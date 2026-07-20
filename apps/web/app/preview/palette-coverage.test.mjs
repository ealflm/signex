// Every editor-preview page must render <PaletteStyle> so the theme palette applies — the PUBLIC
// site emits it once in app/[lang]/layout.tsx, but the preview tree has no shared content layout
// (app/preview/layout.tsx renders only {children}), so each preview page must render it itself.
// Regression guard for the "preview shows a page unthemed after navigating to it" bug: PaletteStyle
// was present only in the home preview page, so /preview/<lang>/about|contact|404|products came up
// with no #signex-palette and fell back to the raw template default colours.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const previewLangDir = join(dirname(fileURLToPath(import.meta.url)), "[lang]");

function findPageFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findPageFiles(full));
    else if (entry.name === "page.tsx") out.push(full);
  }
  return out;
}

test("every preview page renders <PaletteStyle> (theme applies on every route, not just home)", () => {
  const pages = findPageFiles(previewLangDir);
  assert.ok(pages.length >= 4, `expected several preview pages, found ${pages.length}`);
  const missing = pages
    .filter((p) => !/<PaletteStyle\b/.test(readFileSync(p, "utf8")))
    .map((p) => p.slice(p.indexOf("app/preview/")));
  assert.deepEqual(missing, [], `preview pages missing <PaletteStyle>:\n  ${missing.join("\n  ")}`);
});
