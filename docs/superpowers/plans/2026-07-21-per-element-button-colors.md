# Per-element Button Colours Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an editor set each button's own **background + hover** colour (per-element, not just site-wide) for every button on the site, and make the floating buttons' **radar-ring colour** configurable — per the spec `docs/superpowers/specs/2026-07-21-per-element-button-colors-design.md`.

**Architecture:** Per-element hover reuses the existing palette **override** pipeline — two new optional fields (`hoverBg`/`hoverText`) on the override object, and the trusted emitter appends `:hover` when writing the CSS (the stored selector stays pseudo-class-free, so the selector grammar and its stored-XSS defense are unchanged). Stable `data-sx-c` anchors on every CTA + float button make per-element targeting reliable. The float ring colour is a dedicated `floatingButtons` block field (bespoke `--sx-ring`, not a bg/text/border role).

**Tech Stack:** zod schemas (`@signex/shared`, CJS build), Next.js 16 (`apps/web` public + preview, `apps/admin` visual editor), vitest (shared/admin), node/jiti test chain (web).

## Global Constraints

- Branch: `feat/site-adjustments-r3` (extends it). Work ON this branch. Base at plan time: `e46fe89`.
- `@signex/shared` compiles to CommonJS `dist/`: run `npm run build -w @signex/shared` after EVERY shared edit, before web/admin typecheck/tests.
- **NEVER `npm run test` at the repo root.** Per-workspace only: `npm run test -w @signex/shared` (vitest), `npm run test -w @signex/admin` (vitest), `npm run test -w @signex/web` (node/jiti chain).
- web tsc: `cd /home/ealflm/dev/signex/apps/web && node /home/ealflm/dev/signex/node_modules/typescript/bin/tsc --noEmit` (`npx tsc` is a decoy). admin tsc: same from `apps/admin`.
- **Selector grammar (`packages/shared/src/content/selector.ts`) is NOT changed.** `:hover` is appended by the emitter only; the stored `selector` stays validated by `CssSelectorSchema`.
- All new schema fields are `.optional()` → published snapshot / Themes / draft / `initial-snapshot.ts` stay valid with **no migration, no re-publish, no importer edit** (none is a `.default()` that becomes required in the output type).
- NEVER rename existing CSS classes, `data-sx-c` ids, or `data-sx-block` keys. New anchors only.
- `data-sx-c` renders on BOTH public + preview (override target); inert until an override references it. All `data-edit-*` stay preview-only.
- Next 16.2.x differs from training data — when touching Next code read `apps/web/node_modules/next/dist/docs/` first. These tasks add no new Next APIs.
- Commit after each task; message given per task, with trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_014yg6t7bPGiJfjaQrk5rxJE`.

---

### Task 1: Per-element hover — shared schema + emitter

**Files:**
- Modify: `packages/shared/src/content/palette.ts` (`PaletteOverrideSchema`, ~L194-201)
- Modify: `packages/shared/src/content/palette-style.ts` (`paletteStyle`, L71-88)
- Modify: `packages/shared/src/content/palette.test.ts`
- Modify: `packages/shared/src/content/palette-style.test.ts`

**Interfaces:**
- Produces: `PaletteOverride` gains optional `hoverBg?: HexA`, `hoverText?: HexA`. `paletteStyle()` emits an extra `selector:hover{…}` rule when either is present. Consumed by Task 2 (admin helpers) and Task 3 (anchors make it reachable).

- [ ] **Step 1: Write the failing schema + emitter tests**

In `packages/shared/src/content/palette.test.ts`, add (match the file's existing import of `PaletteOverrideSchema` / `PaletteSchema`; import whichever it already uses — `PaletteOverrideSchema` is exported from `./palette`):

```ts
import { PaletteOverrideSchema } from "./palette";

describe("PaletteOverride hover fields", () => {
  it("accepts optional hoverBg/hoverText (HexA)", () => {
    const o = PaletteOverrideSchema.parse({
      selector: '[data-sx-c="x"]', bg: "#112233", hoverBg: "#445566ff", hoverText: "#ffffff",
    });
    expect(o.hoverBg).toBe("#445566ff");
    expect(o.hoverText).toBe("#ffffff");
  });
  it("still rejects unknown keys (.strict preserved)", () => {
    expect(() => PaletteOverrideSchema.parse({ selector: '[data-sx-c="x"]', nope: "#000000" })).toThrow();
  });
  it("rejects a non-hex hover value", () => {
    expect(() => PaletteOverrideSchema.parse({ selector: '[data-sx-c="x"]', hoverBg: "red" })).toThrow();
  });
});
```

In `packages/shared/src/content/palette-style.test.ts`, add (match its `paletteStyle` import):

```ts
import { paletteStyle } from "./palette-style";

describe("paletteStyle hover rule", () => {
  it("emits a selector:hover rule from hoverBg/hoverText", () => {
    const css = paletteStyle({ overrides: [
      { selector: '[data-sx-c="heroForm.cta"] .btn-bg', bg: "#0b1f33", hoverBg: "#16324f" },
    ] });
    expect(css).toContain('[data-sx-c="heroForm.cta"] .btn-bg{background-color:#0b1f33}');
    expect(css).toContain('[data-sx-c="heroForm.cta"] .btn-bg:hover{background-color:#16324f}');
  });
  it("emits no hover rule when no hover field is set", () => {
    const css = paletteStyle({ overrides: [{ selector: '[data-sx-c="x"]', bg: "#0b1f33" }] });
    expect(css).not.toContain(":hover");
  });
  it("drops a non-hex hover value (defense in depth)", () => {
    const css = paletteStyle({ overrides: [{ selector: '[data-sx-c="x"]', hoverBg: "red" as never }] });
    expect(css ?? "").not.toContain(":hover");
  });
});
```

- [ ] **Step 2: Run — must fail**

```bash
npm run test -w @signex/shared
```
Expected: FAIL (schema strips/rejects hover fields; emitter emits no `:hover`).

- [ ] **Step 3: Add the schema fields**

`packages/shared/src/content/palette.ts`, `PaletteOverrideSchema` — add two fields before the closing `.strict()`:

```ts
export const PaletteOverrideSchema = z
  .object({
    selector: CssSelectorSchema,
    bg: HexA.optional(),
    text: HexA.optional(),
    border: HexA.optional(),
    // Per-element HOVER colours. The emitter appends `:hover` to the (validated) selector — the
    // stored selector stays pseudo-class-free, so the grammar/stored-XSS defense is unchanged.
    hoverBg: HexA.optional(),
    hoverText: HexA.optional(),
  })
  .strict();
```

- [ ] **Step 4: Emit the hover rule**

`packages/shared/src/content/palette-style.ts`, inside the `for (const ov of palette.overrides ?? [])` loop, AFTER the existing `if (decls.length) rules.push(`${ov.selector}{${decls.join(";")}}`);` line, add:

```ts
    // Per-element hover: same role→prop map, minus border (YAGNI). `:hover` is a fixed literal on
    // the already-validated selector — never user input — so no pseudo-class enters the grammar.
    const HOVER_PROP = { hoverBg: "background-color", hoverText: "color" } as const;
    const hoverDecls: string[] = [];
    for (const [role, prop] of Object.entries(HOVER_PROP) as [keyof typeof HOVER_PROP, string][]) {
      const val = ov[role];
      if (isHexA(val)) hoverDecls.push(`${prop}:${val}`);
    }
    if (hoverDecls.length) rules.push(`${ov.selector}:hover{${hoverDecls.join(";")}}`);
```

- [ ] **Step 5: Rebuild shared + run tests**

```bash
npm run build -w @signex/shared && npm run test -w @signex/shared
```
Expected: PASS (new tests green; existing palette/release/registry tests unaffected — fields optional).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/content/palette.ts packages/shared/src/content/palette-style.ts packages/shared/src/content/palette.test.ts packages/shared/src/content/palette-style.test.ts
git commit -m "feat(shared): per-element hover colours on palette overrides (emitter appends :hover)"
```

---

### Task 2: Per-element hover — admin helpers + colour panel

**Files:**
- Modify: `apps/admin/app/(dash)/editor/_lib/palette-working-set.ts` (`setOverride` L47-60, `clearOverrideRole` L76-93)
- Modify: `apps/admin/app/(dash)/editor/_panels/color-panel.tsx` (the clicked-target fieldset)
- Modify/Create: `apps/admin/app/(dash)/editor/_lib/palette-working-set.test.ts` (if present; else create)

**Interfaces:**
- Consumes: Task 1's `hoverBg`/`hoverText` override fields.
- Produces: `setOverride`/`clearOverrideRole` accept `OverrideRole = "bg" | "text" | "border" | "hoverBg" | "hoverText"`. The colour panel renders a "Khi rê chuột (hover)" subsection binding each hover row to its role's resolved selector.

- [ ] **Step 1: Write the failing helper test**

Create (or append to) `apps/admin/app/(dash)/editor/_lib/palette-working-set.test.ts` (vitest, match the admin test style — relative import, no `@/` alias, like `floating-buttons.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import { setOverride, clearOverrideRole } from "./palette-working-set";

describe("per-element hover roles", () => {
  const SEL = '[data-sx-c="heroForm.cta"] .btn-bg';
  it("setOverride writes hoverBg onto the same selector entry as bg", () => {
    let p = setOverride({}, SEL, "bg", "#0b1f33");
    p = setOverride(p, SEL, "hoverBg", "#16324f");
    const o = p.overrides!.find((x) => x.selector === SEL)!;
    expect(o.bg).toBe("#0b1f33");
    expect(o.hoverBg).toBe("#16324f");
    expect(p.overrides!.length).toBe(1); // one entry, two roles
  });
  it("clearOverrideRole('bg') keeps the entry alive while hoverBg remains", () => {
    let p = setOverride({}, SEL, "bg", "#0b1f33");
    p = setOverride(p, SEL, "hoverBg", "#16324f");
    p = clearOverrideRole(p, SEL, "bg");
    const o = p.overrides!.find((x) => x.selector === SEL);
    expect(o).toBeDefined();
    expect(o!.bg).toBeUndefined();
    expect(o!.hoverBg).toBe("#16324f");
  });
  it("clearing the last remaining role drops the entry", () => {
    let p = setOverride({}, SEL, "hoverBg", "#16324f");
    p = clearOverrideRole(p, SEL, "hoverBg");
    expect((p.overrides ?? []).length).toBe(0);
  });
});
```

- [ ] **Step 2: Run — must fail**

```bash
npm run test -w @signex/admin
```
Expected: FAIL — `role` param type rejects `"hoverBg"`, and/or `clearOverrideRole`'s survival check ignores `hoverBg` so the entry is wrongly dropped in test 2.

- [ ] **Step 3: Widen the role type + fix the survival check**

`apps/admin/app/(dash)/editor/_lib/palette-working-set.ts`:

Add a type alias near the top (after the imports):

```ts
/** The roles an override can carry — the three default-state roles plus the two hover roles. */
export type OverrideRole = "bg" | "text" | "border" | "hoverBg" | "hoverText";
```

Change `setOverride`'s signature `role: "bg" | "text" | "border"` → `role: OverrideRole` (the `{ [role]: hex }` body already works for any key).

Change `clearOverrideRole`'s signature `role: "bg" | "text" | "border"` → `role: OverrideRole`, and update its survival check (L90) to include the hover roles:

```ts
    if (
      rest.bg !== undefined || rest.text !== undefined || rest.border !== undefined ||
      rest.hoverBg !== undefined || rest.hoverText !== undefined
    ) next.push(rest);
```

(`rebasePalette` needs NO change — `rolesOf` strips only `selector` and `rebaseSlice` is generic over all remaining keys, so hover roles merge role-wise automatically.)

- [ ] **Step 4: Run helper tests — pass**

```bash
npm run test -w @signex/admin
```
Expected: PASS.

- [ ] **Step 5: Add the hover subsection to the colour panel**

`apps/admin/app/(dash)/editor/_panels/color-panel.tsx` — inside the clicked-`target` fieldset, AFTER the `target.roles.map(...)` block (and after the r3 primary-button hover-token block if present), add a per-element hover subsection. It reuses `ColorRow`, `overrideFor`, `setOverride`, `clearOverrideRole` (all already in scope). Bind each hover row to the matching default role's `selector` (bg role for Nền-hover, text role for Chữ-hover); show a row only when that role resolved a selector:

```tsx
{(() => {
  const bgSel = target.roles.find((r) => r.role === "bg")?.selector;
  const textSel = target.roles.find((r) => r.role === "text")?.selector;
  if (!bgSel && !textSel) return null;
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border/60 p-3">
      <span className="text-sm font-medium text-foreground">Khi rê chuột (hover)</span>
      {bgSel && (
        <ColorRow
          id="color-hover-bg"
          label="Nền (hover)"
          value={overrideFor(bgSel, "hoverBg")}
          alpha
          onCommit={(hex) => onChange(setOverride(palette, bgSel, "hoverBg", hex))}
          onClear={() => onChange(clearOverrideRole(palette, bgSel, "hoverBg"))}
        />
      )}
      {textSel && (
        <ColorRow
          id="color-hover-text"
          label="Chữ (hover)"
          value={overrideFor(textSel, "hoverText")}
          alpha
          onCommit={(hex) => onChange(setOverride(palette, textSel, "hoverText", hex))}
          onClear={() => onChange(clearOverrideRole(palette, textSel, "hoverText"))}
        />
      )}
      <p className="text-xs text-muted-foreground">Màu khi rê chuột vào — chỉ riêng nút này.</p>
    </div>
  );
})()}
```

NOTE: `overrideFor(selector, role)` is the panel's existing helper (`palette.overrides?.find((o) => o.selector === selector)?.[role]`); its `role` param type widens to `OverrideRole` automatically via the import — if it is locally typed to `ColorRole`, widen that local type to `OverrideRole` too. Confirm `ColorRow`'s props (`id`,`label`,`value`,`alpha`,`onCommit`,`onClear`) match the existing per-element `ColorRow` usage in this file (RoleRow) and adjust names if the file differs.

- [ ] **Step 6: Verify admin tsc + tests**

```bash
cd /home/ealflm/dev/signex/apps/admin && node /home/ealflm/dev/signex/node_modules/typescript/bin/tsc --noEmit
npm run test -w @signex/admin
```
Expected: clean tsc; vitest green.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(admin): per-element hover colour rows in the colour panel"
```

---

### Task 3: Stable colour anchors on every CTA + float button

**Files:**
- Modify: `apps/web/app/components/home/hero-quote-form.tsx` (submit CTA `<a class="cta_primary">`)
- Modify: `apps/web/app/components/home/features-full.tsx` (features CTA)
- Modify: `apps/web/app/components/home/contact.tsx` (submit CTA)
- Modify: `apps/web/app/[lang]/products/[slug]/[product]/page.tsx` (product CTA)
- Modify: `apps/web/app/components/floating-contact.tsx` (Zalo + call buttons)

**Interfaces:**
- Consumes: the r3 `editable(flag, field, { color: "<id>" })` string-anchor form (emits `data-sx-c="<id>"` on both public + preview). For the product page (no `editable` flag) and the floating-contact (server component), stamp `data-sx-c` directly (unconditional, like the render-time overlay attrs) — it is an override target, safe on public.
- Produces: anchors `heroForm.cta`, `features.cta.color`, `contactForm.cta`, `product.cta.color`, `floatBtn.zalo`, `floatBtn.call` — so Tasks 1–2's per-element bg/hover are reliably targetable on each.

- [ ] **Step 1: Anchor the hero submit CTA**

`apps/web/app/components/home/hero-quote-form.tsx` — the submit `<a class="cta_primary …">` (in `submitButton`, ~L75-89). Add the colour anchor to the `<a>` via `editableAttrs` (it already imports `editable as editableAttrs`):

```tsx
<a
  button=""
  className="cta_primary w-inline-block"
  data-cta="hero-quote"
  data-wf--cta-primary--variant="primary"
  href="#"
  tabIndex={tabIndex}
  {...editableAttrs(editable, "heroForm.cta", { color: true })}
>
```

(`{ color: true }` emits `data-sx-c="heroForm.cta"` on both renders — the r3 anchor mechanism.)

- [ ] **Step 2: Anchor the features CTA**

`apps/web/app/components/home/features-full.tsx` — the `<a class="cta_primary …" href="#quote-form">` (~L53). Add:

```tsx
{...editableAttrs(editable, "features.cta.color", { color: true })}
```
to that `<a>`'s attributes.

- [ ] **Step 3: Anchor the contact submit CTA**

`apps/web/app/components/home/contact.tsx` — the submit `<a class="cta_primary …" data-cta="contact-quote">` (~L240). Add:

```tsx
{...editableAttrs(editable, "contactForm.cta", { color: true })}
```

- [ ] **Step 4: Anchor the product-detail CTA**

`apps/web/app/[lang]/products/[slug]/[product]/page.tsx` — the `<a class="cta_primary …" href="/contact">` (~L93). This page has no `editable` flag, so stamp the anchor directly (it is an override target, public-safe):

```tsx
<a button="" className="cta_primary w-inline-block" data-wf--cta-primary--variant="primary" href="/contact" data-sx-c="product.cta.color">
```

- [ ] **Step 5: Anchor the two float buttons**

`apps/web/app/components/floating-contact.tsx` — a server component with no `editable` flag. Stamp `data-sx-c` directly on each `<a class="sx-float-btn …">`:
- Zalo `<a class="sx-float-btn is-zalo">`: add `data-sx-c="floatBtn.zalo"`.
- Call `<a class="sx-float-btn is-call">`: add `data-sx-c="floatBtn.call"`.

- [ ] **Step 6: Verify web tsc + chain**

```bash
cd /home/ealflm/dev/signex/apps/web && node /home/ealflm/dev/signex/node_modules/typescript/bin/tsc --noEmit
npm run test -w @signex/web
```
Expected: clean; chain green (anchors are inert markup — no test asserts against their absence).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(web): colour anchors on every CTA + float button (reliable per-element bg/hover)"
```

---

### Task 4: Float button radar-ring colour config

**Files:**
- Modify: `packages/shared/src/content/blocks/floatingButtons.ts`
- Create: `packages/shared/src/content/blocks/floatingButtons.test.ts` (if none) OR extend the existing floatingButtons test
- Modify: `apps/web/app/components/floating-contact.links.ts` (+ `.test.mjs`) — `hexToRgbTriple`
- Modify: `apps/web/app/lib/content.ts` (expose the two fields)
- Modify: `apps/web/app/components/floating-contact.tsx` (set `--sx-ring` inline from config)

**Interfaces:**
- Consumes: `HexA` from `@signex/shared` (palette); r3's `.describe("color")` admin colour FieldKind (auto-renders).
- Produces: `floatingButtons.zaloRingColor?`, `callRingColor?` (optional HexA); `hexToRgbTriple(hex: string): string | null` ("#0068ff" → "0, 104, 255"); `dict.floatingButtons.{zaloRingColor,callRingColor}`.

- [ ] **Step 1: Failing shared schema test**

Create `packages/shared/src/content/blocks/floatingButtons.test.ts` (vitest):

```ts
import { describe, it, expect } from "vitest";
import { floatingButtonsBlock } from "./floatingButtons";

describe("floatingButtons ring colours", () => {
  it("defaults href fields and leaves ring colours absent", () => {
    expect(floatingButtonsBlock.parse(undefined)).toEqual({ callHref: "", zaloHref: "" });
  });
  it("accepts optional HexA ring colours", () => {
    const b = floatingButtonsBlock.parse({ callHref: "", zaloHref: "", zaloRingColor: "#0068ff", callRingColor: "#0b1f33" });
    expect(b.zaloRingColor).toBe("#0068ff");
    expect(b.callRingColor).toBe("#0b1f33");
  });
  it("rejects a non-hex ring colour", () => {
    expect(() => floatingButtonsBlock.parse({ callHref: "", zaloHref: "", zaloRingColor: "blue" })).toThrow();
  });
  it("marks the ring fields for the admin colour picker", () => {
    expect(floatingButtonsBlock.shape.zaloRingColor.unwrap().description).toBe("color");
  });
});
```

Run `npm run test -w @signex/shared` → expected FAIL.

- [ ] **Step 2: Add the schema fields**

`packages/shared/src/content/blocks/floatingButtons.ts`:

```ts
import { z } from "zod";
import { HexA } from "../palette";
```
and in the object:

```ts
export const floatingButtonsBlock = z
  .object({
    callHref: z.string().default(""),
    zaloHref: z.string().default(""),
    // Radar-ring colour per button (the sx-float-ping glow). Optional; absent = the CSS default
    // (Zalo blue / call navy). `.describe("color")` → admin colour-picker field (r3 FieldKind).
    zaloRingColor: HexA.describe("color").optional(),
    callRingColor: HexA.describe("color").optional(),
  })
  .default({ callHref: "", zaloHref: "" });
```

```bash
npm run build -w @signex/shared && npm run test -w @signex/shared
```
Expected: PASS.

- [ ] **Step 3: Failing `hexToRgbTriple` test**

Append to `apps/web/app/components/floating-contact.links.test.mjs`:

```js
// hexToRgbTriple: "#rrggbb" (or #rgb) → "r, g, b" for rgba(var(--sx-ring), a); null if not a hex.
assert.equal(hexToRgbTriple("#0068ff"), "0, 104, 255");
assert.equal(hexToRgbTriple("#0B1F33"), "11, 31, 51");
assert.equal(hexToRgbTriple("#fff"), "255, 255, 255");
assert.equal(hexToRgbTriple("#0068ffcc"), "0, 104, 255"); // 8-digit: ignore alpha for the triple
assert.equal(hexToRgbTriple("blue"), null);
assert.equal(hexToRgbTriple(""), null);
```

Add `hexToRgbTriple` to the import line at the top of the test file.

Run `npm run test -w @signex/web` → expected FAIL (not exported).

- [ ] **Step 4: Implement `hexToRgbTriple`**

Append to `apps/web/app/components/floating-contact.links.ts`:

```ts
/** "#rrggbb" / "#rgb" / "#rrggbbaa" → "r, g, b" for `rgba(var(--sx-ring), α)`; null if not a hex.
 *  Alpha (8-digit) is ignored — the triple is the colour; the keyframe supplies the alpha. */
export function hexToRgbTriple(hex: string): string | null {
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec((hex ?? "").trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}
```

Re-run `npm run test -w @signex/web` → expected PASS.

- [ ] **Step 5: Expose the fields in the resolver**

`apps/web/app/lib/content.ts`, in the `floatingButtons: { … }` object (currently `{ callHref, zaloHref }`):

```ts
    floatingButtons: {
      callHref: b.floatingButtons.callHref,
      zaloHref: b.floatingButtons.zaloHref,
      zaloRingColor: b.floatingButtons.zaloRingColor,
      callRingColor: b.floatingButtons.callRingColor,
    },
```

- [ ] **Step 6: Set `--sx-ring` inline per button**

`apps/web/app/components/floating-contact.tsx` — import `hexToRgbTriple`, and set the ring var on each button when the config resolves to a triple:

```tsx
import { resolveCallHref, resolveZaloHref, displayNumber, hexToRgbTriple } from "./floating-contact.links";
// … inside the component, after resolving call/zalo/labels:
const zaloRing = dict.floatingButtons.zaloRingColor ? hexToRgbTriple(dict.floatingButtons.zaloRingColor) : null;
const callRing = dict.floatingButtons.callRingColor ? hexToRgbTriple(dict.floatingButtons.callRingColor) : null;
```

On the Zalo `<a>`: `style={zaloRing ? ({ "--sx-ring": zaloRing } as React.CSSProperties) : undefined}`.
On the call `<a>`: `style={callRing ? ({ "--sx-ring": callRing } as React.CSSProperties) : undefined}`.

(When unset → no inline style → the CSS default `--sx-ring` from `.is-zalo`/`.is-call` applies.)

- [ ] **Step 7: Verify web tsc + chain**

```bash
cd /home/ealflm/dev/signex/apps/web && node /home/ealflm/dev/signex/node_modules/typescript/bin/tsc --noEmit
npm run test -w @signex/web
```
Expected: clean; chain green (links test incl. hexToRgbTriple).

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat(shared+web): configurable radar-ring colour per float button (floatingButtons block fields)"
```

---

### Task 5: Full verification pass

**Files:** none (verification; fix-forward anything found).

- [ ] **Step 1: Builds + all per-workspace tests**

```bash
npm run build -w @signex/shared
npm run test -w @signex/shared
npm run test -w @signex/admin
npm run test -w @signex/web
cd /home/ealflm/dev/signex/apps/admin && node /home/ealflm/dev/signex/node_modules/typescript/bin/tsc --noEmit
cd /home/ealflm/dev/signex/apps/web && node /home/ealflm/dev/signex/node_modules/typescript/bin/tsc --noEmit
npm run build   # turbo across workspaces
```
Expected: all green (web build's `DATABASE_URL not found` prisma lines are expected → INITIAL_SNAPSHOT fallback; build exits 0).

- [ ] **Step 2: Browser pass (branch dev server on :3072 — the docker stack holds :3062; use the root next bin `node node_modules/next/dist/bin/next dev apps/web -p 3072`; resize_window is blocked in the sandbox → use the same-origin iframe technique to measure, and getComputedStyle to verify colours)**

Admin editor (`/admin` → editor for the active theme):
- Click each CTA (hero submit, features, contact, product-detail) → the colour panel shows the default Nền/Chữ rows AND the new "Khi rê chuột (hover)" subsection; set a distinct bg + hover on two of them; confirm each is independent.
- Click a Zalo / call float button → set bg + hover (per-element) + the ring colour field (in the Floating buttons block settings).
- Publish; verify on public (`getComputedStyle` on `:hover` via a forced `:hover` or reading the emitted `#signex-palette` style text) that each button's hover differs and the rings recolour.
- Confirm an untouched CTA still follows the site-wide token hover (r3), and old overrides are unaffected.

Public/preview:
- Grep the published HTML for the new `data-sx-c` anchors (present) and confirm no `data-edit-*` leaks on public.

- [ ] **Step 3: Report + leave branch for user (merge/push/deploy are the user's call, per the r3 convention)**

Summarise per-part status against the spec's Testing section; note any Minor findings for the final review.

## Self-Review

- **Spec coverage:** Part 1 (per-element hover) → Tasks 1 (shared) + 2 (admin). Part 2 (anchors) → Task 3. Part 3 (float ring colour) → Task 4. Testing/back-compat → Task 5 + the optional-fields constraint. All spec sections mapped.
- **Placeholder scan:** every code step carries concrete code; the one "confirm ColorRow props match" note in Task 2 Step 5 is a real in-file verification (the component's exact prop names must be matched), not a placeholder — the implementer reads the sibling `ColorRow` usage in the same file.
- **Type consistency:** `OverrideRole` defined in Task 2 Step 3 is used consistently; `setOverride(p, selector, role, hex)` / `clearOverrideRole(p, selector, role)` signatures match Task 1's `hoverBg`/`hoverText` field names; `hexToRgbTriple` name consistent across Task 4 steps; anchor ids (`heroForm.cta`, `features.cta.color`, `contactForm.cta`, `product.cta.color`, `floatBtn.zalo`, `floatBtn.call`) consistent between Task 3 and the emitter test in Task 1.

## Out of scope
`hoverBorder` per element; explicit anchors for EN/VI + menu buttons (generic engine selectors cover them); secondary/tertiary button *types* (unused); animating the ring via `color-mix` (the hex→triple keeps the keyframe unchanged).
