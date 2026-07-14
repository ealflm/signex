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
