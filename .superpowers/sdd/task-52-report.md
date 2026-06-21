# Task 52 Report: Asset manifest + importAssets via AssetsService.register

## Status: DONE

## Commit
`842f402` — `feat(api/importer): asset manifest + importAssets via AssetsService.register`

## Files Created
- `apps/api/src/importer/asset-manifest.ts` — `ASSET_MANIFEST` (29 entries), `categoryImageLogicalId(i)`, `productImageLogicalId(j)`
- `apps/api/src/importer/asset-importer.ts` — `importAssets({ assets, repoRoot? })`, `FrozenAssetEntry`
- `apps/api/src/importer/asset-importer.spec.ts` — 4 tests (manifest existence, id helpers, upload+dedup, video no-crash)

## Test Results
- 4 new tests GREEN (spec file: `asset-importer.spec.ts`)
- Full suite: **218 tests, 35 suites, 0 failures**
- `npm run build -w @signex/api` (nest build): clean
- `npm run lint -w @signex/api`: 0 errors (prettier auto-fixed via `lint:fix` before commit)

## Interface Drift Correction (brief was stale)
The brief's `importAssets` depended on `{ prisma, r2 }` with `r2.uploadFromBytes(...)` — that method does not exist. The implementation was adapted to use:
```ts
importAssets({ assets: AssetsService, repoRoot?: string })
```
`AssetsService.register(actor, { bytes, mime, originalName })` is the real server-side upload path. The system actor is `{ id: SYSTEM_USER_ID, role: 'ADMIN' }` from `apps/api/src/auth/seed-config.ts`.

## Video Dims Finding
`readImageDimensions(buf, mime)` in `apps/api/src/assets/image-dimensions.ts` has a `default: return null` branch for all unrecognized MIME types including `video/mp4` and `video/webm`. It does **NOT throw** on video buffers — it returns `null`. The `register` method stores `dims?.width ?? null`, so video assets get `null` width/height in the DB.

In `importAssets`, the `dtoToFrozen` mapper converts `null` → `undefined` for optional fields: `width: dto.width ?? undefined`. The video no-crash test explicitly asserts `frozen.width === undefined` for all VIDEO manifest entries.

**No guard needed in `image-dimensions.ts` or `register`** — the existing `default: return null` is correct and sufficient.

## AssetDto id Field
`AssetDto` (in `assets.service.ts`) exposes the asset id as `id` (not `assetId`). `FrozenAssetEntry.assetId` is mapped from `dto.id` in `dtoToFrozen`.

## Manifest Filename Verification
All 29 manifest entries verified to exist on disk under `apps/web/public/assets/`:
- 9 brand/chrome files (SVG + PNG)
- 4 shared surface images (AVIF)
- 2 video poster images (JPG) + 2×2 video files (MP4/WEBM)
- 4 category images (AVIF)
- 6 product images (AVIF)

**No filename corrections needed.** Every `relPath` in the manifest matched an actual file.

## Dedup
`ASSET_MANIFEST` has 1 entry for `logo` (logicalId `logo`, relPath `images/signex-logo.svg`). No duplicate logicalIds reference the same file, so the dedup assertion in the test uses `if (logoIds.length > 1)` guard — passes trivially for the current manifest. `AssetsService.register` internally deduplicates by sha256 (returns the existing READY row without re-uploading); the mock mirrors this behaviour.

## Notes
- The `uploadedSha256s` tracking variable in the test is declared but only used to verify that distinct content produces distinct entries — the mock itself provides the dedup behaviour.
- `SYSTEM_USER_ID = 'seedsystemadmin0000000000'` is used as the actor for all `register` calls (audit trail).

## Fix pass (live dedup test + real multiple-reference manifest entries)

### Problem
The original `ASSET_MANIFEST` had one logicalId per file (zero duplicate relPaths), making the dedup test's `if (logoIds.length > 1)` branch dead code. `uploadedSha256s` was tracked but never asserted. The sha256 dedup inside `AssetsService.register` was real but untested.

### Real multiple reference discovered
`signex-logo.svg` is legitimately referenced in TWO places in the live web app:
- **Navbar** (`apps/web/app/components/navbar.tsx` line 89) — CSS mask `<span className="signex-logo-nav">` (no `<img src>`, mask via CSS)
- **Footer** (`apps/web/app/components/footer.tsx` line 55) — `<img src="/assets/images/signex-logo.svg">` with `className="footer-signex_logo"`

### Manifest change
Added `SVG('logoFooter', 'signex-logo.svg')` immediately after `SVG('logo', 'signex-logo.svg')` in `ASSET_MANIFEST`. Manifest is now **30 entries** with 29 unique relPaths (1 duplicate: `images/signex-logo.svg`).

**Task 54 (buildBlocks) must reference both `logo` and `logoFooter` logicalIds** — `logo` for the navbar brand link, `logoFooter` for the footer brand column.

### Dedup mechanism: relPath-group (not service-sha)
`importAssets` now groups manifest entries by `relPath` before the upload loop. Each unique relPath is read from disk once and passed to `register` once. All logicalIds sharing that relPath are mapped to the single returned `FrozenAssetEntry`. This means:
- `register` is called `uniqueRelPaths` times (29), not `ASSET_MANIFEST.length` times (30)
- Both `logo` and `logoFooter` resolve to the identical `FrozenAssetEntry` (same `assetId` and `r2Key`)

### Live dedup assertions (unconditional, no guard)
```
expect(navLogoEntry.assetId).toBe(footerLogoEntry.assetId);   // same Asset row
expect(navLogoEntry.r2Key).toBe(footerLogoEntry.r2Key);        // same R2 object
expect(registerMock).toHaveBeenCalledTimes(uniqueRelPaths);    // 29 calls
expect(registerMock.mock.calls.length).toBeLessThan(ASSET_MANIFEST.length); // 29 < 30
```

### Verify
- `npm run test -w @signex/api -- asset-importer`: **4 tests GREEN** (dedup assertion now live — would fail if dedup broke)
- `npm run test -w @signex/api`: **218 tests, 35 suites, 0 failures**
- `npm run build -w @signex/api`: clean
- `npm run lint -w @signex/api`: 0 errors
