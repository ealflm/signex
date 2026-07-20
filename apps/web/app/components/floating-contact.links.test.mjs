import test from "node:test";
import assert from "node:assert/strict";
import { resolveCallHref, resolveZaloHref } from "./floating-contact.links.ts";

test("empty explicit -> derive tel: from the phone", () => {
  assert.equal(resolveCallHref("", "(+84) 979 700 072"), "tel:+84979700072");
});
test("empty explicit + no phone -> empty (button hidden)", () => {
  assert.equal(resolveCallHref("", undefined), "");
  assert.equal(resolveZaloHref("", undefined), "");
});
test("empty explicit -> derive zalo.me from the phone (84 -> 0)", () => {
  assert.equal(resolveZaloHref("", "(+84) 94 9999 326"), "https://zalo.me/0949999326");
});
test("full link is used verbatim", () => {
  assert.equal(resolveCallHref("tel:+84123", "0000"), "tel:+84123");
  assert.equal(resolveZaloHref("https://zalo.me/g/abcdef", "0000"), "https://zalo.me/g/abcdef");
});
test("bare number is formatted", () => {
  assert.equal(resolveCallHref("0979700072", undefined), "tel:0979700072");
  assert.equal(resolveZaloHref("0949999326", undefined), "https://zalo.me/0949999326");
});
test("unsafe scheme is never emitted verbatim", () => {
  const c = resolveCallHref("javascript:alert(1)", undefined);
  const z = resolveZaloHref("javascript:alert(1)", undefined);
  assert.ok(!/^javascript:/i.test(c), `call must not emit javascript: got ${c}`);
  assert.ok(!/^javascript:/i.test(z), `zalo must not emit javascript: got ${z}`);
});
test("garbage explicit value (no digits) falls back to the phone", () => {
  assert.equal(resolveCallHref("abc", "(+84) 979 700 072"), "tel:+84979700072");
  assert.equal(resolveZaloHref("!!!", "(+84) 94 9999 326"), "https://zalo.me/0949999326");
});
test("garbage explicit value + no phone -> empty (button hidden)", () => {
  assert.equal(resolveCallHref("abc", undefined), "");
});
