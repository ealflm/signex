// apps/web/app/api/draft/route.test.mjs
// Verify the draft entry handler exists and gates on PREVIEW_SECRET.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, "route.ts"), "utf8");
const fail = [];
if (!/draftMode\(\)/.test(src)) fail.push("draft route: must call draftMode()");
if (!/\.enable\(\)/.test(src)) fail.push("draft route: must call draft.enable()");
if (!/PREVIEW_SECRET/.test(src)) fail.push("draft route: must gate on PREVIEW_SECRET");
if (!/export\s+async\s+function\s+GET/.test(src)) fail.push("draft route: missing GET");
if (fail.length) { console.error("FAIL\n" + fail.join("\n")); process.exit(1); }
console.log("draft route OK");
