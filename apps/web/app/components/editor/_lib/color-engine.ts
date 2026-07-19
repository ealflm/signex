// Colour engine — the DOM half of "any element, every colour role".
//
// Thin glue on purpose: the decidable logic lives in selector-path.ts (pure, unit-tested) and in
// @signex/shared's selector grammar. What's here needs a live DOM + CSSOM, and apps/web has no
// jsdom, so it is verified in the browser (see the plan's Task 12).

import { PALETTE_VARS, ROOT_SELECTOR, TOKEN_VARS, isSafeSelector } from "@signex/shared";
import {
  INK_SENTINELS,
  SVG_MARK_SEL,
  paintFollowsColor,
  someGlyphDisagrees,
  type MarkPaint,
} from "./ink-paint";
import { isOverlayClass } from "./overlay-classes";
import { composeSelector, pickSegment, type SegmentInput } from "./selector-path";

export type ColorRole = "bg" | "text" | "border";

export type RoleInfo = {
  role: ColorRole;
  /** The DEFAULT-state colour (see defaultStateColor — NOT what the element renders while the
   *  pointer holds it in :hover); undefined when not representable as hex (alpha / gradient). */
  hex?: string;
  /** Seed/token key driving this role, when the winning rule reads a var(). */
  tokenKey?: string;
  /** Whether a SITE-WIDE override of `tokenKey` would actually move this element, or is shadowed by
   *  a section that re-declares the token for its own subtree. Only set when tokenKey is. See
   *  tokenReaches — reading a token and following a site-wide change of it are different facts. */
  tokenReaches?: boolean;
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
 *
 * `localName`, NOT `tagName`, now that the tag is EMITTED and not merely grouped by. tagName is the
 * qualified name — uppercased for HTML elements ("SPAN"), which a type selector does match, since
 * they are ASCII case-insensitive in an HTML document, but which puts `H2 SPAN:nth-of-type(1)` in
 * front of the user for no reason. localName gives the canonical lowercase name there and the
 * AUTHORED case for foreign content ("linearGradient"), where type selectors are case-SENSITIVE and
 * a lowercased tagName would match nothing. It drops the namespace that CSS's notion of "element
 * type" also carries, which would matter only for a sibling list mixing an HTML and an SVG element
 * of the same local name — impossible, since the HTML parser puts every child of one parent in one
 * namespace.
 */
export const asSegment = (el: Element): SegmentInput => ({
  tag: el.localName,
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
 * A colour → `#rrggbb`, or `#rrggbbaa` when it is translucent. Undefined only when parseColor could
 * not read it at all — a gradient, a named colour, an unresolved `color-mix()`, another colour space.
 *
 * ALPHA IS NOW EXPRESSED, and dropping it was the third of the three faults behind a real dead end:
 * `.tone-medium` → `tone--medium` → a `color-mix(… 64%, transparent)`, which Chrome serialises as
 * `color(srgb 1 1 1 / 0.64)`. This returned undefined for it, the panel read that as "you cannot
 * write a colour here", and the user was shown "Không đổi được bằng mã hex" with no way forward. The
 * template derives EVERY transparency through color-mix, so that was not an edge case — it was most
 * of the token system.
 *
 * The storable type is now `HexA` (packages/shared palette.ts) for exactly the values this feeds:
 * tokens and per-element overrides, both TERMINAL — no color-mix in this template takes either, so
 * the alpha written here is the alpha rendered, with nothing compounding it. The seeds keep `Hex`
 * and stay opaque, because they ARE the color-mix input; this function has no seed caller.
 *
 * "Undefined" therefore now means only what hex genuinely cannot carry, and the panel's read-only row
 * finally names that reason instead of standing in for a colour it simply refused to read.
 *
 * Exported for color-engine.test.mjs: apps/web has no jsdom, and this is the half of the resolution
 * that needs no DOM at all.
 */
export function rgbToHex(v: string): string | undefined {
  const c = parseColor(v);
  if (!c) return undefined;
  const byte = (n: number) => Math.min(255, Math.max(0, Math.round(n)));
  const rgb = `#${[c.r, c.g, c.b].map((n) => byte(n).toString(16).padStart(2, "0")).join("")}`;
  // Opaque stays 6-digit: every stored palette today is, and an untouched colour re-saved through
  // the picker must round-trip to the same bytes rather than churn every value to #rrggbbff.
  if (c.a >= 1) return rgb;
  return `${rgb}${byte(c.a * 255).toString(16).padStart(2, "0")}`;
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
 * Does `el` render glyphs of its OWN — a non-empty DIRECT text node?
 *
 * The glyph half of "renders ink", asked of one element. DIRECT is the whole of it: `textContent`
 * would say yes to every ancestor of every word on the page, which is the opposite of the question.
 * painterFor gathers its text bearers with this, and resolveMeaningfulBlock asks it of the clicked
 * element — one definition, so the branch that hands a click to `top` and the test that decides
 * whether `top` paints anything cannot drift apart.
 */
const ownsGlyphs = (el: Element): boolean =>
  Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && !!n.nodeValue?.trim());

/**
 * Does `unit` contain glyphs it provably does not paint — i.e. does painterFor(unit, "text") refuse?
 *
 * The DOM half of someGlyphDisagrees (see there for the asymmetry: true is a fact, false is only the
 * absence of a proof). Everything decidable is in that function so a test can drive it; what is here
 * is the two CSSOM reads it needs and the subtree to ask them of — `roleColor` for `settled`, which
 * is painterFor's own reader, because a predicate meant to prove what painterFor will do has to ask
 * the question painterFor asks.
 */
function swallowsGlyphs(unit: HTMLElement): boolean {
  return someGlyphDisagrees(unit, [unit, ...Array.from(unit.querySelectorAll<HTMLElement>("*"))], {
    ownsGlyphs,
    live: (el) => getComputedStyle(el).color,
    settled: (el) => roleColor(el, "text"),
  });
}

/**
 * The element the user means by "this button" — not the topmost node at the click point, which in
 * this template is usually a meaningless fragment (.gsap_split_word inside a split-text heading).
 * Walks up from the top of the paint stack to the first link/button/stamped element/block root.
 *
 * AN SVG IS THE ONE EXCEPTION, and it is the reason a user could not recolour the phone badge on the
 * home page. 31 of the 34 SVG paint attributes in this template are `stroke="currentColor"` /
 * `fill="currentColor"`, so an icon's colour is its holder's `color` — but a holder like
 * `.contact_info-icon.is-phone` is a plain classed <div>, carrying nothing in the list above, so the
 * walk sailed past it to <section data-sx-block>. That section has 45 glyph bearers in 5 colours, so
 * no single element determines its text colour and painterFor (rightly) refuses the role: the click
 * resolved to a unit that does not paint the thing the user clicked.
 *
 * The mark itself is not a block either — a <path> is as meaningless a fragment as a split-text
 * letter, and unanchorable for the same reason. The unit is the element that OWNS the <svg>: it is
 * the nearest thing that carries the `color` painting the mark, and on the phone badge it carries
 * `background-color: #e7f7ee` too, so the click hands back both roles at once — the badge and its
 * glyph, which is what was clicked.
 *
 * BUT ONLY WHERE THE WALK HAS NOTHING BETTER, and that condition is the whole of the rule. The walk
 * looks for two different things in one list: real UNITS (a link, a control, an element an author
 * deliberately stamped) and, failing those, the block ROOT — which is not a unit at all but the
 * walk's terminator, the answer it gives when it found nothing. The phone badge's bug was the second
 * kind: the walk fell through `.contact_info-icon` to <section data-sx-block>, whose 45 bearers in 5
 * colours mean no element paints its ink, so the role was refused and the icon had NO route. Where
 * the walk stops at a real unit the icon never lacked a route: the unit is an ancestor, `color`
 * inherits, so the unit's text role recolours the icon anyway — and the unit carries its own bg and
 * border besides. Returning the holder there would TAKE those two away and add nothing. Measured, on
 * `<a class="content_image-features">` (a link with two text tiles and an arrow icon, live on /vi):
 * the holder offers `text` alone where the <a> offers bg + text + border, and the <a>'s text role
 * already moves the arrow. That link is why this is a condition and not an unconditional return.
 *
 * So: the SVG branch fires exactly where Cause B bit, and nowhere else. Across /vi, /vi/about and
 * /vi/contact, 27 of 38 currentColor icon holders have no route but this one; the other 11 all sit
 * under a unit that offers `text` — none of them lost anything, because none of them was broken.
 *
 * Scoped to clicks that LAND on an SVG, and that scope is the point: `top.closest("svg")` is null
 * for every other click on the site, so resolution for them is byte-identical to before. Widening
 * the list below instead (a `:has(> svg)` term, say) would have re-resolved clicks that already work
 * — the nav CTA, a heading, a card — for a bug none of them have. And where the walk DOES find a
 * unit, this now returns exactly what the walk returned, for every element on the site rather than
 * for most of them: the footer's social links (which wrap their icon directly, so the owner IS the
 * <a>) got that for free, but the features link and the play/pause button did not.
 *
 * THE OTHER HALF: A UNIT CAN SWALLOW A CLICK IT CANNOT ANSWER, and the user found it. The comment
 * that stood here called that a KNOWN LIMIT, said no such markup existed, and declined to guard it —
 * on a measurement (11/11 units offer `text`) that only ever looked at units containing ICONS. The
 * limit is reached through TEXT, on the loudest line in the footer: `div.master_footer` carries
 * `data-sx-c="footer.bar.color"`, so it is a unit and the walk stops there for every click inside its
 * 1233x838 — and it contains 36 glyph bearers in 4 colours, so painterFor rightly refuses it a text
 * role. The brand line `SIGNEX – Manufacturing Brand Identity` sits inside it, in a class-bearing div
 * that owns its glyphs and could answer perfectly, and no click could reach it.
 *
 * So: A UNIT THAT PROVABLY CANNOT PAINT THE INK YOU CLICKED IS NOT THE UNIT YOU MEANT. The walk falls
 * through to the element that owns that ink — the exact shape the SVG branch above already takes for
 * a mark (there the holder is `svg.parentElement`; for a glyph the holder is the element owning the
 * text node, which is `top` itself).
 *
 * "PROVABLY" IS THE WORD THAT DOES THE WORK, and it is why this asks someGlyphDisagrees rather than a
 * likeness. That predicate is painterFor's own test over a SUBSET of painterFor's own bearers, so
 * `true` from it MEANS painterFor refuses — this branch can only ever take away a text role the unit
 * never had. What it costs the click is the unit's `bg`/`border`, which is the trade the SVG branch
 * already makes and which review already ruled on: precision at the click point is spec decision #1,
 * and the unit's own background stays one click away on any part of it that isn't ink. For the footer
 * bar that is most of 1233x838.
 *
 * AND IT HAD TO BE AFFORDABLE, which is what killed the obvious version. edit-overlay.tsx calls this
 * once per animation frame while the pointer moves, on a page already running GSAP + Lenis. Measured
 * on /vi, per call: this function 0.041ms; painterFor(footer, "text") 10.1ms — 6.5ms of which is
 * marksFollowingColor forcing two document-wide recalcs, and ~1.5-3ms the settled-colour reads. So
 * "just ask painterFor" is a 250x regression on the hover path and the old comment was right to
 * refuse it. someGlyphDisagrees pays neither: no mark probe (the glyph subset is enough to prove
 * refusal), and a cheap live-colour filter in front of the expensive settled read. Measured after:
 * 0.087ms — one twentieth of one frame at 60Hz, and the expensive read runs twice on the whole site.
 *
 * KNOWN LIMIT, NARROWED AND STILL OPEN: the MARK half of the same swallow — a unit whose glyphs all
 * agree with it but whose icon does not — still keeps no role, because someGlyphDisagrees cannot see
 * marks and the thing that can (marksFollowingColor) is the 6.5ms this budget has no room for. Unlike
 * its predecessor this limit is stated by construction rather than by a survey: it is exactly the
 * bearers the glyph subset omits. No such markup exists on the three pages, and the measurement that
 * says so is the same 11/11 as before — which is evidence about icons, and this time that is the
 * claim being made.
 */
/** A real unit: a link, a control, or an element an author deliberately stamped. NOT
 *  `[data-sx-block]` — see resolveMeaningfulBlock: the root is the walk's terminator, and telling
 *  the two apart is what keeps the SVG branch confined to the bug it was written for. */
const UNIT_SEL = "a,button,[data-edit-field],[data-sx-c]";
const WALK_SEL = `${UNIT_SEL},[data-sx-block]`;
export function resolveMeaningfulBlock(x: number, y: number): HTMLElement | null {
  const stack = (document.elementsFromPoint(x, y) as HTMLElement[]).filter(
    (n) => !n.closest(".sx-edit-layer"),
  );
  const top = stack[0];
  if (!top) return null;
  const walked = top.closest(WALK_SEL) as HTMLElement | null;
  if (!walked?.matches(UNIT_SEL)) {
    const svgOwner = top.closest("svg")?.parentElement;
    if (svgOwner) return svgOwner;
  } else if (top !== walked && ownsGlyphs(top) && swallowsGlyphs(walked)) {
    return top;
  }
  return walked ?? top;
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
const roleColor = (el: Element, role: ColorRole): string =>
  defaultStateColor(el, ROLE_PROP[role], ROLE_COMPUTED[role]);

/**
 * Every SVG mark under `block` whose paint FOLLOWS `color` — the non-glyph half of "renders ink".
 *
 * ASKED, NOT DERIVED, and asked the way the browser would answer it: force `color` to a sentinel
 * document-wide, read every mark's computed `fill`/`stroke`, then do it again with a second
 * sentinel. A paint that arrived at both is `currentColor`; a literal, `none`, or a `var()` sat
 * still. See ink-paint.ts's paintFollowsColor for why the cheaper tests (read the `fill` attribute;
 * compare computed fill to computed color) are each a lying hex waiting to happen.
 *
 * A document-level <style>, like tokenReaches' — NOT an inline style on the marks. That is
 * overlay-classes.ts's THE RULE: the overlay may stamp an `sx-ov-` class on a page element and must
 * never otherwise mutate one, and it must never touch their children at all. A throwaway sheet in
 * <head> mutates nothing on the page and cannot poison a generated selector. `*` is broader than the
 * block, which costs nothing: the node is appended and removed inside the same task, so no frame
 * ever renders it and the user sees no flash — the same argument tokenReaches makes.
 *
 * Cost is two style inserts + two forced recalcs per CLICK — and only for a block containing marks
 * at all. Hover does not come here: it calls resolveMeaningfulBlock, never resolveRoles.
 *
 * KNOWN LIMIT, unreached today: a mark inside <defs>/<mask>/<clipPath> renders nothing yet would be
 * counted, and a hidden mark likewise. This template has neither (no component under
 * app/components/ contains one), and the text-node half has always had the same blind spot. It fails
 * SAFE in any case — an extra bearer can only make the "all agree" test stricter, which withholds a
 * role, never fabricates one.
 */
function marksFollowingColor(block: HTMLElement): Element[] {
  const marks = Array.from(block.querySelectorAll(SVG_MARK_SEL));
  if (marks.length === 0) return [];
  const host = document.head ?? document.documentElement;
  if (!host) return [];
  const st = document.createElement("style");
  host.appendChild(st);
  try {
    const readings = INK_SENTINELS.map((c) => {
      st.textContent = `*{color:${c}!important}`;
      // `color` comes back with fill/stroke, out of the same getComputedStyle, because that is what
      // paintFollowsColor compares against — never the `c` above. A sentinel is CSS we author; what
      // the browser serialises back is its own business (`rgb(1,2,3)` reads back `rgb(1, 2, 3)`),
      // and the only reading that can answer "is this currentColor?" honestly is one where both
      // sides went through the same serialiser.
      return marks.map((m): MarkPaint => {
        const cs = getComputedStyle(m);
        return { fill: cs.fill, stroke: cs.stroke, color: cs.color };
      });
    });
    return marks.filter((_, i) => paintFollowsColor(readings.map((r) => r[i])));
  } finally {
    st.remove();
  }
}

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
    // So: `block` is the painter only when it genuinely DETERMINES its colour. Gather the elements
    // that actually RENDER INK and require all of them to have inherited block's colour unchanged.
    // If any re-declares, no single element paints this block's ink — the role is absent rather than
    // a lie. That rule is sound and stays; what was wrong was its notion of ink.
    //
    // "RENDERS INK" WAS DEFINED AS "OWNS A TEXT NODE", and that is the bug the user hit. `color`
    // paints two things, not one: glyphs, and every SVG mark whose fill/stroke is `currentColor` —
    // which is 31 of the 34 SVG paint attributes in this template. An icon holder like
    // `.contact_info-icon.is-phone` owns no text node at all, so it had zero bearers and the gate
    // below refused the role outright — for a `color` that demonstrably paints (force the holder's
    // `color` to magenta and the <path>'s computed stroke follows it from rgb(47,158,68) to
    // rgb(255,0,255)). The comment that gate used to carry said an icon-only button's `color` "never
    // paints a pixel". It paints the icon.
    //
    // So the concept is EXTENDED rather than special-cased: a mark that follows `color` is a bearer
    // exactly as a text node's owner is, and the "all bearers agree" test below reads it unchanged.
    // The bearer is the MARK, not the holder — `currentColor` on a <path> resolves against the
    // <path>'s own computed `color`, so the mark is where the question "did block's colour reach
    // this ink unmodified?" is actually asked. Marks that do NOT follow `color` are not bearers and
    // never were: the template's `fill="var(--…ink--base)"` and `fill="#ffffff"` marks have no
    // per-element colour route, and inventing one for them is the lying hex again.
    const textBearers = candidates.filter(ownsGlyphs);
    const inkBearers: Element[] = [...textBearers, ...marksFollowingColor(block)];
    // Still the right gate, now asked of the right set: the navbar shell and a bg-only <a> render no
    // ink of any kind, so they have no text colour to edit. An icon-only button is no longer one of
    // them.
    if (inkBearers.length === 0) return null;
    // Compare BROWSER-SERIALISED colour strings — NOT hex. Hex would drop every non-opaque colour
    // to undefined and make unequal colours compare equal. And compare the DEFAULT state on both
    // sides: `.hero-quote_upload:hover { color: #ffffff }` recolours a block whose children
    // re-declare their own colour, so a live comparison would find them equal only while the pointer
    // is on it — handing back `block`, and with it a hex no glyph under the pointer has.
    const blockColor = roleColor(block, "text");
    return inkBearers.every((el) => roleColor(el, "text") === blockColor) ? block : null;
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
function inTransientChain(el: Element): boolean {
  try {
    return !!el.closest(TRANSIENT_SEL);
  } catch {
    return true;
  }
}
function transientlyMoves(el: Element, prop: RoleProp, inherited: boolean): boolean {
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
function winningDecl(el: Element, prop: string): string | undefined {
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
function detectToken(el: Element, prop: string): string | undefined {
  const varName = varNameOf(winningDecl(el, prop));
  if (!varName) return undefined;
  for (const [k, m] of Object.entries(PALETTE_VARS)) if (m.cssVar === varName) return k;
  for (const [k, m] of Object.entries(TOKEN_VARS)) if (m.cssVar === varName) return k;
  return undefined;
}

/** The cssVar behind a seed/token key, whichever tier it is in. */
const cssVarOf = (key: string): string | undefined =>
  (PALETTE_VARS as Record<string, { cssVar: string }>)[key]?.cssVar ??
  (TOKEN_VARS as Record<string, { cssVar: string }>)[key]?.cssVar;

/**
 * Would a SITE-WIDE override of `tokenKey` actually move `el` — or is it shadowed here?
 *
 * detectToken says which token an element READS. It does NOT say that re-declaring that token
 * site-wide reaches this element, and in this template those are routinely different facts. Each
 * tier-B token is declared 31 times: `:root`, `body`, and 29 SECTION selectors (`.master_footer`,
 * `.content_hero-home-c`, `.wrap_home-a`, …) that re-theme their own subtree. A custom property
 * resolves from the nearest declaring ancestor, so for an element inside one of those sections the
 * section's declaration wins over anything paletteStyle emits at `:root, html body` — and the
 * override paints everything EXCEPT the element the user clicked.
 *
 * That is not hypothetical and it is not rare. Measured on /vi/about: a site-wide `tone--medium`
 * override moves 105 elements, and not the `.tone-medium` span in `.content_hero-home-c` — which is
 * precisely the element that sent a user looking for this feature. The panel promotes "đổi cả site"
 * as the DEFAULT action, so offering it there would be the accentAqua bug exactly: a prominent
 * control that emits, parses, applies, and paints nothing on the thing it is pointed at.
 *
 * ASKED, NOT DERIVED — for the same reason INERT_SEED_KEYS is data checked against the stylesheet
 * rather than a hardcoded list. We could enumerate the 29 sections here and go stale silently; or
 * compare the token's computed value on `el` against `body`'s, which is wrong in a way that reads as
 * right (a section re-declaring a token to the SAME value still shadows an override, and the strings
 * would match). So this runs the REAL mechanism: emit the exact rule paletteStyle emits, with a
 * sentinel, and ask `el` what it resolves. Reads back the sentinel → the route reaches it. Reads back
 * anything else → something between `body` and `el` re-declares it, and the route does not. No
 * approximation, and nothing to keep in sync with the template.
 *
 * Cost is one style insert + one forced recalc per role per CLICK (≤3), and the node is removed
 * inside the same task, so nothing paints and the user sees no flash. Verified in the browser
 * against ground truth (does the colour actually move?) in BOTH directions: true for a free
 * `.tone-medium`, false for the one inside `.content_hero-home-c`.
 */
const REACH_SENTINEL = "#010203";
function tokenReaches(el: Element, tokenKey: string): boolean {
  const cssVar = cssVarOf(tokenKey);
  if (!cssVar) return false;
  const host = document.head ?? document.documentElement;
  if (!host) return false;
  const st = document.createElement("style");
  // paletteStyle()'s own ROOT_SELECTOR, imported rather than re-typed — this probe is only worth
  // anything because it asks about the rule we really emit, `html body` specificity included, and a
  // second copy would silently keep answering for a rule that is no longer emitted.
  st.textContent = `${ROOT_SELECTOR}{${cssVar}:${REACH_SENTINEL}}`;
  host.appendChild(st);
  try {
    return getComputedStyle(el).getPropertyValue(cssVar).trim() === REACH_SENTINEL;
  } finally {
    st.remove();
  }
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
  el: Element,
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
  //
  // DESCENDANT FIRST, CHILD AS FALLBACK — the ordering is the whole design, so read why.
  //
  // The walk above visits EVERY level from `el` up to `root` (`node.parentElement` each step), so
  // `parts` carries one segment per real parent→child edge and supports either combinator:
  //   • " "  (descendant) — what this function emitted before the child combinator existed. Short,
  //     but a SHAPE: every hop re-opens to any depth, so a repeated structure (form rows, the
  //     footer columns) matches it repeatedly and verify() then refuses.
  //   • " > " (child) — pins each hop to its actual parent, so the path is a ROUTE. For one fixed
  //     segment chain a " > " path matches a SUBSET of what the " " path matches, and the target is
  //     in both (every edge is real): child can only ever REMOVE a spurious co-match, never lose the
  //     target. Its one cost is length — " > " is +2 chars/hop against SELECTOR_MAX_LEN=300.
  //
  // So try the descendant form first and keep it when it already resolves to exactly the target:
  // that is byte-identical to every selector this function emitted before, so no working anchor
  // changes, and — the reason the ordering is not merely cosmetic — a deep element whose CHILD path
  // would exceed 300 keeps its shorter descendant path instead of being lost to the length cap
  // (measured: contactPage's upload-help text is 277 as a descendant, 305 as a child; descendant
  // first is what keeps it anchorable). Fall back to the child form only where descendant is
  // ambiguous — a repeated shape only a route disambiguates, e.g. the footer company name
  // (`businessContact.legalName`, a class-less <span>) and the contact form-row internals ("Tên").
  // verify() guards BOTH attempts, so an over-length child or an ambiguous block-key prefix fails
  // closed (no override), exactly as before.
  const key = root.getAttribute("data-sx-block") ?? "";
  const asDescendant = verify(composeSelector(key, parts, " "), el);
  if (asDescendant) return asDescendant;
  return verify(composeSelector(key, parts, " > "), el);
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
    const tokenKey = detectToken(painter, ROLE_PROP[role]);
    out.push({
      role,
      // Undefined only when the DEFAULT-state colour isn't representable as hex AT ALL — a gradient
      // or a colour space we don't read. Alpha is representable now (#rrggbbaa), so a translucent
      // colour reports its real value instead of reading as "no colour here".
      hex: rgbToHex(roleColor(painter, role)),
      tokenKey,
      // Only meaningful alongside a tokenKey, and asked only then: the probe costs a forced recalc.
      tokenReaches: tokenKey ? tokenReaches(painter, tokenKey) : undefined,
      selector: buildSelector(painter) ?? undefined,
    });
  }
  return out;
}
