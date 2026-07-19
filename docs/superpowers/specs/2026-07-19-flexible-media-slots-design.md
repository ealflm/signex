# Flexible Media Slots — image *or* video in the same slot

**Goal:** In the visual editor, clicking any of four visual-content media slots lets the user upload/choose **either an image or a video**, and the public site renders whichever was stored.

**Architecture:** A `MediaRef = AssetRef | VideoRef` union type at the schema layer; the web resolves it to a discriminated view-model and renders `<img>` or `<video>` accordingly; the editor stamps both `image` + `video` caps on those slots; the media picker gains an **Ảnh / Video** toggle that reuses the existing image and video picker bodies. Backward-compatible — existing stored `AssetRef`/`VideoRef` values parse unchanged, so **no data migration and no re-publish**.

**Tech stack:** zod (`@signex/shared`), Next.js 16 (`apps/web` render + `apps/admin` editor), existing `uploadAsset` presign→PUT→confirm pipeline (unchanged).

## Global Constraints

- **American "color" in identifiers, British "colour" in prose; UI copy in Vietnamese.**
- `@signex/shared` compiles to CommonJS `dist/` — rebuild it (`npm run build -w @signex/shared`) before `apps/*` consume the new type, or they test stale code.
- **No migration, no re-publish.** The union MUST accept every value shape currently stored for the four fields. Existing snapshots (draft + all published releases) stay valid; changing the schema must not invalidate a stored snapshot.
- Public render still leaks zero `data-edit-*` (`editableAttrs` already gates on `editable`).
- Never run `npm run test` (turbo-all) against a live `DATABASE_URL`. Per-workspace only: `-w @signex/shared`, `-w @signex/web`, `-w @signex/admin`.
- Feature branch `feat/flexible-media-slots` off `main` (`d5a51dd`). Unrelated to the unmerged `feat/editable-site-colors` branch. Do not merge/push without the operator's decision.

---

## Scope

**Four slots become flexible (image *or* video):**

| Field | Today | Web render site |
|---|---|---|
| `hero.image` | `AssetRef` (required) | `apps/web/app/components/home/hero.tsx` — `<img>` |
| `features.featured.image` | `AssetRef.optional()` | `apps/web/app/components/home/features.tsx` — `<img>` |
| `features.video.media` | `VideoRef.optional()` | `features.tsx` — `<video>` |
| `aboutPage.hero.video` | `VideoRef.optional()` | `apps/web/app/components/about/about-sections.tsx` — `<video>` |

**Explicitly OUT of scope (stay image-only, unchanged):**
- `nav.logo`, `footer.logo`, `footer.watermark`, `meta.ogImage`, `meta.favicons[]` — a video cannot serve as a logo, favicon, or social-share image.
- **`notFound.image` — dropped for a real technical reason, not an oversight.** The public 404 (`not-found-view.tsx`) is *deliberately static*: Next's `notFound()` cannot make the subtree dynamic, so the page single-sources its copy from the build-time `INITIAL_SNAPSHOT` and renders a **hard-coded literal `<img src>`** (line ~85) — it never resolves the stored `notFound.image` at all. Only `not-found-preview.tsx` (the editor iframe) renders it. Making the slot flexible would show the toggle in preview while the live 404 kept its literal image — a promise the public page can't keep. Reworking the 404 to render stored media (image *or* video) is a separate, larger change (dynamic 404) and is out of scope here.
- The public quote/lead forms (`lead-upload-field.tsx`, `contact.tsx`, `hero-quote-form.tsx`) — customer attachments (image + PDF), a separate concern.

`hero.image` is currently a **required** `AssetRef`. It becomes a **required** `MediaRef`: the slot must still hold *something*, but that something may now be an image or a video.

---

## The data model — `MediaRef` union

`packages/shared/src/content/primitives.ts` (today):
```ts
export const AssetRef = z.object({ assetId: Id, alt: LocalizedText.optional() });
export const VideoRef = z.object({ posterAssetId: Id, mp4AssetId: Id, webmAssetId: Id.optional() });
```

Add:
```ts
/** A media slot that may hold EITHER an image (AssetRef) or a video (VideoRef).
 *  The two are structurally disjoint — an image carries `assetId`, a video carries
 *  `posterAssetId`+`mp4AssetId` and no `assetId` — so a plain union discriminates cleanly and,
 *  crucially, every value already stored as an AssetRef or a VideoRef still parses. No migration. */
export const MediaRef = z.union([AssetRef, VideoRef]);
export type MediaRef = z.infer<typeof MediaRef>;

/** The one honest discriminator: presence of `mp4AssetId` means video. `assetId` means image.
 *  Used by the web resolver and the admin picker so both read "which kind" the same way. */
export const isVideoRef = (m: MediaRef): m is VideoRef => "mp4AssetId" in m;
```

**Why a plain `z.union`, not `z.discriminatedUnion`:** a discriminated union needs a shared literal tag on every member. The stored values have no such tag (they were written before this feature), so a discriminated union would force a migration to add one. The structural union needs nothing added.

**Disjointness proof (must be held by a test):** zod `.object()` strips unknown keys by default and requires declared-required keys. `AssetRef` requires `assetId`; `VideoRef` requires `posterAssetId` + `mp4AssetId` and declares no `assetId`. So:
- a stored `{assetId, alt?}` matches `AssetRef` (union tries it first, succeeds) → **image**;
- a stored `{posterAssetId, mp4AssetId, webmAssetId?}` fails `AssetRef` (no `assetId`) and matches `VideoRef` → **video**;
- a **hybrid** `{assetId, posterAssetId, mp4AssetId}` (the bug the picker must never write — see Save) matches `AssetRef` first and is **silently read back as an image, dropping the video**. This is why the save path must clean-replace, and why a test pins that a hybrid is not what we ever store.

**Block schema changes** (`packages/shared/src/content/blocks/`): change the four fields from `AssetRef`/`VideoRef` to `MediaRef`, preserving `.optional()` where present:
- `hero.ts`: `image: AssetRef` → `image: MediaRef`
- `features.ts`: `featured.image: AssetRef.optional()` → `MediaRef.optional()`; `video.media: VideoRef.optional()` → `MediaRef.optional()`
- `aboutPage.ts`: `hero.video: VideoRef.optional()` → `MediaRef.optional()`

---

## Web resolution + rendering

**Resolution — `apps/web/app/lib/content.ts`.** Today each field resolves to a fixed shape (`hero.imageUrl = assetUrl(b.hero.image.assetId)`; `features.videoMedia = { posterUrl, mp4Url, webmUrl }`). Introduce a single resolver used by all four slots:
```ts
type ResolvedMedia =
  | { kind: "image"; url: string; alt: string }
  | { kind: "video"; posterUrl: string; mp4Url: string; webmUrl: string };

// resolveMedia(ref, lang, assetUrl) → ResolvedMedia | null   (null when the slot is empty/optional)
```
`isVideoRef(ref)` decides the branch; `assetUrl(...)` resolves each id. `alt` reads `ref.alt?.[lang]` for images. Each of the four view-model builders calls `resolveMedia` and exposes the result under one key (e.g. `t.hero.media`), replacing the old per-kind url fields **for those four slots only**.

**Rendering — the four components.** Each renders on `media.kind`:
```tsx
{media?.kind === "video"
  ? <video autoPlay muted loop playsInline poster={media.posterUrl}>
      <source src={media.mp4Url} type="video/mp4" />
      {media.webmUrl && <source src={media.webmUrl} type="video/webm" />}
    </video>
  : media?.kind === "image"
    ? <img src={media.url} alt={media.alt} loading="lazy" />
    : /* existing literal fallback (unchanged) */}
```
- **Image-today slots** (`hero`, `features.featured`) already render `<img>`; add the `<video>` branch, keeping the current `<img>` (classes, parallax, fallback `src`) as the image branch verbatim so nothing regresses for stored images.
- **Video-today slots** (`features.video`, `aboutPage.hero`) already render `<video>`; add the `<img>` branch. Preserve the existing all-or-nothing video fallback behaviour.

The literal/default fallback each component ships today (e.g. `hero`'s default image `src`) stays the "empty slot" render, so a slot that was never edited looks identical.

---

## Editor caps + overlay signal

**Caps.** The four slots' `editableAttrs(editable, field, { image: true })` / `{ video: true }` become `{ image: true, video: true }` → `data-edit-caps="image,video"`. The `EditCapsOpts` type already supports both flags (`apps/web/app/lib/edit-attrs.ts:68-69`); no type change. (These live in three components — `hero.tsx`, `features.tsx` ×2, `about-sections.tsx`.)

**Overlay.** `edit-overlay.tsx:425` derives `mediaKind` as `hasCap(el,"image") ? "image" : "video"`. For a both-caps slot this yields `"image"` — fine as a default, but the picker must know the slot is *flexible*. The overlay's `edit` message gains a boolean:
```
preview → admin: { source, type: "edit", field, mediaKind, flexible }   // flexible = hasCap image AND video
```
`flexible` is `hasCap(el, "image") && hasCap(el, "video")`. `mediaKind` stays as-is (the hotspot badge already reads it). Non-flexible slots post `flexible: false` and behave exactly as today.

---

## The picker — Ảnh / Video toggle

`apps/admin/app/(dash)/editor/_panels/…` → `media-picker-dialog.tsx`. Today the dialog renders the **image body** (Library + Upload tabs, crop) when `mediaKind === "image"` and the **video body** (poster/mp4/webm sub-pickers) when `"video"`. Both bodies already exist and already resolve a `MediaRef` (`{type:"image",…}` | `{type:"video",…}`).

Change: when `flexible` is true, render a top-level **Ảnh | Video** segmented toggle above the body; the selected side shows the corresponding existing body. When `flexible` is false, no toggle (today's behaviour, untouched).

- **Default side:** the *currently stored* media type for that field — image if the field holds an AssetRef, video if a VideoRef, else the posted `mediaKind`. The admin (editor-shell) knows the stored value and passes the resolved default into the dialog.
- The dialog's resolved output type (`MediaRef` union) and `onApply` are unchanged — only which body is shown becomes user-selectable.
- Copy: toggle labels **"Ảnh"** / **"Video"**; existing body copy unchanged.

---

## Save — clean-replace, never hybridise

`editor-shell.tsx` `applyMediaRef` (lines 431-485) today merges `...existing` into the new value. That is correct **within one kind** (it preserves `alt` across an image→image swap) but **wrong across kinds**: switching image→video would keep the stale `assetId`, producing the hybrid `{assetId, posterAssetId, mp4AssetId}` that the union reads back as an image (dropping the video).

Fix: build `nextValue` as **exactly** the target kind's shape, carrying over only same-kind sibling fields:
- image: `{ ...(existing.assetId ? { alt: existing.alt } : {}), assetId }` — keep `alt` only when replacing an image; drop everything else.
- video: `{ posterAssetId, mp4AssetId, ...(webmAssetId ? {webmAssetId} : {}) }` — no carry-over of `assetId`/`alt`.

Equivalently: when the incoming kind differs from the stored kind, start from `{}` instead of `existing`. A test pins that an image→video save leaves **no** `assetId` in the stored value (and vice-versa).

The live preview swap (`bridge.postApplyEdits`) already carries `{kind, …}`; the overlay's `applyEdits` handler already renders image vs video previews. Confirm it swaps an `<img>` slot to a `<video>` (and back) in the preview, not only the poster.

---

## Data flow (one flexible slot, image → video)

1. User clicks the hero image hotspot in the editor.
2. Overlay posts `{ type:"edit", field:"hero.image", mediaKind:"image", flexible:true }`.
3. Editor-shell opens the picker with a default side = **image** (hero currently holds an AssetRef), toggle visible.
4. User switches the toggle to **Video**, picks a poster + mp4 (+ optional webm) via the existing sub-pickers (each an `uploadAsset` presign→PUT→confirm, unchanged).
5. `onApply({type:"video", posterAssetId, mp4AssetId, webmAssetId?})` → `applyMediaRef` clean-replaces `hero.image` with `{posterAssetId, mp4AssetId, webmAssetId?}` (no `assetId`).
6. Live preview swaps the `<img>` for a `<video>`; the pending edit joins the Save-draft batch.
7. On Save + Publish, the snapshot stores a `VideoRef` at `hero.image`; the public site's `content.ts` resolves it via `isVideoRef` → renders `<video>`.

---

## Backward compatibility

- Existing draft + all 14 published releases keep their stored `AssetRef` at `hero.image`, `VideoRef` at `features.video.media`, etc. Each still parses as `MediaRef`. **No migration, no re-publish.**
- `ReleaseSnapshotSchema.parse` (the render-time backstop) accepts them unchanged.
- The four slots' untouched-slot fallback renders identically to today.

---

## Error handling & edge cases

- **Empty optional slot** (`features.featured.image` absent) → `resolveMedia` returns `null` → component renders its literal fallback (today's behaviour).
- **Partial video** (poster + mp4 present, webm absent) → already handled; webm optional.
- **A required slot** (`hero.image`) can never be cleared to empty — the picker always resolves a complete image or a complete (poster+mp4) video before `onApply` (the video body already enforces "needs at least a poster and an MP4").
- **Hybrid never stored** — guaranteed by the clean-replace save; a shared-layer test additionally pins that a hybrid object is not the shape we emit.
- **`alt` on video** — VideoRef has no `alt`; switching image→video drops it (correct). The video's accessible label is out of scope (unchanged from today's video slots).

---

## Testing

- **`@signex/shared`** (vitest): `MediaRef` parses a stored `AssetRef` as image and a stored `VideoRef` as video; rejects a value that is neither; a hybrid `{assetId, mp4AssetId}` resolves to image (documents the disjointness rule the save path must respect); `isVideoRef` agrees with which member matched. Each of the three touched block schemas (`hero`, `features`, `aboutPage`) accepts both an image and a video at the flexible field, and still rejects a bad shape.
- **`apps/web`** (node --test): `resolveMedia` returns `{kind:"image",…}` for an AssetRef and `{kind:"video",…}` for a VideoRef, resolving every id through the asset map; returns `null` for an absent optional slot. (Pure-module test — no jsdom.)
- **`apps/admin`** (vitest): the picker shows the toggle iff `flexible`; the default side matches the stored kind; `applyMediaRef` clean-replaces (image→video leaves no `assetId`; video→image leaves no `posterAssetId`/`mp4AssetId`) — mutation-checked.
- **Browser (preview, live)**: for each of the four slots — click it, switch type, upload the other kind, verify the public-shaped render actually changes (`<img>`↔`<video>`) and a save round-trips; verify the out-of-scope slots (logo/watermark; and `notFound.image` in preview) still open the image-only picker with no toggle; verify an untouched slot renders identically to before.

---

## Out of scope

- Logo / watermark / favicon / og:image flexibility (image-only by design).
- Public quote/lead form video attachments.
- Any change to the `uploadAsset` presign pipeline, the 200MB video cap, or the mime allowlist (that was the prior hotfix `d5a51dd`).
- Cropping video, or a poster auto-extracted from a video (video still needs an explicit poster image, as today).

## Deployment

Feature branch off `main`. After review + tests green, the operator decides merge → `main` → deploy (rebuild `signex-web` + `signex-admin`; `@signex/shared` rebuilt first). No DB migration. No nginx change.
