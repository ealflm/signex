import test from "node:test";
import assert from "node:assert/strict";

import { INK_SENTINELS, SVG_MARK_SEL, paintFollowsColor } from "./ink-paint.ts";

// The engine forces `color` to two colours in turn and reads each mark's computed fill/stroke back
// TOGETHER WITH the `color` it was read against. These two values are genuinely arbitrary — they
// stand for "whatever the browser serialised" and the predicate compares a mark's paint to the
// reading's OWN colour, never to a literal. That is a recent fact, not a timeless one: the first
// version of this module compared computed paint against the sentinel LITERAL, so authoring
// `rgb(1,2,3)` instead of `rgb(1, 2, 3)` — identical CSS — silently stripped the text role from
// every icon on the site, and this comment was flatly false. Both sides now come from the same
// serialiser, which is what makes "the values are arbitrary; they need only DIFFER" true.
const A = "rgb(1, 2, 3)";
const B = "rgb(4, 5, 6)";
/** A mark's two readings, as the probe collects them: [under A, under B]. */
const readings = (fillA, strokeA, fillB, strokeB) => [
  { fill: fillA, stroke: strokeA, color: A },
  { fill: fillB, stroke: strokeB, color: B },
];

test("a stroke that arrived at BOTH forced colours follows color — the template's lucide icon", () => {
  // <svg fill="none" stroke="currentColor"><path/></svg>: the exact shape of the phone badge the
  // user could not recolour. If this said false, the icon has no text role and the bug is back.
  assert.equal(paintFollowsColor(readings("none", A, "none", B)), true);
});

test("a filled currentColor mark follows color too — fill OR stroke, not both", () => {
  assert.equal(paintFollowsColor(readings(A, "none", B, "none")), true);
});

test("the sentinels are spelled however you like — only the COMPUTED colour is compared", () => {
  // The regression IMPORTANT-2 named, pinned. The probe authors `*{color:<sentinel>!important}` and
  // the browser answers in ITS serialisation, which need not match the literal byte for byte. Here
  // the readings' colours are spelled unlike anything the engine would author; a predicate that
  // reached for a literal instead of `r.color` could not answer true.
  const readback = [
    { fill: "none", stroke: "rgba(1, 2, 3, 0.5)", color: "rgba(1, 2, 3, 0.5)" },
    { fill: "none", stroke: "color(srgb 0 0.5 1)", color: "color(srgb 0 0.5 1)" },
  ];
  assert.equal(paintFollowsColor(readback), true);
});

test("a LITERAL fill does not follow color, even one that happens to equal the holder's color", () => {
  // THE LYING HEX, in its SVG form, and the reason this is a probe rather than an equality check.
  // `.contact_info-icon.is-phone` computes `color: rgb(47, 158, 68)`; a <path fill="#2f9e44"> in it
  // reads back the same string, so a SINGLE "computed fill === computed color" reading would call it
  // a bearer, the text role would be offered, and editing it would move nothing. Under the two
  // forced colours the literal sits still — which is the fact that separates the two.
  assert.equal(paintFollowsColor(readings("rgb(47, 158, 68)", "none", "rgb(47, 158, 68)", "none")), false);
});

test("a mark painted a token or nothing at all does not follow color", () => {
  // `fill="var(--…tokens---ink--base)"` (2 icons/page) and `fill="#ffffff"` (1/page) are out of the
  // per-element route by construction: no colour of theirs is `currentColor`, so no text role.
  assert.equal(paintFollowsColor(readings("rgb(255, 255, 255)", "none", "rgb(255, 255, 255)", "none")), false);
  assert.equal(paintFollowsColor(readings("none", "none", "none", "none")), false);
});

test("ONE matching reading is not enough — a mark literally painted the forced colour must not pass", () => {
  // Why the probe runs twice. A single read of `fill === color` cannot tell `currentColor` from a
  // mark that is coincidentally that exact colour; the second forced colour is what makes it MOVE.
  assert.equal(paintFollowsColor(readings(A, "none", "rgb(9, 9, 9)", "none")), false);
});

test("fill and stroke are judged per-property, never mixed across the two readings", () => {
  // A mark whose fill followed under A and whose STROKE followed under B follows neither: `some` is
  // over the properties, `every` is over the readings, and swapping those two quantifiers would let
  // this through.
  assert.equal(paintFollowsColor(readings(A, "none", "none", B)), false);
});

test("fewer than two readings is refused, not guessed", () => {
  assert.equal(paintFollowsColor([{ fill: A, stroke: "none", color: A }]), false);
  assert.equal(paintFollowsColor([]), false);
});

test("a probe whose colour never MOVED is refused — it cannot tell currentColor from a literal", () => {
  // The failure this guard exists for: two identical sentinels, or a page rule beating the probe.
  // Then `color` reads the same in both passes and `r.stroke === r.color` is answered against a
  // constant — a mark literally painted that colour is indistinguishable from a currentColor one.
  // Both readings below say "stroke === color"; only the movement of `color` makes that mean
  // anything, so with no movement the honest answer is false, not true.
  assert.equal(
    paintFollowsColor([
      { fill: "none", stroke: A, color: A },
      { fill: "none", stroke: A, color: A },
    ]),
    false,
  );
});

test("INK_SENTINELS satisfies the contract paintFollowsColor requires of it", () => {
  // The module's own constant, checked against its own predicate's precondition — the coupling that
  // used to be a byte-comparison with the browser and is now this one line. Two sentinels that were
  // equal (or a list of one) would make every mark's `color` sit still, refuse every bearer, and
  // hand every icon on the site back its original bug in silence.
  assert.ok(INK_SENTINELS.length >= 2, "the probe needs at least two passes");
  assert.equal(new Set(INK_SENTINELS).size, INK_SENTINELS.length, "the sentinels must differ");
  // Deliberately NOT asserted: that they are spelled `rgb(r, g, b)`. Pinning a FORMAT here would
  // re-create the coupling this change removed, one layer up — `hsl(0, 100%, 50%)` is a perfectly
  // good sentinel. The residual the module cannot decide in node is that they are colours a browser
  // ACCEPTS: a non-colour makes `color` sit still, which paintFollowsColor's movement guard catches
  // at runtime by refusing every mark rather than fabricating a bearer.
});

test("SVG_MARK_SEL names the elements that PAINT, and neither <svg> nor <g>", () => {
  const marks = SVG_MARK_SEL.split(",");
  // The two the template's icons actually use. Losing either silently un-fixes a page of icons.
  for (const m of ["path", "rect", "circle"]) assert.ok(marks.includes(m), `missing ${m}`);
  // <svg>/<g> carry fill/stroke for descendants to INHERIT but render nothing themselves; counting
  // one would add a bearer no pixel corresponds to.
  for (const m of ["svg", "g", "defs"]) assert.ok(!marks.includes(m), `${m} must not be a mark`);
});
