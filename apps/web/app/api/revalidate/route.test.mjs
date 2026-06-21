// apps/web/app/api/revalidate/route.test.mjs
// Spec §10.3 / Next 16.2 (revalidateTag.md): single-arg revalidateTag is DEPRECATED.
// The route MUST use revalidateTag('release','max'), gate on REVALIDATE_SECRET, and
// revalidatePath each provided literal path.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, "route.ts"), "utf8");
const fail = [];
if (!/revalidateTag\(\s*["']release["']\s*,\s*["']max["']\s*\)/.test(src))
  fail.push("revalidate route: must call revalidateTag('release','max')");
if (!/revalidatePath\(/.test(src)) fail.push("revalidate route: must call revalidatePath()");
if (!/REVALIDATE_SECRET/.test(src)) fail.push("revalidate route: must gate on REVALIDATE_SECRET");
if (!/x-revalidate-secret/.test(src)) fail.push("revalidate route: must read x-revalidate-secret header");
if (fail.length) { console.error("FAIL\n" + fail.join("\n")); process.exit(1); }
console.log("revalidate route OK");
