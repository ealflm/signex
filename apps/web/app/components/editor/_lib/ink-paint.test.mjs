import test from "node:test";
import assert from "node:assert/strict";

import { SVG_MARK_SEL, paintFollowsColor } from "./ink-paint.ts";

// The engine forces `color` to each of these in turn and reads the mark's computed fill/stroke back.
// The values are arbitrary; what matters is that they DIFFER, which is the whole of the test.
const A = "rgb(1, 2, 3)";
const B = "rgb(4, 5, 6)";
/** A mark's two readings, as the probe collects them: [under A, under B]. */
const readings = (fillA, strokeA, fillB, strokeB) => [
  { fill: fillA, stroke: strokeA },
  { fill: fillB, stroke: strokeB },
];

test("a stroke that arrived at BOTH sentinels follows color — the template's lucide icon", () => {
  // <svg fill="none" stroke="currentColor"><path/></svg>: the exact shape of the phone badge the
  // user could not recolour. If this said false, the icon has no text role and the bug is back.
  assert.equal(paintFollowsColor(readings("none", A, "none", B), [A, B]), true);
});

test("a filled currentColor mark follows color too — fill OR stroke, not both", () => {
  assert.equal(paintFollowsColor(readings(A, "none", B, "none"), [A, B]), true);
});

test("a LITERAL fill does not follow color, even one that happens to equal the holder's color", () => {
  // THE LYING HEX, in its SVG form, and the reason this is a probe rather than an equality check.
  // `.contact_info-icon.is-phone` computes `color: rgb(47, 158, 68)`; a <path fill="#2f9e44"> in it
  // reads back the same string, so "computed fill === computed color" would call it a bearer, the
  // text role would be offered, and editing it would move nothing. Under the sentinels the literal
  // sits still — which is the fact that separates the two.
  assert.equal(
    paintFollowsColor(readings("rgb(47, 158, 68)", "none", "rgb(47, 158, 68)", "none"), [A, B]),
    false,
  );
});

test("a mark painted a token or nothing at all does not follow color", () => {
  // `fill="var(--…tokens---ink--base)"` (2 icons/page) and `fill="#ffffff"` (1/page) are out of the
  // per-element route by construction: no colour of theirs is `currentColor`, so no text role.
  assert.equal(paintFollowsColor(readings("rgb(255, 255, 255)", "none", "rgb(255, 255, 255)", "none"), [A, B]), false);
  assert.equal(paintFollowsColor(readings("none", "none", "none", "none"), [A, B]), false);
});

test("ONE matching reading is not enough — a mark literally painted the sentinel must not pass", () => {
  // Why the probe runs twice. A single read of `fill === sentinel` cannot tell `currentColor` from a
  // mark that is coincidentally that exact colour; the second sentinel is what forces it to MOVE.
  assert.equal(paintFollowsColor(readings(A, "none", "rgb(9, 9, 9)", "none"), [A, B]), false);
});

test("fill and stroke are judged per-property, never mixed across the two", () => {
  // A mark whose fill followed under A and whose STROKE followed under B follows neither: `some` is
  // over the properties, `every` is over the readings, and swapping those two quantifiers would let
  // this through.
  assert.equal(paintFollowsColor(readings(A, "none", "none", B), [A, B]), false);
});

test("fewer than two sentinels is refused, not guessed", () => {
  assert.equal(paintFollowsColor([{ fill: A, stroke: "none" }], [A]), false);
  assert.equal(paintFollowsColor([], []), false);
});

test("a readings/sentinels length mismatch is refused rather than zipped short", () => {
  // `every` over the SHORTER list would vacuously agree with a truncated probe.
  assert.equal(paintFollowsColor([{ fill: A, stroke: "none" }], [A, B]), false);
});

test("SVG_MARK_SEL names the elements that PAINT, and neither <svg> nor <g>", () => {
  const marks = SVG_MARK_SEL.split(",");
  // The two the template's icons actually use. Losing either silently un-fixes a page of icons.
  for (const m of ["path", "rect", "circle"]) assert.ok(marks.includes(m), `missing ${m}`);
  // <svg>/<g> carry fill/stroke for descendants to INHERIT but render nothing themselves; counting
  // one would add a bearer no pixel corresponds to.
  for (const m of ["svg", "g", "defs"]) assert.ok(!marks.includes(m), `${m} must not be a mark`);
});
