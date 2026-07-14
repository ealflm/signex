import test from "node:test";
import assert from "node:assert/strict";
import { asSegment, rgbToHex } from "./color-engine.ts";
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

// ── rgbToHex ──────────────────────────────────────────────────────────────────
// The other half of the resolution that needs no DOM. It decides, for every role of every click,
// between "here is the colour, edit it" and the read-only empty state — so what it can and cannot
// read IS the feature's surface.

test("reads the rgb()/rgba() forms getComputedStyle serialises an ordinary colour to", () => {
  assert.equal(rgbToHex("rgb(13, 43, 68)"), "#0d2b44");
  assert.equal(rgbToHex("rgb(255 255 255)"), "#ffffff");
  assert.equal(rgbToHex("rgba(13, 43, 68, 1)"), "#0d2b44");
});

// THE nav CTA case. `.btn-bg:hover` reads --base--dark-88 = color-mix(… 88%, transparent), which
// Chrome serialises like this. The old parser matched only /^rgba?\(/, so this read as "no colour
// at all" — and that verdict, used as a CANDIDACY gate, deleted the whole bg role rather than
// showing it read-only. The alpha still makes it unstorable; being READ is what makes it honest.
test("reads Chrome's color(srgb …) serialisation of a color-mix()", () => {
  assert.equal(rgbToHex("color(srgb 0.0509804 0.168627 0.266667)"), "#0d2b44");
  assert.equal(rgbToHex("color(srgb 1 1 1 / 1)"), "#ffffff");
});

test("refuses alpha in EVERY form — Hex is #rgb/#rrggbb, and a lying hex is worse than a blank", () => {
  // hero.titleBottom's real case: .tone-medium → --base--light-64 → color-mix(… 64%, transparent).
  assert.equal(rgbToHex("color(srgb 1 1 1 / 0.64)"), undefined);
  assert.equal(rgbToHex("color(srgb 0.05 0.17 0.27 / 0.88)"), undefined);
  assert.equal(rgbToHex("rgba(13, 43, 68, 0.5)"), undefined);
  assert.equal(rgbToHex("rgba(0, 0, 0, 0)"), undefined);
  assert.equal(rgbToHex("#0d2b4480"), undefined);
});

test("reads a custom property's value as AUTHORED — hex is what defaultStateColor gets back", () => {
  // getComputedStyle(el).getPropertyValue("--…") returns the substituted token stream, not a
  // browser-normalised colour: the template authors its seeds as hex, so hex is what arrives.
  assert.equal(rgbToHex("#0d2b44"), "#0d2b44");
  assert.equal(rgbToHex("  #0d2b44  "), "#0d2b44"); // decls come back whitespace-padded
  assert.equal(rgbToHex("#FFF"), "#ffffff");
  assert.equal(rgbToHex("#0D2B44"), "#0d2b44");
});

test("refuses what it cannot read rather than guessing at it", () => {
  // A var left unresolved, an unresolved color-mix, a gradient, a named colour (the computed-style
  // path normalises those before we ever see them), and another colour space — whose numbers read
  // as sRGB would be exactly the lying hex the whole parser exists to refuse.
  for (const v of [
    "var(--_🎨-color--base---accent--dark-ocean)",
    "color-mix(in srgb, #ffffff 64%, transparent)",
    "linear-gradient(#fff, #000)",
    "white",
    "transparent",
    "",
    "color(display-p3 0.05 0.17 0.27)",
    "rgb(nope, x, y)",
  ]) {
    assert.equal(rgbToHex(v), undefined, `expected no hex for ${v}`);
  }
});
