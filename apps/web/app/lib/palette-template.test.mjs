import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PALETTE_VARS, TOKEN_VARS, SEED_KEYS, INERT_SEED_KEYS } from "@signex/shared";

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

// ---------------------------------------------------------------------------------------------
//  The OTHER half of the same contract: declared is not the same as READ.
//
//  A seed can be declared exactly as the registry spells it and still paint nothing, because no
//  rule anywhere resolves it with var(). accentAqua is that case — declared 1x, read 0x — and it
//  was the colour panel's FIRST swatch. The panel now marks such seeds inert, driven by
//  INERT_SEED_KEYS. That list is a claim about the template, so it is checked against the
//  template, here, rather than trusted.
//
//  Set EQUALITY in both directions, deliberately:
//    • a seed that goes live (someone points a var() at accentAqua) and is still listed  → FAIL,
//      "drop it from INERT_SEED_KEYS" — the swatch comes back instead of staying dead forever.
//    • a seed that goes dead (a var() is refactored away) and is not listed              → FAIL,
//      which is the original silent bug caught the moment it is introduced, not by a user.
//  A one-way subset check would let either rot in.
// ---------------------------------------------------------------------------------------------

/** Every stylesheet the site actually loads — a var() read in ANY of them makes a seed live, so
 *  scoping this to the template alone could call a live seed inert. */
function allSiteCss() {
  const appCss = fileURLToPath(new URL("../globals.css", import.meta.url));
  const cssFiles = readdirSync(CSS_DIR)
    .filter((f) => f.endsWith(".css"))
    .map((f) => join(CSS_DIR, f));
  assert.ok(cssFiles.length > 0, `no stylesheets found in ${CSS_DIR} — nothing to read`);
  return [...cssFiles, appCss].map((f) => readFileSync(f, "utf8")).join("\n");
}

/** True when some rule RESOLVES `name` — `var(--name)` or `var(--name, fallback)`. Whitespace is
 *  legal on both sides of the name inside var(). */
function isRead(css, name) {
  const esc = name.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
  return new RegExp(`var\\(\\s*${esc}\\s*[,)]`).test(css);
}

test("INERT_SEED_KEYS is exactly the set of seeds no stylesheet reads via var()", () => {
  const css = allSiteCss();

  // Anchor the loop — a failed import would make both sets empty and the equality vacuously true.
  assert.ok(SEED_KEYS.length > 0, "no seeds — nothing asserted");

  const deadInTemplate = SEED_KEYS.filter((k) => !isRead(css, PALETTE_VARS[k].cssVar)).sort();
  const listedInert = [...INERT_SEED_KEYS].sort();

  assert.deepEqual(
    deadInTemplate,
    listedInert,
    `INERT_SEED_KEYS disagrees with the stylesheets.\n` +
      `  no var() reads it (so it paints nothing): ${deadInTemplate.join(", ") || "none"}\n` +
      `  INERT_SEED_KEYS says:                     ${listedInert.join(", ") || "none"}\n` +
      `If a seed became LIVE, drop it from INERT_SEED_KEYS in packages/shared/src/content/palette.ts ` +
      `and its swatch returns to the colour panel. If a seed became DEAD, add it — otherwise the ` +
      `panel offers a control that silently paints nothing.`,
  );
});

test("the read-probe can fail — and tells a declaration apart from a var() read", () => {
  // Guards the guard, like the isDeclared probe above. If isRead() matched everything, EVERY seed
  // would look live and INERT_SEED_KEYS would have to be empty to pass — inverting the test into a
  // demand that we un-mark accentAqua. If it matched nothing, all 8 would look dead. Both arms are
  // pinned, and the positive one is harvested from the stylesheet so a registry-wide rename cannot
  // make the probe and its input agree with each other about nothing.
  const css = allSiteCss();
  assert.equal(isRead(css, "--_🎨-color--base---accent--NOT-A-REAL-NAME"), false);

  const readName = css.match(/var\(\s*(--_[^\s,)]+)\s*[,)]/)?.[1];
  assert.ok(readName, "no var() reference found in the stylesheets — the probe has nothing to prove");
  assert.equal(isRead(css, readName), true);

  // The distinction the whole test rests on: accentAqua IS declared and is NOT read. If isRead()
  // were secretly matching declarations, the two would be indistinguishable and the inert set empty.
  assert.equal(isRead("--a: #fff; var(--b);", "--a"), false);
  assert.equal(isRead("--a: #fff; var(--b);", "--b"), true);
});
