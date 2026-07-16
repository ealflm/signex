// Pure segment chooser for generated override selectors. DOM-free on purpose: apps/web has no
// jsdom, and this is the only part of selector generation with real logic — the DOM walk in
// color-engine.ts is thin glue verified in the browser.

export type SegmentInput = { tag: string; classes: string[] };

/** Must match packages/shared/src/content/selector.ts — a class outside this charset is unusable. */
const CLASS_RE = /^[A-Za-z0-9_-]+$/;
/** Ditto for the type selector. Every HTML/SVG tag name passes; a custom element (`<my-x>`) does
 *  not, and then only the class rungs below are available. The template is Webflow output and has
 *  no custom elements, so this is a guard, not a code path. */
const TAG_RE = /^[A-Za-z][A-Za-z0-9]*$/;

/**
 * Build one selector segment for `target` among `siblings` (which INCLUDES target).
 *
 * Four rungs, most durable first. Every rung is sibling-unique BY CONSTRUCTION — that is the whole
 * contract, and it is what the old collision check had to establish by testing:
 *
 *   1. `.class`                     a class no sibling carries. Webflow's classes are semantic
 *                                   (.btn-bg, .cta_primary), so a unique one is stable, readable and
 *                                   independent of DOM order — always the best answer available.
 *   2. `tag.class`                  a class no SAME-TAG sibling carries. Still order-free, and it is
 *                                   the honest answer to the `.card` collision below: a
 *                                   `<span class="card">` beside a `<div class="card">` needs the
 *                                   TAG to tell them apart, not an index.
 *   3. `tag.class:nth-of-type(n)`   a same-tag sibling carries every class target has; the index
 *                                   separates them.
 *   4. `tag:nth-of-type(n)`         no usable class at all — the last resort, and the rung that
 *                                   makes "mọi element" true. `features.title.lead` is a bare
 *                                   `<span>` next to a `<span class="tone-medium">`, and before this
 *                                   rung existed it had no selector in the grammar at all.
 *
 * WHY THE COLLISION CHECK IS GONE, and why that is not a regression of 2878c40. CSS evaluates
 * :nth-of-type per element TYPE, so the old grammar's tagless `.card:nth-of-type(1)` matched every
 * element that was both first-of-its-own-tag and carried `.card` — reproduced live in Chrome
 * matching a span AND a div. Lacking a type production, that fix could only try each class in turn
 * and, when all of them collided, REFUSE to anchor. Naming the tag removes the ambiguity at its
 * source: a sibling matching `div.card:nth-of-type(2)` must be a div (so it is counted in the same
 * per-tag sequence) at index 2 of that sequence — which is target and nothing else. The invariant
 * the fix defended is now structural rather than checked, so the check has nothing left to do and
 * rungs 2/3 anchor the very cases it had to give up on. selector-path.test.mjs states the invariant
 * directly — it evaluates the emitted segment against the sibling list under CSS's real per-tag
 * nth-of-type semantics — so a future rung that reintroduces the collision fails there.
 *
 * Returns null when no rung applies: no usable class AND no usable tag, or a same-tag index outside
 * the grammar's 1..99. The caller then refuses to anchor rather than emit an ambiguous selector.
 */
export function pickSegment(target: SegmentInput, siblings: SegmentInput[]): string | null {
  const usable = target.classes.filter((c) => CLASS_RE.test(c));

  // Rung 1 — a class nothing else here carries. Preferred over every tag-bearing rung below: a
  // class is authored intent, an index is an accident of layout.
  const unique = usable.find(
    (c) => !siblings.some((s) => s !== target && s.classes.includes(c)),
  );
  if (unique) return `.${unique}`;

  if (!TAG_RE.test(target.tag)) return null;
  // nth-of-type is 1-based and counts same-tag siblings only — which is exactly why the tag is
  // named alongside it from here down.
  const sameTag = siblings.filter((s) => s.tag === target.tag);

  // Rung 2 — a class no sibling OF THE SAME TAG carries; the tag does the rest, no index needed.
  const tagUnique = usable.find(
    (c) => !sameTag.some((s) => s !== target && s.classes.includes(c)),
  );
  if (tagUnique) return `${target.tag}.${tagUnique}`;

  const idx = sameTag.indexOf(target) + 1;
  if (idx < 1 || idx > 99) return null; // grammar caps n at 99
  // Rung 3 / rung 4. The class is kept when there is one: it is not needed for uniqueness (tag +
  // per-tag index already names one element), and it buys no durability either — the segment is a
  // CONJUNCTION, so it still requires the index, and a re-order breaks it whether the class is
  // there or not. Keeping the class only NARROWS: it says what the element is, and if the DOM
  // changes under a stored selector it fails closed (matches nothing, override is a no-op) rather
  // than silently repainting whatever slid into that index.
  return usable.length
    ? `${target.tag}.${usable[0]}:nth-of-type(${idx})`
    : `${target.tag}:nth-of-type(${idx})`;
}
