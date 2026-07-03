import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, "tracker.ts"), "utf8");

test("tracker beacons same-origin and is fire-and-forget", () => {
  assert.match(src, /COLLECT_URL = "\/api\/collect"/, "must post to same-origin /api/collect");
  assert.match(src, /sendBeacon/, "must use navigator.sendBeacon");
  assert.match(src, /doNotTrack === "1"/, "must honor DNT");
  assert.match(src, /catch\s*{[^}]*}/, "track() must swallow errors");
});

test("tracker persists identity in cookie + sessionStorage", () => {
  assert.match(src, /sx_vid/, "visitor cookie");
  assert.match(src, /sessionStorage/, "session id in sessionStorage");
  assert.match(src, /SESSION_GAP_MS = 30 \* 60 \* 1000/, "30-min session window");
});
