import test from "node:test";
import assert from "node:assert/strict";
import { pickSegment } from "./selector-path.ts";

const el = (tag, ...classes) => ({ tag, classes });

test("prefers a class that is unique among siblings", () => {
  const target = el("div", "btn-bg");
  const siblings = [el("div", "button_text-mask"), target];
  assert.equal(pickSegment(target, siblings), ".btn-bg");
});

test("adds nth-of-type when every class is shared", () => {
  const target = el("div", "card");
  const siblings = [el("div", "card"), target, el("div", "card")];
  assert.equal(pickSegment(target, siblings), ".card:nth-of-type(2)");
});

test("nth-of-type counts only same-tag siblings", () => {
  const target = el("div", "card");
  const siblings = [el("span", "card"), el("div", "card"), target];
  assert.equal(pickSegment(target, siblings), ".card:nth-of-type(2)");
});

test("returns null when the element has no usable class", () => {
  assert.equal(pickSegment(el("div"), [el("div")]), null);
});

test("ignores classes outside the grammar charset", () => {
  const target = el("div", "w-变体", "btn-bg");
  assert.equal(pickSegment(target, [el("div", "other"), target]), ".btn-bg");
});

// :nth-of-type is evaluated per TAG in CSS — `.card:nth-of-type(1)` matches every element that is
// both the 1st of its own tag AND carries `.card`, regardless of tag. The old fallback assumed
// class + same-tag index disambiguated the target, which is false whenever a differently-tagged
// sibling shares the class and sits at the same per-tag position. Reproduced live in Chrome:
//   <div class="parent"><span class="card">a</span><div class="card">TARGET</div></div>
//   parent.querySelectorAll('.card:nth-of-type(1)') matches BOTH the span and the div.
test("rejects a nth-of-type fallback that would also match a differently-tagged sibling", () => {
  const target = el("div", "card");
  // target is the 1st div; the span is the 1st span — both are "index 1 of their own tag", so
  // `.card:nth-of-type(1)` matches both. "card" is the only usable class, so no alternative
  // exists and the function must refuse to anchor rather than emit an ambiguous selector.
  const siblings = [el("span", "card"), target];
  assert.equal(pickSegment(target, siblings), null);
});

test("tries a second usable class when the first collides with a differently-tagged sibling", () => {
  const target = el("div", "card", "frame");
  // Both "card" and "frame" are shared with another sibling, so neither is unique. Among divs,
  // target is the 2nd (divD0 is the 1st) -> idx = 2.
  const spanA = el("span"); // 1st span — pads the span index so spanB lands on index 2
  const spanB = el("span", "card"); // 2nd span -> collides with `.card:nth-of-type(2)`
  const iC0 = el("i", "frame"); // 1st (only) i -> does NOT collide with idx 2
  const divD0 = el("div"); // 1st div
  const siblings = [spanA, spanB, iC0, divD0, target];
  assert.equal(pickSegment(target, siblings), ".frame:nth-of-type(2)");
});
