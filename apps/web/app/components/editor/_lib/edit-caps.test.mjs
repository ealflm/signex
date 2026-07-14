import test from "node:test";
import assert from "node:assert/strict";
import { capSel, hasCap } from "./edit-caps.ts";

// Stand-in for an element carrying `data-edit-caps=attr` (null = attribute absent). hasCap only
// ever reads that one attribute, so this is all the DOM it needs — apps/web has no jsdom.
const el = (attr) => ({ getAttribute: (name) => (name === "data-edit-caps" ? attr : null) });

// A faithful evaluator for the four CSS attribute-selector operators capSel emits, applied to one
// element's attribute value — i.e. what a browser does with the selector list. hasCap agreeing with
// THIS is the property the whole capability design rests on.
// Note the values are quoted and contain commas, so a selector list cannot be split on "," — pull
// the operator/value pairs out instead (which is also how a real CSS parser reads them).
const OP_RE = /\[data-edit-caps(\^=|\$=|\*=|=)"([^"]*)"\]/g;
const selMatches = (sel, attr) => {
  if (attr === null) return false; // no attribute → no attribute selector can match
  const ops = [...sel.matchAll(OP_RE)];
  assert.ok(ops.length > 0, `no [data-edit-caps…] matcher parsed out of: ${sel}`);
  return ops.some(([, op, value]) =>
    op === "="
      ? attr === value
      : op === "^="
        ? attr.startsWith(value)
        : op === "$="
          ? attr.endsWith(value)
          : attr.includes(value),
  );
};

const matchesCap = (attr, cap) => selMatches(capSel(cap), attr);

test("matches a cap at every boundary position", () => {
  assert.equal(matchesCap("text", "text"), true); // sole value
  assert.equal(matchesCap("text,color", "text"), true); // first
  assert.equal(matchesCap("color,text", "text"), true); // last
  assert.equal(matchesCap("image,text,color", "text"), true); // middle
});

test("hasCap matches a cap at every boundary position", () => {
  assert.equal(hasCap(el("text"), "text"), true);
  assert.equal(hasCap(el("text,color"), "text"), true);
  assert.equal(hasCap(el("color,text"), "text"), true);
  assert.equal(hasCap(el("image,text,color"), "text"), true);
});

test("does not match a cap absent from the list", () => {
  assert.equal(matchesCap("text,color", "image"), false);
  assert.equal(hasCap(el("text,color"), "image"), false);
});

// The reason capSel exists at all: a bare `*="color"` would match "colorful" too. If a future cap
// name ever contains another as a substring, the boundary-pinned matchers must still not cross-match
// — the failure mode (a wrong element becoming clickable) is silent.
test("a cap name that is a substring of another value never cross-matches", () => {
  for (const attr of ["colorful", "colorful,text", "text,colorful", "textarea,color"]) {
    assert.equal(matchesCap(attr, "color"), attr.split(",").includes("color"), attr);
    assert.equal(hasCap(el(attr), "color"), attr.split(",").includes("color"), attr);
    assert.equal(matchesCap(attr, "text"), attr.split(",").includes("text"), attr);
    assert.equal(hasCap(el(attr), "text"), attr.split(",").includes("text"), attr);
  }
});

test("an empty attribute matches nothing", () => {
  assert.equal(matchesCap("", "text"), false);
  assert.equal(hasCap(el(""), "text"), false);
});

test("a missing attribute matches nothing", () => {
  assert.equal(hasCap(el(null), "text"), false);
});

test("the suffix is applied to every matcher, not just the first", () => {
  const sel = capSel("text", ":hover");
  const parts = sel.split(/,(?=\[)/);
  assert.equal(parts.length, 4);
  for (const p of parts) assert.ok(p.endsWith("]:hover"), p);
});

// THE load-bearing property: the CSS selector (which paints the affordance) and the JS predicate
// (which dispatches the click) must select the exact same elements. Any disagreement means an
// element that looks editable but isn't, or vice versa — silently.
test("hasCap and capSel agree on the same element set", () => {
  const attrs = [
    "text",
    "color",
    "image",
    "video",
    "text,color",
    "color,text",
    "image,text,color",
    "video,color",
    "",
    "colorful",
    "colorful,text",
    "textarea,color",
    "text, color", // editable() never emits spaces, but the two sides must still not diverge
    ",",
    ",text",
    "text,",
    null,
  ];
  for (const attr of ["image", "video", "text", "color"]) {
    for (const value of attrs) {
      assert.equal(
        hasCap(el(value), attr),
        selMatches(capSel(attr), value),
        `disagreement for caps=${JSON.stringify(value)} cap=${attr}`,
      );
    }
  }
});
