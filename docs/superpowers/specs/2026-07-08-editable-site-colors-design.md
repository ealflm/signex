# Editable Site Colors (Theme Palette) — Design

**Date:** 2026-07-08
**Status:** Approved (key decisions confirmed by user)
**Area:** `packages/shared` (schema) · `apps/web` (render + instrumentation) · `apps/admin` (editor) · `apps/api` (save-draft)

## Goal

Let an admin recolor the entire public site (`apps/web`) from the CMS — both by **clicking a
themed element in the live preview** (the same interaction model as the existing inline text /
media editing) and by a fallback **"Bảng màu" (Palette) panel** that lists every colour. Colours
ride the existing per-Theme snapshot → Publish → web read-path pipeline, so a palette is
versioned, previewable, roll-back-able, and revalidated exactly like content.

## Key insight: the template is already a token system

The Caladan template CSS (`apps/web/public/assets/css/caladan-template.shared.*.css`) is a full
design-token system built on CSS custom properties. Every colour on the site derives from a small
set of **seed** variables:

```
--_🎨-color--base---accent--aqua:      #2ec4b6
--_🎨-color--base---accent--ocean:     #0f4c81
--_🎨-color--base---accent--dark-ocean:#0d2b44
--_🎨-color--base---accent--deep-navy: #071522
--_🎨-color--base---base--dark-100:    #0b1f33
--_🎨-color--base---base--light-100:   white
--_🎨-color--base---lift--dark:        #272727
--_🎨-color--base---lift--light:       #d9d9d9
```

Everything else is derived, not authored:

- The **opacity scales** (`base--dark-0/4/8/16/32/48/64/88/100`, and the `light-*` mirror) are
  `color-mix(in srgb, var(--…--dark-100) N%, transparent)` — i.e. functions of the two `-100`
  seeds.
- The **semantic tokens** (`--tokens---ink--*`, `--tokens---button--{primary,secondary,tertiary}--{default,hover}--{background,text,border}`,
  `--tokens---input--{default,active,error,filled}--{background,text,border}`) are `var()`
  references back to the seeds / scales.
- There is **no global light/dark toggle**. `:root` and `body` establish the default (light)
  scheme; specific dark surfaces (`.master_footer`, `.overlay_cta`, `.card_menu-contact`, …)
  locally re-declare the same `--tokens---*` to the `dark-*` scale. Both schemes still resolve
  back to the **same seeds**.

**Consequence:** overriding the ~8 seed variables at `:root` re-themes the whole site — light
sections, dark sections, buttons, inputs, ink — in one cascade. This is the foundation of the
design.

## Confirmed decisions

1. **Three levels of control, all stored in the snapshot (per Theme):**
   - **Seeds** — the 8 seed swatches above. Site-wide.
   - **Tokens** — optional/partial overrides of the **`:root`-level** semantic tokens (ink,
     button, input). Site-wide fine-tuning. Section-scoped re-declarations still win locally
     (documented limitation, acceptable).
   - **Overrides** — per-element colour overrides, keyed by a stable `anchorId`, scoped to the
     curated set of colour-**anchored** elements only.
2. **Click-to-edit in the preview** via a new `data-edit-kind="color"` — the fourth edit kind
   alongside `text` / `image` / `video`. Clicking a themed element opens a popover offering **two
   modes**: *"Đổi cả site (token)"* (edit the seed/token behind that element → site-wide) **or**
   *"Chỉ phần tử này"* (write a per-element override).
3. **Palette panel** ("Bảng màu") in the editor is the exhaustive fallback: all 8 seeds + an
   *Advanced* group for tokens, each with a colour picker and a "Reset" control. Covers colours
   that are hard to click.
4. **Backward-compatible schema:** `palette` is **optional** on `ReleaseSnapshotSchema`;
   `schemaVersion` stays `1`. Snapshots without a palette parse unchanged and emit **no** style
   override (byte-identical to today). No DB migration.
5. **End-user-facing labels are descriptive Vietnamese** ("Màu nhấn", "Đại dương", "Nền tối", …),
   not the technical token names.

## A. Schema (`packages/shared/src/content/`)

New module `palette.ts`, exporting:

```ts
// A 6-digit (or 3-digit) hex, validated. Alpha handled by the token system, not stored here.
const Hex = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);

export const PaletteSeedsSchema = z.object({
  accentAqua: Hex, accentOcean: Hex, accentDarkOcean: Hex, accentDeepNavy: Hex,
  baseDark: Hex, baseLight: Hex, liftDark: Hex, liftLight: Hex,
}).partial();

// TokenKey is a fixed allowlist of the :root-level semantic token variables (ink/button/input).
// Source of truth = the :root/body declarations in the template CSS. Enumerated as a const array
// so web (emit) and admin (labels) share it.
export const PaletteTokensSchema = z.record(TokenKeySchema, Hex).partial();

// AnchorId = the same stable "<blockKey>.<path>" string used by data-edit-field.
export const PaletteOverridesSchema = z.record(
  z.string(),
  z.object({ bg: Hex, text: Hex, border: Hex }).partial(),
);

export const PaletteSchema = z.object({
  seeds: PaletteSeedsSchema.optional(),
  tokens: PaletteTokensSchema.optional(),
  overrides: PaletteOverridesSchema.optional(),
});
```

`ReleaseSnapshotSchema` gains `palette: PaletteSchema.optional()` (sits beside the already-optional
`catalog`).

**Shared constant map** `PALETTE_VARS`: `paletteKey → exact CSS variable name` (including the
`--_🎨-color--…` prefix, emoji preserved as literal bytes). This single map is imported by both the
web emitter and the admin panel so the two can never drift. It also carries the **default value**
per key (the current template value) and the **descriptive VN label** for the panel.

## B. Web render (`apps/web`)

### B.1 Read-path (`app/lib/content.ts`)

The published loader already reads + validates the snapshot. Surface `snapshot.palette` on the
resolved `SiteContent` (locale-agnostic — colours are not bilingual). No change to caching:
`palette` rides the existing `'use cache'` + `cacheTag('release')` loader, so Publish →
`/api/revalidate` marks it stale like everything else.

### B.2 Style emitter

A new server helper `paletteStyle(palette): string | null` builds the CSS text:

```css
:root{
  --_🎨-color--base---accent--aqua:#…;   /* seeds present */
  --_🎨-color--tokens---ink--base:#…;    /* tokens present */
}
[data-sx-c="hero.cta"]{ background:#…; color:#… }   /* one rule per override */
```

- Only keys **present** in the palette are emitted. Absent seed/token → template default is left
  untouched.
- `null` when the palette is empty/absent → **nothing rendered** (today's behaviour exactly).
- Emitted verbatim from a fixed allowlist of variable names + hex-validated values (no interpolation
  of free-form strings) → no CSS-injection surface.

Both `app/[lang]/layout.tsx` **and** `app/preview/layout.tsx` render
`<style id="signex-palette" dangerouslySetInnerHTML={{__html}} />` **after** the template
`<link>` so the `:root` overrides win by source order. Preview needs it too so the initial preview
paint already reflects the saved draft palette.

### B.3 Instrumentation — new `editColor()` helper (`app/lib/edit-attrs.ts`)

Mirrors `editText` / `editAttrs`. Applied to a **curated set** of colour-anchored elements
(buttons, accent headings, section backgrounds — the obvious single-role targets). Signature:

```ts
editColor(editable, anchorId, spec)
// spec = which token(s) drive this element + which roles are overridable, e.g.
//   { token: "button.primary", roles: ["bg","text"] }
```

Emits:

- **Always (public + preview):** `data-sx-c="<anchorId>"` — the stable hook the override CSS binds
  to. This is the *only* attribute that reaches the public HTML, and only on anchored elements.
- **Preview only:** `data-edit-kind="color"`, `data-edit-field="<anchorId>"`, plus
  `data-edit-color-token` / `data-edit-color-roles` describing the token + roles for the popover.

The curated anchor list is the coverage boundary: only anchored elements are individually
click-editable **and** individually overridable. Everything else is recoloured via the seeds/tokens
(panel or token mode), which is what "change the whole site" means anyway.

### B.4 Overlay (`app/components/editor/edit-overlay.tsx`)

Add a third branch to the existing scan. Colour zones get a small swatch/hotspot (like media
zones). Click → `postMessage({ type: "colorEdit", field, token, roles })` to the admin. Also handle
an inbound `applyPalette` message to live-update the in-iframe `<style id="signex-palette">` without
a reload (parallel to the existing `applyEdits` media/text live-swap), so picking a colour is
instant.

## C. Admin editor (`apps/admin/app/(dash)/editor/`)

### C.1 Pending model

`editor-shell.tsx` currently holds `pending: Map<BlockKey, blockData>`. Add a **separate**
`pendingPalette: Palette` patch (colours are not a block). The dirty indicator, Save-draft payload,
and discard all account for it. Save-draft sends `{ blocks, palette }`.

### C.2 Click popover

On `colorEdit`, open a popover (admin-side, anchored near the toolbar/panel — the picker UI lives in
admin, like the media drawer, since the iframe is cross-origin). Two modes:

- **"Đổi cả site (token)"** — edits the seed/token named by `data-edit-color-token`. Writes into
  `pendingPalette.seeds` / `.tokens`.
- **"Chỉ phần tử này"** — writes `pendingPalette.overrides[anchorId][role]`. Role chooser shown
  only when the element exposes >1 role.

Every pick posts `applyPalette` to the preview for instant feedback.

### C.3 Palette panel ("Bảng màu")

A new selection target in `SectionsNav` (not a block). Renders:

- **8 seed pickers** with VN labels + live swatch (source: `PALETTE_VARS`).
- **Advanced (collapsible)** — token overrides; each row shows the derived default and lets you pin
  or reset an override.
- Global **"Đặt lại toàn bộ màu"** clears `pendingPalette` (→ template defaults).

Picker component: reuse an existing shadcn-based colour input if present; otherwise a small
`<input type="color">` + hex text field wrapper. (Confirm during planning — no new heavy dep unless
needed.)

## D. API (`apps/api`)

The save-draft endpoint accepts an optional `palette` (validated by `PaletteSchema`) and merges it
into `draftSnapshot.palette` under the existing per-Theme optimistic lock (`draftRevision`). Publish
already serializes the whole `draftSnapshot` into the Release snapshot, so the palette flows through
unchanged. Reset = a `palette` that clears keys (or omits the field).

## E. Backward compatibility

- Existing Themes / Releases have no `palette` → parse unchanged → emit nothing → site looks
  identical.
- No Prisma migration (snapshot is `Json`).
- `schemaVersion` stays `1` (additive, optional field).

## F. Testing

- **shared:** `PaletteSchema` accepts valid seeds/tokens/overrides; rejects bad hex; a snapshot
  **without** `palette` still parses (backward-compat); `PALETTE_VARS` covers every seed key.
- **web:** `paletteStyle()` emits only present keys, correct `:root` + `[data-sx-c]` rules, and
  `null` for empty/absent; `editColor()` stamps `data-sx-c` on public render and the full
  `data-edit-*` set only when `editable`.
- **admin:** popover offers both modes and writes the right slice; panel renders pickers and reset;
  edits land in `pendingPalette` and in the save-draft payload; `applyPalette` live-updates preview.
- **browser e2e:** click a button → change token → all like buttons change; choose "chỉ phần tử
  này" → only that element changes; Publish → public site reflects it.

## G. Out of scope (YAGNI)

- Global light/dark theme toggle (the template has none; per-section schemes stay as authored).
- Per-element overrides on **non-anchored** elements (bounded to the curated anchor set on purpose).
- Editing the derived opacity scales directly (they follow the seeds).
- Colour-contrast/accessibility auto-validation of chosen palettes (could be a later add).
