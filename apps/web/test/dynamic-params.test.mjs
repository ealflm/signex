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
