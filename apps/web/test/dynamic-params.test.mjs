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

// data-sx-block — the scope every generated colour-override selector is anchored to. Must be
// rendered on the PUBLIC site (unconditionally), not just in /preview, since the override CSS
// has to match there. This suite stays STATIC (readFileSync, no server/network), so the full
// runtime assertion (and the data-edit-* leak check) lives in the E2E task.
//
// Every file that is supposed to carry a stamp is covered below (see Task 3 report's file→key
// mapping), not just a spot-check — a prior version of this test only checked navbar/hero/footer
// and missed that about-sections.tsx's 7th sibling `<section>` (the "Manufacturing Approach"
// process section) had no stamp at all (code-review finding #1). To make that class of bug
// non-vacuously detectable, `SECTION_ROOT_FILES` below asserts the count of top-level `<section`
// opens in the file equals the count of `data-sx-block="<key>"` occurrences — a file with an
// unstamped sibling section fails on the count mismatch, not just a presence check.
const SECTION_ROOT_FILES = [
  // [pathPartsFromApp, blockKey, expectedTopLevelSectionCount]
  [["components", "home", "hero.tsx"], "hero", 1],
  [["components", "home", "features.tsx"], "features", 1],
  [["components", "home", "home-about.tsx"], "about", 1],
  [["components", "home", "product-categories.tsx"], "productsHeader", 1],
  [["components", "footer.tsx"], "footer", 1],
  [["components", "home", "contact.tsx"], "contactPage", 1],
  // 7 sibling <section>s in a Fragment (no wrapping element) — the file that had the miss.
  [["components", "about", "about-sections.tsx"], "aboutPage", 7],
  // contactPage.hero.* / contactPage.map.* are authored inline in the route files, not inside
  // a components/ file (Task 3 report, deviation #3 / code-review finding #2) — 2 own <section>s
  // each (hero + FAQ/map); the shared <Contact> component's section is covered by the
  // "home/contact.tsx" row above.
  [["[lang]", "contact", "page.tsx"], "contactPage", 2],
  [["preview", "[lang]", "contact", "page.tsx"], "contactPage", 2],
];

// Block roots that are not `<section>` elements (so the sibling-count check above doesn't apply)
// — each of these files has exactly one such root.
const OTHER_ROOT_FILES = [
  [["components", "navbar.tsx"], "nav"],
  [["components", "not-found-view.tsx"], "notFound"],
  [["components", "not-found-preview.tsx"], "notFound"],
];

test("block roots are stamped with data-sx-block, unconditionally", () => {
  for (const [pathParts, key, expectedSectionCount] of SECTION_ROOT_FILES) {
    const file = pathParts.join("/");
    const s = src(...pathParts);
    const sectionOpens = s.match(/<section\b/g) ?? [];
    const stamped = s.match(new RegExp(`data-sx-block="${key}"`, "g")) ?? [];
    assert.equal(
      sectionOpens.length,
      expectedSectionCount,
      `${file}: expected ${expectedSectionCount} top-level <section> root(s), found ${sectionOpens.length} — update this test's expected count if the markup intentionally changed`,
    );
    assert.equal(
      stamped.length,
      sectionOpens.length,
      `${file}: ${sectionOpens.length - stamped.length} <section> root(s) missing data-sx-block="${key}"`,
    );
    // It must NOT be gated on `editable` — generated override selectors are scoped to this
    // attribute, so it has to exist on the public site, not just in preview.
    assert.doesNotMatch(
      s,
      new RegExp(`editable[^\\n]*data-sx-block="${key}"`),
      `${file}: data-sx-block must not be conditional on editable`,
    );
  }

  for (const [pathParts, key] of OTHER_ROOT_FILES) {
    const file = pathParts.join("/");
    const s = src(...pathParts);
    assert.match(s, new RegExp(`data-sx-block="${key}"`), `${file}: block root not stamped`);
    assert.doesNotMatch(
      s,
      new RegExp(`editable[^\\n]*data-sx-block="${key}"`),
      `${file}: data-sx-block must not be conditional on editable`,
    );
  }
});
