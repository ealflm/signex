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
 * Returns null when no class survives the charset filter; the caller then refuses to anchor.
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
  return `.${usable[0]}:nth-of-type(${idx})`;
}
