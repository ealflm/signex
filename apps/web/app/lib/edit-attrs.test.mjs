import test from "node:test";
import assert from "node:assert/strict";
import { editable } from "./edit-attrs.ts";

test("emits nothing when not editable — the public render must stay clean", () => {
  assert.deepEqual(editable(false, "hero.titleBottom", { text: {} }), {});
});

test("keeps the colour anchor on the public render", () => {
  // data-sx-c is the override target; it must exist on the live site even when not editing.
  assert.deepEqual(editable(false, "nav.cta.color", { color: { roles: ["bg"] } }), {
    "data-sx-c": "nav.cta.color",
  });
});

test("one element can declare BOTH text and colour", () => {
  const a = editable(true, "hero.titleBottom", {
    text: { maxLength: 80 },
    color: { token: "accentAqua", roles: ["text"] },
  });
  assert.equal(a["data-edit-caps"], "text,color");
  assert.equal(a["data-edit-field"], "hero.titleBottom");
  // String, not number: the helper returns Record<string, string> (DOM attributes are strings, and
  // the overlay parses this back with Number()). node:assert/strict makes `equal` strict.
  assert.equal(a["data-edit-maxlength"], "80");
  assert.equal(a["data-edit-color-token"], "accentAqua");
  assert.equal(a["data-edit-kind"], undefined);
});

test("media caps", () => {
  assert.equal(editable(true, "hero.image", { image: true })["data-edit-caps"], "image");
});
