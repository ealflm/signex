// Run via jiti (imports the sibling .ts). node:test + assert, same as the other _lib tests.
import test from "node:test";
import assert from "node:assert/strict";
import { auditSelector, brokenSelectors } from "./selector-audit";

// count stub: known selectors → their match count; anything else throws (unparseable).
const counts = (map) => (sel) => {
  if (Object.hasOwn(map, sel)) return map[sel];
  throw new Error(`unparseable: ${sel}`);
};

const ABOUT = '[data-sx-block="aboutPage"]';
const DEEP = `${ABOUT} .master_hero-home-c .heading-style-h0 span:nth-of-type(1)`;

test("scope root absent on this page → off-page, NOT broken", () => {
  assert.equal(auditSelector(DEEP, counts({ [DEEP]: 0, [ABOUT]: 0 })), "off-page");
});
test("scope root present but the full selector matches nothing → broken", () => {
  assert.equal(auditSelector(DEEP, counts({ [DEEP]: 0, [ABOUT]: 6 })), "broken");
});
test("exactly one match → ok", () => {
  assert.equal(auditSelector(DEEP, counts({ [DEEP]: 1 })), "ok");
});
test("several matches still paint (multi-root blocks) → ok", () => {
  assert.equal(auditSelector(DEEP, counts({ [DEEP]: 3 })), "ok");
});
test("data-sx-c anchored selectors get the same page-awareness", () => {
  const A = '[data-sx-c="heroForm.name"]';
  assert.equal(auditSelector(A, counts({ [A]: 0 })), "off-page");
});
test("unparseable selector → broken", () => {
  assert.equal(auditSelector("]]garbage", () => { throw new Error("bad"); }), "broken");
});
test("brokenSelectors filters to broken only", () => {
  const ok = '[data-sx-c="x"]';
  assert.deepEqual(
    brokenSelectors([DEEP, ok], counts({ [DEEP]: 0, [ABOUT]: 2, [ok]: 1 })),
    [DEEP],
  );
});
