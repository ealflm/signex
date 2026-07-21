# Universal Overlay Editor — Design

**Date:** 2026-07-21
**Status:** Approved design → ready for implementation plan
**Base branch:** `feat/site-adjustments-r3` @ `1f5e15a` (carries all 8 `Overlay` block fields + the r3 `color` FieldKind + `overlay-edit.ts`). Work branch: `feat/universal-overlay-editor` (stacked on r3).

> **Branch note (not a blocker):** `main` @ `b17b531` has *diverged* — it carries a separate "Floating buttons block" feature and does **not** have the 3 catalog overlay fields nor the `color` FieldKind. This work therefore stacks on the r3 branch, not on main. Reconciling r3 + this feature + main's floatingButtons is a future merge task, out of scope here.

---

## Goal

Give every `Overlay` ("phủ màu") block field a proper visual editor — colour + opacity, or a 2–4 stop gradient — in the admin block-settings form, replacing the raw-JSON textarea they render as today. One detection change fixes **all 8** overlay fields at once, including the 3 catalog washes that r3 shipped but could never be configured.

## Background — two defects, one root

**Defect A — overlay fields render as raw JSON in block forms.** The admin's `deriveFields` (`apps/admin/app/lib/zodform-fields.ts`) classifies the `Overlay` primitive (a `z.discriminatedUnion`) as kind `"json"` — its fallback for shapes it can't model — so every overlay field shows a raw JSON textarea instead of a picker. A working overlay editor *does* exist, but only inline inside the media-picker dialog's `FlexibleBody` (`apps/admin/app/(dash)/visual/media-picker-dialog.tsx`), reachable only by clicking an editable **media slot** on the canvas. Catalog images are plain `<img>` (not media slots), so that on-canvas path never opens for the 3 catalog washes — leaving raw JSON as their only editor.

**Defect B — the dev catalog is unconfigurable/untestable.** The web reads categories from the `Catalog` singleton table (`apps/web/app/lib/catalog.ts`), and the editor's preview path (`apps/web/app/lib/content.ts:564`) uses the API's catalog draft: when that draft is an empty array (truthy) it does **not** fall back to `INITIAL_CATALOG`, so the editor renders 0 category cards and the 3 catalog washes have nothing to preview on. This is why r3 Task 5 was never visually verified.

Both are resolved here: Part 1 fixes Defect A (the feature). Part 2 fixes Defect B (test-enablement I run myself, no code).

---

## Part 1 — Universal "overlay" FieldKind (the feature)

### Approach

Mirror the existing r3 `color` FieldKind precedent: mark the schema with a `.describe()` tag, detect that tag in `deriveFields`, and render a dedicated editor. Because all 8 fields share the single `Overlay` export, one `.describe("overlay")` on that export tags all of them. The editor UI already exists inline in `FlexibleBody`; extract it into a reusable presentational component so both the block form and the media picker render the *same* control (no duplication).

### Changes

**1. Tag the schema — `packages/shared/src/content/primitives.ts:76`**

Add `.describe("overlay")` to the `Overlay` export:

```ts
export const Overlay = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("solid"), fill: OverlayFill }),
  z.object({ kind: z.literal("gradient"), angle: z.number().min(0).max(360), stops: z.array(OverlayStop).min(2).max(4) }),
]).describe("overlay");
```

`Overlay` is used *exclusively* as an overlay field (all 8 sites), so tagging the export — rather than each use site as `color` did — is both correct and DRY. `.describe()` returns the same `ZodDiscriminatedUnion` subclass (spreads `_def`, preserving `discriminator`/`options`/`optionsMap`) and does not change the inferred type, so parsing, `Overlay.optional()`, `z.infer`, and `initial-snapshot.ts`'s `satisfies ReleaseSnapshot` are all unaffected. No other consumer reads schema descriptions; only `deriveFields` does.

**2. Detect it — `apps/admin/app/lib/zodform-fields.ts`**

Add `"overlay"` to the `FieldKind` union, and one line in `classify()` beside the `color` check (both are description-based; both must precede the structural checks and the `json` fallback):

```ts
if (s.description === "overlay") return { name, kind: "overlay", label: name };
```

`unwrap()` already strips `.optional()` down to the described discriminated union, so `s.description === "overlay"` holds for every `Overlay.optional()` field, top-level or nested.

**3. Extract the reusable control — new `apps/admin/app/(dash)/visual/overlay-field.tsx`**

Move the inline "Lớp phủ" markup from `FlexibleBody` (media-picker-dialog.tsx ~L643–882: the None/Màu đặc/Gradient toggle, the solid colour+opacity controls, the gradient angle+stops controls) and the `OverlayPreview` swatch (~L542–560) into a single presentational component. It owns no state — value in, change out:

```ts
interface OverlayFieldProps {
  value: Overlay | undefined;              // absent ⇒ "Không" (no overlay)
  onChange: (next: Overlay | undefined) => void;
  label?: string;                          // section legend; default "Lớp phủ"
  idPrefix?: string;                       // unique input/aria ids when many render on one page
}
```

It uses the existing pure helpers `setKind`/`addStop`/`removeStop`/`emptyStop` (`overlay-edit.ts`) and `overlayCss` (`@signex/shared`) — no logic is rewritten, only relocated. Co-located with `overlay-edit.ts` in `(dash)/visual/`.

**4. Render it in the block form — `apps/admin/app/(dash)/editor/_fields/field-editor.tsx`**

Add a branch beside the `color` branch:

```tsx
} else if (field.kind === "overlay") {
  inner = <OverlayField value={value as Overlay | undefined} onChange={onChange} label={field.label} idPrefix={field.name} />;
}
```

Also add `case "overlay": return undefined;` to `defaultForField` for completeness (an optional overlay defaults to absent; no overlay field currently sits inside a repeater array, so this is defensive only).

**5. De-duplicate the media picker — `media-picker-dialog.tsx` `FlexibleBody`**

Replace the inline overlay block with the extracted component, preserving the live-preview behaviour:

```tsx
<OverlayField value={overlay} onChange={(next) => { setOverlay(next); onOverlayPreview?.(next); }} />
```

`FlexibleBody` keeps owning its `overlay` state, the `onOverlayPreview` live-preview sink, and the Apply payload — only the *rendering* is delegated. The media-picker flow is behaviourally unchanged.

### The 8 fields this fixes (all `Overlay.optional()`, all now a picker)

| # | Field | File |
|---|---|---|
| 1 | `hero.overlay` | `blocks/hero.ts:11` |
| 2 | `features.video.overlay` | `blocks/features.ts:13` |
| 3 | `features.featured.overlay` | `blocks/features.ts:21` |
| 4 | `aboutPage.hero.overlay` | `blocks/aboutPage.ts:25` |
| 5 | `contactPage.hero.overlay` | `blocks/contactPage.ts:33` |
| 6 | `productsHeader.homeCardOverlay` | `blocks/productsHeader.ts:22` |
| 7 | `productsHeader.categoryImageOverlay` | `blocks/productsHeader.ts:23` |
| 8 | `productsHeader.productImageOverlay` | `blocks/productsHeader.ts:24` |

Fields 6–8 are the catalog washes — the original motivation.

### Data flow

- **Block form:** `deriveFields` → `FieldPlan{kind:"overlay"}` → `FieldEditor` renders `OverlayField` → `onChange` writes the value at the field's path in the block working value → **Save** posts the block → the API's `parseBlock` (the block schema, unchanged) validates → persisted to the theme draft → reflected on Publish/preview.
- **Media picker:** unchanged, now rendered via the shared `OverlayField`.

### Validity & error handling

`OverlayField` emits only schema-valid values by construction: the native `<input type="color">` yields `#rrggbb` (matches `OverlayFill`), the opacity/angle `<input type="range">` are bounded 0–100 / 0–360, and `addStop`/`removeStop` clamp the stop count to 2–4. So — like the other structured field editors (`LocalizedField`, etc.) and unlike `JsonField` — it never calls `onValidityChange`. It assumes a schema-valid `Overlay | undefined` in (guaranteed for stored values by the block-save validation) and does not defensively re-parse. The block schema parse on save remains the validation backstop.

---

## Part 2 — Dev catalog test-enablement (operational; I run it, no code)

Root cause found by inspecting the running dev stack: the real catalog **already exists** — the live theme's `draftSnapshot.catalog` holds 4 categories / 24 products and all 32 catalog images are `READY` in MinIO. Only the `Catalog` singleton table is empty (it was backfilled before the theme catalog existed, and `catalog:backfill` is idempotent so it now refuses to re-run). The `PublishedPointer → Release → Theme` chain is intact and the first category image resolves to a `READY` asset.

So "seed sample data" = re-copy theme → singleton via the **official backfill script** (real images, non-destructive to theme/config, no new code, no production pull):

```bash
# 1. clear the empty singleton so backfill's idempotency guard lets it re-run
docker exec signex-postgres psql -U signex -d signex -c 'DELETE FROM "Catalog";'
# 2. re-seed 4 cats / 24 products from the live theme (images already in MinIO)
docker compose exec api node dist/catalog/backfill
# 3. revalidate so web + editor pick it up (secret from: docker compose exec api printenv REVALIDATE_SECRET)
curl -sS -X POST http://localhost:3060/api/revalidate -H "x-revalidate-secret: <secret>" -H 'content-type: application/json' -d '{"tags":["catalog"]}'
```

This is test-setup, not a shipped artifact — no committed seed script. It runs once to make the editor render category/product imagery so the 3 catalog washes are verifiable end-to-end.

---

## Testing strategy

**Unit (extend existing suites):**
- `apps/admin/app/lib/zodform-fields.test.ts` — assert a block with an `Overlay.optional()` field derives `kind:"overlay"` (was `"json"`); assert a genuinely unmodellable field still derives `"json"` (no over-capture).
- `packages/shared/src/content/overlay-style.test.ts` / `blocks/*.test.ts` — regression: `Overlay` still parses valid `solid`/`gradient` values and rejects malformed ones *after* `.describe("overlay")` (the tag must not alter validation).
- `apps/admin/app/(dash)/visual/overlay-edit.test.ts` — unchanged; the pure helpers are only relocated-into, not modified.

**Browser (after Part 2 seeding):**
- Admin editor: open a block with an overlay field (e.g. `productsHeader` → `homeCardOverlay`), confirm the picker renders (not raw JSON), set a solid colour + opacity, Save, and confirm it persists on reload.
- Public/preview: confirm the wash renders over real catalog imagery on the home cards, category page (hero + grid), and product-detail image, and matches the configured colour/opacity.
- Media picker regression: confirm the on-canvas media-slot overlay control still works identically (it now renders via the shared component).

---

## Out of scope (YAGNI)

- No changes to `main`'s floatingButtons feature or any branch reconciliation.
- No committed catalog seed script (Part 2 is a one-time operational fix).
- No new overlay *capabilities* (radial gradients, blend modes, >4 stops) — the editor exposes exactly what the `Overlay` schema already supports.
- No production data pull.
- No local-image fallback added to the category/product detail pages — Part 2 supplies real MinIO images instead.

## Risks & mitigations

- **`.describe()` on a discriminated union** altering parse/type behaviour → covered by the schema regression test above; `.describe()` only sets `_def.description`.
- **Legacy malformed overlay value** (a hand-typed raw-JSON value from before this change) reaching `OverlayField` → not possible for *stored* values (block-save validation rejects them); the JSON editor that could produce them is being removed for these fields.
- **Main divergence** → explicitly out of scope; flagged for a later merge task.
