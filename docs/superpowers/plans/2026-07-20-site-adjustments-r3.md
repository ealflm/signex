# Site Adjustments r3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the 9-item client change-request round (spec: `docs/superpowers/specs/2026-07-20-site-adjustments-r3-design.md`) — button hover tokens, config-driven required asterisks, hero-form label colour/background/hide, per-area catalog image washes, description placement, page-aware colour audit, 3× pulsing float buttons with hover labels, about features split layout, 2× nav logo.

**Architecture:** Schema-first additions in `@signex/shared` (all optional/defaulted → zero migration), consumed by `apps/web` render + resolver, with two admin capabilities (a `color` FieldKind, hover-token rows) and one web editor fix (page-aware selector audit). One commit per task on branch `feat/site-adjustments-r3`.

**Tech Stack:** zod schemas (`packages/shared`, CJS build), Next.js 16 App Router (`apps/web`, `apps/admin`), NestJS importer untouched, vitest (shared/admin) + node/jiti test chain (web).

## Global Constraints

- Branch: `feat/site-adjustments-r3` (already exists; spec committed on it). Work ON this branch.
- `@signex/shared` compiles to CommonJS `dist/` before consumers see changes: run `npm run build -w @signex/shared` after EVERY schema edit, before web/admin typecheck.
- **NEVER `npm run test` at the repo root (turbo-all).** Per-workspace only: `npm run test -w @signex/shared` (vitest), `npm run test -w @signex/web` (node/jiti chain), `npm run test -w @signex/admin` (vitest).
- web tsc: `cd /home/ealflm/dev/signex/apps/web && node /home/ealflm/dev/signex/node_modules/typescript/bin/tsc --noEmit` (`npx tsc` is a decoy). admin tsc: same from `apps/admin`.
- Every new schema field is `.optional()` or `.default(...)` — published snapshots stay valid, NO migration, NO re-publish, NO importer edits (zod defaults backfill DB snapshots at `ReleaseSnapshotSchema.parse` time). **One exception:** `apps/web/app/lib/initial-snapshot.ts` (the DB-empty fallback) ends with `as const satisfies ReleaseSnapshot` AND is consumed **unparsed** (content.ts:505,509), so a new **`.default()`** field — which zod makes *required* in the output type — must be added there by hand (one line) or `satisfies` fails tsc. New **`.optional()`** fields need NO edit. In this plan that is exactly one field: `hero.showQuoteForm` (Task 2). Despite the file's "DO NOT EDIT BY HAND" banner, hand-adding a defaulted field is the established practice (the floating-buttons round did the same); regenerating requires a live DB.
- NEVER rename existing CSS classes, `data-sx-c` anchor ids, or `data-sx-block` keys (stored palette-override selectors reference them). New classes/wrappers are fine.
- `data-sx-c` renders on BOTH public + preview (override CSS must match). `data-edit-*` is preview-only. `data-sx-overlay` follows the hero pattern: attribute stamped only when `editable` (preview); the overlay `<div>` itself renders always.
- No new translated copy except the two float-button fallback labels (static per-locale constants in the component).
- Next 16.2.x differs from training data — when touching Next APIs (the new preview route in Task 5), copy the existing preview page's patterns verbatim; read `apps/web/node_modules/next/dist/docs/` if anything deeper is needed.
- Before Tasks 8–10 (visual/UI work), Skill-load `frontend-design` + `web-design-guidelines` (user rule).
- Commit after every task, message given per task, with the session's standard co-author trailer.

---

### Task 1: Required checkbox drives the (\*) asterisk (spec item 2)

**Files:**
- Modify: `apps/web/app/lib/content.ts` (form dict, ~L131-163)
- Modify: `apps/web/app/components/home/hero-quote-form.tsx`
- Modify: `apps/web/app/components/home/contact.tsx`
- Modify: `apps/web/app/components/lead-upload-field.tsx` (new optional `required` prop)
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Consumes: `formConfig.fields.<key>.required` (exists in shared schema, `.default(false)`; importer seeds `true` for name/email/phone only).
- Produces: `dict.form.required: { name; email; phone; quantity; standard; height; width; thickness; upload; message: boolean }` — later tasks (2) reuse the same label spans this task touches.

- [ ] **Step 1: Expose `required` in the form dict**

In `apps/web/app/lib/content.ts`, inside the `form: { … }` object (after the `fail: t(fc.fail, lang),` line), add:

```ts
      // Per-field `required` (formConfig.fields.<k>.required, zod-defaulted false; the importer
      // seeds true only for name/email/phone) — drives the (*) marker and the native `required`
      // attribute on BOTH forms (hero quote + contact page).
      required: {
        name: fFields.name.required,
        email: fFields.email.required,
        phone: fFields.phone.required,
        quantity: fFields.quantity.required,
        standard: fFields.standard.required,
        height: fFields.height.required,
        width: fFields.width.required,
        thickness: fFields.thickness.required,
        upload: fFields.upload.required,
        message: fFields.message.required,
      },
```

(`fFields` is the existing local for `b.formConfig.fields` — match its actual name in the file.)

- [ ] **Step 2: Asterisk CSS**

In `apps/web/app/globals.css`, directly under the `.hero-quote_panel.hero-quote_panel { … }` rule block, add:

```css
/* Required-field marker — CSS content on the LABEL SPAN (not a DOM <sup>) so it always inherits
   the span's own colour: uniform form colour, per-label override, or default alike. A11y comes
   from the input's `required` attribute; the glyph is decoration. */
.text_input-label .sx-required::after {
  content: "*";
  margin-left: 0.15em;
  font-size: 0.8em;
  vertical-align: super;
}
```

- [ ] **Step 3: Hero form — config-driven asterisks + required attrs**

In `apps/web/app/components/home/hero-quote-form.tsx`:

For **name/email/phone** (L145-193): delete the three hardcoded `<sup>*</sup>` nodes and the three hardcoded `required` attributes; drive both from config. Pattern (name shown; repeat for email, phone):

```tsx
<label className="text_input-label label-large" htmlFor="quote-name">
  <span className={dict.required.name ? "sx-required" : undefined} {...editableAttrs(editable, "formConfig.fields.name.label", { text: { maxLength: 80 } })}>{dict.name}</span>
</label>
<input
  className="text-field w-input"
  autoComplete="new-password"
  data-name="Name"
  id="quote-name"
  maxLength={256}
  name="Name"
  placeholder={dict.namePlaceholder}
  required={dict.required.name}
  type="text"
/>
```

For the **seven detail fields** (quantity, standard, height, width, thickness, upload, message): same span `className` treatment on each label span, plus `required={dict.required.<key>}` on the `<input>`/`<select>`/`<textarea>`. For `standard` put it on the `<select>`; for `message` on the `<textarea>`; for `upload` pass `required={dict.required.upload}` to `<LeadUploadField …>` (Step 5 adds the prop).

- [ ] **Step 4: Contact form — same treatment**

In `apps/web/app/components/home/contact.tsx` (fields at L154-236): delete the three `<sup>*</sup>` + hardcoded `required` on name/email/phone; apply the same span `className={t.required.<key> ? "sx-required" : undefined}` + `required={t.required.<key>}` pattern to all ten fields (the dict local here is `t`). `upload` again goes through the `LeadUploadField` prop.

- [ ] **Step 5: `LeadUploadField` learns `required`**

In `apps/web/app/components/lead-upload-field.tsx`: add `required?: boolean` to the component's props type and spread it onto the underlying `<input type="file" …/>` element (`required={required}`). No other behaviour changes.

- [ ] **Step 6: Typecheck + web tests**

```bash
npm run build -w @signex/shared   # no schema change, but keeps the invariant cheap
cd /home/ealflm/dev/signex/apps/web && node /home/ealflm/dev/signex/node_modules/typescript/bin/tsc --noEmit
npm run test -w @signex/web
```
Expected: tsc clean; web test chain passes unchanged.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(web): required checkbox drives the form asterisks + native validation"
```

---

### Task 2: Hero quote form — label colour, hide toggle, anchors, editor expansion (spec item 3, web+shared half)

**Files:**
- Modify: `packages/shared/src/content/blocks/hero.ts`
- Create: `packages/shared/src/content/blocks/hero.test.ts`
- Modify: `apps/web/app/lib/initial-snapshot.ts` (one line — the `.default()` exception, see Global Constraints)
- Modify: `apps/web/app/lib/edit-attrs.ts` (+ its test `apps/web/app/lib/edit-attrs.test.mjs`)
- Modify: `apps/web/app/lib/content.ts` (hero resolver)
- Modify: `apps/web/app/components/home/hero.tsx`
- Modify: `apps/web/app/components/home/hero-quote-form.tsx`
- Modify: `apps/web/app/components/home/contact.tsx`
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Consumes: Task 1's label spans; `HexA` (exported by `@signex/shared` palette).
- Produces: `hero.showQuoteForm: boolean` (default true), `hero.formLabelColor?: HexA` (marked `.describe("color")` — Task 3's admin FieldKind keys off exactly the string `"color"` in `schema.description`); `EditableOpts.color: true | string` (string = explicit `data-sx-c` id); anchors `heroForm.<key>`, `contactForm.<key>` (key ∈ name,email,phone,quantity,standard,height,width,thickness,upload,message), `heroForm.panel`; CSS var `--sx-form-label` on the hero panel.

- [ ] **Step 1: Failing shared test**

Create `packages/shared/src/content/blocks/hero.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { heroBlock } from "./hero";

// `.pick` keeps the fixture to the two NEW fields — no need to invent a valid MediaRef.
const slim = heroBlock.pick({ showQuoteForm: true, formLabelColor: true });

describe("heroBlock r3 fields", () => {
  it("defaults showQuoteForm to true and leaves formLabelColor absent", () => {
    expect(slim.parse({})).toEqual({ showQuoteForm: true });
  });
  it("accepts an explicit hide + a HexA colour (alpha allowed)", () => {
    expect(slim.parse({ showQuoteForm: false, formLabelColor: "#ff8800cc" })).toEqual({
      showQuoteForm: false,
      formLabelColor: "#ff8800cc",
    });
  });
  it("rejects a non-hex formLabelColor", () => {
    expect(() => slim.parse({ formLabelColor: "red" })).toThrow();
  });
  it("carries the admin colour-picker marker", () => {
    expect(heroBlock.shape.formLabelColor.unwrap().description).toBe("color");
  });
});
```

- [ ] **Step 2: Run it — must fail**

```bash
npm run test -w @signex/shared
```
Expected: FAIL (`pick` of unknown keys / missing fields).

- [ ] **Step 3: Extend the hero schema**

`packages/shared/src/content/blocks/hero.ts`:

```ts
import { z } from "zod";
import { LocalizedText, MediaRef, Overlay } from "../primitives";
import { HexA } from "../palette";

/** Home hero (dict.hero). titleTop/titleBottom are the two stacked lines. */
export const heroBlock = z.object({
  titleTop: LocalizedText,
  titleBottom: LocalizedText,
  subtitle: LocalizedText,
  image: MediaRef, // image OR video (MediaRef); dict.hero.imageAlt maps to an image's alt
  overlay: Overlay.optional(),
  // false → the hero renders WITHOUT the quote form (client option: show the full banner).
  showQuoteForm: z.boolean().default(true),
  // Uniform colour for ALL 10 field-label spans of the HERO form only. The contact form is
  // deliberately out of scope (its light card needs different colours; per-label overrides cover
  // it). `.describe("color")` is the admin zodform's colour-picker marker. Absent = inherit.
  formLabelColor: HexA.describe("color").optional(),
});
export type HeroBlock = z.infer<typeof heroBlock>;
```

- [ ] **Step 4: Rebuild shared, re-run tests**

```bash
npm run build -w @signex/shared && npm run test -w @signex/shared
```
Expected: PASS (including existing registry/release tests — new fields are defaulted/optional).

- [ ] **Step 4b: Keep `INITIAL_SNAPSHOT` valid (the `.default()` exception)**

`hero.showQuoteForm`'s `.default(true)` makes it *required* in `HeroBlock`'s output type, and `apps/web/app/lib/initial-snapshot.ts` ends with `as const satisfies ReleaseSnapshot` (and is consumed unparsed). Add one line to the **top-level `blocks.hero`** object (line ~1162, the sibling of `image`/`subtitle`/`titleBottom`/`titleTop` — NOT `aboutPage.hero` at ~435 nor `contactPage.hero` at ~798, which have their own schemas):

```json
      "showQuoteForm": true,
```

`formLabelColor` is optional → no entry needed. Verify the web still typechecks after Step 4:

```bash
cd /home/ealflm/dev/signex/apps/web && node /home/ealflm/dev/signex/node_modules/typescript/bin/tsc --noEmit
```
Expected: clean (a missing `showQuoteForm` here would surface as a `satisfies` error on the `blocks.hero` object).

- [ ] **Step 5: `EditableOpts.color` accepts a custom anchor id**

`apps/web/app/lib/edit-attrs.ts` — change the option type and the anchor line:

```ts
  /**
   * Declare the element a COLOUR ANCHOR. …(keep existing comment)…
   * `true` uses the field path as the `data-sx-c` id. A STRING gives an explicit id — needed when
   * the same snapshot field renders in two places (hero form + contact form both render
   * `formConfig.fields.<k>.label`): distinct ids keep a per-element override from painting both.
   */
  color?: true | string;
```

```ts
  const anchor: Record<string, string> =
    opts.color ? { "data-sx-c": typeof opts.color === "string" ? opts.color : field } : {};
```

Extend `apps/web/app/lib/edit-attrs.test.mjs` with one case matching the file's existing assertion style:

```js
// color: "<id>" → explicit anchor id on BOTH renders (public flag=false included)
assert.deepEqual(
  editable(false, "formConfig.fields.name.label", { color: "heroForm.name" }),
  { "data-sx-c": "heroForm.name" },
);
```

- [ ] **Step 6: Resolver passthrough**

`apps/web/app/lib/content.ts`, in the `hero: { … }` object after `overlay: b.hero.overlay,`:

```ts
      // r3: hide-form toggle + uniform form-label colour (raw passthrough; component renders).
      showQuoteForm: b.hero.showQuoteForm,
      formLabelColor: b.hero.formLabelColor,
```

- [ ] **Step 7: Hero renders the toggle + the CSS var**

`apps/web/app/components/home/hero.tsx` — wrap the form mount (L53-58):

```tsx
{t.showQuoteForm !== false && (
  <HeroQuoteForm
    dict={dict.form}
    editable={editable}
    data-w-id="e727a2b9-869a-7dcf-ee76-b8e98292f02d"
    style={{
      ...REVEAL_STYLE,
      ...(t.formLabelColor
        ? ({ "--sx-form-label": t.formLabelColor } as React.CSSProperties)
        : {}),
    }}
  />
)}
```

- [ ] **Step 8: Uniform label colour rule**

`apps/web/app/globals.css`, under the Task-1 `.sx-required` rule:

```css
/* Uniform hero-form label colour (hero.formLabelColor → --sx-form-label set inline on the panel).
   The nested-var fallback reproduces the template's own base rule (.text_input-label { color:
   var(--_🎨-color--tokens---input--label) }, caladan-template …css:5539) EXACTLY when unset — so
   today's look is bit-for-bit unchanged. (`inherit` would NOT be a no-op: our selector out-specifies
   the base rule, and `inherit` pulls a brighter ancestor colour instead of the input--label token —
   verified in-browser. Use the token, never `inherit`.) Per-label per-element overrides still win:
   the palette <style> (injected after app CSS) targets the anchored SPAN directly, and the span's
   own colour beats what it would inherit from this label rule. */
.hero-quote_panel .text_input-label { color: var(--sx-form-label, var(--_🎨-color--tokens---input--label)); }
```

- [ ] **Step 9: Anchors + editor expansion in the hero form**

`apps/web/app/components/home/hero-quote-form.tsx`:

1. Every one of the 10 label spans gains a `color` anchor id `heroForm.<key>`, e.g. (name; repeat for all ten):

```tsx
<span className={dict.required.name ? "sx-required" : undefined} {...editableAttrs(editable, "formConfig.fields.name.label", { text: { maxLength: 80 }, color: "heroForm.name" })}>{dict.name}</span>
```

2. The `<form>` (L96-105) becomes a colour-anchored panel — add one spread:

```tsx
<form
    ref={formRef}
    id="quote-form"
    name="quote-form"
    className="form is-small hero-quote_panel"
    autoComplete="off"
    data-w-id={dataWId}
    style={style}
    {...editableAttrs(editable, "heroForm.panel", { color: true })}
    onFocus={handleFocus}
    onBlur={handleBlur}
```

(Clicking the panel in COLOUR mode now mints the stable selector `[data-sx-c="heroForm.panel"]` → the existing "Chỉ phần tử này" Nền row with the alpha slider edits the glass background.)

3. Editor expansion — the collapsed seven become clickable in the editor:

```ts
const [expanded, setExpanded] = useState(editable); // editor: start (and stay) expanded
```

and in `handleBlur`, guard the collapse: `if (!hasValue && !editable) setExpanded(false);`. Same guard in the submit handler's success branch: `if (!editable) setExpanded(false);`.

- [ ] **Step 10: Contact form anchors**

`apps/web/app/components/home/contact.tsx`: add `color: "contactForm.<key>"` to the same 10 label spans' `editableAttrs` opts (e.g. `{ text: { maxLength: 80 }, color: "contactForm.name" }`). No uniform colour here (hero-scoped by design).

- [ ] **Step 11: Verify**

```bash
cd /home/ealflm/dev/signex/apps/web && node /home/ealflm/dev/signex/node_modules/typescript/bin/tsc --noEmit
npm run test -w @signex/web
```
Expected: clean tsc; web chain passes (edit-attrs test now includes the new case).

- [ ] **Step 12: Commit**

```bash
git add -A && git commit -m "feat(shared+web): hero form hide toggle, uniform label colour, stable per-label colour anchors"
```

---

### Task 3: Admin `color` FieldKind (spec item 3, admin half)

**Files:**
- Modify: `apps/admin/app/lib/zodform-fields.ts` (+ `zodform-fields.test.ts`)
- Modify: `apps/admin/app/(dash)/editor/_fields/field-editor.tsx`

**Interfaces:**
- Consumes: schemas whose unwrapped leaf has `description === "color"` (Task 2's `hero.formLabelColor`).
- Produces: `FieldKind` gains `"color"`; `FieldEditor` renders it (native picker + hex text input; empty string → `undefined` = unset).

- [ ] **Step 1: Failing derivation test**

Append to `apps/admin/app/lib/zodform-fields.test.ts` (match its imports/style):

```ts
it('classifies a `.describe("color")` string as kind:"color" (before the string kind)', () => {
  const schema = z.object({
    formLabelColor: z.string().regex(/^#[0-9a-fA-F]{8}$|^#[0-9a-fA-F]{6}$/).describe("color").optional(),
  });
  const [f] = deriveFields(schema);
  expect(f).toMatchObject({ name: "formLabelColor", kind: "color" });
});
```

- [ ] **Step 2: Run — must fail**

```bash
npm run test -w @signex/admin
```
Expected: FAIL — kind comes back `"string"`.

- [ ] **Step 3: Add the kind**

`apps/admin/app/lib/zodform-fields.ts`:
- Add `| "color"` to the `FieldKind` union.
- In `classify()`, insert BEFORE the `isStringSchema` line (order is the point — HexA is a branded ZodString):

```ts
  // A colour hex field (a shared HexA marked `.describe("color")`). MUST precede the string
  // check or it degrades to a plain text input.
  if (s.description === "color") return { name, kind: "color", label: name };
```

- [ ] **Step 4: Render it**

`apps/admin/app/(dash)/editor/_fields/field-editor.tsx` — add a `ColorField` next to `StringField` (mirror its `Field` wrapper + prop shape exactly as used in-file):

```tsx
// kind:"color" — a shared HexA leaf marked `.describe("color")`. Native picker for the RGB part +
// a hex text input that also accepts #rrggbbaa. Empty text = undefined = "use the default"
// (the field is optional in the schema; the API's zod validates the hex on save).
function ColorField({ field, value, onChange }: { field: FieldPlan; value: unknown; onChange: (name: string, v: unknown) => void }) {
  const hex = typeof value === "string" ? value : "";
  const rgb = /^#[0-9a-fA-F]{6}/.test(hex) ? hex.slice(0, 7) : "#888888";
  return (
    <Field label={field.label} name={field.name}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${field.label} — chọn màu`}
          value={rgb}
          onChange={(e) => onChange(field.name, e.target.value)}
          className="h-9 w-9 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-1"
        />
        <Input
          value={hex}
          placeholder="#rrggbb — bỏ trống = mặc định"
          onChange={(e) => {
            const v = e.target.value.trim();
            onChange(field.name, v === "" ? undefined : v);
          }}
        />
      </div>
    </Field>
  );
}
```

Wire the dispatch (after the `"string"` branch at ~L680):

```tsx
  } else if (field.kind === "color") {
    inner = <ColorField field={field} value={value} onChange={onChange} />;
```

(If the `Field` wrapper or `Input` import names differ in-file, mirror `StringField`'s exact usage.)

- [ ] **Step 5: Verify**

```bash
npm run test -w @signex/admin
cd /home/ealflm/dev/signex/apps/admin && node /home/ealflm/dev/signex/node_modules/typescript/bin/tsc --noEmit
```
Expected: PASS + clean tsc.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(admin): colour-picker FieldKind for .describe(\"color\") schema leaves"
```

---

### Task 4: Button hover colour tokens (spec item 1)

**Files:**
- Modify: `packages/shared/src/content/palette.ts` (+ `palette.test.ts`)
- Modify: `apps/admin/app/(dash)/editor/_panels/color-panel.tsx`

**Interfaces:**
- Consumes: template CSS vars `--_🎨-color--tokens---button--primary--hover--{background,text}` (verified present in `caladan-template.shared.28e174924.css`); existing `btnPrimaryHoverBg` token; panel helpers `tokenValueFor`, `setTokenColor`, `tokenLabel`, `ColorRow`.
- Produces: `TOKEN_VARS.btnPrimaryHoverText`; hover rows in the colour panel whenever a clicked role resolves to `btnPrimaryBg`/`btnPrimaryText`.

- [ ] **Step 1: Failing shared test**

Append to `packages/shared/src/content/palette.test.ts` (inside its TOKEN_VARS describe):

```ts
it("registers the primary-button hover pair against the template vars", () => {
  expect(TOKEN_VARS.btnPrimaryHoverBg.cssVar).toBe("--_🎨-color--tokens---button--primary--hover--background");
  expect(TOKEN_VARS.btnPrimaryHoverText.cssVar).toBe("--_🎨-color--tokens---button--primary--hover--text");
});
```

Run `npm run test -w @signex/shared` — expected FAIL (`btnPrimaryHoverText` undefined).

- [ ] **Step 2: Add the token**

`packages/shared/src/content/palette.ts`, in `TOKEN_VARS` directly under `btnPrimaryHoverBg`:

```ts
  btnPrimaryHoverText: { cssVar: "--_🎨-color--tokens---button--primary--hover--text",         label: "Nút chính — chữ (hover)" },
```

Then:

```bash
npm run build -w @signex/shared && npm run test -w @signex/shared && npm run test -w @signex/web
```
Expected: shared PASS; web PASS — `app/lib/palette-template.test.mjs` holds every `TOKEN_VARS.cssVar` to the real stylesheet, so it proves the var exists in the template. (If any token-count assertion exists and fails, bump it by one — that is the only acceptable count change.)

- [ ] **Step 3: Hover rows in the colour panel**

`apps/admin/app/(dash)/editor/_panels/color-panel.tsx`, inside the `target` fieldset, immediately after the `target.roles.map(…)` block (still inside the fieldset), add:

```tsx
{/* Hover companions. The :hover state cannot be click-resolved (roles are measured from the
    DEFAULT state's CSSOM), so when the click landed on a primary-button role we offer the two
    hover TOKENS as extra site-wide rows. Sparse values: unset = template default → checkered. */}
{target.roles.some((r) => r.tokenKey === "btnPrimaryBg" || r.tokenKey === "btnPrimaryText") && (
  <div className="flex flex-col gap-1.5">
    <ColorRow
      id="color-token-hover-bg"
      label={`Đổi cả site — ${tokenLabel("btnPrimaryHoverBg")}`}
      value={tokenValueFor("btnPrimaryHoverBg")}
      alpha
      onCommit={(hex) => onChange(setTokenColor(palette, "btnPrimaryHoverBg", hex))}
    />
    <ColorRow
      id="color-token-hover-text"
      label={`Đổi cả site — ${tokenLabel("btnPrimaryHoverText")}`}
      value={tokenValueFor("btnPrimaryHoverText")}
      alpha
      onCommit={(hex) => onChange(setTokenColor(palette, "btnPrimaryHoverText", hex))}
    />
    <p className="text-xs text-muted-foreground">
      Màu khi rê chuột vào nút — áp dụng cho mọi nút chính trên toàn site.
    </p>
  </div>
)}
```

(`ColorRow`, `tokenLabel`, `setTokenColor`, `tokenValueFor` are already in scope in this file.)

- [ ] **Step 4: Verify + commit**

```bash
npm run test -w @signex/admin
cd /home/ealflm/dev/signex/apps/admin && node /home/ealflm/dev/signex/node_modules/typescript/bin/tsc --noEmit
git add -A && git commit -m "feat(shared+admin): configurable primary-button hover colours (bg + text tokens)"
```

---

### Task 5: Per-area colour washes on product imagery (spec item 4)

**Files:**
- Modify: `packages/shared/src/content/blocks/productsHeader.ts`
- Create: `packages/shared/src/content/blocks/productsHeader.test.ts`
- Modify: `apps/web/app/lib/content.ts` (products resolver)
- Modify: `apps/web/app/components/home/product-categories.tsx`
- Modify: `apps/web/app/[lang]/products/[slug]/page.tsx`
- Modify: `apps/web/app/preview/[lang]/products/[slug]/page.tsx`
- Modify: `apps/web/app/[lang]/products/[slug]/[product]/page.tsx`
- Create: `apps/web/app/preview/[lang]/products/[slug]/[product]/page.tsx`
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Consumes: `Overlay` primitive + `overlayCss()` (`@signex/shared`); the hero's overlay-div pattern; `applyEdits` overlay branch already targets ALL `[data-sx-overlay="<field>"]` nodes via `querySelectorAll` (edit-overlay.tsx ~L877) — no editor changes needed.
- Produces: `productsHeader.{homeCardOverlay,categoryImageOverlay,productImageOverlay}?: Overlay`; `dict.products.{homeCardOverlay,categoryImageOverlay,productImageOverlay}`; preview route `/preview/[lang]/products/[slug]/[product]`.

- [ ] **Step 1: Failing shared test**

Create `packages/shared/src/content/blocks/productsHeader.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { productsHeaderBlock } from "./productsHeader";

const slim = productsHeaderBlock.pick({
  homeCardOverlay: true,
  categoryImageOverlay: true,
  productImageOverlay: true,
});

describe("productsHeaderBlock r3 overlay fields", () => {
  it("all three are optional (absent = transparent)", () => {
    expect(slim.parse({})).toEqual({});
  });
  it("accepts a solid wash per area", () => {
    const wash = { kind: "solid", fill: { color: "#112233", opacity: 40 } } as const;
    expect(slim.parse({ homeCardOverlay: wash }).homeCardOverlay).toEqual(wash);
  });
  it("rejects a malformed overlay", () => {
    expect(() => slim.parse({ productImageOverlay: { kind: "solid" } })).toThrow();
  });
});
```

Run `npm run test -w @signex/shared` — expected FAIL.

- [ ] **Step 2: Extend the schema**

`packages/shared/src/content/blocks/productsHeader.ts`:

```ts
import { z } from "zod";
import { LocalizedText, TwoToneTitle, Href, Overlay } from "../primitives";
```

and append to the object (after `product: { … }`):

```ts
  // r3 — per-AREA colour washes over catalog imagery ("phủ màu"), the same Overlay primitive as
  // the hero banner. One uniform wash per area, each independently configurable on-canvas
  // (click any image in the area). Absent = transparent = today's look.
  homeCardOverlay: Overlay.optional(),      // homepage category cards
  categoryImageOverlay: Overlay.optional(), // category page: hero image + product-grid cards
  productImageOverlay: Overlay.optional(),  // product-detail main image (NOT the zoom lightbox)
```

```bash
npm run build -w @signex/shared && npm run test -w @signex/shared
```
Expected: PASS.

- [ ] **Step 3: Resolver passthrough**

`apps/web/app/lib/content.ts`, inside the `products: { … }` object (alongside `categories`):

```ts
      // r3 per-area image washes — raw passthrough, rendered via overlayCss.
      homeCardOverlay: b.productsHeader.homeCardOverlay,
      categoryImageOverlay: b.productsHeader.categoryImageOverlay,
      productImageOverlay: b.productsHeader.productImageOverlay,
```

- [ ] **Step 4: Homepage cards**

`apps/web/app/components/home/product-categories.tsx`: import `overlayCss` from `@signex/shared`; inside `.image_resort-v1`, AFTER the `<img …/>` (L65), add:

```tsx
<div className="overlay_media-config" style={overlayCss(t.homeCardOverlay)} {...(editable ? { "data-sx-overlay": "productsHeader.homeCardOverlay" } : {})} />
```

- [ ] **Step 5: Category page (public + preview)**

In BOTH `apps/web/app/[lang]/products/[slug]/page.tsx` and `apps/web/app/preview/[lang]/products/[slug]/page.tsx` (the preview file stamps `data-sx-overlay` unconditionally; the public file stamps nothing):

1. Import `overlayCss` from `@signex/shared`; add a local `const washes = dict.products;`.
2. Category hero — inside `.image_feature-blog-b`, after `<div className="overlay_featured-blog"></div>`:

```tsx
<div className="overlay_media-config" style={overlayCss(washes.categoryImageOverlay)} data-sx-overlay="productsHeader.categoryImageOverlay" />
```

(public version: same line WITHOUT the `data-sx-overlay` attribute)

3. Every grid card — inside `.wrap_image-blog-b`, BETWEEN `.image_blog-a` and `.overlay_tag-home`:

```tsx
<div className="overlay_media-config" style={overlayCss(washes.categoryImageOverlay)} data-sx-overlay="productsHeader.categoryImageOverlay" />
```

(again attribute preview-only)

- [ ] **Step 6: Product detail (public)**

`apps/web/app/[lang]/products/[slug]/[product]/page.tsx`: import `overlayCss`; wrap the media cell:

```tsx
<div className="product-detail_media">
  <ProductImageZoom src={image} alt={item.title} hint={pl.zoomHint} />
  <div className="overlay_media-config" style={overlayCss(dict.products.productImageOverlay)} />
</div>
```

- [ ] **Step 7: NEW preview route for the product detail**

Create `apps/web/app/preview/[lang]/products/[slug]/[product]/page.tsx` — mirror the category preview's shell verbatim (same imports, `connection()` + `PREVIEW_SECRET` gate, `getPreviewSnapshot(locale, theme)`, `Suspense` default export) with this body: resolve `const cat = dict.products.categories.find((c) => c.slug === slug); const item = cat?.items.find((i) => i.slug === product); if (!cat || !item) notFound();`, then render the PUBLIC detail page's JSX (back link, `product-detail_grid`, `ProductImageZoom`, meta, desc, CTA) inside `page-wrapper`/`main-wrapper` with `<PaletteStyle/>`, `<Navbar dict={dict.nav} editable />`, `<Footer dict={dict.footer} editable />`, `<FloatingContact dict={dict} />`, `<EditOverlay />`, `<PreviewRuntime />` — and the wash div WITH the attribute:

```tsx
<div className="overlay_media-config" style={overlayCss(dict.products.productImageOverlay)} data-sx-overlay="productsHeader.productImageOverlay" />
```

Render the description guarded (`{item.desc && (<p className="tone-medium product-detail_desc">{item.desc}</p>)}`) — Task 6 makes the public page match. Params type: `Promise<{ lang: string; slug: string; product: string }>`.

- [ ] **Step 8: Stacking/positioning CSS**

`apps/web/app/globals.css`, next to the existing `.overlay_media-config` notes:

```css
/* r3 catalog washes: above the image, below the tag chip / template scrims / UI chrome. The wash
   div is position:absolute (see .overlay_media-config) — these parents are its containing blocks.
   Every template scrim that must stay above the wash needs an explicit z-index:2 pair, because the
   wash's own z-index:1 (base rule) would otherwise win the tie by DOM order. The category HERO
   vignette (.overlay_featured-blog) and the product-detail "Click to zoom" hint are two such
   surfaces that are easy to miss — the hint is positioned but .product-zoom_trigger is NOT a
   stacking context, so its z-index lands in .product-detail_media's context and outranks the wash. */
.product-detail_media { position: relative; }
.image_resort-v1 .overlay_media-config,
.wrap_image-blog-b .overlay_media-config,
.image_feature-blog-b .overlay_media-config { z-index: 1; }
.image_resort-v1 .overlay_resort-card-v1,
.wrap_image-blog-b .overlay_tag-home,
.image_feature-blog-b .overlay_featured-blog { z-index: 2; }
.product-detail_media .product-zoom_hint { z-index: 2; }
```

- [ ] **Step 9: Verify**

```bash
cd /home/ealflm/dev/signex/apps/web && node /home/ealflm/dev/signex/node_modules/typescript/bin/tsc --noEmit
npm run test -w @signex/web
```
Expected: clean. (Visual + editor round-trip is in Task 11's checklist.)

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "feat(shared+web): per-area colour washes on catalog imagery + product-detail preview route"
```

---

### Task 6: Product description — detail page only (spec item 5)

**Files:**
- Modify: `apps/web/app/[lang]/products/[slug]/page.tsx`
- Modify: `apps/web/app/preview/[lang]/products/[slug]/page.tsx`
- Modify: `apps/web/app/[lang]/products/[slug]/[product]/page.tsx`

**Interfaces:** none new (render-only).

- [ ] **Step 1: Remove desc from the category-grid cards**

In BOTH the public and preview category pages, delete the card paragraph:

```tsx
<p className="tone-medium margin-0">
  {p.desc}
</p>
```

(the card keeps image, tag chip, and title inside `.card-blog-b_content`).

- [ ] **Step 2: Guard the detail-page desc**

`apps/web/app/[lang]/products/[slug]/[product]/page.tsx` (L89-91) becomes:

```tsx
{item.desc && (
  <p className="tone-medium product-detail_desc">
    {item.desc}
  </p>
)}
```

- [ ] **Step 3: Verify + commit**

```bash
cd /home/ealflm/dev/signex/apps/web && node /home/ealflm/dev/signex/node_modules/typescript/bin/tsc --noEmit
git add -A && git commit -m "fix(web): product description renders on the detail page only, not on grid cards"
```

---

### Task 7: Page-aware "Màu không còn áp dụng" audit (spec item 6)

**Files:**
- Create: `apps/web/app/components/editor/_lib/selector-audit.ts`
- Create: `apps/web/app/components/editor/_lib/selector-audit.test.mjs`
- Modify: `apps/web/app/components/editor/edit-overlay.tsx` (~L801-813)
- Modify: `apps/web/package.json` (test chain)
- Modify: `apps/admin/app/(dash)/editor/_panels/color-panel.tsx` (copy only)

**Interfaces:**
- Produces: `auditSelector(sel, count): "ok" | "broken" | "off-page"` and `brokenSelectors(selectors, count): string[]` where `count: (selector: string) => number` (injected → pure/testable). Bridge protocol unchanged (`{type:"selectorAudit", broken}`).

- [ ] **Step 1: Failing classifier test**

Create `apps/web/app/components/editor/_lib/selector-audit.test.mjs`:

```js
// Run via jiti (imports the sibling .ts). node:test + assert, same as the other _lib tests.
import test from "node:test";
import assert from "node:assert/strict";
import { auditSelector, brokenSelectors } from "./selector-audit";

// count stub: known selectors → their match count; anything else throws (unparseable).
const counts = (map) => (sel) => {
  if (Object.hasOwn(map, sel)) return map[sel];
  throw new Error(`unparseable: ${sel}`);
};

const ABOUT = '[data-sx-block="aboutPage"]';
const DEEP = `${ABOUT} .master_hero-home-c .heading-style-h0 span:nth-of-type(1)`;

test("scope root absent on this page → off-page, NOT broken", () => {
  assert.equal(auditSelector(DEEP, counts({ [DEEP]: 0, [ABOUT]: 0 })), "off-page");
});
test("scope root present but the full selector matches nothing → broken", () => {
  assert.equal(auditSelector(DEEP, counts({ [DEEP]: 0, [ABOUT]: 6 })), "broken");
});
test("exactly one match → ok", () => {
  assert.equal(auditSelector(DEEP, counts({ [DEEP]: 1 })), "ok");
});
test("several matches still paint (multi-root blocks) → ok", () => {
  assert.equal(auditSelector(DEEP, counts({ [DEEP]: 3 })), "ok");
});
test("data-sx-c anchored selectors get the same page-awareness", () => {
  const A = '[data-sx-c="heroForm.name"]';
  assert.equal(auditSelector(A, counts({ [A]: 0 })), "off-page");
});
test("unparseable selector → broken", () => {
  assert.equal(auditSelector("]]garbage", () => { throw new Error("bad"); }), "broken");
});
test("brokenSelectors filters to broken only", () => {
  const ok = '[data-sx-c="x"]';
  assert.deepEqual(
    brokenSelectors([DEEP, ok], counts({ [DEEP]: 0, [ABOUT]: 2, [ok]: 1 })),
    [DEEP],
  );
});
```

- [ ] **Step 2: Run — must fail**

```bash
cd /home/ealflm/dev/signex/apps/web && ./node_modules/.bin/jiti app/components/editor/_lib/selector-audit.test.mjs
```
Expected: FAIL (module not found). (If the repo runs `jiti` bare in the chain, use the same invocation.)

- [ ] **Step 3: Implement the classifier**

Create `apps/web/app/components/editor/_lib/selector-audit.ts`:

```ts
// Page-aware audit of stored per-element colour-override selectors (the "Màu không còn áp dụng"
// panel section). The OLD rule — broken ⟺ querySelectorAll(sel).length !== 1 on the CURRENT
// page — false-positived every override scoped to a DIFFERENT page (about-page selectors audited
// while previewing home match 0 there by definition) and every override under a multi-root block
// (aboutPage stamps six section roots, so a legitimate selector can match >1).
//
// New rule, per selector:
//   • its first segment ([data-sx-block="…"] or [data-sx-c="…"] — buildSelector always anchors on
//     one) matches 0 elements here  → "off-page": its whole scope isn't on this page; unauditable,
//     and NOT reported.
//   • full selector matches ≥ 1     → "ok": it still paints (≥2 = multi-root, still painting).
//   • scope present, full match 0   → "broken": reported (the user decides; never auto-removed).
//   • unparseable                   → "broken" (dead everywhere).
export type AuditStatus = "ok" | "broken" | "off-page";

const FIRST_SEGMENT_RE = /^\[data-sx-(?:block|c)="[^"]*"\]/;

export function auditSelector(sel: string, count: (selector: string) => number): AuditStatus {
  let full: number;
  try {
    full = count(sel);
  } catch {
    return "broken";
  }
  if (full >= 1) return "ok";
  const first = FIRST_SEGMENT_RE.exec(sel)?.[0];
  if (first) {
    try {
      if (count(first) === 0) return "off-page";
    } catch {
      return "broken";
    }
  }
  // No data-sx anchor to scope by (defensive — minted selectors always have one): keep the old
  // strictness for a zero-match selector.
  return "broken";
}

export function brokenSelectors(selectors: string[], count: (selector: string) => number): string[] {
  return selectors.filter((s) => auditSelector(s, count) === "broken");
}
```

Re-run the Step-2 command — expected PASS.

- [ ] **Step 4: Wire the overlay handler**

`apps/web/app/components/editor/edit-overlay.tsx` — import `{ brokenSelectors }` from `./_lib/selector-audit`, then replace the body of the `auditSelectors` branch (keep the surrounding comment, updated):

```ts
      // auditSelectors: which stored override selectors are BROKEN ON THIS PAGE? Page-aware since
      // r3 — see _lib/selector-audit.ts for the classification (off-page scopes are excluded, and
      // multi-match no longer counts as broken). Reported, never auto-removed: the user decides.
      if (data.type === "auditSelectors" && Array.isArray(data.selectors)) {
        const broken = brokenSelectors(
          data.selectors as string[],
          (s) => document.querySelectorAll(s).length,
        );
        window.parent.postMessage({ source: SOURCE, type: "selectorAudit", broken }, "*");
        return;
      }
```

- [ ] **Step 5: Register the test + panel copy**

1. `apps/web/package.json` — append to the `"test"` chain (next to the other `editor/_lib` entries): `&& jiti app/components/editor/_lib/selector-audit.test.mjs`
2. `apps/admin/app/(dash)/editor/_panels/color-panel.tsx` (~L568-570) — the explanatory copy becomes:

```tsx
<p className="text-xs text-muted-foreground">
  Phần tử gắn màu này không còn trên trang này (thường do thêm/bớt mục trong danh sách,
  hoặc phần tử đã bị xoá/đổi cấu trúc). Màu thuộc trang khác không bị liệt kê ở đây.
</p>
```

- [ ] **Step 6: Verify + commit**

```bash
npm run test -w @signex/web
cd /home/ealflm/dev/signex/apps/web && node /home/ealflm/dev/signex/node_modules/typescript/bin/tsc --noEmit
git add -A && git commit -m "fix(web+admin): colour audit is page-aware — no more cross-page false positives"
```

---

### Task 8: Floating buttons — 3×, pulse, hover labels (spec item 7)

**Files:**
- Modify: `apps/web/app/components/floating-contact.links.ts` (+ `floating-contact.links.test.mjs`)
- Modify: `apps/web/app/components/floating-contact.tsx`
- Modify: `apps/web/app/lib/content.ts` (add `locale`)
- Modify: `apps/web/app/globals.css` (float section, L1481-1519)

**Interfaces:**
- Consumes: `resolveCallHref`/`resolveZaloHref` (unchanged); `dict.locale` (NEW — added here: in `resolveForLang`'s return, next to `palette:`, add `locale: lang,`).
- Produces: `displayNumber(href: string): string | null` (exported from `floating-contact.links.ts`).

- [ ] **Step 1: Failing tests for `displayNumber`**

Append to `apps/web/app/components/floating-contact.links.test.mjs` (match its harness):

```js
// displayNumber: the user-facing number behind a resolved href (labels derive from CONFIG).
assert.equal(displayNumber("tel:0982633377"), "0982633377");
assert.equal(displayNumber("tel:+84982633377"), "0982633377");
assert.equal(displayNumber("https://zalo.me/0979700072"), "0979700072");
assert.equal(displayNumber("https://zalo.me/84979700072"), "0979700072");
assert.equal(displayNumber("https://zalo.me/signex.oa"), null); // OA link → generic label
assert.equal(displayNumber("mailto:x@y.z"), null);
assert.equal(displayNumber(""), null);
```

Run: `npm run test -w @signex/web` — expected FAIL (`displayNumber` is not exported).

- [ ] **Step 2: Implement**

Append to `apps/web/app/components/floating-contact.links.ts`:

```ts
/** The user-facing number behind a resolved href — "tel:+84982633377" → "0982633377",
 *  "https://zalo.me/0979700072" → "0979700072" (84-prefix normalised to 0, same convention as
 *  zaloHref). Null when the target isn't a plain number (Zalo OA/group links, mailto, …): the
 *  button then gets a generic label instead of a fabricated number. */
export function displayNumber(href: string): string | null {
  const m = /^tel:(\+?\d+)$/.exec(href) ?? /^https:\/\/zalo\.me\/(\d+)$/i.exec(href);
  if (!m) return null;
  let d = m[1];
  if (d.startsWith("+84")) d = "0" + d.slice(3);
  else if (d.startsWith("84") && d.length >= 11) d = "0" + d.slice(2);
  else if (d.startsWith("+")) return null; // non-VN international — don't guess a local format
  return /^\d{9,11}$/.test(d) ? d : null;
}
```

Re-run — expected PASS.

- [ ] **Step 3: `dict.locale`**

`apps/web/app/lib/content.ts`, in `resolveForLang`'s returned object (next to `palette: snap.palette,`):

```ts
    locale: lang, // which language this view was resolved for (labels, fallback copy)
```

- [ ] **Step 4: Component — items + labels**

`apps/web/app/components/floating-contact.tsx` becomes:

```tsx
// app/components/floating-contact.tsx
// Floating call + Zalo quick-contact buttons, fixed bottom-right on every page. Links from the
// floatingButtons block (fallback: businessContact phones). r3: 3× size + pulse (CSS), and a
// hover label pill whose number DERIVES from the configured link (displayNumber) — never
// hardcoded. Server component, no JS.
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { resolveCallHref, resolveZaloHref, displayNumber } from "./floating-contact.links";

export function FloatingContact({ dict }: { dict: Dictionary }) {
  const phones = dict.businessContact.phones;
  const telPhone = phones.find((p) => p.kind === "tel")?.value;
  const zaloPhone = phones.find((p) => p.kind === "zalo")?.value;
  const call = resolveCallHref(dict.floatingButtons.callHref, telPhone);
  const zalo = resolveZaloHref(dict.floatingButtons.zaloHref, zaloPhone);
  const callNewTab = /^https?:/i.test(call);
  if (!call && !zalo) return null;
  const vi = dict.locale !== "en";
  const zaloNum = zalo ? displayNumber(zalo) : null;
  const callNum = call ? displayNumber(call) : null;
  const zaloLabel = zaloNum ? `Chat zalo ${zaloNum}` : vi ? "Chat Zalo" : "Zalo chat";
  const callLabel = callNum ? `Hotline ${callNum}` : vi ? "Gọi ngay" : "Call now";
  return (
    <div className="sx-float-contact">
      {zalo ? (
        <div className="sx-float-item">
          <span className="sx-float-label" aria-hidden="true">{zaloLabel}</span>
          <a
            className="sx-float-btn is-zalo"
            href={zalo}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={zaloLabel}
          >
            Zalo
          </a>
        </div>
      ) : null}
      {call ? (
        <div className="sx-float-item">
          <span className="sx-float-label" aria-hidden="true">{callLabel}</span>
          <a
            className="sx-float-btn is-call"
            href={call}
            aria-label={callLabel}
            {...(callNewTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            <svg aria-hidden="true" fill="none" height="22" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="22" xmlns="http://www.w3.org/2000/svg">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          </a>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: CSS — size, pulse, labels**

`apps/web/app/globals.css` — replace the float section (L1481-1519) with:

```css
/* Floating quick-contact stack (call + Zalo), fixed bottom-right on every page. z-index 900:
   above page content, below the editor hotspot layer. Call bg follows the primary-button token;
   Zalo keeps its brand blue. r3: 3× size on desktop (~1.5× on mobile), infinite pulse ring
   ("nhấp nháy" — off under reduced motion), and a hover/focus label pill to the LEFT whose text
   derives from the configured link (see floating-contact.tsx). */
.sx-float-contact {
  position: fixed;
  right: 1.25rem;
  bottom: calc(1.25rem + env(safe-area-inset-bottom, 0px));
  z-index: 900;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1rem;
}
.sx-float-item { position: relative; display: flex; align-items: center; }
.sx-float-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 9.75rem;   /* 3 × 3.25rem */
  height: 9.75rem;
  border-radius: 50%;
  color: #fff;
  box-shadow: 0 6px 20px rgba(7, 21, 34, 0.28);
  transition: transform 0.15s ease;
  animation: sx-float-pulse 2s ease-out infinite;
}
.sx-float-item:nth-child(2) .sx-float-btn { animation-delay: 1s; } /* de-sync the two rings */
.sx-float-btn:hover { transform: scale(1.05); }
.sx-float-btn:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.sx-float-btn.is-call {
  background-color: var(--_🎨-color--tokens---button--primary--default--background, #0b1f33);
}
.sx-float-btn.is-call svg { width: 42%; height: 42%; }
.sx-float-btn.is-zalo {
  background-color: #0068ff;
  font-weight: 800;
  font-size: 2.4rem;
  letter-spacing: 0.01em;
}
@keyframes sx-float-pulse {
  0%   { box-shadow: 0 6px 20px rgba(7, 21, 34, 0.28), 0 0 0 0 rgba(255, 255, 255, 0.45); }
  70%  { box-shadow: 0 6px 20px rgba(7, 21, 34, 0.28), 0 0 0 1.1rem rgba(255, 255, 255, 0); }
  100% { box-shadow: 0 6px 20px rgba(7, 21, 34, 0.28), 0 0 0 0 rgba(255, 255, 255, 0); }
}
.sx-float-label {
  position: absolute;
  right: calc(100% + 0.75rem);
  white-space: nowrap;
  background: rgba(8, 10, 12, 0.85);
  color: #fff;
  font-size: 0.95rem;
  font-weight: 600;
  padding: 0.5rem 0.9rem;
  border-radius: 999px;
  opacity: 0;
  transform: translateX(8px);
  transition: opacity 0.18s ease, transform 0.18s ease;
  pointer-events: none;
}
.sx-float-item:hover .sx-float-label,
.sx-float-item:focus-within .sx-float-label { opacity: 1; transform: none; }
@media (max-width: 767px) {
  .sx-float-btn { width: 4.875rem; height: 4.875rem; } /* ~1.5× — user decision for mobile */
  .sx-float-btn.is-zalo { font-size: 1.2rem; }
  .sx-float-label { display: none; } /* no hover concept — tap acts immediately */
}
@media (prefers-reduced-motion: reduce) {
  .sx-float-btn { transition: none; animation: none; }
  .sx-float-btn:hover { transform: none; }
  .sx-float-label { transition: none; }
}
```

- [ ] **Step 6: Verify + commit**

```bash
npm run test -w @signex/web
cd /home/ealflm/dev/signex/apps/web && node /home/ealflm/dev/signex/node_modules/typescript/bin/tsc --noEmit
git add -A && git commit -m "feat(web): floating buttons 3x + pulse + config-derived hover labels"
```

---

### Task 9: About "why choose us" — video half + 2×2 criteria (spec item 8)

**Files:**
- Modify: `apps/web/app/components/home/features-full.tsx`
- Modify: `apps/web/app/globals.css` (features section, L1521-1548)

**Interfaces:** none new. Class `.sx-features-row5` is KEPT (override-selector compatibility); new wrapper class `.sx-features-quad`.

- [ ] **Step 1: Wrap the criteria in a quad container**

`apps/web/app/components/home/features-full.tsx` — the `criteria.map` block becomes:

```tsx
<div className="sx-features-quad">
  {criteria.map((c, i) => (
    <div className="sx-features-cell" key={i}>
      <div className="icon_service-card w-embed">{c.icon}</div>
      <div className="text-size-large text_body-bold">
        <span {...editableAttrs(editable, c.titleField, { text: { maxLength: 80 } })}>{c.title}</span>
      </div>
      <p className="tone-medium margin-0">
        <span {...editableAttrs(editable, c.descField, { text: { maxLength: 200 } })}>{c.desc}</span>
      </p>
    </div>
  ))}
</div>
```

Update the row comment: `{/* Split row: video fills the left HALF, 4 criteria as a 2×2 quad on the right. */}`

- [ ] **Step 2: CSS**

`apps/web/app/globals.css` — replace L1521-1548 (the `.sx-features-row5` group; keep the class NAMES) with:

```css
/* About page features: split row — video fills the left half, the 4 criteria sit as a 2×2 quad
   on the right ("cho xuống dòng, căn video to ra"). Class name .sx-features-row5 predates the
   split and is KEPT: stored per-element colour selectors may reference it (renames mint stale
   entries). ≤991px: one column (video 16/10 on top, quad below); ≤479px: quad to one column. */
.sx-features-row5 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2rem;
  align-items: stretch;
}
.sx-features-cell {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.sx-features-cell .icon_service-card {
  width: 2.5rem;
  height: 2.5rem;
}
/* video cell fills its half: the media box stretches, the caption stays beneath it */
.sx-features-cell--video { height: 100%; }
.sx-features-cell--video .image-inner_features {
  position: relative;
  flex: 1 1 auto;
  height: auto;
  min-height: 24rem;
  overflow: hidden;
  border-radius: var(--_🔘-radius---general--large, 0.75rem);
}
.sx-features-quad {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2rem 1.5rem;
  align-content: center;
}
@media (max-width: 991px) {
  .sx-features-row5 { grid-template-columns: 1fr; }
  .sx-features-cell--video .image-inner_features { flex: none; aspect-ratio: 16 / 10; min-height: 0; }
}
@media (max-width: 479px) {
  .sx-features-quad { grid-template-columns: 1fr; }
}
```

- [ ] **Step 3: Verify + commit**

```bash
cd /home/ealflm/dev/signex/apps/web && node /home/ealflm/dev/signex/node_modules/typescript/bin/tsc --noEmit
git add -A && git commit -m "feat(web): about features block — video takes the left half, criteria 2x2"
```

(Layout is visually confirmed in Task 11 at all three breakpoints. DOM-path note: wrapping the criteria changes their structural selector paths — any positional overrides on them will now surface, correctly, in the page-aware audit on /about.)

---

### Task 10: Navigation logo ×2 (spec item 9)

**Files:**
- Modify: `apps/web/app/globals.css` (L294-313)

- [ ] **Step 1: Double both logo variants**

In the two rules, change `height: 1.85rem;` → `height: 3.7rem;` (`.signex-logo-nav` and `.signex-logo-nav-img`). Update the comment to note the r3 ×2.

- [ ] **Step 2: Verify the navbar visually (Task 11 covers it in full)**

Quick check now: `cd /home/ealflm/dev/signex/apps/web && node /home/ealflm/dev/signex/node_modules/typescript/bin/tsc --noEmit`. In Task 11's browser pass, IF the wordmark is clipped by `.brand_navbar`'s template width cap or collides with the nav links at ≤991px, add (and only then):

```css
/* r3: the 2× logo (≈8.9rem wide at 3.7rem tall) needs more room than the template cap allows. */
.brand_navbar.w-nav-brand { max-width: none; }
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(web): navigation logo doubled (1.85rem -> 3.7rem)"
```

---

### Task 11: Full verification pass

**Files:** none (verification only; fix-forward anything found, amending the responsible task's commit style).

- [ ] **Step 1: Builds + all per-workspace tests**

```bash
npm run build -w @signex/shared
npm run test -w @signex/shared
npm run test -w @signex/web
npm run test -w @signex/admin
cd /home/ealflm/dev/signex/apps/web && node /home/ealflm/dev/signex/node_modules/typescript/bin/tsc --noEmit
cd /home/ealflm/dev/signex/apps/admin && node /home/ealflm/dev/signex/node_modules/typescript/bin/tsc --noEmit
npm run build   # turbo build across workspaces (allowed; only turbo TEST is banned)
```
Expected: all green.

- [ ] **Step 2: Browser pass (dev stack: postgres via `docker compose up -d postgres` if not running; `npm run dev`; web :3062, admin :3061, api :3060)**

Public site (:3062):
- `/vi` — asterisks on exactly name/email/phone (both hero + contact forms, `*` inherits label colour); float buttons ≈156px, pulsing, hover shows "Chat zalo 0979700072" / "Hotline 0982633377" (numbers from config); category cards unchanged visually (transparent wash).
- `/vi/products/<slug>` — no description on grid cards; category hero unchanged.
- `/vi/products/<slug>/<product>` — description present (and absent = no gap); zoom still opens clean.
- `/vi/about` — features: video left half, criteria 2×2 right; check 992px⁻/480px⁻ stacking.
- Nav logo ×2 on desktop + mobile menu; no clipping (else Task 10 Step 2 fallback).
- Mobile viewport (≤767px): float buttons ≈78px, no labels, tap acts.
- OS "reduce motion": no pulse.

Admin editor (:3061 `/admin` → editor):
- Hero form: all 10 labels clickable (collapsible stays open in editor); set `formLabelColor` in the Hero block settings via the new colour field → all 10 titles + asterisks recolour; per-label "Chỉ phần tử này" override beats the uniform colour; click the panel → Nền + alpha edits the glass.
- Hero block settings: "Ẩn form" checkbox (`showQuoteForm`) hides the form in preview + on publish.
- Click a primary CTA in colour mode → "Nền (hover)" + "Chữ (hover)" site-wide rows; publishing recolours the real `:hover`.
- Click a homepage category card image / category-page image / product-detail image (new preview route) → the banner-style overlay editor; the wash applies to EVERY image in that area live and after publish.
- Colour panel on the HOME surface no longer lists `aboutPage` selectors under "Màu không còn áp dụng"; on /about, genuinely orphaned ones appear and "Xoá" removes them.

- [ ] **Step 3: Final commit (if the pass produced fixes) + report**

Summarise per-item status against the spec's Testing section; leave the branch unmerged (user decides merge + deploy per the repo's protocol).
