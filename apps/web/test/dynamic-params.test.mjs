// apps/web/test/dynamic-params.test.mjs
// Build-time route-config invariant — cacheComponents-correct edition.
//
// Under nextConfig.cacheComponents=true the `dynamicParams` route-segment config is
// FORBIDDEN. The correct invariant for both product segments is:
//   (a) generateStaticParams IS present   — SSG pre-lists published slugs.
//   (b) `export const dynamicParams` is NOT present — banned under cacheComponents.
//   (c) notFound() IS called              — guards against invalid slugs.
//
// The [lang] layout also must have generateStaticParams (one entry per locale)
// and must NOT export dynamicParams.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..", "app");
const src = (...p) => readFileSync(join(APP, ...p), "utf8");

// Product [slug] segment — category detail page
test("product [slug] segment: has generateStaticParams", () => {
  assert.match(
    src("[lang]", "products", "[slug]", "page.tsx"),
    /export\s+(async\s+)?function\s+generateStaticParams/
  );
});

test("product [slug] segment: does NOT export dynamicParams (forbidden under cacheComponents)", () => {
  assert.doesNotMatch(
    src("[lang]", "products", "[slug]", "page.tsx"),
    /export\s+const\s+dynamicParams/
  );
});

test("product [slug] segment: calls notFound() for invalid-slug guard", () => {
  assert.match(src("[lang]", "products", "[slug]", "page.tsx"), /\bnotFound\(\)/);
});

// Product [slug]/[product] segment — product detail page
test("product [slug]/[product] segment: has generateStaticParams", () => {
  assert.match(
    src("[lang]", "products", "[slug]", "[product]", "page.tsx"),
    /export\s+(async\s+)?function\s+generateStaticParams/
  );
});

test("product [slug]/[product] segment: does NOT export dynamicParams (forbidden under cacheComponents)", () => {
  assert.doesNotMatch(
    src("[lang]", "products", "[slug]", "[product]", "page.tsx"),
    /export\s+const\s+dynamicParams/
  );
});

test("product [slug]/[product] segment: calls notFound() for invalid-slug guard", () => {
  assert.match(
    src("[lang]", "products", "[slug]", "[product]", "page.tsx"),
    /\bnotFound\(\)/
  );
});

// [lang] layout — locale set is fixed; generateStaticParams must enumerate locales
test("[lang] layout: has generateStaticParams", () => {
  assert.match(
    src("[lang]", "layout.tsx"),
    /export\s+(async\s+)?function\s+generateStaticParams/
  );
});

test("[lang] layout: does NOT export dynamicParams (forbidden under cacheComponents)", () => {
  assert.doesNotMatch(
    src("[lang]", "layout.tsx"),
    /export\s+const\s+dynamicParams/
  );
});

// GTM tag management — all marketing/analytics tags (GA4 + Google Ads) are managed in a single GTM
// container, injected ONLY in production (empty id in dev/preview ⇒ nothing). GA4 is configured
// INSIDE the GTM UI, not in code. See docs/superpowers/specs/2026-07-06-gtm-tag-management-migration-design.md.
test("[lang] layout: imports GoogleTagManager from @next/third-parties/google", () => {
  assert.match(
    src("[lang]", "layout.tsx"),
    /import\s*\{\s*GoogleTagManager\s*\}\s*from\s*["']@next\/third-parties\/google["']/
  );
});

test("[lang] layout: renders <GoogleTagManager> guarded by a production-only container id", () => {
  const layout = src("[lang]", "layout.tsx");
  // container id is production-only; empty string in dev/preview ⇒ nothing injected.
  assert.match(
    layout,
    /const\s+GTM_CONTAINER_ID\s*=\s*process\.env\.NODE_ENV\s*===\s*["']production["']\s*\?\s*["']GTM-[A-Z0-9]+["']\s*:\s*["']["']/
  );
  // conditional render: `GTM_CONTAINER_ID ? <GoogleTagManager gtmId={GTM_CONTAINER_ID} /> : null` — empty id ⇒ nothing.
  assert.match(layout, /GTM_CONTAINER_ID\s*\?\s*<GoogleTagManager\s+gtmId=\{GTM_CONTAINER_ID\}[^>]*\/>\s*:\s*null/);
});

test("marketing tags come from the GTM container constant, not the theme meta block (no GA4 in code)", () => {
  const layout = src("[lang]", "layout.tsx");
  // GTM container id is a code constant (tags managed in the GTM UI), not derived from dict.meta,
  // and the old per-theme/SiteConfig GA4 id path is gone.
  assert.match(layout, /GTM_CONTAINER_ID/);
  assert.doesNotMatch(layout, /getGa4Id|GoogleAnalytics/);
  // content.ts no longer resolves a ga4Id off the meta block.
  const content = readFileSync(join(APP, "lib", "content.ts"), "utf8");
  assert.doesNotMatch(content, /ga4Id:\s*b\.meta/);
});
