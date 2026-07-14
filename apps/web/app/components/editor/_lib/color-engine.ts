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
 */
let probeEl: HTMLElement | null = null;
function colorProbe(): HTMLElement | null {
  if (probeEl?.isConnected) return probeEl;
  const host = document.querySelector(".sx-edit-layer") ?? document.body;
  if (!host) return null;
  probeEl = document.createElement("span");
  probeEl.setAttribute("aria-hidden", "true");
  probeEl.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:0;height:0;pointer-events:none";
  host.appendChild(probeEl);
  return probeEl;
}

/**
 * A CSS colour value → the browser's own serialisation of it.
 *
 * Needed because a custom property's computed value comes back AS AUTHORED, and this template
 * authors colours every way CSS allows: `#0d2b44` for the seeds, the bare keyword `white` for
 * `--…button--primary--default--text`, `color-mix(in srgb, white 8%, transparent)` for
 * `--…primary--default--border`. Hand-parsing that set is a losing game — `white` alone would have
 * cost the nav CTA's TEXT role its editor, and it is a real, opaque, site-wide token (btnPrimaryText)
 * — so the question goes to the only authority on CSS colour syntax: CSS.
 *
 * The value arrives already var-substituted (that is what a computed custom property IS), so it
 * needs no element context — only a parser. A `var(` that somehow survived is refused rather than
 * resolved: it would resolve against the PROBE, where the property is unset, and quietly yield the
 * probe's inherited colour instead of the element's.
 */
function normalizeColor(value: string): string {
  const v = value.trim();
  if (!v || v.includes("var(")) return "";
  const probe = colorProbe();
  if (!probe) return v; // no DOM to ask — parseColor still reads the literal forms itself
  probe.style.removeProperty("color");
  // An invalid value is simply not accepted by the CSSOM, which leaves `color` empty — that is the
  // rejection, read back below, and it costs nothing to ask. `important` so no page rule can outrank
  // the thing we are asking about.
  probe.style.setProperty("color", v, "important");
  if (!probe.style.color) return "";
  return getComputedStyle(probe).color;
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
 * Candidacy is about what the element PAINTS. Representability is decided afterwards, on the
 * DEFAULT-state colour, and can only ever cost a role its editor — never its existence.
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

/** The element that actually PAINTS `role` for `block`. For `bg`/`border`, colour does NOT
 *  inherit, so the block itself is frequently transparent — the nav CTA is a transparent <a>
 *  whose pill is painted by a .btn-bg child — and searching the subtree finds the real painter
 *  by construction. `text` is the opposite case: see the comment inside that branch. */
function painterFor(block: HTMLElement, role: ColorRole): HTMLElement | null {
  const candidates = [block, ...Array.from(block.querySelectorAll<HTMLElement>("*"))];
  if (role === "bg") {
    const box = layoutBox(block);
    return (
      candidates.find((el) => {
        if (!isPainted(getComputedStyle(el).backgroundColor)) return false;
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
    // Compare the computed strings getComputedStyle already resolved and serialized — NOT hex.
    // Hex would drop every non-opaque colour to undefined and make unequal colours compare equal.
    const blockColor = getComputedStyle(block).color;
    return glyphBearers.every((el) => getComputedStyle(el).color === blockColor) ? block : null;
  }
  return (
    candidates.find((el) => {
      const cs = getComputedStyle(el);
      return parseFloat(cs.borderTopWidth) > 0 && isPainted(cs.borderTopColor);
    }) ?? null
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
 * `(?![\w-])` makes this a pseudo-class NAME match, not a substring match: `:hover` here, but never
 * `:hovercard`. Longest alternatives lead so `:focus-visible` isn't clipped to `:focus`. Class
 * names cannot be swallowed by accident — `.is-hover-card` carries no colon. `:where(…)` and
 * `:nth-*` deliberately survive: the template's `.w-variant-*` rules are genuine VARIANT selectors
 * (primary vs secondary button), not state, and dropping them would lose the secondary tokens.
 */
const STATE_PSEUDO_RE = /:(?:hover|focus-visible|focus-within|focus|active|visited|target)(?![\w-])/i;

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
 * disagree about.
 *
 * "Later wins" approximates the cascade — it ignores specificity — and it is the approximation this
 * file has always made; the template is single-class Webflow output, where source order IS the order.
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
 * The colour `prop` paints on `el` IN THE DEFAULT STATE — the only state colour mode edits.
 *
 * Deliberately not a bare `getComputedStyle(el)[computedKey]`, which reports the CURRENT state.
 * Colour mode hides every hotspot (`display:none !important`, MODE_AFFORDANCE_CSS in edit-mode.ts)
 * and `.sx-edit-layer` itself is `pointer-events:none`, so nothing intercepts the pointer: the
 * element the user just clicked is genuinely under `:hover` while we introspect it — verified, not
 * assumed (`.btn-bg.matches(":hover")` is true at click time). And `.btn-bg` carries
 * `transition: background-color .3s`, so the live value is not even a STABLE wrong answer. That is how the nav CTA measured `color(srgb … / 0.88)` off
 * `.btn-bg:hover` (which reads `--base--dark-88`, a color-mix) while detectToken, correctly skipping
 * that same rule, reported `btnPrimaryBg` = `#0d2b44`. Two answers, one element, and the measurement
 * was the wrong one.
 *
 * So both read the same declaration. When it is a `var()` — how this template declares every colour
 * — the custom property's own computed value is the answer, and it is state-INDEPENDENT: a `:hover`
 * rule changes which var is read, never what the var holds. That is what makes this work without
 * suppressing the hover, which we cannot do: the pointer is the user's. The value is normalised
 * through the browser (normalizeColor) because a custom property comes back as AUTHORED — `white` is
 * as likely as `#0d2b44`.
 *
 * Everything else falls through to the computed value: a literal declaration needs no resolving, and
 * an inherited `color` has no declaration on `el` at all to find. Neither is contradicted by a state
 * rule in this template, and the computed value is the browser's own normalisation — which is how a
 * named colour (`white`) still reads back as a hex.
 */
function defaultStateColor(
  el: HTMLElement,
  prop: string,
  computedKey: "backgroundColor" | "color" | "borderTopColor",
): string | undefined {
  const cs = getComputedStyle(el);
  const varName = varNameOf(winningDecl(el, prop));
  return rgbToHex(varName ? normalizeColor(cs.getPropertyValue(varName)) : cs[computedKey]);
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

const ROLE_PROP: Record<ColorRole, string> = {
  bg: "background-color",
  text: "color",
  border: "border-color",
};
const ROLE_COMPUTED: Record<ColorRole, "backgroundColor" | "color" | "borderTopColor"> = {
  bg: "backgroundColor",
  text: "color",
  border: "borderTopColor",
};

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
      hex: defaultStateColor(painter, ROLE_PROP[role], ROLE_COMPUTED[role]),
      tokenKey: detectToken(painter, ROLE_PROP[role]),
      selector: buildSelector(painter) ?? undefined,
    });
  }
  return out;
}
