// apps/web/scripts/verify-dynamic-params.mjs
// Build-time invariant (spec §10.2/§14, cacheComponents-correct edition):
//
//  Under nextConfig.cacheComponents=true the `dynamicParams` route-segment config is
//  FORBIDDEN (the build errors: "dynamicParams is not compatible with
//  nextConfig.cacheComponents. Please remove it."). So the correct invariant for both
//  product route segments is:
//
//   (a) generateStaticParams IS present   — SSG pre-lists the currently-published slugs.
//   (b) `export const dynamicParams` is   — banned under cacheComponents; its absence
//       NOT present in either direction.     is the safe state.
//   (c) notFound() IS called              — guards against invalid slugs (replaces the
//                                            old dynamicParams=false 404 behavior).
//
//  New-published slugs render on demand then cache via the `'use cache'`/cacheTag('release')
//  in getSiteContent (spec §10.2). No dynamicParams export is needed or allowed.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const targets = [
  "app/[lang]/products/[slug]/page.tsx",
  "app/[lang]/products/[slug]/[product]/page.tsx",
];
const fail = [];
for (const rel of targets) {
  const s = readFileSync(join(root, rel), "utf8");

  // (a) generateStaticParams must be present — SSG pre-list of known slugs
  if (!/generateStaticParams/.test(s))
    fail.push(`${rel}: must keep generateStaticParams (SSG pre-list)`);

  // (b) dynamicParams must NOT be exported (banned under cacheComponents)
  if (/export\s+const\s+dynamicParams/.test(s))
    fail.push(
      `${rel}: must NOT export dynamicParams (forbidden under nextConfig.cacheComponents=true)`
    );

  // (c) notFound() must be called — guards invalid slugs (replaces dynamicParams=false behavior)
  if (!/\bnotFound\(\)/.test(s))
    fail.push(`${rel}: must call notFound() for invalid-slug guard`);
}
if (fail.length) {
  console.error("FAIL\n" + fail.join("\n"));
  process.exit(1);
}
console.log("verify-dynamic-params OK");
