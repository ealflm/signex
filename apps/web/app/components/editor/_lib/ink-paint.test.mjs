import test from "node:test";
import assert from "node:assert/strict";

import { INK_SENTINELS, SVG_MARK_SEL, paintFollowsColor, someGlyphDisagrees } from "./ink-paint.ts";

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

// ---- someGlyphDisagrees — the glyph half ------------------------------------------------------
//
// A fake element is just its three readings. `settled` and `live` are separate fields on purpose:
// every interesting case in this predicate is one where they DISAGREE, which is what happens on the
// real page the instant the pointer parks on something (see color-engine's defaultStateColor).
// `probe()` counts the reads so the tests can assert the COST, not only the answer — the cheap
// filter in front of the expensive read is the reason this function may be called once per animation
// frame at all, and a mutation that drops it changes no answer here, only the bill.
const el = (glyphs, live, settled = live) => ({ glyphs, live, settled });
const probe = () => {
  const calls = { live: 0, settled: 0 };
  return [
    calls,
    {
      ownsGlyphs: (e) => e.glyphs,
      live: (e) => (calls.live++, e.live),
      settled: (e) => (calls.settled++, e.settled),
    },
  ];
};
const WHITE = "rgb(255, 255, 255)";
const DIM = "color(srgb 1 1 1 / 0.64)";

test("the footer bar: a bearer in another colour proves painterFor refuses the unit", () => {
  // The reported bug, in miniature. div.master_footer is white and carries data-sx-c, so the walk
  // stops there for every click in its 1233x838 — but 12 of its 36 glyph bearers are .tone-medium
  // (white at 64%) and 3 are badge text in navy/red. painterFor needs EVERY ink bearer to have
  // inherited the unit's colour, so one of these sinks the text role: proof, not a guess.
  const unit = el(false, WHITE);
  const [, p] = probe();
  assert.equal(
    someGlyphDisagrees(unit, [unit, el(true, WHITE), el(true, DIM), el(true, WHITE)], p),
    true,
  );
});

test("a unit whose glyphs all agree is left exactly alone", () => {
  // The nav CTA and every other unit on the site: nothing is proved, so resolveMeaningfulBlock keeps
  // its old answer. This is the case that MUST stay false — it is 99% of the clicks on the page, and
  // a true here would strip bg/border off every one of them.
  const unit = el(false, WHITE);
  const [, p] = probe();
  assert.equal(someGlyphDisagrees(unit, [unit, el(true, WHITE), el(true, WHITE)], p), false);
});

test("an element in another colour that renders NO glyphs is not a bearer", () => {
  // A navy layout div inside a white unit paints no ink, so it says nothing about whether the unit
  // paints its text. Without the ownsGlyphs gate the footer bar's own wrappers would "disagree" and
  // this predicate would fire on units that are perfectly able to answer.
  const unit = el(false, WHITE);
  const [, p] = probe();
  assert.equal(someGlyphDisagrees(unit, [unit, el(false, "rgb(11, 31, 51)"), el(true, WHITE)], p), false);
});

test("a bearer that only LOOKS different under the pointer is not a proof — settled has the last word", () => {
  // The pointer is parked on whatever the user is about to click, so a :hover rule recolouring a
  // descendant makes `live` disagree while the DEFAULT state — the only state colour mode edits, and
  // the one painterFor reads — agrees. Acting on `live` alone would take bg/border off a click on a
  // unit that would have answered it, on the strength of a colour that exists only while hovered.
  const unit = el(false, WHITE);
  const [calls, p] = probe();
  assert.equal(someGlyphDisagrees(unit, [unit, el(true, "rgb(255, 0, 0)", WHITE)], p), false);
  assert.ok(calls.settled > 0, "the settled read must actually have been consulted");
});

test("the live filter is allowed to MISS, and misses toward today's behaviour", () => {
  // The documented incompleteness: a :hover rule painting a bearer and its unit the same colour right
  // now hides a real default-state disagreement from the filter, so this answers false. False means
  // "no proof", the caller keeps its old answer, and the worst case is the bug we started with —
  // never a role taken from a unit that had one. Pinned so nobody reads the miss as a defect and
  // "fixes" it by dropping the filter that pays for the whole feature.
  const unit = el(false, WHITE, WHITE);
  const [, p] = probe();
  assert.equal(someGlyphDisagrees(unit, [unit, el(true, WHITE, DIM)], p), false);
});

test("AFFORDABILITY: no candidate survives the filter, no expensive read happens at all", () => {
  // THE MEASUREMENT THIS FUNCTION EXISTS TO SATISFY, as an assertion. `settled` walks a 1300-rule
  // sheet (~0.17ms/element, measured); `live` is ~0.004ms. resolveMeaningfulBlock runs once per
  // animation frame while the pointer moves, so a `settled` per bearer is a 3ms frame and this branch
  // does not ship. Deleting the `live` guard leaves every answer in this file unchanged and only this
  // assertion fails — which is the point of writing it.
  const unit = el(false, WHITE);
  const [calls, p] = probe();
  const many = [unit, ...Array.from({ length: 50 }, () => el(true, WHITE))];
  assert.equal(someGlyphDisagrees(unit, many, p), false);
  assert.equal(calls.settled, 0, "the expensive read must not run when the cheap one settles it");
});

test("AFFORDABILITY: the unit's own settled colour is read once, not once per candidate", () => {
  // It cannot change between candidates, and read per-candidate it is one sheet walk per survivor to
  // learn the same thing again.
  //
  // EVERY CANDIDATE HERE MUST SURVIVE THE FILTER AND FAIL THE CONFIRMATION, and that is the whole
  // construction of the test rather than a detail of it. My first version asserted the same bound
  // over candidates that disagreed — `some` returned on the first one, so memoised and un-memoised
  // both read `settled` exactly twice and the assertion held either way. It reported PASS against a
  // deliberately un-memoised build. A test that cannot fail has not run. These three look different
  // live (so each pays a settled pair) but agree once settled (so the walk continues to the end),
  // which is the only shape that reaches the second read of `unit` at all.
  const unit = el(false, WHITE);
  const [calls, p] = probe();
  const survivors = [el(true, DIM, WHITE), el(true, DIM, WHITE), el(true, DIM, WHITE)];
  assert.equal(someGlyphDisagrees(unit, [unit, ...survivors], p), false);
  // 3 candidate reads + the unit's, ONCE. Un-memoised this is 6.
  assert.equal(calls.settled, 4, `unit settled re-read per candidate: ${calls.settled} calls`);
});

test("AFFORDABILITY: it stops at the first PROVEN disagreement", () => {
  // `some`, not a filter+length: the answer is a yes/no and the footer's first .tone-medium span
  // settles it. Everything after it is a sheet walk bought for nothing.
  const unit = el(false, WHITE);
  const [calls, p] = probe();
  const rest = Array.from({ length: 40 }, () => el(true, DIM));
  assert.equal(someGlyphDisagrees(unit, [unit, el(true, DIM), ...rest], p), true);
  assert.ok(calls.live <= 3, `walked past the answer: ${calls.live} live reads`);
});
