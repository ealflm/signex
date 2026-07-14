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
  /** Current rendered colour; undefined when not representable as hex (alpha / gradient). */
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

/** rgb()/rgba() → #rrggbb. Undefined unless fully opaque: hex cannot carry the template's
 *  color-mix alpha, and a lying hex is worse than an honest blank. */
function rgbToHex(v: string): string | undefined {
  const m = v.match(/^rgba?\(([^)]+)\)$/);
  if (!m) return undefined;
  const [r, g, b, a] = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
  if (![r, g, b].every(Number.isFinite)) return undefined;
  if (a !== undefined && a !== 1) return undefined;
  return `#${[r, g, b].map((n) => Math.round(n).toString(16).padStart(2, "0")).join("")}`;
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
    const box = block.getBoundingClientRect();
    return (
      candidates.find((el) => {
        if (!rgbToHex(getComputedStyle(el).backgroundColor)) return false;
        const r = el.getBoundingClientRect();
        return r.width >= box.width - 1 && r.height >= box.height - 1;
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
      return parseFloat(cs.borderTopWidth) > 0 && !!rgbToHex(cs.borderTopColor);
    }) ?? null
  );
}

/**
 * Transient STATE pseudo-classes. Colour mode edits the DEFAULT state only (per-state editing is
 * explicitly out of scope), so a rule gated on one of these must not be consulted.
 *
 * This is not an exception to detectToken's "later rule wins, never break" walk — it is what makes
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

/** The custom property the winning rule reads for `prop`, mapped back to a seed/token key. */
function detectToken(el: HTMLElement, prop: string): string | undefined {
  let varName: string | undefined;
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // cross-origin sheet
    }
    for (const rule of Array.from(rules) as CSSStyleRule[]) {
      if (!rule.selectorText || !rule.style) continue;
      if (STATE_PSEUDO_RE.test(rule.selectorText)) continue; // default state only — see above
      const val = rule.style.getPropertyValue(prop);
      if (!val.startsWith("var(")) continue;
      try {
        if (!el.matches(rule.selectorText)) continue;
      } catch {
        continue; // selector this browser can't parse
      }
      varName = val.slice(4, val.indexOf(")")).trim(); // later rule wins — keep going
    }
  }
  if (!varName) return undefined;
  for (const [k, m] of Object.entries(PALETTE_VARS)) if (m.cssVar === varName) return k;
  for (const [k, m] of Object.entries(TOKEN_VARS)) if (m.cssVar === varName) return k;
  return undefined;
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

export function resolveRoles(block: HTMLElement): RoleInfo[] {
  return (["bg", "text", "border"] as ColorRole[]).map((role) => {
    const painter = painterFor(block, role);
    if (!painter) return { role };
    return {
      role,
      hex: rgbToHex(getComputedStyle(painter)[ROLE_COMPUTED[role]]),
      tokenKey: detectToken(painter, ROLE_PROP[role]),
      selector: buildSelector(painter) ?? undefined,
    };
  });
}
