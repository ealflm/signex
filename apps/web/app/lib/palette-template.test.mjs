import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PALETTE_VARS, TOKEN_VARS } from "@signex/shared";

// ---------------------------------------------------------------------------------------------
//  The palette's contract with the template.
//
//  PALETTE_VARS + TOKEN_VARS name CSS custom properties that the Webflow-exported stylesheet
//  declares. paletteStyle() re-declares those names to re-theme the site, so a name that matches
//  nothing in the template is not an error anywhere — it is a `<style>` block that parses fine,
//  applies cleanly, and changes NOTHING. Silent, and site-wide.
//
//  This branch already shipped a bug of exactly that shape (the token shadow: all 12 tier-B tokens
//  were no-ops because `body` out-specified a `:root`-only override). The names being right is the
//  other half of the same contract, and nothing checked it: shared's own palette.test.ts asserts
//  `PALETTE_VARS.accentAqua.cssVar === "--_🎨-color--base---accent--aqua"` — the implementation's
//  literal re-typed in the test, which can only catch an edit to one side, never the drift that
//  matters. Renaming a cssVar to a name absent from the template left 363 tests green.
//
//  WHY THIS TEST LIVES IN apps/web AND NOT IN packages/shared. It needs both halves: the registry
//  (packages/shared) and the template (apps/web/public). Only one workspace can legally see both —
//  web already depends on shared, and shared must NEVER depend on an app. A shared-package test
//  reaching up into apps/web would invert the dependency for a test file, which is exactly the
//  coupling the monorepo's build order forbids (shared compiles to dist/ BEFORE any app builds).
//  So the guard sits on the side that owns the template and consumes the registry.
//
//  Follows overlay-classes.test.mjs: read the artefact, don't re-type it.
// ---------------------------------------------------------------------------------------------

const CSS_DIR = fileURLToPath(new URL("../../public/assets/css/", import.meta.url));

/** The template is content-hashed (…shared.28e174924.css). Globbing rather than re-typing the hash
 *  means a REGENERATED template is still checked — hard-coding it would make the drift this test
 *  exists to catch arrive as a missing file. Exactly one must match: two would mean the assertions
 *  below could pass against a stale sibling while the site loads the other. */
function templateCss() {
  const hits = readdirSync(CSS_DIR).filter(
    (f) => f.startsWith("caladan-template.shared.") && f.endsWith(".css"),
  );
  assert.equal(
    hits.length,
    1,
    `expected exactly one caladan-template.shared.*.css in ${CSS_DIR}, found: ${hits.join(", ") || "none"}`,
  );
  return readFileSync(join(CSS_DIR, hits[0]), "utf8");
}

/** True when `name` is DECLARED (`--x: …`), not merely referenced (`var(--x)`). An override
 *  re-declares the property, so a name the template only reads would still be a no-op. */
function isDeclared(css, name) {
  // The names carry a literal 🎨 and runs of `-`; escape before building the probe.
  const esc = name.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
  return new RegExp(`${esc}\\s*:`).test(css);
}

test("every palette cssVar is declared by the template stylesheet", () => {
  const css = templateCss();
  const entries = [...Object.entries(PALETTE_VARS), ...Object.entries(TOKEN_VARS)];

  // Anchor the loop: a for..of over an empty list passes vacuously, and a registry that failed to
  // import (or a renamed export) would produce exactly that — all-green, nothing asserted.
  assert.ok(entries.length > 0, "no palette vars declared — nothing asserted");

  for (const [key, { cssVar }] of entries) {
    assert.ok(
      isDeclared(css, cssVar),
      `${key} → "${cssVar}" is declared nowhere in the template. An override on it is a silent, ` +
        `site-wide no-op: the <style> emits and applies, and paints nothing.`,
    );
  }
});

test("the probe can fail — a name absent from the template is not reported as declared", () => {
  // Guards the guard. isDeclared() is a hand-built regex over an escaped, emoji-bearing name; if it
  // ever matched everything (or threw and got swallowed), the test above would pass vacuously for
  // all 20. This is the mutation the review ran, frozen in: a plausible-but-wrong name must read as
  // absent, and a real one as present, from the SAME function.
  const css = templateCss();
  assert.equal(isDeclared(css, "--_🎨-color--tokens---ink--LIFT-TYPO"), false);

  // The positive arm is harvested from the stylesheet rather than taken from the registry (or
  // re-typed): a known-good name must come from a source that cannot itself be the thing under
  // test, or a registry-wide rename would make both arms agree and prove nothing.
  const declared = css.match(/(--_[^\s:;{}()]+)\s*:/)?.[1];
  assert.ok(declared, "no custom property found in the template — the probe has nothing to prove");
  assert.equal(isDeclared(css, declared), true);
});

test("a cssVar is matched as a declaration, not as a var() reference", () => {
  // `--a: var(--b)` declares --a and only READS --b. If isDeclared() matched the reference too, a
  // token the template merely consumes would look declared and the no-op would slip through.
  assert.equal(isDeclared("--a: var(--b);", "--b"), false);
  assert.equal(isDeclared("--a: var(--b);", "--a"), true);
});
