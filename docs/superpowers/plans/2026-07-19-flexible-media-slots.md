# Flexible Media Slots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four visual-content media slots (`hero.image`, `features.featured.image`, `features.video.media`, `aboutPage.hero.video`) accept **either an image or a video** in the visual editor, and the public site renders whichever was stored.

**Architecture:** A structurally-disjoint `MediaRef = AssetRef | VideoRef` union at the schema layer (existing stored refs parse unchanged → no migration). The web resolves a `MediaRef` to a discriminated `ResolvedMedia` and each slot keeps its current `<img>`/`<video>` markup as one branch and gains the other. The editor stamps both `image`+`video` caps; the picker gains an **Ảnh / Video** toggle reusing its existing image and video bodies; the save path clean-replaces so image↔video never hybridises.

**Tech Stack:** zod (`@signex/shared`), Next.js 16 (`apps/web`, `apps/admin`), existing `uploadAsset` presign pipeline (unchanged), vitest (shared/admin), `node --test` + jiti (web, no jsdom).

## Global Constraints

- **American "color" in identifiers, British "colour" in prose; UI copy in Vietnamese.**
- `@signex/shared` compiles to CommonJS `dist/` — run `npm run build -w @signex/shared` after editing it, before `apps/*` tests/build consume the new type, or they read stale code.
- **No migration, no re-publish:** the union MUST accept every value already stored for the four fields. A stored `AssetRef` (`{assetId, alt?}`) parses as image; a stored `VideoRef` (`{posterAssetId, mp4AssetId, webmAssetId?}`) parses as video.
- Public render leaks zero `data-edit-*` (`editableAttrs` already gates on `editable`; do not bypass it).
- **NEVER run `npm run test` (turbo-all)** — it once wiped the dev DB. Per-workspace only: `npm test -w @signex/shared`, `-w @signex/web`, `-w @signex/admin`.
- `apps/web` tests are static `node --test`/jiti (must pass with the stack down), run from the **`apps/web` cwd**, registered in the `&&` chain in `apps/web/package.json`. No jsdom → decidable logic goes in pure modules; DOM/render behaviour is browser-verified.
- `apps/admin` tests are vitest, env `node`, **no `resolve.alias`** (`@/…` imports fail in tests) and **no jsdom** — a test can only import a module free of `@/…` and DOM.
- Do **not** touch: the `uploadAsset` presign pipeline, the 200MB video cap, the mime allowlist, logo/watermark/favicon/og slots, `notFound.image`, the public lead forms.
- Branch `feat/flexible-media-slots` off `main` (`d5a51dd`). Commit trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Do not merge/push.
- Every test added must be **mutation-checked**: change the implementation, confirm the mutation *landed* (a no-op mutation that reports PASS proves nothing — assert the target string was present before editing), watch the test fail, restore, watch it pass. Report the mutation and its failure output.

---

## File-by-file responsibilities

| File | Change |
|---|---|
| `packages/shared/src/content/primitives.ts` | Add `MediaRef` union + `isVideoRef` guard |
| `packages/shared/src/content/blocks/hero.ts` | `image: AssetRef` → `MediaRef` |
| `packages/shared/src/content/blocks/features.ts` | `featured.image` + `video.media` → `MediaRef` |
| `packages/shared/src/content/blocks/aboutPage.ts` | `hero.video` → `MediaRef` |
| `packages/shared/src/content/blocks/blocks.test.ts` | Add MediaRef + block-accepts-both tests |
| `apps/web/app/lib/media-ref.ts` *(new)* | Pure `resolveMedia(ref, lang, assetUrl)` + `ResolvedMedia` type |
| `apps/web/app/lib/media-ref.test.mjs` *(new)* | Pure test for `resolveMedia` |
| `apps/web/app/lib/content.ts` | Wire the 4 fields through `resolveMedia`; expose `…media: ResolvedMedia | null` |
| `apps/web/app/components/home/hero.tsx` | Render `t.hero.media` as img OR video; caps `{image,video}` |
| `apps/web/app/components/home/features.tsx` | Render `featured.media` + `videoMedia` as img OR video; caps |
| `apps/web/app/components/about/about-sections.tsx` | Render about hero media as img OR video; caps |
| `apps/web/app/package.json` | Register `media-ref.test.mjs` in the test chain |
| `apps/web/app/components/editor/edit-overlay.tsx` | Add `flexible` to the `edit` message |
| `apps/admin/app/(dash)/editor/editor-shell.tsx` | Thread `flexible`+stored-kind into the picker; clean-replace in `applyMediaRef` |
| `apps/admin/app/(dash)/visual/media-picker-dialog.tsx` | Ảnh/Video toggle when `flexible` |
| `apps/admin/app/(dash)/visual/media-picker-dialog.test.ts` *(new or existing)* | Toggle + default-side test |

---

## Task 1: `MediaRef` union + `isVideoRef` (schema core)

**Files:**
- Modify: `packages/shared/src/content/primitives.ts` (append after the `VideoRef` definition, ~line 41)
- Test: `packages/shared/src/content/primitives.test.ts` (create if absent; else append)

**Interfaces:**
- Consumes: existing `AssetRef`, `VideoRef` (same file).
- Produces: `MediaRef` (zod schema + type), `isVideoRef(m: MediaRef): m is VideoRef`.

- [ ] **Step 1: Write the failing test** — create/append `packages/shared/src/content/primitives.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { AssetRef, VideoRef, MediaRef, isVideoRef } from "./primitives";

const IMG = { assetId: "clxxxxxxxxxxxxxxxxxxxxxxx1" };
const VID = { posterAssetId: "clxxxxxxxxxxxxxxxxxxxxxxx2", mp4AssetId: "clxxxxxxxxxxxxxxxxxxxxxxx3" };

describe("MediaRef", () => {
  it("parses a stored AssetRef as an image (union tries AssetRef first)", () => {
    const m = MediaRef.parse(IMG);
    expect(isVideoRef(m)).toBe(false);
    expect((m as { assetId: string }).assetId).toBe(IMG.assetId);
  });

  it("parses a stored VideoRef as a video", () => {
    const m = MediaRef.parse(VID);
    expect(isVideoRef(m)).toBe(true);
    expect((m as { mp4AssetId: string }).mp4AssetId).toBe(VID.mp4AssetId);
  });

  it("accepts a video with an optional webm", () => {
    const m = MediaRef.parse({ ...VID, webmAssetId: "clxxxxxxxxxxxxxxxxxxxxxxx4" });
    expect(isVideoRef(m)).toBe(true);
  });

  it("rejects a value that is neither (no assetId, no mp4AssetId)", () => {
    expect(() => MediaRef.parse({ foo: "bar" })).toThrow();
    expect(() => MediaRef.parse({ posterAssetId: VID.posterAssetId })).toThrow(); // poster without mp4 is not a VideoRef
  });

  it("strips the video keys off a HYBRID and reads it back as an image — the exact hazard the save path must avoid", () => {
    // AssetRef matches first (assetId present) and .object() strips unknown keys, so a hybrid loses
    // its video. This documents WHY editor-shell.applyMediaRef must clean-replace, never merge.
    const hybrid = { ...IMG, ...VID };
    const m = MediaRef.parse(hybrid);
    expect(isVideoRef(m)).toBe(false);
    expect("mp4AssetId" in m).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npm test -w @signex/shared -- primitives.test`
Expected: FAIL — `MediaRef`/`isVideoRef` are not exported.

- [ ] **Step 3: Implement** — append to `packages/shared/src/content/primitives.ts`:

```ts
/**
 * A media slot that may hold EITHER an image (AssetRef) or a video (VideoRef).
 *
 * The two are structurally disjoint — an image carries `assetId`, a video carries
 * `posterAssetId`+`mp4AssetId` and no `assetId` — so a plain union discriminates cleanly AND every
 * value already stored as an AssetRef or a VideoRef still parses (no migration, no re-publish). A
 * z.discriminatedUnion is NOT used: it would need a literal tag on every member, which stored values
 * predate. AssetRef is listed FIRST so a hybrid `{assetId, mp4AssetId}` resolves to image and its
 * stray video keys are stripped — editor-shell.applyMediaRef must clean-replace so a hybrid is never
 * written in the first place.
 */
export const MediaRef = z.union([AssetRef, VideoRef]);
export type MediaRef = z.infer<typeof MediaRef>;

/** True when this MediaRef is a video. The one discriminator the web resolver and the admin picker
 *  both read: a video carries `mp4AssetId`, an image never does. */
export const isVideoRef = (m: MediaRef): m is VideoRef => "mp4AssetId" in m;
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npm test -w @signex/shared -- primitives.test`
Expected: PASS (5 tests).

- [ ] **Step 5: Mutation-check** — reorder the union to `z.union([VideoRef, AssetRef])`; confirm the hybrid test now fails (the hybrid would match VideoRef first). Restore. Then change `isVideoRef` to `"posterAssetId" in m`; confirm still green (poster is on video only) — this is NOT a valid mutation, so instead change it to `"assetId" in m` and confirm the image/video tests fail. Restore.

- [ ] **Step 6: Build shared + commit**

```bash
npm run build -w @signex/shared
git add packages/shared/src/content/primitives.ts packages/shared/src/content/primitives.test.ts packages/shared/dist
git commit -m "feat(shared): MediaRef = AssetRef | VideoRef union + isVideoRef"
```

---

## Task 2: Block schemas accept `MediaRef` at the four fields

**Files:**
- Modify: `packages/shared/src/content/blocks/hero.ts`, `features.ts`, `aboutPage.ts`
- Test: `packages/shared/src/content/blocks/blocks.test.ts` (append)

**Interfaces:**
- Consumes: `MediaRef` from Task 1.
- Produces: `heroBlock`, `featuresBlock`, `aboutPageBlock` whose media fields are `MediaRef`.

- [ ] **Step 1: Write the failing test** — append to `blocks.test.ts` (helpers `lt`, `twoTone`, `cuid` already exist in that file):

```ts
describe("flexible media slots accept image OR video", () => {
  const img = { assetId: cuid() };
  const vid = { posterAssetId: cuid(), mp4AssetId: cuid() };
  const baseHero = { titleTop: lt("a", "a"), titleBottom: lt("b", "b"), subtitle: lt("c", "c") };

  it("hero.image accepts an image and a video", () => {
    expect(() => heroBlock.parse({ ...baseHero, image: img })).not.toThrow();
    expect(() => heroBlock.parse({ ...baseHero, image: vid })).not.toThrow();
    expect(() => heroBlock.parse({ ...baseHero, image: { nope: 1 } })).toThrow();
  });

  it("features.featured.image and features.video.media each accept image and video", () => {
    const base = {
      eyebrow: lt("e", "e"), title: twoTone(lt("l", "l"), lt("a", "a")),
      cta: { label: lt("c", "c"), href: "#" },
      video: { title: lt("t", "t"), text: lt("x", "x"), media: vid },
      featured: { title: lt("t", "t"), desc: lt("d", "d"), image: img },
      cards: [{ title: lt("t", "t"), desc: lt("d", "d") }],
    };
    expect(() => featuresBlock.parse(base)).not.toThrow();
    expect(() => featuresBlock.parse({ ...base, featured: { ...base.featured, image: vid } })).not.toThrow();
    expect(() => featuresBlock.parse({ ...base, video: { ...base.video, media: img } })).not.toThrow();
  });

  it("aboutPage.hero.video accepts an image and a video", () => {
    const mk = (media: unknown) => ({
      hero: { title: twoTone(lt("l", "l"), lt("a", "a")), subtitle: lt("s", "s"), video: media },
      testimonial: { title: twoTone(lt("l", "l"), lt("a", "a")), body: { en: ["x"], vi: ["x"] } },
      approach: [{ title: lt("t", "t"), body: { en: ["x"], vi: ["x"] } }],
      intro: { title: twoTone(lt("l", "l"), lt("a", "a")) },
      capability: { title: twoTone(lt("l", "l"), lt("a", "a")), groups: [] },
    });
    expect(() => aboutPageBlock.parse(mk(vid))).not.toThrow();
    expect(() => aboutPageBlock.parse(mk(img))).not.toThrow();
  });
});
```
> If `aboutPageBlock`'s later fields (`capability.groups`, etc.) require more than the sketch above, read the current `aboutPage.ts` and fill the fixture so it validates a *complete* block — the point is the media field, but the whole object must parse.

- [ ] **Step 2: Run it, verify it fails**

Run: `npm test -w @signex/shared -- blocks.test`
Expected: FAIL — the video-in-image-field (and image-in-video-field) cases throw, because the fields are still `AssetRef`/`VideoRef`.

- [ ] **Step 3: Implement** — three edits:

`hero.ts`: change the import `import { LocalizedText, AssetRef } from "../primitives";` → `import { LocalizedText, MediaRef } from "../primitives";` and the field `image: AssetRef,` → `image: MediaRef, // image OR video (MediaRef); dict.hero.imageAlt maps to an image's alt`.

`features.ts`: change the import to include `MediaRef` (drop `VideoRef, AssetRef` if now unused — check; `TwoToneTitle, Href` stay), and:
- `media: VideoRef.optional(),` → `media: MediaRef.optional(), // image OR video`
- `image: AssetRef.optional(),` → `image: MediaRef.optional(), // image OR video`

`aboutPage.ts`: change the import to include `MediaRef` (keep `AssetRef` — `testimonial.image` stays image-only), and `video: VideoRef.optional(),` → `video: MediaRef.optional(), // image OR video`. Drop `VideoRef` from the import if now unused.

- [ ] **Step 4: Run it, verify it passes**

Run: `npm test -w @signex/shared -- blocks.test`
Expected: PASS.

- [ ] **Step 5: Mutation-check** — revert `hero.ts`'s field to `image: AssetRef`; confirm the `heroBlock.parse({…, image: vid})` case fails. Restore.

- [ ] **Step 6: Build shared + full shared suite + commit**

```bash
npm run build -w @signex/shared
npm test -w @signex/shared    # whole suite green (existing + new)
git add packages/shared/src/content/blocks packages/shared/dist
git commit -m "feat(shared): hero.image, features media fields, aboutPage.hero.video are MediaRef"
```

---

## Task 3: Web resolver `resolveMedia` + wire `content.ts`

**Files:**
- Create: `apps/web/app/lib/media-ref.ts`, `apps/web/app/lib/media-ref.test.mjs`
- Modify: `apps/web/app/lib/content.ts` (the `hero`, `features.videoMedia`, `features.featured`, and the aboutPage hero-video builders), `apps/web/package.json` (test chain)

**Interfaces:**
- Consumes: `MediaRef`, `isVideoRef` from `@signex/shared`.
- Produces:
  ```ts
  export type ResolvedMedia =
    | { kind: "image"; url: string; alt: string }
    | { kind: "video"; posterUrl: string; mp4Url: string; webmUrl: string };
  export function resolveMedia(
    ref: unknown,              // a MediaRef | undefined (the stored field)
    lang: "en" | "vi",
    assetUrl: (assetId: string) => string,
    altOf: (loc?: { en: string; vi: string }) => string,  // content.ts's `t(...)` bound to lang
  ): ResolvedMedia | null;
  ```
  The web view-model exposes, for each of the four slots, a `media: ResolvedMedia | null` key.

- [ ] **Step 1: Write the failing test** — `apps/web/app/lib/media-ref.test.mjs`:

```mjs
import test from "node:test";
import assert from "node:assert/strict";
import { resolveMedia } from "./media-ref.ts";

const assetUrl = (id) => (id ? `https://cdn/${id}` : "");
const altOf = (loc) => loc?.vi ?? "";

test("null when the slot is empty", () => {
  assert.equal(resolveMedia(undefined, "vi", assetUrl, altOf), null);
});

test("resolves an AssetRef to an image with url + alt", () => {
  const r = resolveMedia({ assetId: "a1", alt: { en: "E", vi: "V" } }, "vi", assetUrl, altOf);
  assert.deepEqual(r, { kind: "image", url: "https://cdn/a1", alt: "V" });
});

test("resolves a VideoRef to a video with poster/mp4/webm urls", () => {
  const r = resolveMedia({ posterAssetId: "p", mp4AssetId: "m", webmAssetId: "w" }, "vi", assetUrl, altOf);
  assert.deepEqual(r, { kind: "video", posterUrl: "https://cdn/p", mp4Url: "https://cdn/m", webmUrl: "https://cdn/w" });
});

test("a video without webm yields an empty webmUrl", () => {
  const r = resolveMedia({ posterAssetId: "p", mp4AssetId: "m" }, "vi", assetUrl, altOf);
  assert.equal(r.kind, "video");
  assert.equal(r.webmUrl, "");
});
```

- [ ] **Step 2: Run it (from `apps/web`), verify it fails**

Run: `cd apps/web && npx jiti app/lib/media-ref.test.mjs`
Expected: FAIL — module not found / `resolveMedia` undefined.

- [ ] **Step 3: Implement** — `apps/web/app/lib/media-ref.ts`:

```ts
// Pure resolver: a stored MediaRef (image or video) → a discriminated view-model the render
// components switch on. DOM-free so node --test can drive it (apps/web has no jsdom). The
// image/video discrimination is `isVideoRef` from @signex/shared — the same test both sides use.
import { isVideoRef, type MediaRef } from "@signex/shared";

export type ResolvedMedia =
  | { kind: "image"; url: string; alt: string }
  | { kind: "video"; posterUrl: string; mp4Url: string; webmUrl: string };

export function resolveMedia(
  ref: MediaRef | undefined | null,
  _lang: "en" | "vi",
  assetUrl: (assetId: string) => string,
  altOf: (loc?: { en: string; vi: string }) => string,
): ResolvedMedia | null {
  if (!ref) return null;
  if (isVideoRef(ref)) {
    return {
      kind: "video",
      posterUrl: assetUrl(ref.posterAssetId),
      mp4Url: assetUrl(ref.mp4AssetId),
      webmUrl: ref.webmAssetId ? assetUrl(ref.webmAssetId) : "",
    };
  }
  return { kind: "image", url: assetUrl(ref.assetId), alt: altOf(ref.alt) };
}
```
> `_lang` is kept in the signature for call-site symmetry with `content.ts` (which passes its bound locale) even though `altOf` already closes over it; drop it if the reviewer prefers — it is not load-bearing.

- [ ] **Step 4: Register + run, verify it passes**

Add `jiti app/lib/media-ref.test.mjs` to the `&&` chain in `apps/web/package.json`'s `test` script (next to the other `app/lib` jiti tests).
Run: `cd apps/web && npx jiti app/lib/media-ref.test.mjs` → PASS (4 tests). Then `npm test -w @signex/web` → all subsuites `fail 0`.

- [ ] **Step 5: Wire `content.ts`.** Replace the four fixed-shape resolutions with `resolveMedia`. Import `resolveMedia` at the top. **The exposed key names are load-bearing — Tasks 4–6 read exactly these:**
  - **hero** (`hero:` builder): replace `imageAlt` + `imageUrl` with a single `media: resolveMedia(b.hero.image, lang, assetUrl, (l) => t(l, lang))`. → the hero component reads `t.media`.
  - **features workshop video** (`features:` builder): replace the `b.features.video.media ? {...} : {...}` block with `videoMedia: resolveMedia(b.features.video.media, lang, assetUrl, (l) => t(l, lang))`. → the features component reads `t.videoMedia`.
  - **features featured image** (`features.featured:`): replace `imageUrl` + `imageAlt` with `media: resolveMedia(b.features.featured.image, lang, assetUrl, (l) => t(l, lang))`. → the features component reads `t.featured.media`.
  - **aboutPage hero video** (the aboutPage builder's `hero`): the current object exposed as `dict.aboutPage.hero.videoMedia` (poster/mp4/webm) becomes `videoMedia: resolveMedia(b.aboutPage.hero.video, lang, assetUrl, (l) => t(l, lang))`. → the about component reads `dict.aboutPage.hero.videoMedia`. Read content.ts to locate this builder (it is a distinct block builder from `features`).
  > `t(...)` is content.ts's localized-text resolver; pass `(l) => t(l, lang)` as `altOf`. The `imageAlt`/`imageUrl`/old-`videoMedia`-object keys are REMOVED for these four slots — grep the web components for any other reader of them (there should be none outside Tasks 4–6).

- [ ] **Step 6: Typecheck + commit**

Run: `cd apps/web && npx tsc --noEmit` (exit 0 — read it unpiped) and `npm test -w @signex/web` (all `fail 0`).
```bash
git add apps/web/app/lib/media-ref.ts apps/web/app/lib/media-ref.test.mjs apps/web/app/lib/content.ts apps/web/package.json
git commit -m "feat(web): resolveMedia + content.ts exposes ResolvedMedia for the 4 flexible slots"
```

---

## Task 4: Render `hero.image` as image OR video

**Files:**
- Modify: `apps/web/app/components/home/hero.tsx` (the `<img>` at ~line 60)

**Interfaces:**
- Consumes: within `hero.tsx` the view-model is the local `t`, so read **`t.media: ResolvedMedia | null`** (Task 3). `t.imageAlt`/`t.imageUrl` no longer exist.

- [ ] **Step 1: Implement** — replace the single `<img … {...editableAttrs(editable, "hero.image", { image: true })} />` with a conditional that KEEPS the current `<img>` verbatim as the image branch (same `className="image_cover is-parallax"`, same literal fallback `src`) and adds a cover-video branch. Stamp both caps on the rendered element:

```tsx
{t.media?.kind === "video" ? (
  <video
    className="image_cover is-parallax"
    autoPlay muted loop playsInline
    poster={t.media.posterUrl}
    {...editableAttrs(editable, "hero.image", { image: true, video: true })}
  >
    <source src={t.media.mp4Url} type="video/mp4" />
    {t.media.webmUrl && <source src={t.media.webmUrl} type="video/webm" />}
  </video>
) : (
  <img
    alt={t.media?.kind === "image" ? t.media.alt : ""}
    className="image_cover is-parallax"
    loading="lazy"
    src={(t.media?.kind === "image" && t.media.url) || "/assets/images/69b04fc10fe79a2becaf38a8_Contemporary_Cliffside_House_at_Twilight.avif"}
    {...editableAttrs(editable, "hero.image", { image: true, video: true })}
  />
)}
```
> `hero.image` is required, so `t.media` is non-null in practice, but the `?.` keeps the render total. Preserve any surrounding wrapper markup exactly.

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit` → exit 0.

- [ ] **Step 3: Browser-verify (preview, live).** Bring the stack up (or rebuild `signex-web`). In `http://localhost:3062/preview/vi`, in the editor: (a) the hero image still renders as an `<img>` for the current stored image; (b) `data-edit-caps` on it is `"image,video"`; (c) hand-store a VideoRef preview via the overlay `applyEdits` path (Task 9 wires the real picker) and confirm the DOM swaps to a `<video>`. Record the before/after `tagName` and computed `object-fit`/cover sizing. This is browser-verified because apps/web has no jsdom.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/components/home/hero.tsx
git commit -m "feat(web): hero slot renders image OR video; both caps"
```

---

## Task 5: Render `features.featured.image` + `features.video.media` as image OR video

**Files:**
- Modify: `apps/web/app/components/home/features.tsx`

**Interfaces:**
- Consumes: within `features.tsx` the view-model is the local `t`, so read **`t.featured.media: ResolvedMedia | null`** (featured image slot) and **`t.videoMedia: ResolvedMedia | null`** (workshop-video slot) (Task 3). The old `t.featured.imageUrl/imageAlt` and the old `t.videoMedia.{posterUrl,mp4Url,webmUrl}` object are gone — `t.videoMedia` is now a `ResolvedMedia | null`.

- [ ] **Step 1: Implement — featured image (~line 74).** Currently `<img … "features.featured.image", { image: true } />`. Wrap exactly like Task 4: keep the current `<img>` (same `className="image_cover is-parallax"`, same literal fallback) as the image branch; add a cover-`<video>` branch; stamp `{ image: true, video: true }` on both. Read `t.featured.media` (`?.kind`).

- [ ] **Step 2: Implement — workshop video (~lines 170–200).** The current elaborate Webflow background-video markup (`<div class="video_cover w-background-video …"> <video>…</video> <noscript/> <button/> …</div>`) is the VIDEO branch — keep it verbatim, driven by `t.videoMedia`. Add an IMAGE branch: when `t.videoMedia?.kind === "image"`, render a cover `<img className="image_cover" src={t.videoMedia.url} alt={t.videoMedia.alt} />` in place of the `video_cover` block. Move the existing `editableAttrs(editable, "features.video.media", { video: true })` onto the outer element of BOTH branches, changing caps to `{ image: true, video: true }`. Guard the current `hasFeatureVideo`/`featMp4` logic so it only applies in the video branch.
  > Preserve the play/pause button, `noscript` fallback, and all `data-*`/`data-w-id` attributes in the video branch unchanged — they are Webflow runtime hooks. Only the branch wrapper is new.

- [ ] **Step 3: Typecheck** — `cd apps/web && npx tsc --noEmit` → exit 0.

- [ ] **Step 4: Browser-verify.** In `/preview/vi`: the featured image still renders `<img>` and the workshop video still renders the Webflow `<video>` with its play/pause control for the current stored values; both carry `data-edit-caps="image,video"`; a preview swap of each to the other kind changes the DOM (`<img>`↔`<video>`) and the workshop-video image branch shows a cover image. Confirm the existing video still autoplays.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/components/home/features.tsx
git commit -m "feat(web): features featured-image + workshop-video slots render image OR video"
```

---

## Task 6: Render `aboutPage.hero.video` as image OR video

**Files:**
- Modify: `apps/web/app/components/about/about-sections.tsx` (the about-hero video, ~lines 44–112)

**Interfaces:**
- Consumes: within `about-sections.tsx` the view-model is `dict`, so read **`dict.aboutPage.hero.videoMedia: ResolvedMedia | null`** (Task 3 keeps this exact key; the old `{posterUrl,mp4Url,webmUrl}` object is replaced by a `ResolvedMedia | null`).

- [ ] **Step 1: Implement.** Mirror Task 5's video slot: keep the current Webflow background-video markup (the `<video>` with `heroPoster`/`heroMp4`/`heroWebm`, the `noscript`, the play/pause button) as the VIDEO branch; add an IMAGE branch rendering a cover `<img>` when the resolved media `kind === "image"`. Move `editableAttrs(editable, "aboutPage.hero.video", { video: true })` (currently ~line 63) onto both branches with caps `{ image: true, video: true }`. Preserve all Webflow `data-*` attributes and the literal poster/mp4 fallbacks in the video branch.

- [ ] **Step 2: Typecheck** — `cd apps/web && npx tsc --noEmit` → exit 0.

- [ ] **Step 3: Browser-verify.** In `/preview/vi/about`: the about-hero still renders the Webflow `<video>` for the stored video; `data-edit-caps="image,video"`; a preview swap to an image renders a cover `<img>`; a swap back restores the video.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/components/about/about-sections.tsx
git commit -m "feat(web): about-hero slot renders image OR video"
```

---

## Task 7: Overlay signals `flexible` on the edit message

**Files:**
- Modify: `apps/web/app/components/editor/edit-overlay.tsx` (the media hotspot handler, ~lines 420–433 and the postMessage protocol comment ~line 34)
- Modify: `apps/admin/app/(dash)/editor/editor-shell.tsx` (the `edit` message handler, ~lines 777–782, to read `flexible`)

**Interfaces:**
- Produces (preview → admin): `{ source, type: "edit", field, mediaKind, flexible: boolean }` where `flexible = hasCap(el,"image") && hasCap(el,"video")`.
- Consumes (admin): `data.flexible` when opening the picker.

- [ ] **Step 1: Implement — overlay.** At the media hotspot construction (~line 425) compute `const flexible = hasCap(el, "image") && hasCap(el, "video");` alongside the existing `mediaKind`. Include `flexible` in the `postMessage({ source: SOURCE, type: "edit", field, mediaKind, flexible }, "*")`. Update the protocol comment at ~line 34 to `{ source, type:"edit", field, mediaKind, flexible }`.

- [ ] **Step 2: Implement — editor-shell.** In the `data.type === "edit"` handler (~line 777), read `const flexible = data.flexible === true;` and pass it into `setMediaTarget({ field, mediaKind: kind, flexible })`. Extend the `EditTarget` type (search its definition) to carry `flexible?: boolean`.

- [ ] **Step 3: Typecheck both apps** — `cd apps/web && npx tsc --noEmit`; `cd apps/admin && npx tsc --noEmit`. Both exit 0.

- [ ] **Step 4: Browser-verify.** In `/preview/vi`, click a flexible slot; in the admin devtools/console confirm the received `edit` message has `flexible: true`; click a logo (image-only) and confirm `flexible: false`. (No behaviour change yet — Task 9 consumes it. This task only threads the flag.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/components/editor/edit-overlay.tsx "apps/admin/app/(dash)/editor/editor-shell.tsx"
git commit -m "feat(editor): overlay signals flexible (both caps) on the media edit message"
```

---

## Task 8: Save clean-replace — never hybridise a slot

**Files:**
- Modify: `apps/admin/app/(dash)/editor/editor-shell.tsx` — `applyMediaRef` (~lines 431–485)
- Test: `apps/admin/app/(dash)/editor/media-apply.test.ts` *(new)* — extract the pure value-builder so vitest (no jsdom, no `@/` alias) can drive it.

**Interfaces:**
- Produces: a pure `buildMediaValue(ref: MediaRef_picker, existing: Record<string, unknown>): Record<string, unknown>` where `MediaRef_picker` is the picker's `{type:"image",assetId} | {type:"video",posterAssetId,mp4AssetId,webmAssetId?}`. It returns EXACTLY the target-kind shape, carrying over `alt` only on an image→image replace, and NEVER carrying cross-kind keys.

- [ ] **Step 1: Write the failing test** — `apps/admin/app/(dash)/editor/media-apply.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildMediaValue } from "./media-apply";

describe("buildMediaValue — clean-replace, never hybridise", () => {
  it("image → image keeps alt, sets assetId, no video keys", () => {
    const v = buildMediaValue({ type: "image", assetId: "A2" }, { assetId: "A1", alt: { en: "e", vi: "v" } });
    expect(v).toEqual({ alt: { en: "e", vi: "v" }, assetId: "A2" });
  });

  it("image → video drops assetId AND alt, sets only video keys", () => {
    const v = buildMediaValue(
      { type: "video", posterAssetId: "P", mp4AssetId: "M" },
      { assetId: "A1", alt: { en: "e", vi: "v" } },
    );
    expect(v).toEqual({ posterAssetId: "P", mp4AssetId: "M" });
    expect("assetId" in v).toBe(false);
    expect("alt" in v).toBe(false);
  });

  it("video → image drops poster/mp4/webm, sets only assetId (no stale alt to keep)", () => {
    const v = buildMediaValue({ type: "image", assetId: "A1" }, { posterAssetId: "P", mp4AssetId: "M", webmAssetId: "W" });
    expect(v).toEqual({ assetId: "A1" });
  });

  it("video → video sets poster+mp4, includes webm only when present", () => {
    expect(buildMediaValue({ type: "video", posterAssetId: "P", mp4AssetId: "M" }, { posterAssetId: "x", mp4AssetId: "y", webmAssetId: "z" }))
      .toEqual({ posterAssetId: "P", mp4AssetId: "M" });
    expect(buildMediaValue({ type: "video", posterAssetId: "P", mp4AssetId: "M", webmAssetId: "W" }, {}))
      .toEqual({ posterAssetId: "P", mp4AssetId: "M", webmAssetId: "W" });
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `npm test -w @signex/admin -- media-apply` → FAIL (module absent).

- [ ] **Step 3: Implement** — create `apps/admin/app/(dash)/editor/media-apply.ts` (no `@/` imports, so vitest can load it):

```ts
// Pure value-builder for a media slot: given the picker's resolved ref and the field's existing
// value, return EXACTLY the target-kind shape. Never merge across kinds — a hybrid
// {assetId, mp4AssetId} would be read back as an image by MediaRef (AssetRef wins), silently
// dropping the video. `alt` survives only an image→image replace.
export type PickerMediaRef =
  | { type: "image"; assetId: string }
  | { type: "video"; posterAssetId: string; mp4AssetId: string; webmAssetId?: string };

export function buildMediaValue(
  ref: PickerMediaRef,
  existing: Record<string, unknown>,
): Record<string, unknown> {
  if (ref.type === "image") {
    const wasImage = "assetId" in existing;
    return { ...(wasImage && existing.alt ? { alt: existing.alt } : {}), assetId: ref.assetId };
  }
  return {
    posterAssetId: ref.posterAssetId,
    mp4AssetId: ref.mp4AssetId,
    ...(ref.webmAssetId ? { webmAssetId: ref.webmAssetId } : {}),
  };
}
```

- [ ] **Step 4: Use it in `applyMediaRef`.** Replace the `let nextValue …` block (lines ~452–467) so `nextValue = buildMediaValue(ref, existing)`. Keep the `preview` construction as-is (it already branches on `ref.type`). Import `buildMediaValue` from `./media-apply`.

- [ ] **Step 5: Run it, verify it passes** — `npm test -w @signex/admin -- media-apply` → PASS (4 tests).

- [ ] **Step 6: Mutation-check** — change the video branch to `{ ...existing, posterAssetId: ref.posterAssetId, mp4AssetId: ref.mp4AssetId }` (the old merge bug); confirm the "image → video drops assetId" test fails (asserts `"assetId" in v === false`). Restore.

- [ ] **Step 7: Typecheck admin + commit**

Run: `cd apps/admin && npx tsc --noEmit` → exit 0.
```bash
git add "apps/admin/app/(dash)/editor/media-apply.ts" "apps/admin/app/(dash)/editor/media-apply.test.ts" "apps/admin/app/(dash)/editor/editor-shell.tsx"
git commit -m "feat(editor): clean-replace media value on save — image↔video never hybridises"
```

---

## Task 9: Picker Ảnh / Video toggle (the user-facing change) + E2E

**Files:**
- Modify: `apps/admin/app/(dash)/visual/media-picker-dialog.tsx`
- Modify: `apps/admin/app/(dash)/editor/editor-shell.tsx` (pass `flexible` + the stored default kind to the dialog)
- Test: `apps/admin/app/(dash)/visual/media-picker-toggle.test.ts` *(new; pure — extract the default-side chooser)*

**Interfaces:**
- Consumes: `mediaTarget.flexible` (Task 7), the field's stored kind (editor-shell computes from the block value via `isVideoRef`).
- Produces: a picker that, when `flexible`, shows an **Ảnh | Video** segmented toggle above its body; when not, renders exactly today's single-kind body.

- [ ] **Step 1: Extract + test the default-side chooser.** Create `apps/admin/app/(dash)/visual/picker-default-kind.ts` (pure, no `@/`):

```ts
// Which side an Ảnh/Video toggle opens on: the kind the slot currently holds, else the caps default.
export function pickerDefaultKind(
  storedKind: "image" | "video" | null,
  postedMediaKind: "image" | "video",
): "image" | "video" {
  return storedKind ?? postedMediaKind;
}
```
Test `picker-default-kind.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { pickerDefaultKind } from "./picker-default-kind";
describe("pickerDefaultKind", () => {
  it("opens on the stored kind when the slot holds something", () => {
    expect(pickerDefaultKind("video", "image")).toBe("video");
    expect(pickerDefaultKind("image", "video")).toBe("image");
  });
  it("falls back to the posted mediaKind for an empty slot", () => {
    expect(pickerDefaultKind(null, "image")).toBe("image");
    expect(pickerDefaultKind(null, "video")).toBe("video");
  });
});
```
Run `npm test -w @signex/admin -- picker-default-kind` → write impl → PASS. Mutation: swap the `??` operands; confirm the "empty slot" test fails; restore.

- [ ] **Step 2: Editor-shell — compute the stored kind + pass to the dialog.** When opening the picker, read the field's current value from the working block data; `storedKind = value == null ? null : (isVideoRef(value) ? "video" : "image")` (import `isVideoRef` from `@signex/shared`). Pass `flexible={mediaTarget.flexible ?? false}` and `defaultKind={pickerDefaultKind(storedKind, mediaTarget.mediaKind)}` into `<MediaPickerDialog …>`.

- [ ] **Step 3: Dialog — the toggle.** In `media-picker-dialog.tsx`, add props `flexible?: boolean` and `defaultKind?: "image" | "video"`. Add local state `const [kind, setKind] = useState(defaultKind ?? mediaKind)`. When `flexible` is true, render a segmented control above the body:
```tsx
{flexible && (
  <div className="mb-3 inline-flex rounded-md border p-0.5" role="tablist" aria-label="Loại nội dung">
    <button type="button" role="tab" aria-selected={kind === "image"} onClick={() => setKind("image")}
      className={kind === "image" ? "rounded px-3 py-1 bg-primary text-primary-foreground" : "rounded px-3 py-1"}>Ảnh</button>
    <button type="button" role="tab" aria-selected={kind === "video"} onClick={() => setKind("video")}
      className={kind === "video" ? "rounded px-3 py-1 bg-primary text-primary-foreground" : "rounded px-3 py-1"}>Video</button>
  </div>
)}
```
Render the image body when `kind === "image"`, the video body when `kind === "video"`. When `!flexible`, render exactly today's body for `mediaKind` (no toggle) — wrap the existing branch so the non-flexible path is byte-unchanged. The dialog's `onApply` (already `MediaRef` union) is unchanged.
> Match the project's shadcn/Tailwind classes actually in use (read a neighbouring component for the real `bg-primary`/segmented pattern rather than the sketch above).

- [ ] **Step 4: Typecheck admin** — `cd apps/admin && npx tsc --noEmit` → exit 0. Full admin suite `npm test -w @signex/admin` green.

- [ ] **Step 5: Browser E2E (live, all four slots).** Stack up with the feature branch built (`signex-web` + `signex-admin`), theme palette any. Log into admin, open the editor, and for each of `hero.image`, `features.featured.image`, `features.video.media`, `aboutPage.hero.video`:
  1. Click the slot → picker opens with the toggle, defaulted to the stored kind.
  2. Switch to the OTHER kind, complete an upload (image: pick/upload+crop; video: poster+mp4), Apply.
  3. Confirm the live preview swaps `<img>`↔`<video>` for that slot.
  4. Save draft, reload the editor, confirm the new kind persisted (round-trip).
  5. Publish to a scratch theme / preview and confirm `content.ts` renders the stored kind on the public-shaped route.
  Also: click a logo slot → **no toggle**, image-only (unchanged). Confirm no `assetId` lingers in a slot switched image→video (inspect the saved block JSON).
  Record the payloads and the before/after `tagName` per slot. Never trust a hex/heuristic — read the actual rendered element.

- [ ] **Step 6: Commit**

```bash
git add "apps/admin/app/(dash)/visual/media-picker-dialog.tsx" "apps/admin/app/(dash)/visual/picker-default-kind.ts" "apps/admin/app/(dash)/visual/picker-default-kind.test.ts" "apps/admin/app/(dash)/editor/editor-shell.tsx"
git commit -m "feat(editor): media picker offers an Ảnh/Video toggle for flexible slots"
```

---

## Final whole-branch review

After Task 9, dispatch the whole-branch review (superpowers:requesting-code-review) over `main..feat/flexible-media-slots`. Focus: (a) no stored snapshot is invalidated (backward-compat holds for every existing release); (b) the four render components preserve their existing image/video markup verbatim in the matching branch (no regression to current media); (c) `buildMediaValue` is the only writer of a media field and never emits a hybrid; (d) public render still leaks zero `data-edit-*`; (e) the out-of-scope slots (logo/watermark/og/favicon/notFound) are byte-unchanged. Then superpowers:finishing-a-development-branch for the merge/deploy decision (rebuild `signex-web`+`signex-admin`; `@signex/shared` first; no DB migration; no nginx change).
