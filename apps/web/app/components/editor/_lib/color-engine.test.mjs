import test from "node:test";
import assert from "node:assert/strict";
import { HexA } from "@signex/shared";
import { asSegment, declarationSets, rgbToHex } from "./color-engine.ts";
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

// WAS: "refuses alpha in EVERY form — Hex is #rgb/#rrggbb, and a lying hex is worse than a blank".
// That premise died with the storable type. Tokens and per-element overrides now take HexA
// (#rrggbbaa) because they are TERMINAL — no color-mix in this template consumes either, so the
// alpha written is the alpha rendered. Only the SEEDS stay opaque, and they have no caller here.
// Refusing alpha was the third of three faults behind a real dead end: a user clicked
// aboutPage.hero.title.accent (a .tone-medium span → color-mix(… 64%, transparent)), this returned
// undefined, and the panel said "Không đổi được bằng mã hex" with nothing to do about it.
test("EXPRESSES alpha as #rrggbbaa — a translucent colour is a colour, not a blank", () => {
  // The user's actual element: .tone-medium → --base--light-64 → color-mix(… 64%, transparent),
  // which Chrome serialises exactly like this (measured on /vi/about).
  assert.equal(rgbToHex("color(srgb 1 1 1 / 0.64)"), "#ffffffa3");
  assert.equal(rgbToHex("color(srgb 0.0509804 0.168627 0.266667 / 0.88)"), "#0d2b44e0");
  assert.equal(rgbToHex("rgba(13, 43, 68, 0.5)"), "#0d2b4480");
  assert.equal(rgbToHex("#0d2b4480"), "#0d2b4480");
  assert.equal(rgbToHex("#0d2b448a"), "#0d2b448a");
});

test("fully transparent is a real, distinct value — not the same answer as 'unreadable'", () => {
  // isPainted treats alpha 0 as "no colour painted" and drops the role before it gets here, so this
  // is about honesty of the primitive rather than a reachable panel state: 0 must not collide with
  // undefined, or a caller distinguishing them would silently be reading a boolean.
  assert.equal(rgbToHex("rgba(0, 0, 0, 0)"), "#00000000");
  assert.equal(rgbToHex("color(srgb 1 1 1 / 0)"), "#ffffff00");
});

test("opaque still returns SIX digits — stored palettes are 6-digit and must not churn", () => {
  // The backward-compat direction that actually gets exercised: an untouched opaque colour re-saved
  // through the new picker has to round-trip to the bytes already in the snapshot.
  assert.equal(rgbToHex("rgba(13, 43, 68, 1)"), "#0d2b44");
  assert.equal(rgbToHex("color(srgb 1 1 1 / 1)"), "#ffffff");
  assert.equal(rgbToHex("#0d2b44ff"), "#0d2b44");
});

test("still refuses what hex genuinely CANNOT carry — the read-only row's real reason", () => {
  // These are what "no hex" is now allowed to mean, and the panel's copy names exactly this.
  assert.equal(rgbToHex("linear-gradient(180deg, #fff, #000)"), undefined);
  assert.equal(rgbToHex("color(display-p3 1 0 0)"), undefined); // wrong space — reading it as sRGB would be a lying hex
  assert.equal(rgbToHex("color-mix(in srgb, white 64%, transparent)"), undefined); // unresolved
  assert.equal(rgbToHex("rebeccapurple"), undefined);
  assert.equal(rgbToHex("none"), undefined);
  assert.equal(rgbToHex(""), undefined);
});

// The value this function produces is stored, so it must be storable. This is the join between the
// engine and the schema that no type checks: color-engine lives in apps/web, HexA in shared, and
// the two meet only over postMessage → PaletteSchema, where a mismatch is a 422 on save-draft that
// takes the whole batch (including unrelated block edits) with it.
//
// So this MUST import the real HexA, not re-type its regex. A local copy asserts rgbToHex agrees
// with this file — which nothing outside this file believes — and passes just as green after the
// real HexA is narrowed to 6-digit and every alpha value starts 422ing the batch. Mutation-checked
// in both directions: narrowing HexA in shared (+ `npm run build -w @signex/shared`) turns this red.
// Importing across the workspace is what makes the assertion about the join it names.
const storable = (v) => HexA.safeParse(v).success;

test("every hex it emits is accepted by the schema that will store it", () => {
  for (let a = 0; a <= 255; a++) {
    const out = rgbToHex(`rgba(13, 43, 68, ${a / 255})`);
    assert.ok(storable(out), `rgbToHex produced an unstorable ${out} at alpha byte ${a}`);
  }
  for (const v of ["rgb(0,0,0)", "color(srgb 1 1 1 / 0.64)", "#FFF", "#0d2b4480"]) {
    assert.ok(storable(rgbToHex(v)), `unstorable output for ${v}`);
  }
});

test("reads a custom property's value as AUTHORED — hex is what defaultStateColor gets back", () => {
  // getComputedStyle(el).getPropertyValue("--…") returns the substituted token stream, not a
  // browser-normalised colour: the template authors its seeds as hex, so hex is what arrives.
  assert.equal(rgbToHex("#0d2b44"), "#0d2b44");
  assert.equal(rgbToHex("  #0d2b44  "), "#0d2b44"); // decls come back whitespace-padded
  assert.equal(rgbToHex("#FFF"), "#ffffff");
  assert.equal(rgbToHex("#0D2B44"), "#0d2b44");
});

// ── declarationSets ───────────────────────────────────────────────────────────
// The transient gate's predicate, minus the DOM. It decides, for one declared property name in one
// `:hover`/`:focus` rule, whether that rule can move the colour being read — and therefore whether
// the live computed value is trusted or handed to the declaration walk. Both answers are wrong in
// their own way (color-engine.ts: defaultStateColor), so which names it accepts IS the gate.

test("a property matches itself", () => {
  assert.equal(declarationSets("background-color", "background-color"), true);
  assert.equal(declarationSets("color", "color"), true);
  assert.equal(declarationSets("border-color", "border-color"), true);
});

// THE case the gate exists for, from the other side. `.text-field` is `border: 1px solid var(--…)`
// and has NO `:hover` rule; `.btn-bg` is the same shorthand and DOES (`.btn-bg:hover` moves the
// border). A shorthand carrying a var() is held pending substitution, so asking such a rule for a
// VALUE (`getPropertyValue("border-color")` → "") would answer "moves nothing" for both. Names can't
// be fooled that way — which is why the gate reads names.
test("a shorthand matches the longhand it carries", () => {
  assert.equal(declarationSets("border", "border-color"), true);
  assert.equal(declarationSets("border-top", "border-color"), true);
  assert.equal(declarationSets("border-top-color", "border-color"), true);
  assert.equal(declarationSets("border-inline-start-color", "border-color"), true);
  assert.equal(declarationSets("background", "background-color"), true);
});

// The other direction is the one that fabricates: a name accepted here sends a read that was already
// correct down the walk, which for a var-bearing shorthand answers `.w-input { border: 1px solid
// #ccc }` — an opaque #cccccc for a transparent border, and, via isPainted, a border role invented
// on an element that has none.
test("a neighbouring property in the same family does NOT match", () => {
  for (const name of [
    "border-width",
    "border-style",
    "border-radius",
    "border-collapse",
    "border-image",
    "border-image-source",
    "border-top-width",
    "border-bottom-style",
  ]) {
    assert.equal(declarationSets(name, "border-color"), false, `${name} does not set border-color`);
  }
  for (const name of ["background-image", "background-position", "background-size", "backdrop-filter"]) {
    assert.equal(declarationSets(name, "background-color"), false, `${name} does not set background-color`);
  }
  // `color` has no shorthand at all — nothing else in CSS reaches it. Notably `font`, which looks
  // like it should and doesn't, and the text decoration/fill colours, which are other properties.
  for (const name of ["font", "caret-color", "-webkit-text-fill-color", "text-decoration-color", "accent-color"]) {
    assert.equal(declarationSets(name, "color"), false, `${name} does not set color`);
  }
});

// Roles do not bleed into each other: a `:hover` rule moving the background must not open the gate
// on the border read, or the fabrication returns by a side door.
test("the three roles are answered independently", () => {
  assert.equal(declarationSets("background-color", "color"), false);
  assert.equal(declarationSets("background-color", "border-color"), false);
  assert.equal(declarationSets("border-color", "background-color"), false);
  assert.equal(declarationSets("color", "border-color"), false);
  assert.equal(declarationSets("border", "background-color"), false);
});

test("reads the name as the CSSOM hands it over", () => {
  // style.item() returns lowercase, but a hand-authored `BORDER-COLOR` costs nothing to accept and
  // an anchored regex would otherwise silently reject the whole rule — the trusting direction.
  assert.equal(declarationSets("BORDER-COLOR", "border-color"), true);
  assert.equal(declarationSets(" border ", "border-color"), true);
  // Anchored at both ends: a custom property that merely CONTAINS the name is not the name.
  assert.equal(declarationSets("--my-border-color", "border-color"), false);
  assert.equal(declarationSets("--color", "color"), false);
  assert.equal(declarationSets("", "color"), false);
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
