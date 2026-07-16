// apps/web/app/components/footer-badges.test.mjs
// Source invariants for the footer's badge lists — the courier badges (footer.shipping) and the
// payment badges (footer.payments).
//
// WHY A SOURCE TEST. Same reason as footer-nap.test.mjs next door: the regression is not a value a
// function returns, it is a `.map()` losing its stamp. `content.ts` is `server-only` and imports
// prisma + next/cache, so it cannot be imported here, and the footer component's own source is the
// surface that regresses. Sanctioned pattern (scripts/verify-readpath.mjs).
//
// It asserts SOURCE SPELLING, which is brittle by construction: extracting a <Badge> component or
// renaming `t.shipping` will fail it while being perfectly correct. That is the intended trade —
// a brittle test that provably catches this regression beats an elegant one that cannot reach it.
// When it fires for a refactor, UPDATE it; do not delete it.
//
// Run from apps/web (`jiti app/components/footer-badges.test.mjs`) — from this file's own directory
// jiti silently resolves nothing and prints an empty result that reads like a pass.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const footer = readFileSync(join(here, "footer.tsx"), "utf8");
const schema = readFileSync(
  join(here, "../../../../packages/shared/src/content/blocks/footer.ts"),
  "utf8",
);
const builder = readFileSync(
  join(here, "../../../api/src/importer/block-builder.ts"),
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
assert.ok(
  schema.includes("export const footerBlock"),
  "footer.ts (schema) does not declare footerBlock — wrong file",
);
assert.ok(
  builder.includes("function buildFooter"),
  "block-builder.ts does not declare buildFooter — wrong file",
);

const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const footerCode = stripComments(footer);

// ── 1. Every badge item is stamped, per item ────────────────────────────────────────────────
// The gap this closes: both lists rendered with .map() and stamped NOTHING, so the five badges on
// /vi (Lalamove, Grab, VISA, JCB, Napas) were the only footer text with no canvas edit route.
// The path convention is the codebase's existing one for array items — `footer.links.${i}.label`,
// `about.mission.items.${i}` — NOT a new invention.
for (const list of ["shipping", "payments"]) {
  const stamp = new RegExp(
    `editableAttrs\\(\\s*editable\\s*,\\s*\`footer\\.${list}\\.\\$\\{i\\}\``,
  );
  assert.ok(
    stamp.test(footerCode),
    `footer.tsx must stamp each footer.${list} badge with editableAttrs(editable, \`footer.${list}.\${i}\`) — ` +
      `without it the badge renders as a plain span with no data-edit-field and the only way to ` +
      `edit it is the section panel's string-list editor`,
  );
  // NOTE: the obvious companion assertion — "reject a CONSTANT `footer.shipping` text stamp, which
  // would collapse every badge onto one field" — was written and then deleted. The realistic
  // mutation (swapping the indexed path for a constant one) is already caught by the assertion
  // above, and the only mutation the companion caught uniquely was a contrived one that ALSO kept
  // the per-item stamps. An assertion whose sole failing case is one nobody would write does not
  // constrain the code, it just makes the file look thorough.
}

// ── 2. The badge text still drives the badge colour ─────────────────────────────────────────
// Stamping made renaming a badge a ONE-CLICK operation, so the coupling that was theoretical is
// now reachable. It is deliberately KEPT (see footer.tsx's note): payments falls back to a complete
// `is-blue` chip; shipping falls back to no chip at all. This pins the mechanism so a refactor
// cannot quietly sever the class from the name and leave every badge grey.
assert.ok(
  /className=\{`footer-signex_badge is-\$\{badgeSlug\(name\)\}`\}/.test(footerCode),
  "footer.tsx must derive the courier badge's brand-colour class from its NAME via badgeSlug — " +
    "the .is-lalamove/.is-grab rules in globals.css are what paint the chip",
);
assert.ok(
  /PAY_TONE\[p\]\s*\?\?\s*"is-blue"/.test(footerCode),
  "footer.tsx must key the payment badge's tone off the payment string with an is-blue fallback",
);

// ── 3. The schema comment must not out-run the code ─────────────────────────────────────────
// `shipping` was documented as editable while NOTHING wrote it: the importer omitted it and every
// snapshot lacked the key, so the field existed only as a web-side fallback literal. Inline
// per-item editing cannot work in that state — the admin resolves an inline edit against the value
// already at the path, and an index into an absent array is not recognisable as a string-array
// item. So the doc claim and the seed stand or fall together.
assert.ok(
  /shipping:\s*\['Lalamove',\s*'Grab'\]/.test(builder),
  "block-builder.ts's buildFooter must SEED footer.shipping — the schema documents the field as " +
    "editable content, and a field nothing ever writes cannot take a per-item inline edit",
);

// ── 4. …but the compatibility hatch stays open ──────────────────────────────────────────────
// Seeding is for NEW sites; already-published snapshots predate the field. `.optional()` is what
// keeps them valid, and the web's `??` fallback is what keeps them rendering. Making shipping
// required would invalidate every snapshot published before it existed.
assert.ok(
  /shipping:\s*z\.array\(z\.string\(\)\)\.min\(1\)\.optional\(\)/.test(stripComments(schema)),
  "footerBlock.shipping must stay .optional() — snapshots published before the field exists are " +
    "still valid FooterBlocks, and the web falls back to the same two literals for them",
);

console.log("footer-badges: ok");
