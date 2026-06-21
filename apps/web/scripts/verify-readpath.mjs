// apps/web/scripts/verify-readpath.mjs
// Source invariants for the published read-path (spec §10.1):
//  - content.ts caches with 'use cache' and tags 'release'
//  - content.ts never reads draftMode() (would de-opt the whole shell off SSG)
//  - the published loader falls back to INITIAL_SNAPSHOT on any error
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "app/lib/content.ts"), "utf8");
const fail = [];
if (!src.includes('"use cache"')) fail.push("content.ts: missing 'use cache' directive");
if (!/cacheTag\(\s*["']release["']\s*\)/.test(src)) fail.push("content.ts: missing cacheTag('release')");
if (/\bdraftMode\b/.test(src)) fail.push("content.ts: must NOT reference draftMode() (de-opts SSG)");
if (!src.includes("INITIAL_SNAPSHOT")) fail.push("content.ts: missing INITIAL_SNAPSHOT fallback");
if (!/catch\b/.test(src)) fail.push("content.ts: missing try/catch fallback");
if (fail.length) { console.error("FAIL\n" + fail.join("\n")); process.exit(1); }
console.log("verify-readpath OK");
