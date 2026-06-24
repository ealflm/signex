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

// Configurable GA4 — Google Analytics must be injected ONLY when an id is configured.
test("[lang] layout: imports GoogleAnalytics from @next/third-parties/google", () => {
  assert.match(
    src("[lang]", "layout.tsx"),
    /import\s*\{\s*GoogleAnalytics\s*\}\s*from\s*["']@next\/third-parties\/google["']/
  );
});

test("[lang] layout: renders <GoogleAnalytics> guarded by a non-empty ga4Id from the cached dict", () => {
  const layout = src("[lang]", "layout.tsx");
  // id comes from the SAME cached snapshot loader (dict.meta.ga4Id) — no extra read.
  assert.match(layout, /dict\.meta\.ga4Id/);
  // conditional render: `ga4Id ? <GoogleAnalytics gaId={ga4Id} /> : null` — no id ⇒ nothing.
  assert.match(layout, /ga4Id\s*\?\s*<GoogleAnalytics\s+gaId=\{ga4Id\}\s*\/>\s*:\s*null/);
});

test("content.ts resolves meta.ga4Id from meta.analytics?.ga4Id (empty when unset)", () => {
  const content = readFileSync(join(APP, "lib", "content.ts"), "utf8");
  assert.match(content, /ga4Id:\s*b\.meta\.analytics\?\.ga4Id\?\.trim\(\)\s*\?\?\s*""/);
});
