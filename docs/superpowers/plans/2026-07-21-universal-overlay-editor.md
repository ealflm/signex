# Universal Overlay Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every `Overlay` block field a visual colour+opacity/gradient picker in the admin block form (replacing raw JSON), by adding an `"overlay"` FieldKind and reusing the media-picker's existing overlay control.

**Architecture:** Tag the shared `Overlay` schema with `.describe("overlay")` → the admin's `deriveFields` detects the tag (mirrors the r3 `color` FieldKind) → a reusable `OverlayField` component (extracted from the media-picker's inline "Lớp phủ" control) renders in the block form. One tag fixes all 8 overlay fields. No web render-code changes.

**Tech Stack:** zod (`@signex/shared`, compiles to CommonJS `dist/`), Next.js 16 admin, React, vitest (node env, no jsdom/RTL — React components are verified by typecheck + lint + browser, not unit tests).

**Spec:** `docs/superpowers/specs/2026-07-21-universal-overlay-editor-design.md`

## Global Constraints

- **Overlay capabilities are fixed by the schema:** solid `{color:#rrggbb, opacity:0–100}` OR a 2–4 stop gradient `{angle:0–360, stops[]}`. Add NO new capabilities (no radial, no blend modes, no >4 stops).
- **`.describe("overlay")` must not change `Overlay`'s parse behaviour or inferred type** — it only sets `_def.description`. The existing `Overlay` parse tests in `primitives.test.ts` must stay green.
- **`OverlayField` is presentational:** value in / `onChange` out, emits only schema-valid `Overlay | undefined`, and — like the other structured field editors — NEVER calls `onValidityChange`.
- **The media-picker (`FlexibleBody`) behaviour is preserved exactly** — same live `onOverlayPreview` on every change, same Apply payload. Task 3 is a behaviour-preserving refactor, not a redesign.
- **★ Workspace-build gotcha:** after editing `@signex/shared`, rebuild its `dist/` (`npm run build -w @signex/shared`) before the admin consumes it — `deriveFields` reads the description from the compiled schema.
- **Out of scope:** no web render-code changes, no committed seed script, no `main`/floatingButtons reconciliation.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `packages/shared/src/content/primitives.ts` | Modify L76–79 | Tag `Overlay` with `.describe("overlay")` |
| `packages/shared/src/content/primitives.test.ts` | Modify (Overlay `describe` block) | Regression: tag present + parse unchanged |
| `apps/admin/app/lib/zodform-fields.ts` | Modify L3–15, L136 | Add `"overlay"` FieldKind + detect it |
| `apps/admin/app/lib/zodform-fields.test.ts` | Modify | Assert overlay field → `kind:"overlay"` |
| `apps/admin/app/(dash)/visual/overlay-field.tsx` | **Create** | Reusable overlay control (extracted) |
| `apps/admin/app/(dash)/visual/media-picker-dialog.tsx` | Modify (FlexibleBody, OverlayPreview) | Consume `OverlayField` (dedupe) |
| `apps/admin/app/(dash)/editor/_fields/field-editor.tsx` | Modify (imports, switch, `defaultForField`) | Render `OverlayField` for `kind:"overlay"` |

---

### Task 1: Tag `Overlay` with `.describe("overlay")` (shared)

**Files:**
- Modify: `packages/shared/src/content/primitives.ts:76-79`
- Test: `packages/shared/src/content/primitives.test.ts` (existing `Overlay` describe block, tail of file)

**Interfaces:**
- Produces: `Overlay` schema whose `.description === "overlay"`; parse behaviour and `z.infer<typeof Overlay>` type UNCHANGED.

- [ ] **Step 1: Add the failing assertion** to the existing `describe("Overlay", …)` block in `primitives.test.ts` (append inside it, after the last `it`):

```ts
  it("carries the overlay describe tag (drives the admin overlay FieldKind)", () =>
    expect(Overlay.description).toBe("overlay"));
```

- [ ] **Step 2: Run the test — verify it FAILS**

Run: `npm run test -w @signex/shared -- primitives`
Expected: the new assertion FAILS (`Overlay.description` is `undefined`); the existing solid/gradient/rejection tests PASS.

- [ ] **Step 3: Add the tag.** In `primitives.ts`, change the end of the `Overlay` export from:

```ts
export const Overlay = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("solid"), fill: OverlayFill }),
  z.object({ kind: z.literal("gradient"), angle: z.number().min(0).max(360), stops: z.array(OverlayStop).min(2).max(4) }),
]);
```

to:

```ts
export const Overlay = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("solid"), fill: OverlayFill }),
  z.object({ kind: z.literal("gradient"), angle: z.number().min(0).max(360), stops: z.array(OverlayStop).min(2).max(4) }),
]).describe("overlay");
```

- [ ] **Step 4: Run the test — verify it PASSES**

Run: `npm run test -w @signex/shared -- primitives`
Expected: ALL Overlay tests PASS (tag present; parse behaviour unchanged).

- [ ] **Step 5: Rebuild the shared dist** (so the admin sees the tag — the ★ gotcha):

Run: `npm run build -w @signex/shared`
Expected: `tsc` exits 0; `packages/shared/dist/` updated.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/content/primitives.ts packages/shared/src/content/primitives.test.ts
git commit -m "feat(shared): tag Overlay with .describe(\"overlay\") for the admin FieldKind"
```

---

### Task 2: Detect the `"overlay"` FieldKind in `deriveFields` (admin)

**Files:**
- Modify: `apps/admin/app/lib/zodform-fields.ts:3-15` (FieldKind union), `:136` (classify)
- Test: `apps/admin/app/lib/zodform-fields.test.ts`

**Interfaces:**
- Consumes: `Overlay` schema tagged `.description === "overlay"` (Task 1, built into `@signex/shared/dist`).
- Produces: `deriveFields` returns `{ name, kind: "overlay", label }` for any `Overlay.optional()` field (top-level or nested).

- [ ] **Step 1: Write the failing test.** Add to `zodform-fields.test.ts` (it already imports `z`, `BLOCK_REGISTRY`, and `deriveFields`; add `Overlay` to the `@signex/shared` import):

```ts
  it("classifies an Overlay field as kind:overlay (not raw json)", () => {
    const plan = deriveFields(z.object({ overlay: Overlay.optional() }));
    expect(plan).toContainEqual({ name: "overlay", kind: "overlay", label: "overlay" });
  });

  it("classifies the real productsHeader catalog washes as overlay", () => {
    const plan = deriveFields(BLOCK_REGISTRY.productsHeader);
    for (const name of ["homeCardOverlay", "categoryImageOverlay", "productImageOverlay"]) {
      expect(plan).toContainEqual({ name, kind: "overlay", label: name });
    }
  });
```

- [ ] **Step 2: Run the test — verify it FAILS**

Run: `npm run build -w @signex/shared && npm run test -w @signex/admin -- zodform-fields`
Expected: FAILS — the overlay fields currently derive `kind:"json"`, not `"overlay"`.

- [ ] **Step 3: Add the FieldKind.** In `zodform-fields.ts`, add `"overlay"` to the union (after `"color"`):

```ts
export type FieldKind =
  | "string"
  | "color"
  | "overlay"
  | "localized"
  | "localizedArray"
  | "stringArray"
  | "boolean"
  | "array"
  | "assetRef"
  | "videoRef"
  | "mediaRef"
  | "object"
  | "json";
```

- [ ] **Step 4: Detect it in `classify`.** Immediately AFTER the color line (`zodform-fields.ts:136`), add:

```ts
  if (s.description === "color") return { name, kind: "color", label: name };
  // An Overlay field (the shared discriminated union tagged `.describe("overlay")`). MUST precede
  // the structural checks / json fallback, which would otherwise classify it as raw JSON.
  if (s.description === "overlay") return { name, kind: "overlay", label: name };
```

- [ ] **Step 5: Run the test — verify it PASSES**

Run: `npm run test -w @signex/admin -- zodform-fields`
Expected: PASS — synthetic and real (`productsHeader`) overlay fields derive `kind:"overlay"`; all pre-existing `deriveFields` assertions still pass (no over-capture).

- [ ] **Step 6: Commit**

```bash
git add apps/admin/app/lib/zodform-fields.ts apps/admin/app/lib/zodform-fields.test.ts
git commit -m "feat(admin): overlay FieldKind — deriveFields detects .describe(\"overlay\")"
```

---

### Task 3: Extract the reusable `OverlayField` + refactor the media picker (admin)

Behaviour-preserving refactor. Relocate the inline "Lớp phủ" control out of `FlexibleBody` into a standalone component, then have `FlexibleBody` render it. No new unit test (no logic added; pure JSX relocation over already-tested helpers). Verified by typecheck + lint + the existing suite staying green; the media picker is browser-QA'd by the controller after this task.

**Files:**
- Create: `apps/admin/app/(dash)/visual/overlay-field.tsx`
- Modify: `apps/admin/app/(dash)/visual/media-picker-dialog.tsx`

**Interfaces:**
- Consumes: `setKind`/`addStop`/`removeStop` (`./overlay-edit`), `overlayCss` (`@signex/shared`).
- Produces:
  ```ts
  interface OverlayFieldProps {
    value: Overlay | undefined;                    // absent ⇒ "Không" (no overlay)
    onChange: (next: Overlay | undefined) => void; // always a schema-valid Overlay | undefined
    label?: string;                                // section legend; default "Lớp phủ"
    idPrefix?: string;                             // namespaces any element id (unique on a busy form)
  }
  export function OverlayField(props: OverlayFieldProps): React.ReactElement;
  ```

- [ ] **Step 1: Create `overlay-field.tsx` scaffold.** Write this top matter, then relocate the JSX per Step 2:

```tsx
"use client";

import { overlayCss, type Overlay } from "@signex/shared";
// FlexibleBody aliases setKind→setOverlayKind (it has its own image/video `setKind`); this file
// has no such clash, so import it under its own name.
import { setKind as setOverlayKind, addStop, removeStop } from "./overlay-edit";

// A small preview swatch: a checkerboard backdrop with the resolved overlay painted on top via
// overlayCss — the SAME resolver the public site and live preview use, so the box shows exactly
// what will render ("Không" included: overlayCss(undefined) = {}).
function OverlayPreview({ overlay }: { overlay: Overlay | undefined }) {
  // …relocated verbatim from media-picker-dialog.tsx L542–560…
}

interface OverlayFieldProps {
  value: Overlay | undefined;
  onChange: (next: Overlay | undefined) => void;
  label?: string;
  idPrefix?: string;
}

export function OverlayField({ value, onChange, label = "Lớp phủ", idPrefix }: OverlayFieldProps) {
  // …relocated overlay control JSX (Step 2)…
}
```

- [ ] **Step 2: Relocate the control JSX.** Move the "Lớp phủ" markup from `media-picker-dialog.tsx` (the block spanning roughly **L643–882** — the section legend, the Không/Màu đặc/Gradient toggle, the solid colour+opacity controls, the gradient angle+stops controls, and the closing `<OverlayPreview overlay={…} />`) and the `OverlayPreview` function (**L542–560**) into `overlay-field.tsx`, applying these exact substitutions:
  - Every read of the local state var `overlay` → `value`.
  - Every mutation pair `setOverlay(next); onOverlayPreview?.(next);` (and any bare `setOverlay(x)`) → a single `onChange(next)` (compute `next` exactly as before, then `onChange(next)`).
  - The three toggle handlers keep calling `setOverlayKind(value, "none"|"solid"|"gradient")`, `addStop(value)`, `removeStop(value, i)` — then `onChange(...)` with the result.
  - The legend text uses `{label}` instead of the literal "Lớp phủ".
  - If any control carries a DOM `id`, prefix it with `idPrefix` (e.g. `id={idPrefix ? \`${idPrefix}-opacity\` : undefined}`); aria-labels stay as-is.
  - Do NOT change class names, control structure, ranges, or the 2–4 stop clamps.

- [ ] **Step 3: Refactor `FlexibleBody` to consume it.** In `media-picker-dialog.tsx`:
  - Delete the now-relocated `OverlayPreview` function and the inline overlay JSX block.
  - Import the component near the other local imports: `import { OverlayField } from "./overlay-field";`
  - Replace the deleted JSX with:
    ```tsx
    <OverlayField value={overlay} onChange={(next) => { setOverlay(next); onOverlayPreview?.(next); }} />
    ```
  - `FlexibleBody` keeps its `overlay`/`setOverlay` state, `onOverlayPreview` prop, and Apply payload unchanged.
  - Remove imports that are now unused in this file (`overlayCss`, `setOverlayKind`, `addStop`, `removeStop`) — keep `type Overlay`. Lint (Step 5) flags any leftover.

- [ ] **Step 4: Typecheck**

Run: `cd apps/admin && npx tsc --noEmit`
Expected: exits 0 (no type errors).

- [ ] **Step 5: Lint + existing suite stay green**

Run: `npm run lint -w @signex/admin && npm run test -w @signex/admin`
Expected: eslint clean (no unused imports); all existing admin tests PASS (behaviour preserved).

- [ ] **Step 6: Commit**

```bash
git add "apps/admin/app/(dash)/visual/overlay-field.tsx" "apps/admin/app/(dash)/visual/media-picker-dialog.tsx"
git commit -m "refactor(admin): extract reusable OverlayField from the media picker"
```

---

### Task 4: Render `OverlayField` in the block form (admin)

**Files:**
- Modify: `apps/admin/app/(dash)/editor/_fields/field-editor.tsx` (imports L6, `defaultForField` L16-40, FieldEditor switch L720 area)

**Interfaces:**
- Consumes: `OverlayField` (Task 3), `FieldPlan{kind:"overlay"}` (Task 2).
- Produces: block-settings forms render the overlay picker for every `kind:"overlay"` field.

- [ ] **Step 1: Add imports.** Extend the `@signex/shared` import and add the component import:

```tsx
import { isVideoRef, type MediaRef, type Overlay } from "@signex/shared";
import { OverlayField } from "../../visual/overlay-field";
```

- [ ] **Step 2: Add the `defaultForField` case.** Inside the `switch (plan.kind)` in `defaultForField`, add (before `default:`):

```ts
    case "overlay":
      return undefined; // optional overlay defaults to absent ("Không")
```

- [ ] **Step 3: Render it in the `FieldEditor` switch.** Add a branch immediately after the `color` branch (`field.kind === "color"`):

```tsx
  } else if (field.kind === "overlay") {
    inner = (
      <OverlayField
        value={value as Overlay | undefined}
        onChange={onChange}
        label={field.label}
        idPrefix={field.name}
      />
    );
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/admin && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 5: Lint + full admin test suite**

Run: `npm run lint -w @signex/admin && npm run test -w @signex/admin`
Expected: eslint clean; all admin tests PASS.

- [ ] **Step 6: Commit**

```bash
git add "apps/admin/app/(dash)/editor/_fields/field-editor.tsx"
git commit -m "feat(admin): render OverlayField for overlay block fields (was raw JSON)"
```

---

## Final Build Gate (after Task 4)

- [ ] **Whole-monorepo build + test + lint**

Run: `npm run build && npm run test && npm run lint`
Expected: turbo runs all workspaces green — shared (`tsc` + vitest incl. the new Overlay tag test), admin (`next build` typecheck + vitest incl. the new deriveFields tests), web, api. No failures.

---

## Post-implementation verification (controller-run — NOT a subagent task)

React components aren't unit-tested here (no jsdom/RTL) and the admin editor requires auth, so the end-to-end proof is a browser pass I run after the subagent tasks:

1. **Enable dev catalog** (spec Part 2 — data already exists in the theme + MinIO):
   ```bash
   docker exec signex-postgres psql -U signex -d signex -c 'DELETE FROM "Catalog";'
   docker compose exec api node dist/catalog/backfill
   # revalidate (secret: docker compose exec api printenv REVALIDATE_SECRET)
   curl -sS -X POST http://localhost:3060/api/revalidate -H "x-revalidate-secret: <secret>" -H 'content-type: application/json' -d '{"tags":["catalog"]}'
   ```
2. **Block form** — open the `productsHeader` block settings; confirm `homeCardOverlay` / `categoryImageOverlay` / `productImageOverlay` render the picker (not a raw-JSON textarea). Set a solid colour + opacity on `homeCardOverlay`, Save, reload — value persists.
3. **Public/preview render** — confirm the wash appears over real catalog imagery on the home cards, the category page (hero + product grid), and the product-detail image, matching the configured colour/opacity.
4. **Spot-check a non-catalog field** — e.g. `hero.overlay` renders the picker too.
5. **Media-picker regression** — open an editable media slot on the canvas; confirm the "Lớp phủ" control still works identically (now rendered via `OverlayField`), including live preview and Apply.

---

## Self-Review

- **Spec coverage:** Overlay tag (Task 1) ✓; FieldKind detect (Task 2) ✓; extract + dedupe (Task 3) ✓; block-form render (Task 4) ✓; all 8 fields covered by the single tag (Tasks 1–2) ✓; Part 2 seeding (controller verification) ✓.
- **Placeholder scan:** the only `<secret>` is a runtime value with documented retrieval (controller step, not a subagent task). Task 3's JSX relocation is specified as exact source line-ranges + explicit substitution rules over already-present code — the implementer relocates, not invents. No TBD/TODO.
- **Type consistency:** `OverlayFieldProps` is defined once (Task 3) and consumed with matching props in both `FlexibleBody` (Task 3) and `field-editor.tsx` (Task 4); `Overlay` type imported from `@signex/shared` in both; `FieldKind` `"overlay"` defined (Task 2) before it's switched on (Task 4).
