import test from "node:test";
import assert from "node:assert/strict";
import { resolveCallHref, resolveZaloHref, displayNumber, hexToRgbTriple } from "./floating-contact.links.ts";

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
test("displayNumber: the user-facing number behind a resolved href (labels derive from CONFIG)", () => {
  assert.equal(displayNumber("tel:0982633377"), "0982633377");
  assert.equal(displayNumber("tel:+84982633377"), "0982633377");
  assert.equal(displayNumber("https://zalo.me/0979700072"), "0979700072");
  assert.equal(displayNumber("https://zalo.me/84979700072"), "0979700072");
  assert.equal(displayNumber("https://zalo.me/signex.oa"), null); // OA link → generic label
  assert.equal(displayNumber("mailto:x@y.z"), null);
  assert.equal(displayNumber(""), null);
  // scheme is case-insensitive (an admin may paste an uppercase-scheme override; resolveCallHref
  // passes SAFE_HREF matches through verbatim), matching the zalo.me branch's own /i.
  assert.equal(displayNumber("TEL:+84982633377"), "0982633377");
});

test("hexToRgbTriple: hex colour -> rgb triple for rgba(var(--sx-ring), a)", () => {
  // hexToRgbTriple: "#rrggbb" (or #rgb) → "r, g, b" for rgba(var(--sx-ring), a); null if not a hex.
  assert.equal(hexToRgbTriple("#0068ff"), "0, 104, 255");
  assert.equal(hexToRgbTriple("#0B1F33"), "11, 31, 51");
  assert.equal(hexToRgbTriple("#fff"), "255, 255, 255");
  assert.equal(hexToRgbTriple("#0068ffcc"), "0, 104, 255"); // 8-digit: ignore alpha for the triple
  assert.equal(hexToRgbTriple("#f0a5"), "255, 0, 170"); // 4-digit #rgba: ff,00,aa; alpha 5 ignored
  assert.equal(hexToRgbTriple("blue"), null);
  assert.equal(hexToRgbTriple(""), null);
});
