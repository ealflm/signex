// apps/web/app/api/revalidate/route.test.mjs
// Spec §10.3 / Next 16.2 (revalidateTag.md): single-arg revalidateTag is DEPRECATED.
// The route MUST call revalidateTag(..., 'max') — defaulting to the 'release' tag when the
// caller sends none, or the caller's explicit tags (e.g. catalog publish sends ['catalog']) —
// gate on REVALIDATE_SECRET, and revalidatePath each provided literal path.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, "route.ts"), "utf8");
const fail = [];
if (!/revalidateTag\([^)]*["']max["'][^)]*\)/.test(src))
  fail.push("revalidate route: must call revalidateTag(tag, 'max')");
if (!/\[\s*["']release["']\s*\]/.test(src))
  fail.push("revalidate route: must default to the 'release' tag when no tags are given");
if (!/revalidatePath\(/.test(src)) fail.push("revalidate route: must call revalidatePath()");
if (!/REVALIDATE_SECRET/.test(src)) fail.push("revalidate route: must gate on REVALIDATE_SECRET");
if (!/x-revalidate-secret/.test(src)) fail.push("revalidate route: must read x-revalidate-secret header");
if (fail.length) { console.error("FAIL\n" + fail.join("\n")); process.exit(1); }
console.log("revalidate route OK");
