// Pure segment chooser for generated override selectors. DOM-free on purpose: apps/web has no
// jsdom, and this is the only part of selector generation with real logic — the DOM walk in
// color-engine.ts is thin glue verified in the browser.

export type SegmentInput = { tag: string; classes: string[] };

/** Must match packages/shared/src/content/selector.ts — a class outside this charset is unusable. */
const CLASS_RE = /^[A-Za-z0-9_-]+$/;

/**
 * Build one selector segment for `target` among `siblings` (which INCLUDES target).
 * Prefers a class unique among siblings — Webflow's classes are semantic (.btn-bg, .cta_primary),
 * so a unique one is both stable and readable. Falls back to :nth-of-type over same-tag siblings.
 * Returns null when no class survives the charset filter, the same-tag index is out of the
 * grammar's 1..99 range, or every usable class still collides with another sibling at that
 * index — in all cases the caller then refuses to anchor rather than emit an ambiguous selector.
 */
export function pickSegment(target: SegmentInput, siblings: SegmentInput[]): string | null {
  const usable = target.classes.filter((c) => CLASS_RE.test(c));
  if (usable.length === 0) return null;

  const unique = usable.find(
    (c) => siblings.filter((s) => s !== target && s.classes.includes(c)).length === 0,
  );
  if (unique) return `.${unique}`;

  // nth-of-type is 1-based and counts same-tag siblings only.
  const sameTag = siblings.filter((s) => s.tag === target.tag);
  const idx = sameTag.indexOf(target) + 1;
  if (idx < 1 || idx > 99) return null; // grammar caps n at 99

  // The grammar (packages/shared/src/content/selector.ts) has no type-selector production — a
  // segment is only `.class` or `.class:nth-of-type(n)`. Crucially, CSS evaluates :nth-of-type
  // per ELEMENT TYPE, not per class: `.card:nth-of-type(1)` matches every element that is both
  // the 1st of its OWN tag among its siblings and carries `.card`, regardless of that element's
  // tag. So a differently-tagged sibling collides with our candidate whenever it carries the same
  // class AND its own per-tag index happens to equal `idx`. Assuming class + same-tag index
  // disambiguates (the old bug) is wrong; we must verify each candidate actually selects only
  // `target` among the siblings, trying every usable class before giving up.
  for (const c of usable) {
    const collides = siblings.some((s) => {
      if (s === target || !s.classes.includes(c)) return false;
      const sSameTag = siblings.filter((x) => x.tag === s.tag);
      return sSameTag.indexOf(s) + 1 === idx;
    });
    if (!collides) return `.${c}:nth-of-type(${idx})`;
  }
  return null; // every usable class collides with a differently-tagged sibling at this index
}
