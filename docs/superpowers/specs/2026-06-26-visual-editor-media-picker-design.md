# Visual-Editor Media Picker + Crop — Design

**Date:** 2026-06-26
**Status:** Approved (key decisions confirmed by user)
**Area:** `apps/admin` visual editor (`app/(dash)/visual/*`)

## Goal

Replace the visual editor's bare media-edit drawer (a right-side `Sheet` with a native `<select>`
+ "Upload new") with a polished **modal media picker**: browse the existing asset library OR upload
a new file, and when uploading an image, **crop / zoom / rotate** it before it's saved. The result
still flows through the unchanged `MediaRef → applyRef` save path.

## Confirmed decisions

1. **Crop scope = crop + zoom + 90° rotate + aspect presets** (not a full filter/annotation editor).
2. **Destructive crop** — the cropped bytes are uploaded as a NEW content-addressed asset and wired
   into the block. Re-cropping starts from the original in the library. (No store-original+rect /
   read-time-transform model in v1.)
3. **Per-zone aspect default** — an admin-side `field → aspect` constant seeds the crop aspect for
   known zones; falls back to the image's natural ratio ("Original"). No change to `EditTarget` or
   the web `editAttrs`/postMessage.

## Library decision: `react-easy-crop@^6.0.2`

Chosen after researching react-easy-crop, react-image-crop, react-cropper/Cropper.js,
react-advanced-cropper, react-filerobot, Pintura — and adversarially verifying the top pick.

**Why react-easy-crop:** MIT; ~6.9 KB gzip; one tiny dep (`normalize-wheel`); actively maintained
(v6.0.2, 2026-06-11); open peer range (`react >= 16.4.0`) → installs clean on **React 19 / Next 16**
with no `--legacy-peer-deps`; works as a **client component** (modal-only, no SSR concern). Decisive:
it is **headless** — it renders only the crop/zoom/rotate surface, no chrome — so all UI (aspect
presets, zoom slider, rotate button, actions) is our shadcn/Tailwind, matching the design system.
It natively handles crop + wheel/pinch/slider zoom + arbitrary rotation + aspect lock, and
`onCropComplete` returns `croppedAreaPixels` which we paint to a `<canvas>` and `canvas.toBlob()`.

**Runner-up:** `react-image-crop` (ISC, ~4.5 KB, best keyboard a11y) — rejected only because it has
**no native zoom/rotate**, which decision #1 requires.
**Rejected:** react-cropper (abandoned, React 17 peer), react-advanced-cropper (0.x, stale, 3.5×
bundle, own chrome), react-filerobot (React 19 only on beta; konva + styled-components fights
shadcn), Pintura (paid/watermarked — fails the permissive-license bar).

New dependency: `react-easy-crop` in `apps/admin` (lazy-imported inside the crop view so it stays
out of the initial bundle).

## UX

A centered shadcn `Dialog` (`max-w-5xl`, ~80vh) replaces the `Sheet`. Two Radix `Tabs`, **Library
default**:

```
┌─ Replace image ─────────────────────[search]──[×]─┐
│ [ Library ]  [ Upload ]                            │
├────────────────────────────────────────────────────┤
│ [All ▾] [Images ▾]      ▣ recent-first thumb grid  │  Library (default)
│  ┌──┐┌──┐┌──┐┌──┐┌──┐  click a card → select        │
│  │✓ ││  ││  ││  ││  │  (2px ring-primary + ✓ badge) │
├────────────────────────────────────────────────────┤
│ hero.jpg · 2400×1600 · 480 KB    [Cancel][Use image]│  sticky footer
└────────────────────────────────────────────────────┘

Upload tab: dropzone → (image) crop view:
   [ react-easy-crop surface ]
   ( zoom ──●──── )  [↻ rotate 90°]
   aspect: Original · 1:1 · 4:5 · 16:9 · Free
   [ Use full image ]            [ Cancel ] [ Crop & upload ]
```

- **Library tab (default):** grid of `aspect-square object-cover` thumbnails (reuse the
  `media/page.tsx` card markup), recent-first, debounced filename search, type filter
  (`All / Images`), whole-card click selects (ring + checkmark), footer shows filename · dims ·
  size; primary button disabled until a selection exists. For an image target this is the 3-click
  "reuse existing" happy path → `MediaRef {type:'image', assetId}`.
- **Upload tab:** dashed dropzone (accepted types + size hint). Dropping a file anywhere in the
  Dialog auto-switches to Upload and pre-fills it. One image → the crop view.
- **Crop view:** `react-easy-crop` surface + shadcn `Slider` (zoom) + one 90° rotate `Button` +
  aspect presets as a `ToggleGroup` (`Original · 1:1 · 4:5 · 16:9 · Free`), aspect seeded from the
  zone (decision #3). A **"Use full image"** escape hatch uploads the original un-cropped — crop is
  an enhancement, never a gate.

## Data flow (image upload)

```
onCropComplete → croppedAreaPixels (+ rotation)
confirm → getCroppedImg(src, croppedAreaPixels, rotation): Promise<Blob>   // canvas helper
        → new File([blob], `crop_${name}`, { type: blob.type })
        → uploadAsset(file, setPhase)            // apps/admin/app/lib/upload-asset.ts — UNCHANGED
        → { id } → onApply({ type:'image', assetId: id })   // MediaRef — UNCHANGED
        → visual-editor.tsx applyRef → GET block → setPath → PUT (optimistic lock) — UNCHANGED
        → refreshPreview()
```

`getCroppedImg` is the standard react-easy-crop canvas helper (handles rotation + DPR), kept in a
new `app/lib/crop-image.ts`. Library-pick path skips upload entirely (asset already exists).

## Video handling — image-only crop

For `mediaKind === 'video'` the Dialog shows the existing three independent sub-pickers in its body
(poster `IMAGE|SVG`, mp4 `VIDEO`, optional webm `VIDEO`) — each "pick existing or upload", **no
crop**. Apply enabled once poster + mp4 resolve → `MediaRef {type:'video', posterAssetId, mp4AssetId,
webmAssetId?}`. (Cropping a video poster as a standalone image is a possible later enhancement, not
in v1.)

## Reused vs changed

**Reused unchanged:**
- `app/lib/upload-asset.ts` `uploadAsset(file, onPhase)` + `UploadPhase` — a Blob wrapped as a
  `File` feeds it as-is (content-addressed dedup still applies; an identical crop dedups).
- `app/(dash)/visual/visual-editor.tsx` — `applyRef`, `loadAssets` (`/admin-api/assets`),
  `setPath`, `refreshPreview`, the 409/422 handling. The new picker is invoked with the same props
  and `onApply(MediaRef)` callback.
- `MediaRef` / `EditTarget` / `AssetRow` contracts.
- `GET /admin-api/assets` list shape (id, kind, url, originalName, width, height, bytes, status).
- API: **no changes** (presign/confirm/list already do everything).

**Changed:**
| Concern | Current | New |
|---|---|---|
| Container | `Sheet` (right panel) | `Dialog` (centered modal) |
| Image picker | native `<select>` (`edit-drawer.tsx`) | `Tabs`: Library grid + Upload→crop |
| Image flow | pick → apply | pick **or** upload→crop→apply |

`edit-drawer.tsx` is superseded by `media-picker-dialog.tsx`, which **re-exports** `MediaRef`,
`EditTarget`, `AssetRow` so `visual-editor.tsx` imports don't move.

## Component breakdown

**Add:**
- `app/(dash)/visual/media-picker-dialog.tsx` — Dialog shell + Tabs + sticky footer + video
  sub-pickers; re-exports the contracts. (replaces `edit-drawer.tsx`)
- `app/(dash)/visual/asset-grid.tsx` — selectable, searchable, type-filtered thumbnail grid (lifted
  from `media/page.tsx`), roving-tabindex, `aria-pressed`.
- `app/(dash)/visual/crop-view.tsx` — `"use client"`, lazy `react-easy-crop`, zoom slider, rotate,
  aspect `ToggleGroup`, "Use full image".
- `app/lib/crop-image.ts` — `getCroppedImg(src, croppedAreaPixels, rotation): Promise<Blob>`.
- `app/(dash)/visual/aspect-presets.ts` — `ASPECT_BY_FIELD` constant (e.g. `hero.image`/
  `contactPage.hero.image` → 16/9; `aboutPage.testimonial.image` → 4/5; logos/watermark → undefined
  = Free) + the preset list. Default crop aspect = mapped value, else "Original".

**Change:**
- `app/(dash)/visual/visual-editor.tsx` — swap `<EditDrawer>` for `<MediaPickerDialog>` (same
  open/target/saving/onApply/onOpenChange props). Remove the `edit-drawer` import.

**Add shadcn primitives** (if missing): `slider`, `toggle-group` (via the shadcn CLI). `dialog`,
`tabs`, `scroll-area`, `input`, `button`, `skeleton` already exist.

## States & quality bar

- **Loading library:** `Skeleton` grid while `loadAssets` runs.
- **Empty library:** show the dropzone inside the Library tab ("No images yet — drop one here").
- **Upload phases:** status line driven by `UploadPhase` (hashing→presigning→uploading→confirming);
  footer disabled during upload.
- **Crop/upload/network error:** `uploadAsset` throws → toast the message, keep the crop view
  mounted so the user retries without re-cropping; guard the `canvas.toBlob` null callback.
- **Optimistic-lock 409:** reuse `applyRef`'s existing handling (toast + refresh); no new logic.
- **Accessibility:** Radix Dialog/Tabs give focus trap, `Esc`, `aria-modal`, labelled title;
  restore focus to the edited hotspot on close. Grid cards are real `<button>`s with arrow-key
  roving tabindex + `Enter`/`Space` select + `aria-pressed`. Selection shown by ring **and**
  checkmark (not color alone). Visible focus rings; respect `prefers-reduced-motion`.

## Testing

- Unit: `getCroppedImg` produces a Blob of the expected type for a known crop rect (jsdom + a mock
  canvas, or a thin pure helper extracted from the canvas call).
- Unit: `ASPECT_BY_FIELD` resolution (mapped field → ratio; unmapped → undefined/Original).
- Manual/agent-browser e2e (the established verification path): in `/visual`, click a hero hotspot
  → Dialog opens on Library → pick an asset → preview updates; switch to Upload → drop an image →
  crop → "Crop & upload" → new asset wired + preview updates; video target shows 3 sub-pickers;
  `Esc`/focus-restore work; no console errors. Build + lint green; admin image rebuilt.

## Out of scope (v1)

Non-destructive crop (original + rect, read-time transform), image filters/brightness/annotations,
cropping a video poster, bulk upload, asset rename/delete from the picker.
