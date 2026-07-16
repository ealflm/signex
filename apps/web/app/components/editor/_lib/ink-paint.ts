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

/**
 * The colours the engine forces `color` to, one probe pass each.
 *
 * The ONLY contract is that they are valid CSS colours that COMPUTE to different values — see
 * paintFollowsColor, which reads each mark's own `color` back rather than trusting these strings, so
 * their spelling is genuinely arbitrary. That was NOT true of the first version of this module: it
 * compared the browser's computed serialisation against these literals, which made a `!important`
 * declaration of `rgb(1,2,3)` (identical CSS, two fewer spaces) read back as `"rgb(1, 2, 3)"`,
 * compare unequal, and silently strip the text role from every icon on the site. The test file even
 * said the values were arbitrary. They were the opposite, and nothing could catch it: the same
 * literal sat on both sides of the comparison.
 *
 * They live HERE, next to the predicate whose contract they must satisfy, so the one fact that can
 * un-fix the icon bug is inside the module a test can drive.
 */
export const INK_SENTINELS = ["rgb(1, 2, 3)", "rgb(4, 5, 6)"] as const;

/** One mark's paint, and the `color` it was painted AGAINST — all three as the browser serialises
 *  them, read from the same CSSOM in the same pass. `color` is what makes the comparison below a
 *  question about the browser rather than a question about our string literals. */
export type MarkPaint = { fill: string; stroke: string; color: string };

/**
 * Does this mark's paint FOLLOW `color` — i.e. is its `fill` or `stroke` `currentColor`?
 *
 * `readings[i]` is the mark's computed paint while the document's `color` was forced to
 * `INK_SENTINELS[i]`. ASKED, NOT DERIVED, for the same reason `tokenReaches` runs the real emitter
 * and `normalizeColor` runs the value twice against two inherited colours: the alternatives all lie.
 * Reading the `fill` ATTRIBUTE misses a `fill` that arrives from CSS (and vice-versa, since a
 * presentation attribute loses to any author rule); comparing computed `fill` to computed `color`
 * ONCE says yes to `<path fill="#2f9e44">` sitting in a `color: #2f9e44` holder — a mark that would
 * not move one pixel when the user edits the text role, which is precisely the lying hex this file
 * refuses to produce. Only a value that MOVED with `color`, to each forced colour in turn, is
 * following it. A literal cannot move; `fill: none` cannot move; `var(--…ink--base)` cannot move.
 *
 * Both sides of `r[p] === r.color` come out of the SAME serialiser, so this asks the browser what it
 * did rather than asking whether it agrees with a string we wrote. Nothing here depends on how
 * INK_SENTINELS is spelled — which is the whole reason `color` is carried in the reading.
 *
 * TWO readings whose `color` DIFFERS are required, and both halves of that are load-bearing:
 *   - fewer than two, and a mark coincidentally painted the forced colour passes on one lucky match;
 *   - two that did not move (identical sentinels, or a probe the page beat), and EVERY mark's
 *     `r[p] === r.color` is answered against a `color` that never changed — `currentColor` and a
 *     literal become indistinguishable. A probe that did not move has not run, so it is refused
 *     rather than believed.
 * Refusal is the safe direction: a mark that is not a bearer only makes color-engine's "all bearers
 * agree" test looser, never a lie.
 *
 * `fill` OR `stroke`: the template's icons are lucide outlines (`fill="none"
 * stroke="currentColor"`), so requiring both would reject every one of them.
 */
export const paintFollowsColor = (readings: readonly MarkPaint[]): boolean => {
  if (readings.length < 2) return false;
  if (new Set(readings.map((r) => r.color)).size !== readings.length) return false;
  return (["fill", "stroke"] as const).some((p) => readings.every((r) => r[p] === r.color));
};
