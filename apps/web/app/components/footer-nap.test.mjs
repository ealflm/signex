// apps/web/app/components/footer-nap.test.mjs
// Source invariants for the footer's NAP field labels (Tel:/Zalo:/Tax:/Office:/Factory:/Email:).
//
// WHY A SOURCE TEST. The regression this pins is not a value a function returns — it is a JSX
// literal reappearing where a content read belongs. The footer used to print `<span
// className="text_body-bold">Tel:</span>` over `businessContact.phones[].label`, which EXISTS and
// is LocalizedText. Result, measured in the browser: editing `businessContact.phones.0.label`
// moved the contactPage card to "ĐIỆN THOẠI" and left the footer saying "Tel:" — the same field
// editable in one place and dead in the other. content.ts is `server-only` + imports prisma and
// next/cache, so it cannot be imported here; the footer's own source is the surface that regresses,
// so it is the surface asserted. Same pattern as scripts/verify-readpath.mjs.
//
// Run from apps/web (`jiti app/components/footer-nap.test.mjs`) — from this file's own directory
// jiti silently resolves nothing and prints an empty result that reads like a pass.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const footer = readFileSync(join(here, "footer.tsx"), "utf8");
const contact = readFileSync(join(here, "home/contact.tsx"), "utf8");

// The test's own premise: if the file we read is not the footer we think it is, every assertion
// below is vacuous. Fail loudly rather than pass on an empty/renamed file.
assert.ok(footer.length > 2000, "footer.tsx looks empty/short — test is reading the wrong file");
assert.ok(
  footer.includes('data-sx-block="footer"'),
  "footer.tsx does not contain the footer block marker — wrong file",
);

// ── 1. No hardcoded NAP field label survives ────────────────────────────────────────────────
// Only JSX TEXT is a violation, so match the label followed by `:` in a text position (`>Tel:` or
// a bare line). Prose in comments naming "Tel:" is fine — hence the comment strip.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const footerCode = stripComments(footer);
for (const label of ["Email", "Tel", "Zalo", "Tax", "Office", "Factory"]) {
  const asJsxText = new RegExp(`>\\s*${label}:`);
  const asBareLine = new RegExp(`^\\s*${label}:\\s*$`, "m");
  assert.ok(
    !asJsxText.test(footerCode),
    `footer.tsx hardcodes the "${label}:" label as JSX text — it must read businessContact content ` +
      `(the label is LocalizedText and the contactPage card already edits it)`,
  );
  assert.ok(
    !asBareLine.test(footerCode),
    `footer.tsx hardcodes "${label}:" as a bare JSX text node`,
  );
}

// ── 2. Every NAP row stamps BOTH leaves, label included ─────────────────────────────────────
for (const row of ["email", "tel", "zalo", "tax", "office", "factory"]) {
  assert.ok(
    footerCode.includes(`t.nap.${row}.label.field`),
    `footer.tsx must stamp t.nap.${row}.label.field so the label is click-to-edit`,
  );
  assert.ok(
    footerCode.includes(`t.nap.${row}.label.text`),
    `footer.tsx must render t.nap.${row}.label.text (content), not a literal`,
  );
  assert.ok(
    footerCode.includes(`t.nap.${row}.value.field`),
    `footer.tsx must keep stamping t.nap.${row}.value.field`,
  );
}

// ── 3. The ":" is TEMPLATE, not content ─────────────────────────────────────────────────────
// The contactPage card composes `<span>{row.label.text}</span>{": "}` — the colon lives OUTSIDE the
// editable span, so the edited field holds "Tel", not "Tel:". The footer must agree, or the two
// stamps of one field would hold different strings and a label edit would render "Tel::" in one of
// them. Assert the colon sits immediately after the label span's close, never inside it.
assert.ok(
  /\{": "\}/.test(stripComments(contact)),
  "home/contact.tsx no longer composes the label with a template ': ' — the footer's colon " +
    "convention was derived from it; re-check both before changing this test",
);
for (const row of ["email", "tel", "zalo", "tax", "office", "factory"]) {
  const stamp = new RegExp(
    `t\\.nap\\.${row}\\.label\\.text\\}</span>:`,
  );
  assert.ok(
    stamp.test(footerCode),
    `footer.tsx must render the ":" AFTER the editable span for ${row} (colon = template). ` +
      `A colon inside the span would put "Tel:" into the content field the contactPage card ` +
      `renders without one.`,
  );
}

// ── 4. The labels must be the SAME fields the contactPage card stamps ───────────────────────
// Both are built by content.ts's phoneRow/addrRow/taxRow, so this asserts the shared origin rather
// than re-spelling the paths (a re-spelling would agree with itself and prove nothing).
for (const builder of ["phoneRow", "addrRow", "taxRow"]) {
  const content = readFileSync(join(here, "../lib/content.ts"), "utf8");
  const uses = content.split(builder).length - 1;
  assert.ok(
    uses >= 2,
    `content.ts: ${builder} must feed BOTH the footer nap and the contactPage cards (found ${uses} mentions)`,
  );
}

// ── 5. emailLabel's web-side fallback literal ───────────────────────────────────────────────
// `emails` is a bare string array, so unlike phones/sites there was no per-item label to read;
// businessContact.emailLabel is NEW and OPTIONAL. The fallback is what makes it optional in
// practice: without it the already-published v1 snapshot (which has no emailLabel) would render an
// empty label — "` : core@signex.vn`" — and the field would need a re-publish to look right.
// Same precedent as footer.ts's brandSuffix/shipping/watermark.
{
  const content = readFileSync(join(here, "../lib/content.ts"), "utf8");
  assert.ok(
    /emailLabel[\s\S]{0,120}\|\|\s*"Email"/.test(content),
    'content.ts must fall back to the literal "Email" when businessContact.emailLabel is absent, ' +
      "so the published v1 snapshot stays valid without a re-publish",
  );
}

// ── 6. The false comments must not come back ────────────────────────────────────────────────
assert.ok(
  !/stay literal by design/.test(footer),
  'footer.tsx: the "labels stay literal by design (locale-invariant)" comment is contradicted by ' +
    "the schema — businessContact labels are LocalizedText",
);
assert.ok(
  !/Business contact panel/.test(footer),
  'footer.tsx: there is no "Business contact panel" — apps/admin ships only _panels/color-panel.tsx',
);

console.log("footer-nap OK");
