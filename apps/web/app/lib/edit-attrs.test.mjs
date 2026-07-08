import { test } from "node:test";
import assert from "node:assert/strict";
import { editColor } from "./edit-attrs.ts";

test("public render stamps only the stable anchor attribute", () => {
  const a = editColor(false, "hero.cta", { token: "btnPrimaryBg", roles: ["bg", "text"] });
  assert.deepEqual(a, { "data-sx-c": "hero.cta" });
});

test("preview render adds the edit hooks", () => {
  const a = editColor(true, "hero.cta", { token: "btnPrimaryBg", roles: ["bg", "text"] });
  assert.equal(a["data-sx-c"], "hero.cta");
  assert.equal(a["data-edit-field"], "hero.cta");
  assert.equal(a["data-edit-kind"], "color");
  assert.equal(a["data-edit-color-token"], "btnPrimaryBg");
  assert.equal(a["data-edit-color-roles"], "bg,text");
});

test("token is optional (element-only override anchor)", () => {
  const a = editColor(true, "footer.bar", { roles: ["bg"] });
  assert.equal(a["data-edit-color-token"], undefined);
  assert.equal(a["data-edit-color-roles"], "bg");
});
