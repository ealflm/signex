# Configurable Media Overlay

**Goal:** Each of the four flexible media slots gains a configurable overlay layer — transparent by default, settable to a solid colour+opacity or a linear gradient — edited inside the same Ảnh/Video picker dialog, rendered on the public site, live-previewed in the editor.

**Architecture:** A new optional `Overlay` union in `@signex/shared`; a pure `overlayCss` resolver the four render components share to style the slot's overlay `<div>`; an "Lớp phủ" section in the media-picker dialog that resolves the overlay alongside the `MediaRef`; a new `applyEdits` kind `"overlay"` for the live preview. Backward-compatible — the field is optional, so an absent overlay means transparent and every stored snapshot stays valid (no migration).

**Tech stack:** zod (`@signex/shared`), Next.js 16 (`apps/web` render + `apps/admin` editor), the existing editor bridge/applyEdits pipeline.

## Global Constraints

- American "color" in identifiers, British "colour" in prose; **UI copy Vietnamese**.
- `@signex/shared` compiles to CommonJS `dist/` — `npm run build -w @signex/shared` after editing, before apps consume it. Do **not** commit `dist/`.
- **No migration, no re-publish.** `overlay` is `.optional()`; absent = transparent. Every existing draft + published snapshot stays valid.
- Public render leaks zero `data-edit-*` (`editableAttrs`/overlay hooks gate on `editable`). The overlay's own live-preview hook (`data-sx-overlay`) is preview-only, gated the same way.
- **NEVER `npm run test` (turbo-all)** — per-workspace only.
- Scope: exactly the **four flexible media slots** — `hero.image`, `features.featured.image`, `features.video.media`, `aboutPage.hero.video`. Their existing hard-coded scrim `<div>`s (`overlay_home-b-hero`, `overlay_dark-16` ×2, `overlay_hero-home-b`) are the divs made configurable. No other overlay on the site changes.
- Branch `feat/media-overlay` off `main`. Commit trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## Data model — `Overlay`

`packages/shared/src/content/primitives.ts` (append):
```ts
/** A colour + its opacity (0–100). Renders as rgba(). */
export const OverlayFill = z.object({
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "hex #RRGGBB"),
  opacity: z.number().min(0).max(100),
});
export type OverlayFill = z.infer<typeof OverlayFill>;

/** A gradient colour stop: a fill plus its position along the axis (0–100%). */
export const OverlayStop = OverlayFill.extend({ pos: z.number().min(0).max(100) });

/**
 * A media slot's overlay. ABSENT (the field is optional) means transparent — the default. A present
 * value is a solid fill or a 2–4 stop linear gradient. `kind` discriminates; nothing to migrate
 * because the absence itself is the "none" case.
 */
export const Overlay = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("solid"), fill: OverlayFill }),
  z.object({ kind: z.literal("gradient"), angle: z.number().min(0).max(360), stops: z.array(OverlayStop).min(2).max(4) }),
]);
export type Overlay = z.infer<typeof Overlay>;
```

**Block schema changes** — add `overlay: Overlay.optional()` beside each slot's media field:
- `hero.ts`: `heroBlock` → `overlay: Overlay.optional()`
- `features.ts`: `featured` object AND `video` object each → `overlay: Overlay.optional()`
- `aboutPage.ts`: `hero` object → `overlay: Overlay.optional()`

---

## Web resolution + rendering

**Pure resolver** — `apps/web/app/lib/overlay-css.ts` (new, DOM-free, unit-tested):
```ts
import type { Overlay } from "@signex/shared";
export type OverlayStyle = { backgroundColor?: string; backgroundImage?: string };
// #RRGGBB + opacity 0–100 → "rgba(r, g, b, a)"
export function overlayCss(o: Overlay | undefined | null): OverlayStyle { … }
```
- `undefined` → `{}` (transparent).
- `solid` → `{ backgroundColor: "rgba(r,g,b,a)" }`.
- `gradient` → `{ backgroundImage: "linear-gradient(<angle>deg, rgba(...) <pos>%, …)" }`.
The web `content.ts` view-model exposes each slot's `overlay: Overlay | undefined` (raw, passed straight to the component — resolution is done in the component via `overlayCss`, keeping content.ts free of CSS strings). Add an `overlay` key to the four builders.

**The four render components.** Each slot already renders a scrim `<div>` (`hero.tsx` `overlay_home-b-hero`, `features.tsx` `overlay_dark-16` ×2, `about-sections.tsx` `overlay_hero-home-b`). For each, replace the scrim's **background-bearing class** with a positioning-only class **`overlay_media-config`** (new, in the web's editor CSS: `position:absolute; inset:0; pointer-events:none;` + the slot's existing `z-index`) and set its background from `style={overlayCss(overlay)}`. When the overlay is absent the div renders with no background (transparent) — the template's dark scrim is gone by default, as designed. Stamp `data-sx-overlay="<block>.overlay"` on the div **only when `editable`** (preview-only hook for live updates), never on the public render.
> Preserve each slot's current z-index / stacking so the overlay still sits over the media and under the text. Read each file's current overlay-div context before swapping the class.

---

## Editor — the "Lớp phủ" section in the media dialog

`apps/admin/app/(dash)/visual/media-picker-dialog.tsx` gains an **Lớp phủ** section under the media body (both flexible and non-flexible media dialogs — but only the four flexible slots pass an overlay through; others omit it). Controls (Vietnamese copy):
- Segmented toggle **Không · Màu đặc · Gradient** (`kind`; "Không" clears the overlay → `undefined`).
- **Màu đặc**: a colour picker (reuse the admin's existing colour input from the colour-panel work if one exists; else an `<input type="color">` + a hex field) + an opacity slider (0–100, label "Độ mờ").
- **Gradient**: an angle control (0–360°, label "Góc"); a list of 2–4 stops, each a colour + opacity + position (0–100, label "Vị trí"); **+ Thêm điểm** / **× Xoá** buttons (enforce 2–4).
- A live **preview swatch** showing `overlayCss(overlay)` over a sample.

The dialog resolves an `Overlay | undefined` alongside the `MediaRef`. Its `onApply` becomes `onApply({ media: MediaRef, overlay: Overlay | undefined })` (or an added `overlay` param); the non-flexible callers pass/ignore overlay unchanged.

**Save** — `editor-shell.tsx` `applyMediaRef` writes the media to `<block>.<mediaField>` (as today) AND the overlay to `<block>.overlay` (clean-set: a cleared overlay deletes the key). It posts BOTH live-preview edits: the media swap (existing) and the new overlay edit.

---

## Live preview — `applyEdits` kind `"overlay"`

A new edit shape: `{ field: "<block>.overlay", kind: "overlay", css: OverlayStyle }`. The overlay's `edit-overlay.tsx` `applyEdits` handler adds an `"overlay"` branch: `document.querySelectorAll('[data-sx-overlay="<field>"]')` → set `el.style.backgroundColor` / `el.style.backgroundImage` (clear both first, then apply the incoming `css`). No element replacement (unlike the media swap), so no hotspot concerns.

---

## Backward compatibility

`overlay` is optional on all four fields → every existing draft + the 14 published releases parse unchanged (absent overlay = transparent). No `packages/db` change. `ReleaseSnapshotSchema.parse` accepts them as-is.

## Error handling & edge cases

- Absent overlay → `overlayCss` returns `{}` → transparent div (default).
- Gradient with < 2 stops is rejected by the schema; the dialog enforces 2–4 in the UI.
- A cleared overlay ("Không") deletes `<block>.overlay` (not a stored `{kind:"none"}`), keeping the absent = transparent invariant single-valued.
- `opacity` and `pos` are 0–100 in the model (percent); the resolver divides opacity by 100 for the rgba alpha.

## Testing

- **`@signex/shared`** (vitest): `Overlay` parses solid + gradient; rejects a gradient with 1 stop, an opacity > 100, a bad hex; the four block schemas accept an overlay and still parse with it absent.
- **`apps/web`** (node --test): `overlayCss` → `{}` for undefined; correct `rgba(...)` for solid; correct `linear-gradient(...)` for a multi-stop gradient (exact string).
- **`apps/admin`** (vitest): the dialog's overlay-state reducer (toggle kind, add/remove stop clamped 2–4, clear→undefined) as a pure helper.
- **Browser (preview, live)**: for each of the four slots — set a solid overlay and a gradient via the dialog, confirm the public-shaped render shows the overlay and a save round-trips; clear it and confirm transparent; confirm the media swap + overlay both live-update; confirm the public (non-preview) render leaks no `data-sx-overlay`.

## Out of scope

- Overlays on non-flexible media (logos, testimonial image, etc.) — untouched.
- Palette-token-sourced overlay colours (overlay colours are free `#RRGGBB` + opacity, independent of the 🎨 palette).
- Radial/conic gradients, blend modes, per-overlay animation.

## Deployment

Feature branch off `main`. After review + tests green + browser E2E, merge to `main` (fast-forward) and the operator deploys (rebuild `signex-web` + `signex-admin`; `@signex/shared` first; no DB migration).
