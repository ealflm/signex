# Task 64a — Public Forms Submit Endpoint

**Date:** 2026-06-21  
**Status:** DONE  
**Commit subject:** feat(api): public Forms submit endpoint (POST /api/forms/:formKey/submit, multipart, R2 upload, rate-limited)

---

## Endpoint shape

```
POST /api/forms/:formKey/submit
Content-Type: multipart/form-data
```

- **Public** — `@Public()` on the handler only; no session required.
- **Rate-limited** — inherits the global `ThrottlerGuard` (100 req/min/IP from `AppModule`).
- **Accepted `formKey` values:** `"quote"` | `"contact"` (NotFoundException for anything else).
- **Success response:** `200 { ok: true }`.

### Error codes
| Condition | HTTP |
|---|---|
| Unknown formKey | 404 |
| Invalid text payload (zod) | 422 |
| Disallowed file mime | 400 |
| File too large (>10 MB) | 400 |

---

## Multipart handling

- `FileInterceptor('upload', { storage: memoryStorage() })` — multer memoryStorage; no disk writes; file lands in `req.file.buffer`.
- Text fields arrive as strings via `@Body()`; the `ZodValidationPipe(submitSchema)` parses and coerces them.
- File upload is optional (`@UploadedFile() file: Express.Multer.File | undefined`).
- `@types/multer` added as devDependency to `@signex/api`.

---

## submitSchema (zod)

```ts
z.object({
  name:    z.string().min(1).max(200),          // required
  email:   z.string().email().max(254),          // required (contactable)
  phone:   z.string().max(50).optional(),
  message: z.string().max(5000).optional(),
  company: z.string().max(200).optional(),
  subject: z.string().max(300).optional(),
})
```

Permissive enough to cover both quote and contact forms; name + email always required.

---

## File upload flow

1. Validate `file.mimetype` is in the `MIME_ALLOWLIST` (images + videos from `assets.dto.ts`).
2. Validate `file.buffer.length <= 10 MB`.
3. Call `AssetsService.register({ id: SYSTEM_USER_ID, role: 'ADMIN' }, { bytes, mime, originalName })` → `AssetDto`.
4. Set `uploadAssetId = dto.id` on the `FormSubmission` row.
5. If no file: `uploadAssetId = null`.

---

## Persistence

```ts
prisma.client.formSubmission.create({
  data: { formKey, payload, uploadAssetId, ip, userAgent }
})
```

- `ip` sourced from `x-forwarded-for` header (proxy-aware) then `req.ip`.
- `userAgent` sourced from `user-agent` header.
- `status` defaults to `NEW` (Prisma schema default).

---

## Files created

| Path | Purpose |
|---|---|
| `apps/api/src/forms/dto/forms.dto.ts` | `VALID_FORM_KEYS`, `submitSchema`, types |
| `apps/api/src/forms/forms.service.ts` | Business logic: formKey check, upload, DB write |
| `apps/api/src/forms/forms.controller.ts` | Route handler, multipart interceptor |
| `apps/api/src/forms/forms.module.ts` | NestJS module, imports PrismaModule + AssetsModule |
| `apps/api/src/forms/forms.service.spec.ts` | Unit tests for service (4 cases) |
| `apps/api/src/forms/forms.controller.spec.ts` | Unit tests for controller (4 cases) |

## Files modified

| Path | Change |
|---|---|
| `apps/api/src/app.module.ts` | Import + register `FormsModule` |
| `apps/api/package.json` | Added `@types/multer` to devDependencies |

---

## Dependencies added

- `@types/multer` (devDependency) — provides `Express.Multer.File` type; required because `@nestjs/platform-express` includes multer but the types weren't installed.

---

## Test results

- **8 tests** across 2 specs: all pass (GREEN).
- **Pre-existing failure:** `importer/parity.spec.ts` (2 tests) — unrelated `businessContact` key mismatch in content dictionary; was failing before this change.
- `nest build`: 0 errors.
- `npm run lint -w @signex/api`: 0 errors.
- `test:e2e app.e2e-spec`: AppModule compiles and boots (1 test passed).
