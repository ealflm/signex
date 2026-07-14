import test from "node:test";
import assert from "node:assert/strict";
import { asSegment } from "./color-engine.ts";
import { pickSegment } from "./selector-path.ts";
import { CLASS_COLOR_HOVER, CLASS_FLASH } from "./overlay-classes.ts";

// A minimal stand-in for the only Element surface asSegment touches. Deliberately not a DOM: the
// defect under test is that asSegment reads the LIVE class attribute, so what matters is exactly
// what that attribute says at click time.
const el = (tag, className) => ({
  tagName: tag,
  getAttribute: (n) => (n === "class" ? className : null),
});

// The two steps buildSelector runs verbatim for every node in its block walk (color-engine.ts:
// "siblings = children.map(asSegment)" then "pickSegment(self, siblings)"). Elements reaching this
// walk have NO data-sx-c — the anchor short-circuit above it returned nothing — which is precisely
// the "any element" case colour mode exists for, and the case browser verification never covered.
// pickSegment compares siblings by IDENTITY, so `self` must be the very object inside `siblings` —
// map ONCE and index it, exactly as buildSelector does. Mapping twice silently makes every element
// collide with its own copy and returns null for everything, which looks like a passing "returns
// null" test while proving nothing.
const segmentFor = (target, siblings) => {
  const segs = siblings.map(asSegment);
  return pickSegment(segs[siblings.indexOf(target)], segs);
};

const HOVER = CLASS_COLOR_HOVER;
const FLASH = CLASS_FLASH;

test("overlay hover class does not displace the real sibling-disambiguating selector", () => {
  const target = el("div", `card ${HOVER}`);
  const siblings = [target, el("div", "card")];
  assert.equal(segmentFor(target, siblings), ".card:nth-of-type(1)");
});

test("overlay hover class does not manufacture an anchor for an unclassed element", () => {
  const target = el("div", HOVER);
  const siblings = [target, el("div", "")];
  assert.equal(segmentFor(target, siblings), null);
});

test("overlay flash class does not displace the real sibling-disambiguating selector", () => {
  const target = el("div", `card ${FLASH}`);
  const siblings = [target, el("div", "card")];
  assert.equal(segmentFor(target, siblings), ".card:nth-of-type(1)");
});

test("overlay flash class does not manufacture an anchor for an unclassed element", () => {
  const target = el("div", FLASH);
  const siblings = [target, el("div", "")];
  assert.equal(segmentFor(target, siblings), null);
});

test("both overlay marks at once are dropped, and the real class still anchors", () => {
  const target = el("div", `${HOVER} btn-bg ${FLASH}`);
  const siblings = [target, el("div", "button_text-mask")];
  assert.equal(segmentFor(target, siblings), ".btn-bg");
});

// The mirror-image bug: the overlay does NOT own `sx-`. These are real, anchorable classes shipped
// by the public site (globals.css / lead-upload-field.tsx / lead-form-notice.tsx). Filtering all of
// `sx-` rather than the reserved `sx-ov-` prefix would strip legitimate anchors off real elements.
test("the page's own sx- classes are NOT mistaken for overlay marks", () => {
  const target = el("button", "sx-upload__btn");
  assert.equal(segmentFor(target, [target, el("button", "sx-upload__meta")]), ".sx-upload__btn");

  const notice = el("button", "sx-notice__close");
  assert.equal(
    segmentFor(notice, [notice, el("div", "sx-notice__msg")]),
    ".sx-notice__close",
  );
});
