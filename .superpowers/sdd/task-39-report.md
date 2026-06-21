# Task 39 Report: AssetsService

## Status: DONE

## Commit
`7017424` — feat(api): AssetsService — presign/confirm(verify+dims+svg)/register/list/usage/replace/setAlt

## Files Created
- `apps/api/src/assets/assets.service.ts` — `@Injectable() AssetsService`
- `apps/api/src/assets/assets.service.spec.ts` — 10 jest tests

## TDD Evidence

### RED Phase
Wrote `assets.service.spec.ts` first. Ran:
```
npm test -w @signex/api -- assets.service
→ FAIL: Cannot find module './assets.service'
```
Correct failure (module missing, not a logic error).

### GREEN Phase
Implemented `assets.service.ts`. Ran:
```
npm test -w @signex/api -- assets.service
→ PASS: 10 tests
```

### Full suite (no regressions)
```
npm test -w @signex/api
→ 27 suites, 164 tests — all PASS
```

### Build
```
npm run build -w @signex/api
→ exit 0 (nest build clean, no TS errors)
```

## Implemented Methods

| Method | Key behavior |
|---|---|
| `presign` | Dedup by sha256 (READY asset → return deduped result, no DB create, no presign). New → create PENDING + R2 presignPut → return `{deduped:false, assetId, r2Key, upload}`. |
| `confirm` | SECURITY path: HEAD check → GET bytes → sha256 re-verify (BadRequest on mismatch) → SVG: sanitizeSvg + R2 putObject (immutable CC) → readImageDimensions (authoritative) → update READY. Idempotent if already READY. |
| `register` | Server-side (importer) path: mime/size guard → SVG sanitize → sha256 → dedup → R2 putObject (immutable CC) → create READY with authoritative dims. |
| `list` | findMany READY, optional kind filter, excludes deletedAt by default. |
| `usage` | Parallel query assetRef + releaseAssetRef → `{working, releases}`. |
| `replace` | Validates target exists → delegates to `register` → audits. |
| `setAlt` | findUnique or NotFound → update altDefault → audit. |

## Key Invariants Verified

- **Dedup by sha256**: `findUnique({ where: { sha256 } })` before any create. Existing READY → short-circuit, no upload.
- **Confirm re-hash-verify**: `createHash('sha256').update(bytes).digest('hex') !== asset.sha256` → `BadRequestException('CHECKSUM_MISMATCH...')`. Client cannot inject wrong bytes.
- **SVG sanitize + re-put**: `sanitizeSvg(bytes)` strips `<script>` etc.; re-uploaded with `IMMUTABLE_CACHE_CONTROL`. Verified by test: `put.body.toString()` does not match `/script/i` and `put.cacheControl === 'public, max-age=31536000, immutable'`.
- **Authoritative dims**: `readImageDimensions(storedBytes, asset.mime)` sets width/height — client-asserted dims are never trusted.
- **IMMUTABLE_CACHE_CONTROL**: Used on all direct puts (SVG re-upload in confirm, register).
- **Audit trail**: Every mutating method calls `this.audit(actor, 'asset.<method>', entityId, meta)`.

## Concerns / Notes

- **confirm SVG sha256 quirk**: After sanitizing SVG, the stored bytes differ from the uploaded bytes. The sha256 we re-verify is the sha256 of the *uploaded* bytes (the declared hash). The sanitized bytes are re-uploaded to R2 under the same key. This is correct by design — the key is content-addressed to the *original* upload, and the sanitized version replaces it transparently.
- **replace semantics**: As per brief, `replace` registers new bytes as a new Asset (potentially the same key if same content) and returns it. Callers (controller, importer) are responsible for atomically repointing imageId/posterId references. No in-place mutation of the old asset.
- **PENDING dedup in presign**: If a PENDING asset already exists for the sha256, we reuse its row and re-presign (idempotent retry). Only READY assets trigger the deduped=true short-circuit.

## Fix pass (SvgForbiddenError→400 + replace test)

### Fix 1 — `SvgForbiddenError` → 400, not 500
Both `confirm()` and `register()` now wrap their `sanitizeSvg(bytes)` call in a try/catch. A `SvgForbiddenError` (thrown when the bytes have no `<svg>` root) is re-raised as `BadRequestException('INVALID_SVG: ...')`. Non-`SvgForbiddenError` errors re-throw transparently. `SvgForbiddenError` is now imported from `./svg-sanitize` alongside `sanitizeSvg`.

### Fix 2 — `replace` tests + malformed-SVG → 400 tests
Added 7 new jest tests across 3 new describe blocks:
- `AssetsService.confirm — malformed SVG → 400` (2 tests): SVG asset whose R2 bytes contain `<html>no svg</html>` → `BadRequestException`; `asset.update` is NOT called (asset never flips to READY).
- `AssetsService.register — malformed SVG → 400` (1 test): `register()` with `image/svg+xml` but no `<svg>` → `BadRequestException`; `r2.putObject` is NOT called.
- `AssetsService.replace` (4 tests): delegates to `register` and returns new asset; writes `asset.replace` audit with `replacedWith`; throws `NotFoundException` for missing target; throws `BadRequestException` when bytes not provided.

### Verify
- `assets.service` suite: 17 tests (was 10) — all PASS
- Full api suite: 27 suites, 171 tests — all PASS
- `nest build` — exit 0, no TypeScript errors
