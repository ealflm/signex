// apps/web/app/components/footer-wordmark.test.mjs
// Source invariants for the footer's giant brand wordmark — the inline SVG <text>.
//
// It guards THREE things that are each one careless edit away from silently regressing:
//   1. the wordmark's string is businessContact.brand, not a JSX literal (the divergence fix);
//   2. its `fill` follows `currentColor`, not a hardcoded hex (the lying-hex fix);
//   3. the four attributes that PRODUCE its geometry survive (the acceptance test, frozen).
//
// WHY A SOURCE TEST. Same reason as footer-nap.test.mjs / footer-badges.test.mjs next door:
// `content.ts` is `server-only` and imports prisma + next/cache, so it cannot be imported here, and
// the regression is a JSX attribute rather than a value a function returns. Sanctioned pattern
// (scripts/verify-readpath.mjs). It asserts SOURCE SPELLING, which is brittle by construction:
// extracting a <Wordmark> component or renaming `t.brand` will fail it while being perfectly
// correct. That is the intended trade. When it fires for a refactor, UPDATE it; do not delete it.
//
// Run from apps/web (`jiti app/components/footer-wordmark.test.mjs`) — from this file's own
// directory jiti silently resolves nothing and prints an empty result that reads like a pass.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const footer = readFileSync(join(here, "footer.tsx"), "utf8");
const content = readFileSync(join(here, "../lib/content.ts"), "utf8");
const bcSchema = readFileSync(
  join(here, "../../../../packages/shared/src/content/blocks/businessContact.ts"),
  "utf8",
);

// ── 0. The test's own premise ───────────────────────────────────────────────────────────────
// If these files are not what we think they are, every assertion below is vacuous. Fail loudly
// rather than pass on an empty/renamed/moved file. (footer-nap.test.mjs's M5 lesson: a check that
// cannot distinguish success from its absence has not run.)
assert.ok(footer.length > 2000, "footer.tsx looks empty/short — test is reading the wrong file");
assert.ok(
  footer.includes('data-sx-block="footer"'),
  "footer.tsx does not contain the footer block marker — wrong file",
);
assert.ok(content.length > 2000, "content.ts looks empty/short — test is reading the wrong file");
assert.ok(
  content.includes("function resolveForLang"),
  "content.ts does not declare resolveForLang — wrong file",
);
assert.ok(
  bcSchema.includes("export const businessContactBlock"),
  "businessContact.ts does not declare businessContactBlock — wrong file",
);

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const footerCode = stripComments(footer);
const contentCode = stripComments(content);

// The wordmark's <text> element, isolated. Everything below asserts against THIS element rather
// than the whole file, so a stray `fill="#ffffff"` on some other glyph elsewhere in the footer can
// neither satisfy nor break these assertions.
const wordmarkMatch = footerCode.match(/<text\b[^>]*>/);
assert.ok(
  wordmarkMatch,
  "footer.tsx renders no SVG <text> element — the wordmark is gone, or is no longer an SVG <text>. " +
    "If that is deliberate, this whole file needs rewriting against the new markup (and the " +
    "geometry must be re-measured at two viewports first — see wordmark-report.md §3).",
);
const wordmark = wordmarkMatch[0];

// ── 1. The wordmark's TEXT is content, not a literal ─────────────────────────────────────────
// The gap this closes: the wordmark printed the JSX literal "SIGNEX" while content.ts's
// brandPrefix six lines away read businessContact.brand — so renaming the brand moved the small
// "<brand> – <suffix>" line and left the giant wordmark showing the old name. Same species as the
// NAP labels (b569689): a literal sitting on top of a field that exists.
const textElement = footerCode.match(/<text\b[^>]*>([\s\S]*?)<\/text>/);
assert.ok(textElement, "could not read the <text> element's children");
assert.equal(
  textElement[1].trim(),
  "{t.brand}",
  "the wordmark must render {t.brand} (businessContact.brand), not a hardcoded brand literal — " +
    `got: ${JSON.stringify(textElement[1].trim())}`,
);

// The <a> and <svg> announce the wordmark to assistive tech. If they keep saying "SIGNEX" after a
// rename they are a literal over the same field, one layer down — the exact bug, still present for
// anyone who cannot see the glyphs.
const wordmarkAnchor = footerCode.match(/<a\b[^>]*className="link_footer-logo[^>]*>/);
assert.ok(wordmarkAnchor, "could not find the wordmark's <a class='link_footer-logo'>");
assert.match(
  wordmarkAnchor[0],
  /aria-label=\{t\.brand\}/,
  "the wordmark's <a> must carry aria-label={t.brand} — a hardcoded aria-label announces the OLD " +
    "brand name to screen readers after a rename",
);
const wordmarkSvg = footerCode.match(/<svg\b[^>]*className="logo_footer"[^>]*>/);
assert.ok(wordmarkSvg, "could not find the wordmark's <svg class='logo_footer'>");
assert.match(
  wordmarkSvg[0],
  /aria-label=\{t\.brand\}/,
  "the wordmark's <svg role='img'> must carry aria-label={t.brand}, not a literal",
);

// ── 2. content.ts resolves footer.brand from businessContact.brand — ONCE ────────────────────
// The read-path half. A `brand` the footer renders is worthless if it is not THE field the panel
// edits, and resolving it twice is how the wordmark and the brand line diverged in the first place.
assert.match(
  contentCode,
  /const brand = t\(bc\.brand, lang\);/,
  "content.ts must resolve businessContact.brand ONCE into `brand` — both the wordmark and the " +
    "brand line read it, and two resolutions are how they diverged before",
);
assert.match(
  contentCode,
  /\n\s*brand,\n/,
  "content.ts's footer projection must expose `brand` (the wordmark's string)",
);
assert.match(
  contentCode,
  /brandPrefix: `\$\{brand\} – `/,
  "content.ts's brandPrefix must be built from the SAME resolved `brand` as the wordmark — if it " +
    "re-reads bc.brand independently the two renderings can drift apart again",
);
// businessContact.brand must stay REQUIRED. This is what buys the wordmark a fallback-free render:
// unlike brandSuffix/shipping/watermark there is no `?? "SIGNEX"` literal in the web, because every
// valid ReleaseSnapshot is guaranteed to carry the field. Make it .optional() and the wordmark
// renders EMPTY on any snapshot that omits it — a blank footer, not a fallback.
assert.match(
  bcSchema,
  /brand: LocalizedText,/,
  "businessContact.brand must stay REQUIRED (`brand: LocalizedText`) — the wordmark renders it " +
    "with no fallback literal, so an optional brand renders an EMPTY wordmark",
);
assert.ok(
  !/brand: LocalizedText\.optional\(\)/.test(bcSchema),
  "businessContact.brand must not be .optional() — see above",
);

// ── 3. The paint FOLLOWS `color` ─────────────────────────────────────────────────────────────
// The lying-hex fix. With `fill="#ffffff"` the colour panel reported a `text` role, hex #ffffff and
// a unique per-element selector for this wordmark, and applying that override repainted NOTHING
// (measured: the <a>'s color went magenta, the glyph stayed white). The engine's painterFor
// collects ink bearers as (owns a text node) ∪ (paint follows `color`); an SVG <text> owns a text
// node, so it entered as a TEXT bearer and never faced paintFollowsColor — the `fill="#ffffff"`
// exclusion ink-paint.ts promises was reached through the other door. `currentColor` is what makes
// the reported hex one the glyph really has.
assert.match(
  wordmark,
  /fill="currentColor"/,
  "the wordmark's fill must be `currentColor` — a literal fill makes the colour panel report a " +
    "text role whose override paints nothing (the lying hex; see 19102d2's accentAqua)",
);
assert.ok(
  !/fill="#/.test(wordmark),
  `the wordmark's fill must not be a hardcoded hex — got: ${wordmark}`,
);

// ── 4. The geometry is frozen ────────────────────────────────────────────────────────────────
// THE ACCEPTANCE TEST, as a regression guard. These four attributes are not decoration: together
// they are the whole reason this is an SVG rather than HTML text.
//   viewBox 0 0 516 100 + width:100% → the wordmark scales fluidly with the container;
//   textLength="516" + lengthAdjust="spacing" → it fills the container edge to edge by adjusting
//     TRACKING ONLY, never distorting a glyph — which CSS has no equivalent for at any price.
// Drop any one of them and the wordmark still renders, still says SIGNEX, still takes the colour
// override, and is visually WRONG — which is precisely why it needs a test rather than a reviewer.
// Measured live before and after this commit, at 1280 and 390 (see wordmark-report.md §3).
for (const [attr, why] of [
  ['viewBox="0 0 516 100"', "the 516×100 user-space box every other number here is expressed in"],
  ['textLength="516"', "forces the string's advance to the full container width (edge-to-edge fill)"],
  ['lengthAdjust="spacing"', "confines that force to TRACKING — 'spacingAndGlyphs' would squash the glyphs"],
  ['fontSize="134"', "the tuned size: 'SIGNEX' measures 492.76/516 units at 134, i.e. +4.6 per gap"],
]) {
  assert.ok(
    footerCode.includes(attr),
    `the wordmark must keep ${attr} — ${why}. Changing it changes the rendered geometry; ` +
      "re-measure at two viewports after document.fonts.ready before touching this.",
  );
}
assert.match(
  wordmark,
  /textAnchor="middle"/,
  "the wordmark's textAnchor must stay `middle` — x=258 is the CENTRE of the 516-unit box, so " +
    "changing the anchor without changing x shifts the wordmark half a container sideways",
);

// NOTE — an assertion deliberately NOT written: a guard on `preserveAspectRatio="xMidYMid meet"`.
// It is the SVG DEFAULT, so the only mutation it would catch is someone spelling out a value that
// already applies, and the geometry does not move when it is absent. Asserting a default makes the
// file look thorough and constrains nothing. (footer-badges.test.mjs's precedent, same reasoning.)

console.log("footer-wordmark.test.mjs: ok — wordmark renders brand, follows currentColor, geometry frozen");
