// What "renders ink" means for an SVG mark — the pure half of color-engine's ink-bearer test.
//
// Same reason as selector-path.ts and edit-caps.ts: apps/web has no jsdom, so color-engine.ts keeps
// the decidable logic here, where node --test can drive it, and keeps only the live CSSOM reads
// (which need a browser) in the engine.

/**
 * The SVG elements that can PAINT — the ones whose `fill`/`stroke` put pixels on screen.
 *
 * Deliberately the shapes and the text content elements, NOT `<svg>` or `<g>`: those two carry
 * `fill`/`stroke` for their descendants to inherit but render nothing themselves, so counting them
 * would add a "bearer" that no pixel corresponds to — and this engine's whole doctrine is that a
 * colour it reports must be one some pixel actually has. Testing the shape works either way, since
 * `fill` and `stroke` inherit: `<svg stroke="currentColor"><path/></svg>` reaches the <path>, and
 * `currentColor` there resolves against the <path>'s OWN computed `color`, which is what the probe
 * reads.
 */
export const SVG_MARK_SEL =
  "path,circle,ellipse,line,polygon,polyline,rect,text,tspan,textPath,use";

/** One mark's paint, as the browser serialises it. */
export type MarkPaint = { fill: string; stroke: string };

/**
 * Does this mark's paint FOLLOW `color` — i.e. is its `fill` or `stroke` `currentColor`?
 *
 * `readings[i]` is the mark's computed paint while the document's `color` was forced to
 * `sentinels[i]`. ASKED, NOT DERIVED, for the same reason `tokenReaches` runs the real emitter and
 * `normalizeColor` runs the value twice against two inherited colours: the alternatives all lie.
 * Reading the `fill` ATTRIBUTE misses a `fill` that arrives from CSS (and vice-versa, since a
 * presentation attribute loses to any author rule); comparing the computed `fill` to the computed
 * `color` for EQUALITY says yes to `<path fill="#2f9e44">` sitting in a `color: #2f9e44` holder —
 * a mark that would not move one pixel when the user edits the text role, which is precisely the
 * lying hex this file refuses to produce. Only a value that MOVED with `color`, to each sentinel in
 * turn, is following it. A literal cannot move; `fill: none` cannot move; `var(--…ink--base)` cannot
 * move. One reading would not be enough — a mark literally painted `sentinels[0]` would pass — so
 * two are required, and a caller offering fewer gets `false` rather than a guess.
 *
 * `fill` OR `stroke`: the template's icons are lucide outlines (`fill="none"
 * stroke="currentColor"`), so requiring both would reject every one of them.
 */
export const paintFollowsColor = (
  readings: readonly MarkPaint[],
  sentinels: readonly string[],
): boolean => {
  if (sentinels.length < 2 || readings.length !== sentinels.length) return false;
  return (["fill", "stroke"] as const).some((p) =>
    readings.every((r, i) => r[p] === sentinels[i]),
  );
};
