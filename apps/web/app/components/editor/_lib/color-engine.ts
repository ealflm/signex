// Colour engine — the DOM half of "any element, every colour role".
//
// Thin glue on purpose: the decidable logic lives in selector-path.ts (pure, unit-tested) and in
// @signex/shared's selector grammar. What's here needs a live DOM + CSSOM, and apps/web has no
// jsdom, so it is verified in the browser (see the plan's Task 12).

import { PALETTE_VARS, TOKEN_VARS, isSafeSelector } from "@signex/shared";
import { isOverlayClass } from "./overlay-classes";
import { pickSegment, type SegmentInput } from "./selector-path";

export type ColorRole = "bg" | "text" | "border";

export type RoleInfo = {
  role: ColorRole;
  /** The DEFAULT-state colour (see defaultStateColor — NOT what the element renders while the
   *  pointer holds it in :hover); undefined when not representable as hex (alpha / gradient). */
  hex?: string;
  /** Seed/token key driving this role, when the winning rule reads a var(). */
  tokenKey?: string;
  /** Target for a per-element override; undefined when the element could not be anchored. */
  selector?: string;
};

/**
 * An element's selector-relevant shape, read LIVE off the class attribute — which during an editing
 * session also carries the overlay's own marks (the hover outline, the jump-to flash). Those are
 * dropped here, at the single point where the live attribute enters selector generation, so neither
 * pickSegment nor verify can be fooled by one: an overlay mark is always sibling-unique, so it would
 * be preferred over the page's real class and would verify clean on the preview page while matching
 * nothing on the public site. See overlay-classes.ts for the rule and the full failure mode.
 *
 * Exported for color-engine.test.mjs: this and pickSegment are the whole of what buildSelector's
 * block walk does per node, and apps/web has no jsdom to drive buildSelector itself.
 */
export const asSegment = (el: Element): SegmentInput => ({
  tag: el.tagName,
  classes: (el.getAttribute("class") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .filter((c) => !isOverlayClass(c)),
});

type Rgba = { r: number; g: number; b: number; a: number };

/**
 * A CSS colour → 0–255 RGB + 0–1 alpha, for the three forms this engine actually meets:
 *
 *   • `rgb(…)` / `rgba(…)` — how getComputedStyle serialises an ordinary colour.
 *   • `color(srgb r g b / a)` — how Chrome serialises anything that went through `color-mix()`, and
 *     the template derives EVERY transparency that way (`--base--dark-88` is
 *     `color-mix(in srgb, … 88%, transparent)`). Not reading this form is how a translucent colour
 *     read back as "no colour here at all" rather than as "a colour with alpha".
 *   • `#rgb`/`#rrggbb`/`#rrggbbaa` — a custom property's computed value comes back AS AUTHORED, and
 *     that value is what defaultStateColor reads.
 *
 * Anything else — a named colour, an unresolved `color-mix()`, a gradient, another colour space —
 * is undefined. The job is to be honest, not exhaustive: every caller treats "I cannot read this"
 * as a reason to say so, never as a reason to guess.
 */
function parseColor(v: string): Rgba | undefined {
  const s = v.trim();
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s);
  if (hex) {
    const pairs =
      hex[1].length <= 4
        ? hex[1].split("").map((c) => c + c)
        : (hex[1].match(/../g) as string[]);
    const [r, g, b, a] = pairs.map((p) => parseInt(p, 16));
    return { r, g, b, a: a === undefined ? 1 : a / 255 };
  }
  const fn = /^(rgba?|color)\(([^)]*)\)$/i.exec(s);
  if (!fn) return undefined;
  const parts = fn[2].split(/[,\s/]+/).filter(Boolean);
  if (fn[1].toLowerCase() === "color") {
    // color(<space> r g b [/ a]) with 0–1 components. The space MUST be checked: reading
    // `color(display-p3 …)`'s numbers as sRGB would be exactly the lying hex we refuse to produce.
    if (parts.shift()?.toLowerCase() !== "srgb") return undefined;
    const [r, g, b, a] = parts.map(Number);
    if (![r, g, b].every(Number.isFinite)) return undefined;
    return { r: r * 255, g: g * 255, b: b * 255, a: a === undefined ? 1 : a };
  }
  const [r, g, b, a] = parts.map(Number);
  if (![r, g, b].every(Number.isFinite)) return undefined;
  return { r, g, b, a: a === undefined ? 1 : a };
}

/**
 * A colour → #rrggbb. Undefined unless FULLY OPAQUE — and that is a designed outcome, not a failure.
 *
 * `Hex` is `#rgb`/`#rrggbb` only (packages/shared palette.ts: the token system derives transparency
 * from the seeds), so alpha is not storable and a translucent colour is genuinely not editable from
 * this panel. The caller says exactly that, read-only, WITH the reason — which is a different thing
 * from a role the element does not have, and resolveRoles keeps the two distinguishable by omitting
 * the latter entirely.
 *
 * Exported for color-engine.test.mjs: apps/web has no jsdom, and this is the half of the resolution
 * that needs no DOM at all.
 */
export function rgbToHex(v: string): string | undefined {
  const c = parseColor(v);
  if (!c || c.a !== 1) return undefined;
  const byte = (n: number) => Math.min(255, Math.max(0, Math.round(n)));
  return `#${[c.r, c.g, c.b].map((n) => byte(n).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * A hidden element to ask the browser what a colour VALUE means. Created once per document, lazily.
 *
 * It lives inside `.sx-edit-layer` — the overlay's own container, and per overlay-classes.ts the ONE
 * sanctioned home for an element the overlay creates: it is excluded from the paint stack, so it can
 * never reach resolveMeaningfulBlock or asSegment, and it inserts no child into a page element (the
 * rule that keeps buildSelector's child walk honest). `document.body` is the fallback for a caller
 * with no overlay mounted; it is safe for the same reason a body-child is never enumerated — the
 * block walk only ever visits nodes strictly inside a `[data-sx-block]` root — but the layer is the
 * placement that needs no such argument.
 *
 * TWO nested elements, because the probe's answer is only trustworthy if we can prove it did not
 * come from the probe. The outer one is a `color` context normalizeColor sets to a known value, and
 * the inner one — returned here — is where the value under test goes. See normalizeColor.
 */
let probeEl: HTMLElement | null = null;
function colorProbe(): HTMLElement | null {
  if (probeEl?.isConnected) return probeEl;
  const host = document.querySelector(".sx-edit-layer") ?? document.body;
  if (!host) return null;
  const context = document.createElement("span");
  context.setAttribute("aria-hidden", "true");
  context.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:0;height:0;pointer-events:none";
  probeEl = context.appendChild(document.createElement("span"));
  host.appendChild(context);
  return probeEl;
}

/**
 * What `value`, declared for `prop`, would MEAN — as the browser's own serialisation of it. "" when
 * that cannot be answered away from the element it was declared on.
 *
 * Needed because a declaration and a custom property's computed value both come back AS AUTHORED,
 * and this template authors colours every way CSS allows: `#0d2b44` for the seeds, the bare keyword
 * `white` for `--…button--primary--default--text`, `color-mix(in srgb, white 8%, transparent)` for
 * `--…primary--default--border`, and — after Next's CSS minifier rewrites globals.css's
 * `.sx-upload__btn { background: transparent }` — the keyword `initial`. Hand-parsing that set is a
 * losing game (`white` alone would have cost the nav CTA's TEXT role its editor, and it is a real,
 * opaque, site-wide token, btnPrimaryText), so the question goes to the only authority on CSS colour
 * syntax: CSS.
 *
 * `prop` is not decoration. The probe answers by DECLARING the value, so it must declare it as the
 * property it came from: the CSS-wide keywords are property-relative, and `background-color: initial`
 * (transparent) is not `color: initial` (black). Asking every value through `color`, as this once
 * did, silently answered a different question than the one posed.
 *
 * The harder half is that some values are not colours at all — they name the ELEMENT'S context.
 * `currentColor`, `inherit` (globals.css really does declare `.sx-upload__btn { color: inherit }`),
 * and `border-color: initial`, whose initial value IS `currentColor`. On the probe these do not
 * fail; they quietly return the PROBE's colour dressed up as the element's — the same lying hex from
 * a new direction. So rather than keep a list of them (a list this file got wrong once already —
 * `initial` was on it, which cost `.sx-upload__btn` the very fix it was the example for), ASK: run
 * the value twice against two different inherited colours and keep the answer only if it did not
 * move. A colour cannot notice; anything context-dependent must. `var()` is refused up front and
 * separately — it is unexpected here (a computed custom property arrives already substituted) and it
 * would resolve against the probe, where the property is unset.
 *
 * A refusal is not a failure: defaultStateColor falls through to the computed value, which is where
 * an inherited colour was always going to have to come from.
 */
function normalizeColor(
  prop: string,
  computedKey: "backgroundColor" | "color" | "borderTopColor",
  value: string,
): string {
  const v = value.trim();
  if (!v || v.includes("var(")) return "";
  const probe = colorProbe();
  if (!probe) return v; // no DOM to ask — parseColor still reads the literal forms itself
  const context = probe.parentElement;
  if (!context) return v;
  const read = (inherited: string): string => {
    context.style.setProperty("color", inherited, "important");
    // Wipe the probe's own declarations, not just this prop's: a `color` left over from an earlier
    // call would anchor a later `currentColor` to a stale value and make it look context-FREE.
    probe.style.cssText = "";
    // An invalid value is simply not accepted by the CSSOM, which leaves the property empty — that
    // is the rejection, read back below, and it costs nothing to ask. `important` so no page rule
    // can outrank the thing we are asking about.
    probe.style.setProperty(prop, v, "important");
    if (!probe.style.getPropertyValue(prop)) return "";
    return getComputedStyle(probe)[computedKey];
  };
  const onBlack = read("rgb(0, 0, 0)");
  const onWhite = read("rgb(255, 255, 255)");
  return onBlack === onWhite ? onBlack : "";
}

/**
 * Does this element paint this role AT ALL — any colour with a non-zero alpha?
 *
 * NOT `rgbToHex(…)`, which asks the much narrower "could the user store this colour from here?".
 * Gating CANDIDACY on the hex is what made the nav CTA's background — THE motivating example of
 * colour mode (spec §3.1) — vanish: the pointer is parked on the button at click time, `.btn-bg:hover`
 * reads `--base--dark-88`, that measures `color(srgb … / 0.88)`, no hex could be made of it, so
 * `.btn-bg` was not even CONSIDERED a painter; the bg role then resolved to nothing and the panel
 * said "not editable by hex" — the very words it uses for a colour that legitimately has alpha.
 *
 * Candidacy is about what the element PAINTS. Representability is decided afterwards, on the same
 * DEFAULT-state colour, and can only ever cost a role its editor — never its existence.
 *
 * Asked of the LIVE colour, candidacy is the lie one layer down: `.sx-upload__btn` is
 * `background: transparent` at rest and `rgba(255,255,255,0.12)` under `:hover` (globals.css), so a
 * live read INVENTS a bg role the element does not have — and, the alpha being unstorable, the panel
 * then prints "this colour has alpha" for a role that at rest is not there at all. That is the exact
 * pair resolveRoles keeps apart, collapsed from the other side. So candidacy asks defaultStateColor
 * (below) too, and every question this file answers about a colour is answered about ONE state.
 */
function isPainted(v: string): boolean {
  const c = parseColor(v);
  // Unparseable but not transparent: some colour is being painted, we just cannot name it. Say the
  // role exists and let the hex come back undefined — the honest direction of the two.
  return c ? c.a > 0 : !!v.trim() && v.trim() !== "transparent";
}

/**
 * An element's box in LAYOUT metrics — the size it OCCUPIES, not the size it currently PAINTS at.
 *
 * `getBoundingClientRect()` is the painted box: transforms included. The template scales the nav
 * CTA's `.btn-bg` by `matrix(0.95, …)` on `:hover`, and the pointer is parked on the element at
 * click time (see defaultStateColor), so the rect measured 108×41.8 inside its own block's 114×44 —
 * and painterFor's "does this cover the block?" test threw the real painter away for being 6px too
 * small. The hover COLOUR and the hover GEOMETRY are one hazard with one answer: read the value the
 * transient state does not touch. A transform is paint, `offsetWidth/Height` are layout, so they
 * still say 114×44 while the button sits mid-hover-scale.
 *
 * SVG and other non-HTML elements have no offsetWidth/Height; they fall back to the painted box,
 * which for them is all there is.
 */
function layoutBox(el: Element): { w: number; h: number } {
  const { offsetWidth: w, offsetHeight: h } = el as HTMLElement;
  if (typeof w === "number" && typeof h === "number") return { w, h };
  const r = el.getBoundingClientRect();
  return { w: r.width, h: r.height };
}

/**
 * The element the user means by "this button" — not the topmost node at the click point, which in
 * this template is usually a meaningless fragment (.gsap_split_word inside a split-text heading).
 * Walks up from the top of the paint stack to the first link/button/stamped element/block root.
 */
export function resolveMeaningfulBlock(x: number, y: number): HTMLElement | null {
  const stack = (document.elementsFromPoint(x, y) as HTMLElement[]).filter(
    (n) => !n.closest(".sx-edit-layer"),
  );
  const top = stack[0];
  if (!top) return null;
  return (
    (top.closest("a,button,[data-edit-field],[data-sx-c],[data-sx-block]") as HTMLElement | null) ??
    top
  );
}

const ROLE_PROP = {
  bg: "background-color",
  text: "color",
  border: "border-color",
} as const satisfies Record<ColorRole, string>;
/** The three CSS properties this engine ever asks about. A closed union, not `string`, so the
 *  PROP_SETTERS table below is total BY TYPE: adding a role without saying which declarations can
 *  move it is a compile error rather than a silently mis-gated read. */
export type RoleProp = (typeof ROLE_PROP)[ColorRole];
const ROLE_COMPUTED: Record<ColorRole, "backgroundColor" | "color" | "borderTopColor"> = {
  bg: "backgroundColor",
  text: "color",
  border: "borderTopColor",
};
/** What `role` is in the DEFAULT state on `el`, for the two callers below. Shorthand for the pair of
 *  lookups every one of them would otherwise repeat. */
const roleColor = (el: HTMLElement, role: ColorRole): string =>
  defaultStateColor(el, ROLE_PROP[role], ROLE_COMPUTED[role]);

/** The element that actually PAINTS `role` for `block`. For `bg`/`border`, colour does NOT
 *  inherit, so the block itself is frequently transparent — the nav CTA is a transparent <a>
 *  whose pill is painted by a .btn-bg child — and searching the subtree finds the real painter
 *  by construction. `text` is the opposite case: see the comment inside that branch.
 *
 *  Every colour read here goes through defaultStateColor (below), never getComputedStyle: the
 *  pointer is parked on `block` at click time, so a live read decides CANDIDACY from the hovered
 *  state — see isPainted. Sizes are the same hazard and get the same answer: layoutBox, not
 *  getBoundingClientRect. */
function painterFor(block: HTMLElement, role: ColorRole): HTMLElement | null {
  const candidates = [block, ...Array.from(block.querySelectorAll<HTMLElement>("*"))];
  if (role === "bg") {
    const box = layoutBox(block);
    return (
      candidates.find((el) => {
        if (!isPainted(roleColor(el, "bg"))) return false;
        const r = layoutBox(el);
        return r.w >= box.w - 1 && r.h >= box.h - 1;
      }) ?? null
    );
  }
  if (role === "text") {
    // `text` is the role where the obvious answers are both wrong, in opposite directions. Two
    // rejected approaches, so the next reader doesn't "simplify" back into either:
    //
    //   (a) Walk DOWN to the deepest node owning a text child. Fails LOUDLY: in this template that
    //       node is a GSAP split-text letter <div> (headings are exploded one <div> per letter) or
    //       an unclassed text-hook <span> — neither is stylable or anchorable, so buildSelector
    //       returns null and the role dies for every anchor. Same .gsap_split_word fragment
    //       problem resolveMeaningfulBlock exists to avoid, reintroduced one layer down.
    //
    //   (b) Return `block` unconditionally, reasoning "colour inherits, so block's computed colour
    //       IS the rendered one". Fails SILENTLY, which is worse: inheritance only holds while no
    //       descendant re-declares `color`. Click a padding/flex gap in the hero and `block`
    //       resolves to <section data-sx-block="hero"> (no intervening layout div carries an
    //       anchor, so the walk goes all the way up); that section computes to navy #0b1f33 while
    //       .wrap_home-a inside it re-declares `color: white` and every glyph on screen is white.
    //       Reporting navy plus a provably-unique selector hands the caller a hex that no glyph
    //       has and promises an override that would change nothing — the "lying hex" rgbToHex
    //       goes out of its way to avoid, laundered through the selector instead.
    //
    // So: `block` is the painter only when it genuinely DETERMINES its text colour. Gather the
    // elements that actually render glyphs (own a direct, non-empty text node) and require all of
    // them to have inherited block's colour unchanged. If any re-declares, no single element
    // paints this block's text — the role is absent rather than a lie.
    const glyphBearers = candidates.filter((el) =>
      Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && !!n.nodeValue?.trim()),
    );
    // Subsumes the old no-glyph gate: the navbar shell, a bg-only <a> and an icon-only button all
    // have a computed `color` that never paints a pixel, so there is no text colour to edit.
    if (glyphBearers.length === 0) return null;
    // Compare BROWSER-SERIALISED colour strings — NOT hex. Hex would drop every non-opaque colour
    // to undefined and make unequal colours compare equal. And compare the DEFAULT state on both
    // sides: `.hero-quote_upload:hover { color: #ffffff }` recolours a block whose children
    // re-declare their own colour, so a live comparison would find them equal only while the pointer
    // is on it — handing back `block`, and with it a hex no glyph under the pointer has.
    const blockColor = roleColor(block, "text");
    return glyphBearers.every((el) => roleColor(el, "text") === blockColor) ? block : null;
  }
  return (
    candidates.find(
      (el) =>
        // Width is layout, not paint, and no state rule in this template moves it — the live read
        // is the right one. The COLOUR beside it is not: `.hero-quote_upload:hover` declares a
        // border-color the element only has under the pointer.
        parseFloat(getComputedStyle(el).borderTopWidth) > 0 && isPainted(roleColor(el, "border")),
    ) ?? null
  );
}

/**
 * Transient STATE pseudo-classes. Colour mode edits the DEFAULT state only (per-state editing is
 * explicitly out of scope), so a rule gated on one of these must not be consulted.
 *
 * This is not an exception to winningDecl's "later rule wins, never break" walk — it is what makes
 * that walk mean the right thing. "Later wins" is about the cascade among rules that ACTUALLY APPLY
 * in the state being edited. A :hover rule doesn't apply to the default state at all; it matches
 * only because the pointer is parked on the element while we introspect it, which is an artifact of
 * the measurement, not the cascade. Concretely: the template declares `.btn-bg` then, later,
 * `.btn-bg:hover`, both reading a background var(). Without this filter, clicking the nav CTA
 * reports btnPrimaryHoverBg — a real TOKEN_VARS key, so nothing downstream would catch it — and it
 * would do so only INTERMITTENTLY, since whether a pointer-events:auto hotspot in .sx-edit-layer
 * happens to overlap the click point decides whether :hover matches the content beneath.
 *
 * ONE list, two derived shapes, because the same state set is asked about in two grammars and a
 * literal spelled twice is how they drift apart:
 *
 *   • STATE_PSEUDO_RE — asked of a RULE's selector text. winningDecl drops the rules it matches;
 *     transientlyMoves goes looking for exactly them. `(?![\w-])` makes it a pseudo-class NAME
 *     match, not a substring match: `:hover` here, but never `:hovercard`. Longest alternatives
 *     lead so `:focus-visible` isn't clipped to `:focus`. Class names cannot be swallowed by
 *     accident — `.is-hover-card` carries no colon. `:where(…)` and `:nth-*` deliberately survive:
 *     the template's `.w-variant-*` rules are genuine VARIANT selectors (primary vs secondary
 *     button), not state, and dropping them would lose the secondary tokens.
 *   • TRANSIENT_SEL — asked of an ELEMENT. See transientlyMoves.
 *
 * `:visited` is the one name the two do not share, and it is not drift: a RULE can be gated on it,
 * but an ELEMENT can never be asked about it — `matches(":visited")` is hard-wired to false for
 * privacy — so putting it in TRANSIENT_SEL would add a term that is false by construction.
 */
const STATE_PSEUDOS = ["hover", "focus-visible", "focus-within", "focus", "active", "target"] as const;
const STATE_PSEUDO_RE = new RegExp(`:(?:visited|${STATE_PSEUDOS.join("|")})(?![\\w-])`, "i");
const TRANSIENT_SEL = STATE_PSEUDOS.map((p) => `:${p}`).join(",");

/**
 * Which DECLARED property names can move `prop` — `prop` itself, plus every shorthand that carries
 * it. Consulted by NAME rather than by value, because a shorthand holding a var() is kept pending
 * substitution and `getPropertyValue(<longhand>)` on it returns "" (see winningDecl). Reading
 * `.btn-bg:hover { border: 1px solid var(--x) }` for a value would say "this rule doesn't move
 * border-color" about a rule that does; reading it for a name cannot.
 *
 * Written as the real CSS shorthand tree for these three properties, so a name CSS actually has is
 * classified correctly. Where it is loose it is loose OUTWARD — `border-bottom-color` cannot move
 * the border-TOP colour ROLE_COMPUTED measures, yet it is accepted here. That direction only ever
 * hands the reading to the declaration walk, and both directions are wrong in their own way (see
 * defaultStateColor), so the tie goes to the smaller, better-understood error.
 */
const PROP_SETTERS: Record<RoleProp, RegExp> = {
  "background-color": /^background(-color)?$/,
  color: /^color$/,
  "border-color": /^border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-color)?$/,
};

/**
 * Does a declaration of the CSS property `name` set `prop`?
 *
 * Exported for color-engine.test.mjs: this is the whole of the gate's new predicate that needs no
 * DOM, and apps/web has no jsdom to drive the rest.
 */
export const declarationSets = (name: string, prop: RoleProp): boolean =>
  PROP_SETTERS[prop].test(name.trim().toLowerCase());

const declaresProp = (style: CSSStyleDeclaration, prop: RoleProp): boolean => {
  for (let i = 0; i < style.length; i++) if (declarationSets(style.item(i), prop)) return true;
  return false;
};

/**
 * Is `el`'s LIVE computed `prop` contaminated by a transient state — i.e. does some rule the
 * default-state cascade excludes currently declare `prop` for it?
 *
 * This is the question, and getting its SHAPE right is the whole of the gate. The predicate this
 * replaces asked "is the pointer on `el`", which is a different question with a different answer:
 * `.text-field` has no `:hover` rule at all (only `:focus`), so its border under the pointer is
 * ALREADY the resting truth — and the old shape threw that truth away and sent the read down the
 * declaration walk, which cannot see `.text-field`'s var-bearing `border` shorthand and answers
 * `.w-input { border: 1px solid #ccc }` instead. `#cccccc`: opaque, therefore storable, therefore a
 * Save button, for a border that is actually transparent. Hovering an element is not evidence that
 * hovering it changes anything.
 *
 * `inherited` is for the properties INHERITANCE spreads. `background-color` does not: only a rule
 * matching `el` itself can move it. `color` does — a child of a hovered element is not itself
 * `:hover`, yet it inherits the hovered colour — so there a rule matching any ANCESTOR contaminates
 * `el` too, which is what `closest` (which starts at `el`) asks.
 *
 * `border-color` is treated as un-inherited, which is a KNOWN under-approximation rather than a
 * truth: its initial value is `currentColor`, so an ancestor's hovered `color` can reach it. The
 * template does this in exactly one family (`.hero-quote_upload`), and all of those measure
 * `borderTopWidth: 0px`, which painterFor tests before reading any colour — so it is unreachable
 * today. Widening it would gate every hovered chain on a property most rules never touch.
 *
 * TRANSIENT_SEL is a cheap pre-filter, not the answer: painterFor reads a colour off every element
 * in the block's subtree, and a CSSOM walk each is ~600 walks of a 1300-rule sheet per click. Nothing
 * transient anywhere up `el`'s ancestry means no transient rule matches it — the hover/focus chain IS
 * an element and its ancestors — unless a rule reaches sideways (`.a:hover + .b`, `:has(:hover)`).
 * This template has none, and the predicate this replaces could not see them either; if one ever
 * lands, this walks past it and reads the live value, which is where we started. A selector this
 * browser cannot parse loses only the fast path.
 */
function inTransientChain(el: HTMLElement): boolean {
  try {
    return !!el.closest(TRANSIENT_SEL);
  } catch {
    return true;
  }
}
function transientlyMoves(el: HTMLElement, prop: RoleProp, inherited: boolean): boolean {
  if (!inTransientChain(el)) return false;
  for (const sheet of Array.from(document.styleSheets)) {
    for (const rule of styleRules(sheet)) {
      if (!rule.selectorText || !rule.style) continue;
      if (!STATE_PSEUDO_RE.test(rule.selectorText)) continue;
      if (!declaresProp(rule.style, prop)) continue;
      try {
        if (inherited ? el.closest(rule.selectorText) : el.matches(rule.selectorText)) return true;
      } catch {
        continue; // a selector this browser can't parse is a rule it isn't applying either
      }
    }
  }
  return false;
}

/**
 * Every style rule in the document, in source order, including those nested in a grouping block
 * whose condition currently HOLDS. The @media half is not theoretical: the editor's canvas is a
 * resizable panel, so the template's `@media screen and (max-width: 991px)` rules — which do declare
 * colours (`.nav-menu_inner`, `.menu-button`) — are the ones that apply whenever the user narrows it.
 * A flat walk of `document.styleSheets` sees only top-level rules and would read the desktop colour
 * off a canvas rendering the mobile one.
 *
 * `CSSStyleRule` is tested FIRST: under CSS nesting it is itself a `CSSGroupingRule`, so the order of
 * these branches is what keeps a plain rule from being treated as a block to descend into.
 */
function* styleRules(node: CSSStyleSheet | CSSGroupingRule): Generator<CSSStyleRule> {
  let rules: CSSRuleList;
  try {
    rules = node.cssRules;
  } catch {
    return; // cross-origin sheet
  }
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSStyleRule) yield rule;
    // @media / @supports: the CSSOM exposes the block whether or not it applies, so ask.
    else if (rule instanceof CSSMediaRule) {
      if (window.matchMedia(rule.conditionText).matches) yield* styleRules(rule);
    } else if (rule instanceof CSSSupportsRule) {
      if (CSS.supports(rule.conditionText)) yield* styleRules(rule);
    } else if (rule instanceof CSSGroupingRule) yield* styleRules(rule); // @layer &c.
  }
}

/**
 * What the DEFAULT-state cascade says `prop` is on `el`: the last rule that declares it, skipping
 * rules gated on a transient state pseudo (STATE_PSEUDO_RE, above).
 *
 * ONE walk, read by BOTH detectToken and defaultStateColor — which is the whole point. They used to
 * be two mechanisms answering one question and they disagreed: detection skipped `:hover` (rightly),
 * measurement was a plain getComputedStyle that did not, so a click on the nav CTA reported token
 * `btnPrimaryBg` beside a hex measured off `.btn-bg:hover`. Anything this returns, they now cannot
 * disagree about. (defaultStateColor asks only for an element actually IN a transient state; for
 * every other element the computed value is already the default-state one and is strictly better
 * than this walk. See there — the reasons are this walk's two approximations, below.)
 *
 * "Later wins" approximates the cascade — it ignores specificity — and it is the approximation this
 * file has always made; the template is single-class Webflow output, where source order IS the order.
 *
 * The second approximation is not a choice: a shorthand carrying a var() is held pending
 * substitution, and `getPropertyValue(<longhand>)` on such a rule returns "". So a rule like
 * `.text-field { border: 1px solid var(--…) }` is INVISIBLE here, and the walk happily returns an
 * earlier rule that the real cascade overrode. Callers must treat what this returns as the best
 * reading of the default state available, not as fact.
 */
function winningDecl(el: HTMLElement, prop: string): string | undefined {
  let decl: string | undefined;
  for (const sheet of Array.from(document.styleSheets)) {
    for (const rule of styleRules(sheet)) {
      if (!rule.selectorText || !rule.style) continue;
      if (STATE_PSEUDO_RE.test(rule.selectorText)) continue; // default state only — see above
      const val = rule.style.getPropertyValue(prop);
      if (!val) continue;
      try {
        if (!el.matches(rule.selectorText)) continue;
      } catch {
        continue; // selector this browser can't parse
      }
      decl = val; // later rule wins — keep going
    }
  }
  return decl;
}

/** `var(--x)` → `--x`; anything else → undefined. Deliberately the BARE single-reference form only:
 *  it is exactly what this template declares every colour as, and both things we do with the name —
 *  map it to a token key, read its computed value back — are meaningless for `var(--x, #fff)` (which
 *  of the two?) or for a var buried inside a larger value. */
const VAR_RE = /^var\(\s*(--[^,)\s]+)\s*\)$/;
const varNameOf = (decl: string | undefined): string | undefined =>
  decl ? (VAR_RE.exec(decl.trim())?.[1] ?? undefined) : undefined;

/** The custom property the winning DEFAULT-state rule reads for `prop`, mapped back to a seed/token
 *  key. Undefined when that rule reads no var (a literal colour) or names a var in neither registry
 *  — both NORMAL, and the panel says so rather than treating either as an error. */
function detectToken(el: HTMLElement, prop: string): string | undefined {
  const varName = varNameOf(winningDecl(el, prop));
  if (!varName) return undefined;
  for (const [k, m] of Object.entries(PALETTE_VARS)) if (m.cssVar === varName) return k;
  for (const [k, m] of Object.entries(TOKEN_VARS)) if (m.cssVar === varName) return k;
  return undefined;
}

/**
 * The colour `prop` paints on `el` IN THE DEFAULT STATE — the only state colour mode edits — as a
 * CSS colour string.
 *
 * Read by BOTH questions this file asks about a colour: painterFor's "does this element paint the
 * role at all?" (isPainted) and resolveRoles' "can the user store it?" (rgbToHex). One answer, so
 * the two can never disagree about which STATE they are describing.
 *
 * Deliberately not a bare `getComputedStyle(el)[computedKey]`, which reports the CURRENT state.
 * Colour mode hides every hotspot (`display:none !important`, MODE_AFFORDANCE_CSS in edit-mode.ts)
 * and `.sx-edit-layer` itself is `pointer-events:none`, so nothing intercepts the pointer: the
 * element the user just clicked is genuinely under `:hover` while we introspect it — verified, not
 * assumed (`.btn-bg.matches(":hover")` is true at click time). And `.btn-bg` carries
 * `transition: background-color .3s`, so the live value is not even a STABLE wrong answer. That is
 * how the nav CTA measured `color(srgb … / 0.88)` off `.btn-bg:hover` (which reads `--base--dark-88`,
 * a color-mix) while detectToken, correctly skipping that same rule, reported `btnPrimaryBg` =
 * `#0d2b44`. Two answers, one element, and the measurement was the wrong one.
 *
 * But the computed value is only WRONG while a transient rule is actually MOVING THIS PROPERTY on
 * this element. So ask that (transientlyMoves) — not the far broader "is the pointer on `el`", which
 * is true of every element the user can click and answers a question nobody asked. When no transient
 * rule declares `prop` here, `el`'s computed value IS its default-state value by definition, and it
 * is the REAL cascade — specificity, `@layer`, shorthands and all — which the walk below only
 * approximates. It is also the cheap answer, and the one almost every candidate painterFor tests
 * will take.
 *
 * Only when a transient rule really is moving `prop` do we read the cascade ourselves: winningDecl,
 * the same walk detectToken uses, with the state rules dropped. Both forms of declaration then resolve
 * WITHOUT asking the element how it currently looks — which is what makes this work without
 * suppressing the hover, since we cannot: the pointer is the user's.
 *
 *   • `var(--x)` — the custom property's own computed value, state-INDEPENDENT: a `:hover` rule
 *     changes WHICH var the property reads, never what the var holds.
 *   • a literal — the declaration IS the colour; there is nothing to resolve.
 *
 * The literal branch is the one that was missing. It fell through to the computed value on the claim
 * that no state rule in this template contradicts a literal; the template contradicts it three times
 * over, all in globals.css — `.hero-quote_upload--filled .sx-upload__btn:hover { color: #ffffff }`
 * over a resting `rgba(255,255,255,0.7)`, `.hero-quote_upload:hover { border-color:
 * rgba(255,255,255,0.55) }` over a resting `…0.25`, and `.product-zoom_controls button:hover {
 * background-color: rgba(…,0.24) }` over a resting `…0.12`. Both forms go through the browser
 * (normalizeColor) rather than a hand-parser: a custom property comes back AS AUTHORED, and a
 * literal is authored however CSS allows.
 *
 * Why the walk is the fallback and not the primary, even though it is the state-correct one: it is
 * blind to a shorthand carrying a var(). `.text-field` is `border: 1px solid
 * var(--…input--default--border)`, and the CSSOM keeps a var-bearing shorthand pending substitution
 * — `getPropertyValue("border-color")` on that rule returns "" — so the walk cannot see it and hands
 * back the last rule it CAN see, Webflow's base `.w-input { border: 1px solid #ccc }`, which loses
 * the real cascade. Trusted unconditionally, the walk therefore reports `#cccccc` for the border of
 * every text input on the site — opaque, hence storable, hence a Save button — where the element
 * actually computes to fully transparent. Worse than a hex off by a state: `isPainted("#cccccc")` is
 * true, and painterFor's `find` stops at the first candidate that paints, so a fabricated colour can
 * INVENT a role on an element that has none.
 *
 * So the walk is confined to the reads whose live value is provably contaminated — which is what
 * makes the gate's shape load-bearing rather than a tuning knob. It does NOT make the blind spot
 * harmless, and no comment here should claim it does: what is left is the overlap, where a transient
 * rule moves `prop` AND the resting winner is a var-bearing shorthand. The template has exactly one
 * — a `.text-field` under `:focus` (`.text-field:focus { border-color: … }` over the `border`
 * shorthand), where this still answers `#cccccc`. Hover, which is what every click parks on it, no
 * longer reaches it. Both remaining errors are real; this buys the rarer one.
 */
function defaultStateColor(
  el: HTMLElement,
  prop: RoleProp,
  computedKey: "backgroundColor" | "color" | "borderTopColor",
): string {
  const cs = getComputedStyle(el);
  // `color` is the one of the three that INHERITS, so it is the one a transient rule can lie about
  // from an ancestor rather than from `el` — see transientlyMoves.
  if (!transientlyMoves(el, prop, computedKey === "color")) return cs[computedKey];
  const decl = winningDecl(el, prop);
  // Nothing declares `color` here, and `color` inherits: this element's default-state colour IS its
  // parent's, so ask the parent the same question. Falling through to cs[computedKey] instead would
  // read the parent's CURRENT colour — the very read this function exists to avoid, one level up.
  // Terminates at <html>, which has no parentElement.
  if (!decl && computedKey === "color" && el.parentElement) {
    return defaultStateColor(el.parentElement, prop, computedKey);
  }
  const varName = varNameOf(decl);
  const resting = normalizeColor(prop, computedKey, varName ? cs.getPropertyValue(varName) : (decl ?? ""));
  // normalizeColor refuses what it cannot resolve away from the element (`inherit`, `currentColor`,
  // a `var()` shape VAR_RE doesn't cover). Nothing better is available then: back to the live value,
  // which for this element is exactly the value we came here to avoid. It is the best answer left,
  // not a correct one — and the case is narrow enough to say so rather than paper over.
  return resting || cs[computedKey];
}

/**
 * A selector for `el`, scoped to its block root and PROVEN to resolve back to exactly `el`.
 * Returns null when it cannot be proven — the caller then refuses to anchor and offers token-only
 * editing. A selector that isn't provably unique is never stored.
 */
export function buildSelector(el: HTMLElement): string | null {
  const anchor = el.closest("[data-sx-c]") as HTMLElement | null;
  if (anchor === el) {
    const sel = `[data-sx-c="${anchor.getAttribute("data-sx-c")}"]`;
    const verified = verify(sel, el);
    if (verified) return verified;
    // Anchor id isn't unique on this page (e.g. editColor invoked inside a .map() so several
    // elements share one data-sx-c value) — fall through to the block walk below instead of
    // refusing outright. Every attempt still goes through verify(), so nothing unprovable is
    // ever returned.
  }
  const root = el.closest("[data-sx-block]") as HTMLElement | null;
  if (!root) return null;

  const parts: string[] = [];
  let node: HTMLElement | null = el;
  while (node && node !== root) {
    const parent: HTMLElement | null = node.parentElement;
    if (!parent) return null;
    // pickSegment compares siblings by IDENTITY, so `self` must be the very object inside
    // `siblings` — hence indexing the mapped array rather than calling asSegment(node) again.
    // `siblings` is the parent's complete, in-order child list, which is the invariant pickSegment
    // documents but cannot enforce.
    const children = Array.from(parent.children);
    const siblings = children.map(asSegment);
    const self = siblings[children.indexOf(node)];
    const seg = pickSegment(self, siblings);
    if (!seg) return null;
    parts.unshift(seg);
    node = parent;
  }
  // NOTE: a [data-sx-block] key is NOT unique — "aboutPage" is stamped on six disjoint <section>
  // roots, two sharing the class .section_home-about — so this prefix can match several subtrees.
  // verify() is what catches a path that is ambiguous across them.
  const sel = [`[data-sx-block="${root.getAttribute("data-sx-block")}"]`, ...parts].join(" ");
  return verify(sel, el);
}

function verify(sel: string, el: HTMLElement): string | null {
  if (!isSafeSelector(sel)) return null; // grammar is the contract, even for what we generate
  let found: NodeListOf<Element>;
  try {
    found = document.querySelectorAll(sel);
  } catch {
    return null;
  }
  return found.length === 1 && found[0] === el ? sel : null;
}

/**
 * One entry per colour role the block ACTUALLY HAS — which is what the admin's color-target.ts has
 * always documented this as, and what it now is.
 *
 * A role with no painter is OMITTED rather than reported hexless. The two are not the same fact and
 * must not read the same: "nothing here paints a border" is the element's shape, while "this colour
 * has alpha, so it isn't editable by hex" is a real colour the panel is declining to edit. Emitting
 * `{ role }` for the first made the panel print the SECOND one's sentence for both — which is how a
 * role that had silently vanished (the nav CTA's background, gated out of candidacy by an
 * unparseable hover measurement) was indistinguishable from a role working as designed, and why it
 * hid for as long as it did. When no role has a painter the list is empty, and the panel says the
 * element has no editable colour — once, instead of three times in the wrong words.
 */
export function resolveRoles(block: HTMLElement): RoleInfo[] {
  const out: RoleInfo[] = [];
  for (const role of ["bg", "text", "border"] as ColorRole[]) {
    const painter = painterFor(block, role);
    if (!painter) continue;
    out.push({
      role,
      // Undefined when the DEFAULT-state colour isn't representable as hex (alpha) — read-only, and
      // a different fact from the role being absent, which is the `continue` above.
      hex: rgbToHex(roleColor(painter, role)),
      tokenKey: detectToken(painter, ROLE_PROP[role]),
      selector: buildSelector(painter) ?? undefined,
    });
  }
  return out;
}
