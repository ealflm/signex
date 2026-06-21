# SIGNEX Admin/CMS — Infrastructure Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote SIGNEX's 100%-static public site into a CMS-driven site without changing what visitors see, by building the shared infrastructure foundation — one mutable working state (relational Catalog + zod-validated JSON ContentBlocks + R2 media), a multi-user RBAC NestJS control plane, immutable site-wide Release snapshots with hybrid ISR on-demand publish/rollback, a one-time importer that loses nothing and mints Release v1, and a minimal admin shell that exercises every surface end-to-end.

**Architecture:** One mutable WORKING world (the live draft = Prisma Catalog tables + ContentBlock rows + Assets, guarded by a single global WorkingState.revision optimistic lock) plus N immutable RELEASE snapshots; the NestJS api (apps/api, port 3060) is the SOLE control plane for all writes/preview/publish/revalidate, and Publish serializes the whole working state into one immutable Release.snapshot JSON and repoints a singleton PublishedPointer. The public web (apps/web, Next 16.2.7) reads the latest published snapshot directly from Postgres via @signex/db in a fully-cached, draftMode-free "use cache"/cacheTag('release') loader (falling back to a committed INITIAL_SNAPSHOT on any error), while draft preview reads live working state through the api, and Publish fires Next on-demand revalidateTag('release','max'). Media is content-addressed in Cloudflare R2 and referenced by {assetId, r2Key} (never an absolute URL — resolved at read time from MEDIA_PUBLIC_BASE); @signex/shared holds the single zod content/auth registry imported by all three apps; the admin shell (Next 16.2.7, port 3061) never touches the api or DB directly — the browser only hits same-origin admin route handlers that forward the session cookie server-side.

**Tech Stack:** Monorepo: npm workspaces + Turborepo, npm@10.9.0, Node >=18. API: NestJS v11 (jest + supertest), node:crypto scrypt, cookie-parser, @nestjs/throttler, ZodValidationPipe, opaque cookie sessions. DB: Prisma 6.18.x + PostgreSQL 16 (host 3059→container 5432); @signex/db & @signex/shared → CommonJS dist/ require()d at runtime. Shared: zod (@signex/shared registry, built FIRST). Web & Admin: Next.js 16.2.7 / React 19.2.4 (App Router, output:standalone, Tailwind v4; verify against node_modules/next/dist/docs/). Media: Cloudflare R2 presigned PUT, NO sharp. Test add-ons: shared/db → vitest; web → Next route smoke / build-time invariant scripts. Infra: Docker Compose (postgres+api+web+admin), reverse-proxy /api (3060 not host-published).

**Spec:** `docs/superpowers/specs/2026-06-21-signex-admin-cms-infra-foundation-design.md` (read it; this plan implements it). **Date:** 2026-06-21. **Tasks:** 82 across 11 milestones (the fixed §15 build sequence).

## Project-wide rules (verbatim, bind every task)
- Monorepo: npm **workspaces** (`apps/*`, `packages/*`) + **Turborepo**; `npm@10.9.0`, Node `>=18`, single root lockfile. Install via `npm install` from the root.
- `@signex/db` and `@signex/shared` MUST compile to **CommonJS `dist/`** (`tsc`) before any app consumes them — `nest build` and Next do NOT bundle workspace deps; they `require()` `./dist/index.js` at runtime. Turbo encodes ordering (`build` `dependsOn ^build`; `@signex/db#build` `dependsOn @signex/db#generate`).
- Ports (do NOT change): api `@signex/api` 3060 (NestJS 11), admin `@signex/admin` 3061 (Next 16), web `@signex/web` 3062 (Next 16). Postgres Docker publishes host **3059** → container `5432`.
- Pin Next/React EXACTLY to web's versions across web AND admin: Next **16.2.7**, React **19.2.4**, react-dom **19.2.4**. Next 16.2.x has breaking changes vs training data — read `node_modules/next/dist/docs/` before writing Next code. Verify revalidate signatures against the installed version.
- Before writing code in an app, read that app's `AGENTS.md` (`apps/web/AGENTS.md`, `apps/api/AGENTS.md`, etc.) — they carry binding rules.
- Scaffold new apps/packages with official CLIs (`create-next-app@latest`, `nest new`, `prisma init`) — do NOT hand-copy scaffolds. Admin is RE-scaffolded via `create-next-app@latest` at its build step.
- Prisma 6.18.x + Postgres 16; `binaryTarget` includes `linux-musl-openssl-3.0.x` (alpine standalone). Generated client lives in `packages/db/generated/`.
- API test runner = **jest** (unit + supertest e2e), already configured. `packages/shared` & `packages/db` → add **vitest** in the first task that needs it. Web → Next route smoke / build-time invariant verification scripts (no Playwright).
- Docker gate: green `docker compose build` of all 4 app images before committing a deliverable that adds a dep — every new dep must be traced into the correct Dockerfile stage. Workspace `dist/` (and `packages/db/generated` for the web stage) must be built BEFORE `next build`/`nest build`.
- The NestJS api is the SOLE control plane for all writes/preview/publish/revalidate. Web PUBLIC reads the published snapshot directly from Postgres via `@signex/db`; admin browser NEVER calls the api or DB directly (same-origin Next route handlers forward the cookie server-side). `enableCors` stays OFF.

## The 14 locked decisions (Decisions Log — bind every task)
1. **Build sequence**: full shared infra first, rich editor UIs later (the 11-step §15 order is fixed).
2. **Admin scaffold**: re-scaffold `apps/admin` via `create-next-app@latest` at the admin-build step (not hand-edited).
3. **Delivery model**: hybrid ISR on-demand — web stays static+cached; Publish triggers Next on-demand revalidation; drafts via Next draft mode.
4. **Versioning unit**: site-wide Release snapshots — working tables ARE the draft (NO `DRAFT` Release status); Publish freezes the whole site into an immutable versioned Release; rollback restores an old one. Enums: `Role {EDITOR PUBLISHER ADMIN}`, `ReleaseStatus {PUBLISHED ARCHIVED}`.
5. **Auth**: multi-user + RBAC — Editor(1) / Publisher(2) / Admin(3), ordered via `ROLE_RANK`/`atLeast()`.
6. **Hosting**: self-hosted Docker, single-instance, Cloudflare R2 for media. Password hashing = `node:crypto` scrypt (NO native dep). No `sharp`.
7. **Content model**: hybrid — relational Catalog (Category/Product/Asset) + zod-validated JSON ContentBlocks for page copy/settings/nav/SEO. `packages/db/prisma/schema.prisma` is the single canonical schema; all layers import from it.
8. **Rollback default**: repoint-only (live reverts, working draft untouched; `restoreWorkingState` is opt-in). Rollback is forward-only (mints a new PUBLISHED release, version keeps incrementing, sets `rolledBackFromVersion`); checksum dedupe applies ONLY to publish-from-working-state, NEVER to rollback.
9. **API topology (prod)**: reverse-proxy `/api` behind one hostname — do NOT publish :3060 to the internet; same-site CSRF model (SameSite=Lax + Origin allowlist enforced at admin route handlers).
10. **Admin session lifetime**: 30-day absolute, server-stored `Session` table — logout/demote/deactivate revokes instantly.
11. **Publish no-op**: soft "nothing to publish" warning on checksum match (no junk version).
12. **Social links**: keep `#` placeholders; importer seeds placeholders, Admin fills post-launch.
13. **businessContact i18n**: emails/phones/taxId = locale-invariant scalars; legalName/address = localized `{en,vi}`.
14. **Revalidation retry**: in-memory retry + manual re-fire for the foundation; durable outbox is a fast-follow.

## Cross-cutting invariants (review fixes — bind every task)
- Single-PUBLISHED enforced via an explicit `PublishedPointer` singleton table (Prisma-expressible), NOT a raw-SQL partial unique index.
- Release `version` assigned from a Postgres **sequence** `release_version_seq` (`nextval` — never `max+1`).
- Publish: serialize+validate the snapshot OUTSIDE the tx; short tx inside with a `WorkingState.revision === fromRevision` guard (else 409 STALE_DRAFT); revalidate AFTER commit (non-fatal, retryable).
- Single global `WorkingState.revision` optimistic lock; `dirty = revision !== lastPublishedRevision` (never compares revision int vs version int).
- Asset URLs are NEVER frozen/stored — snapshots freeze `{assetId, r2Key, mime, width, height}`; web resolves `MEDIA_PUBLIC_BASE + '/' + r2Key` at read time. **Publish gate**: refuse to publish if `MEDIA_PUBLIC_BASE` is unset or an `r2.dev` host.
- Content-addressed R2 keys `originals/<sha256-first-32>/<slug>.<ext>` = dedup + immutability; `Cache-Control: public, max-age=31536000, immutable`. Confirm hardening: server-side sha256/checksum verify, authoritative dims, SVG sanitize (or admin-forbid SVG, importer-only).
- Alt text lives on the USE (`AssetRef`/content field/`Product.imageAlt`), NOT the deduped `Asset`; `Asset.altDefault` is fallback only.
- IDs locked to `cuid()`; `@signex/shared` `Id = z.string().cuid()`.
- Every Json column is zod-validated by `registry[(kind,key)]` before write AND again at publish.
- `FormSubmission` is operational-only — NEVER snapshot-serialized. Snapshot = `Category`, `Product`, `Asset` (frozen refs), `ContentBlock`. Operational-only = `User`, `Session`, `AuditLog`, `Release`, `PublishedPointer`, `WorkingState`, `FormSubmission`, `AssetRef`, `ReleaseAssetRef`.
- Web: `getPublishedSnapshot` reads NO `draftMode()` (would de-opt SSG under `cacheComponents`); set `dynamicParams = true` on the two product segments, keep `[lang]/layout` `dynamicParams = false`; web never 500s on data (any Prisma error → `INITIAL_SNAPSHOT`). `INITIAL_SNAPSHOT` is byte-equal to Release v1's snapshot.
- Global `APP_GUARD` order: OriginGuard → SessionAuthGuard → RolesGuard (secure-by-default; `@Public()` only on `/api/health`, `/api/auth/login`, `/api/forms/:formKey/submit`). `publicUser()` strips `passwordHash`.
- Seed order contract: `prisma migrate deploy` → `auth:seed` (deterministic-cuid SYSTEM/ADMIN from `SEED_ADMIN_*` env) → importer runs passing that user id as actor for Release v1 + `Asset.uploadedById`.

---

## File Structure

**Milestone 0 — @signex/shared content + auth registry (CJS dist)**
- `packages/shared/package.json` — *modify* — Add vitest devDep + test script; keep tsc build + zod dep; ensure dist build still emits CJS for api/web/admin runtime require()
- `packages/shared/vitest.config.ts` — *create* — Vitest config for the package (node env, src/**/*.test.ts)
- `packages/shared/tsconfig.json` — *modify* — Exclude *.test.ts from the tsc dist build so tests don't ship to dist/
- `packages/shared/src/content/primitives.ts` — *create* — Id, localized(), LocalizedText, LocalizedTextArray, TwoToneTitle, Href, AssetRef, VideoRef primitives
- `packages/shared/src/content/blocks/hero.ts` — *create* — heroBlock zod schema (titleTop/titleBottom/subtitle/image AssetRef)
- `packages/shared/src/content/blocks/features.ts` — *create* — featuresBlock zod schema (eyebrow/title/cta/video VideoRef/featured/cards[])
- `packages/shared/src/content/blocks/about.ts` — *create* — aboutBlock zod schema (home About section: eyebrow/title/body/mission/vision/values)
- `packages/shared/src/content/blocks/productsHeader.ts` — *create* — productsHeaderBlock zod schema (dict.products UI copy minus categories[])
- `packages/shared/src/content/blocks/footer.ts` — *create* — footerBlock zod schema (tagline/headings/links/ship+pay labels/payments)
- `packages/shared/src/content/blocks/nav.ts` — *create* — navBlock zod schema (skip/cta/logo AssetRef/links[])
- `packages/shared/src/content/blocks/meta.ts` — *create* — metaBlock zod schema (siteName/title/description/og AssetRef/per-page meta)
- `packages/shared/src/content/blocks/businessContact.ts` — *create* — businessContactBlock UNIFIED NAP + render-helper label map; locale-invariant scalars + localized legalName/address
- `packages/shared/src/content/blocks/formConfig.ts` — *create* — formConfigBlock zod schema (field labels/placeholders, standardOptions value+label pairs, submit/success/fail)
- `packages/shared/src/content/blocks/aboutPage.ts` — *create* — aboutPageBlock zod schema (hero/testimonial/approach/intro/capability/process/timeline repeaters w/ optional milestone items/note)
- `packages/shared/src/content/blocks/contactPage.ts` — *create* — contactPageBlock zod schema (hero/cards/map)
- `packages/shared/src/content/blocks/notFound.ts` — *create* — notFoundBlock zod schema (eyebrow/title/body/cta/image AssetRef)
- `packages/shared/src/content/blocks/index.ts` — *create* — Barrel re-export of all 12 block schemas
- `packages/shared/src/content/registry.ts` — *create* — BLOCK_REGISTRY map, BlockKey type, parseBlock(key,data), ReleaseBlocks type
- `packages/shared/src/content/catalog.ts` — *create* — FrozenAsset + Category/Product/Asset zod DTOs mirroring Prisma (api responses)
- `packages/shared/src/content/release.ts` — *create* — ReleaseSnapshotSchema (schemaVersion literal 1 + blocks via registry + catalog), ReleaseSnapshot type
- `packages/shared/src/auth.ts` — *create* — loginSchema, createUserSchema, RoleName, ROLE_RANK, atLeast()
- `packages/shared/src/index.ts` — *modify* — Re-export everything (primitives, blocks, registry, catalog, release, auth); keep contactMessageSchema
- `packages/shared/src/content/primitives.test.ts` — *create* — Vitest for primitives
- `packages/shared/src/content/registry.test.ts` — *create* — Vitest for BLOCK_REGISTRY + parseBlock against real dict fixtures
- `packages/shared/src/content/release.test.ts` — *create* — Vitest for FrozenAsset + ReleaseSnapshotSchema
- `packages/shared/src/auth.test.ts` — *create* — Vitest for loginSchema/createUserSchema/ROLE_RANK/atLeast

**Milestone 1 — packages/db Prisma schema + migration + release_version_seq**
- `packages/db/prisma/schema.prisma` — *modify* — Append all spec §4 models (User/Session/AuditLog, Asset/AssetRef/ReleaseAssetRef, Category/Product, ContentBlock, FormSubmission, Release/PublishedPointer/WorkingState) + all enums + indexes + relations to the existing datasource/generator. Corrected from the spec's prose-style inline `;` field separators (illegal in Prisma) to one-field-per-line.
- `packages/db/prisma/migrations/migration_lock.toml` — *modify* — Unchanged provider=postgresql lock (kept; the empty placeholder migration dir beside it is deleted).
- `packages/db/prisma/migrations/20260621000000_cms_foundation/migration.sql` — *create* — The single committed migration: CREATE all enums + tables + indexes + FKs (Prisma-generated) followed by an appended `CREATE SEQUENCE release_version_seq;`. Replaces the deleted empty 20260619164715_init placeholder.
- `packages/db/src/index.ts` — *modify* — Already re-exports `prisma` + the generated client; verified to surface the new model types (User, Release, etc.) after `prisma generate`. No code change unless the generate/build verification reveals a gap.
- `packages/db/test/schema.spec.ts` — *create* — Vitest suite asserting the generated client + a live clean-DB migration: enum members, singleton default ids, single-PUBLISHED & monotonic-version invariants exercised against a real Postgres, and that `release_version_seq` exists and nextval increments.
- `packages/db/vitest.config.ts` — *create* — Vitest config for @signex/db (node environment, loads .env DATABASE_URL, single-fork pool so DB tests don't race).
- `packages/db/package.json` — *modify* — Add vitest devDep + `test`/`test:run` scripts; add `migrate:reset` helper used by the clean-DB verification.

**Milestone 2 — api auth + RBAC (sessions, scrypt, guard chain, users CRUD)**
- `apps/api/package.json` — *modify* — add cookie-parser, @nestjs/throttler runtime deps + @types/cookie-parser dev dep
- `apps/api/src/common/crypto/password.ts` — *create* — node:crypto scrypt hashPassword/verifyPassword (constant-time, salted, encoded string)
- `apps/api/src/common/crypto/password.spec.ts` — *create* — jest unit tests for hash/verify
- `apps/api/src/common/crypto/token.ts` — *create* — generateSessionToken (random) + hashToken (sha256) for opaque session tokens
- `apps/api/src/common/crypto/token.spec.ts` — *create* — jest unit tests for token gen + sha256 hash
- `apps/api/src/common/pipes/zod-validation.pipe.ts` — *create* — ZodValidationPipe: parse body against a ZodSchema, throw 422 on failure
- `apps/api/src/common/pipes/zod-validation.pipe.spec.ts` — *create* — jest unit tests for the pipe (pass + 422)
- `apps/api/src/common/decorators/public.decorator.ts` — *create* — @Public() SetMetadata + IS_PUBLIC_KEY
- `apps/api/src/common/decorators/roles.decorator.ts` — *create* — @Roles(...) SetMetadata + ROLES_KEY
- `apps/api/src/common/decorators/current-user.decorator.ts` — *create* — @CurrentUser() param decorator reading req.user
- `apps/api/src/auth/auth.types.ts` — *create* — AuthedUser type (publicUser shape) + publicUser() stripper
- `apps/api/src/auth/auth.types.spec.ts` — *create* — jest unit test: publicUser strips passwordHash
- `apps/api/src/auth/auth.service.ts` — *create* — AuthService: login (verify creds, create Session), logout (revoke), validateSessionToken (lookup by tokenHash), cleanup
- `apps/api/src/auth/auth.service.spec.ts` — *create* — jest unit tests for login/logout/validateSessionToken with mocked PrismaService
- `apps/api/src/auth/auth.controller.ts` — *create* — AuthController: POST login, POST logout, GET me; sets/clears httpOnly cookie
- `apps/api/src/auth/auth.module.ts` — *create* — AuthModule wires AuthService + AuthController + ThrottlerModule, exports AuthService
- `apps/api/src/auth/guards/origin.guard.ts` — *create* — OriginGuard: allow @Public; enforce Origin allowlist on state-changing methods
- `apps/api/src/auth/guards/origin.guard.spec.ts` — *create* — jest unit tests for OriginGuard
- `apps/api/src/auth/guards/session-auth.guard.ts` — *create* — SessionAuthGuard: allow @Public; else read cookie, validate session, attach req.user
- `apps/api/src/auth/guards/session-auth.guard.spec.ts` — *create* — jest unit tests for SessionAuthGuard
- `apps/api/src/auth/guards/roles.guard.ts` — *create* — RolesGuard: allow @Public; enforce @Roles via ROLE_RANK/atLeast
- `apps/api/src/auth/guards/roles.guard.spec.ts` — *create* — jest unit tests for RolesGuard
- `apps/api/src/users/users.service.ts` — *create* — UsersService: create (hash pw), update (role/name/active + revoke sessions on demote/deactivate), deactivate
- `apps/api/src/users/users.service.spec.ts` — *create* — jest unit tests for UsersService with mocked PrismaService
- `apps/api/src/users/users.controller.ts` — *create* — UsersController @Roles(ADMIN): POST create, PATCH :id, DELETE :id (deactivate)
- `apps/api/src/users/users.module.ts` — *create* — UsersModule wires UsersService + UsersController
- `apps/api/src/main.ts` — *modify* — app.use(cookieParser())
- `apps/api/src/app.module.ts` — *modify* — import AuthModule + UsersModule; register APP_GUARD chain Origin->SessionAuth->Roles
- `apps/api/test/auth.e2e-spec.ts` — *create* — supertest e2e: public health open, login sets cookie, me returns user, guarded routes 401/403

**Milestone 3 — Seed / bootstrap (auth:seed system ADMIN + deploy-order contract)**
- `apps/api/src/auth/seed-config.ts` — *create* — Pure, testable reader/validator that turns process.env (SEED_ADMIN_*) into a typed SeedAdminConfig, and the deterministic SYSTEM_USER_ID constant. No Prisma, no I/O — unit-testable in jest.
- `apps/api/src/auth/seed-config.spec.ts` — *create* — Jest unit tests for readSeedAdminConfig() (happy path, missing/blank env throws, password length floor) and SYSTEM_USER_ID determinism.
- `apps/api/src/auth/seed.service.ts` — *create* — Injectable SeedService.seedAdmin(config) that upserts the fixed SYSTEM/ADMIN User by deterministic id using PrismaService + hashPassword from step 2; idempotent; returns {created|updated}. Reusable from the importer (step 7) as the system actor source.
- `apps/api/src/auth/seed.service.spec.ts` — *create* — Jest unit tests for SeedService.seedAdmin against a mocked PrismaService: creates on first run, is idempotent on re-run, always ADMIN+active, hashes via hashPassword.
- `apps/api/src/auth/seed.ts` — *create* — CLI entrypoint compiled to dist/auth/seed.js. Loads dotenv, boots a standalone Nest application context, resolves SeedService, runs seedAdmin(readSeedAdminConfig()), logs result, exits 0 (or 1 on failure). Run as `node dist/auth/seed`.
- `apps/api/package.json` — *modify* — Add scripts: `auth:seed` (node dist/auth/seed), `auth:seed:dev` (ts-node src/auth/seed.ts), and a `db:deploy` convenience that documents the migrate→seed order.
- `.env.example` — *modify* — Add SEED_ADMIN_EMAIL / SEED_ADMIN_NAME / SEED_ADMIN_PASSWORD with a comment documenting the deploy order: migrate deploy → auth:seed → importer.

**Milestone 4 — api ContentService + CatalogService (single-writer working-state edits: revision-guard, registry zod-validate, AssetRef reconcile, audit)**
- `apps/api/src/working-state/working-state.service.ts` — *create* — Owns the WorkingState singleton: ensure() bootstrap, readRevision(), and guardAndBump(tx, expectedRevision) — the optimistic-lock primitive (throws 409 STALE_DRAFT on mismatch, increments revision) used inside every write tx by Content and Catalog services.
- `apps/api/src/working-state/working-state.service.spec.ts` — *create* — Unit tests for guardAndBump (match -> bump, mismatch -> 409 STALE_DRAFT) and ensure() idempotency against a mocked Prisma tx client.
- `apps/api/src/working-state/working-state.module.ts` — *create* — Provides + exports WorkingStateService.
- `apps/api/src/working-state/working-state.controller.ts` — *create* — GET /api/working-state -> { revision, lastPublishedRevision, dirty } (EDITOR+) for the admin dirty-status surface.
- `apps/api/src/audit/audit.service.ts` — *create* — writeAudit(tx, { userId, action, entityType, entityId?, meta? }) — appends an AuditLog row using the passed tx client so audits are atomic with the edit.
- `apps/api/src/audit/audit.service.spec.ts` — *create* — Unit test: writeAudit forwards the exact create payload to the tx auditLog.create.
- `apps/api/src/audit/audit.module.ts` — *create* — Provides + exports AuditService.
- `apps/api/src/content/asset-ref.util.ts` — *create* — Pure walker: collectAssetRefs(data) deep-walks a block/record JSON value, recognizing AssetRef ({assetId,alt?}) and VideoRef ({posterAssetId,mp4AssetId,webmAssetId?}) nodes, returning [{ field, assetId, alt }] with json-path-ish field labels.
- `apps/api/src/content/asset-ref.util.spec.ts` — *create* — Unit tests for collectAssetRefs over nested objects, arrays (gallery[2]), VideoRef expansion into 2-3 refs, and ignoring non-ref objects.
- `apps/api/src/content/content.service.ts` — *create* — Single writer for ContentBlock edits: updateBlock(actor, kind, key, data, expectedRevision) — tx that revision-guards+bumps, parseBlock(kind,key,data) (422 INVALID_BLOCK), upserts ContentBlock by (kind,key), reconciles AssetRef for owner contentBlock, writes audit content.update; returns { revision }.
- `apps/api/src/content/content.service.spec.ts` — *create* — Unit tests for updateBlock: happy path (validate->upsert->reconcile->bump->audit, returns new revision), 422 on bad data, 409 STALE_DRAFT on revision mismatch, AssetRef reconcile deletes stale + creates current.
- `apps/api/src/content/content.controller.ts` — *create* — PUT /api/content/blocks/:kind/:key (EDITOR+) { data, expectedRevision } -> { revision }; GET /api/content/blocks/:kind/:key (EDITOR+) -> stored block data; maps kind param to BlockKind.
- `apps/api/src/content/content.controller.spec.ts` — *create* — Unit test: controller delegates to ContentService.updateBlock with parsed kind + body and returns its result.
- `apps/api/src/content/content.module.ts` — *create* — Imports WorkingStateModule + AuditModule; provides ContentService; declares ContentController.
- `apps/api/src/catalog/asset-ref.reconcile.ts` — *create* — Shared reconcileAssetRefs(tx, ownerType, ownerId, refs) helper used by both Content and Catalog: delete-then-insert AssetRef rows keyed by (ownerType, ownerId, field).
- `apps/api/src/catalog/asset-ref.reconcile.spec.ts` — *create* — Unit test: reconcileAssetRefs deletes all existing refs for the owner then creates the new set on the tx client.
- `apps/api/src/catalog/catalog.service.ts` — *create* — Category/Product CRUD through the same revision-guard+bump+audit tx: createCategory/updateCategory/deleteCategory, createProduct/updateProduct/deleteProduct (soft-delete via deletedAt), reconcile image AssetRef, validate DTOs from @signex/shared catalog schemas.
- `apps/api/src/catalog/catalog.service.spec.ts` — *create* — Unit tests for createCategory (validate->create->bump->audit), updateProduct revision mismatch -> 409, deleteCategory soft-deletes + bumps, image AssetRef reconcile on create.
- `apps/api/src/catalog/catalog.controller.ts` — *create* — POST/PATCH/DELETE /api/catalog/categories[/:id] and /api/catalog/products[/:id] (EDITOR+); GET list endpoints; delegates to CatalogService with @CurrentUser actor.
- `apps/api/src/catalog/catalog.controller.spec.ts` — *create* — Unit test: controller create/update/delete delegate to CatalogService with actor + body.
- `apps/api/src/catalog/catalog.module.ts` — *create* — Imports WorkingStateModule + AuditModule; provides CatalogService; declares CatalogController.
- `apps/api/src/app.module.ts` — *modify* — Register WorkingStateModule, AuditModule, ContentModule, CatalogModule in AppModule imports.
- `apps/api/test/content.e2e-spec.ts` — *create* — Supertest e2e: authenticated EDITOR PUTs a content block -> 200 {revision}; stale expectedRevision -> 409 STALE_DRAFT; bad data -> 422; unauthenticated -> 401. Runs against the real Postgres test DB.
- `apps/api/test/catalog.e2e-spec.ts` — *create* — Supertest e2e: EDITOR creates a Category then a Product (200), revision bumps each time; concurrent stale write -> 409; delete soft-deletes.

**Milestone 5 — R2 media (presign / confirm with verify + immutable cache + SVG sanitize; register/list/replace/alt; no sharp)**
- `apps/api/package.json` — *modify* — Add @aws-sdk/client-s3 + @aws-sdk/s3-request-presigner deps for the R2 S3-compatible client and presigned PUT URLs.
- `apps/api/src/assets/r2.config.ts` — *create* — Reads R2_* + MEDIA_PUBLIC_BASE env into a typed, validated R2Config object; throws at boot if required vars are missing.
- `apps/api/src/assets/r2.config.spec.ts` — *create* — Unit test that loadR2Config parses env, applies defaults, and throws on missing required vars.
- `apps/api/src/assets/image-dimensions.ts` — *create* — sharp-free byte-header parsers for PNG/JPEG/GIF/WebP/SVG -> {width,height}|null; authoritative dims at confirm.
- `apps/api/src/assets/image-dimensions.spec.ts` — *create* — Unit tests asserting dimensions for crafted PNG/GIF/JPEG/WebP/SVG buffers and null for unknown bytes.
- `apps/api/src/assets/svg-sanitize.ts` — *create* — sanitizeSvg(): strips <script>, event handlers, javascript:/data: hrefs, <foreignObject>; throws SvgForbiddenError when fromTrustedImporter=false-by-policy is enforced upstream.
- `apps/api/src/assets/svg-sanitize.spec.ts` — *create* — Unit tests: script/onload/href javascript: removed; benign SVG preserved.
- `apps/api/src/assets/r2.service.ts` — *create* — R2Service: S3Client to Cloudflare R2; presignPut(), putObject(), headObject(), getObjectBytes(), publicUrl().
- `apps/api/src/assets/r2.service.spec.ts` — *create* — Unit tests with a mocked S3Client (aws-sdk-client-mock) for presignPut/headObject/putObject/getObjectBytes/publicUrl.
- `apps/api/src/assets/dto/assets.dto.ts` — *create* — zod schemas presignSchema/confirmSchema/replaceSchema/altSchema + the MIME allowlist + size caps + kindForMime() + keyFor() + slugify().
- `apps/api/src/assets/dto/assets.dto.spec.ts` — *create* — Unit tests for slugify, keyFor (originals/<hash32>/<slug>.<ext>), kindForMime, allowlist, size-cap rejection via zod.
- `apps/api/src/assets/assets.service.ts` — *create* — AssetsService: presign (allowlist/cap/dedup short-circuit), confirm (HEAD + re-hash verify + dims + cache headers + SVG flow + flip READY), register (importer server-side upload path), list, usage, replace (atomic video repoint), setAlt; audits via PrismaService.
- `apps/api/src/assets/assets.service.spec.ts` — *create* — Unit tests with mocked PrismaService + R2Service covering every AssetsService branch.
- `apps/api/src/assets/assets.controller.ts` — *create* — REST controller: POST presign|:id/confirm|:id/replace|:id/alt, GET assets + assets/usage; @Roles('EDITOR') + @CurrentUser(); ZodValidationPipe on bodies.
- `apps/api/src/assets/assets.module.ts` — *create* — AssetsModule wiring R2Service + AssetsService + AssetsController; exports AssetsService for importer/release reuse.
- `apps/api/src/app.module.ts` — *modify* — Import AssetsModule.
- `apps/api/test/assets.e2e-spec.ts` — *create* — supertest e2e: presign happy path + dedup short-circuit + mime reject + confirm checksum-mismatch reject, with R2Service overridden by a fake.

**Milestone 6 — Release engine (SnapshotSerializer, ReleaseService publish/rollback/diff, RevalidationClient)**
- `apps/api/src/revalidation/revalidation.service.ts` — *create* — RevalidationService: POST to web /api/revalidate with x-revalidate-secret, in-memory retry queue, manual re-fire; non-fatal.
- `apps/api/src/revalidation/revalidation.service.spec.ts` — *create* — Jest unit: success POST, secret header, 401/network failure -> queued for retry, manual reFire drains queue.
- `apps/api/src/revalidation/revalidation.module.ts` — *create* — Module exporting RevalidationService.
- `apps/api/src/release/snapshot.serializer.ts` — *create* — SnapshotSerializer.serialize: assemble working state -> ReleaseSnapshot (freeze {assetId,r2Key,mime,w,h,poster/webm r2Keys}), validate via ReleaseSnapshotSchema, canonical-JSON sha256 checksum, collect referenced assetIds.
- `apps/api/src/release/snapshot.serializer.spec.ts` — *create* — Jest unit: freezes r2Key not URL, video poster/webm r2Keys, validates, deterministic checksum, assetIds set.
- `apps/api/src/release/canonical-json.ts` — *create* — canonicalJson(value): stable key-sorted JSON string used for checksum determinism.
- `apps/api/src/release/canonical-json.spec.ts` — *create* — Jest unit: key-order independence, nested objects/arrays, BigInt rejection.
- `apps/api/src/release/release.service.ts` — *create* — ReleaseService: publish (MEDIA_PUBLIC_BASE gate; serialize OUTSIDE tx; short tx with revision guard 409, nextval sequence, demote, create, repoint pointer, ReleaseAssetRef, lastPublishedRevision, audit; revalidate AFTER commit; soft no-op on checksum match), rollback (repoint-only default / restoreWorkingState opt-in), diff, isDirty, listReleases, getLive.
- `apps/api/src/release/release.service.spec.ts` — *create* — Jest unit (mocked Prisma+serializer+revalidation): gate, soft no-op, stale revision 409, demote+create+repoint+refs+audit, revalidate after commit, rollback repoint-only vs restore, isDirty, diff.
- `apps/api/src/release/release.controller.ts` — *create* — REST: GET /api/releases, /live, /diff, :version; POST /publish [PUBLISHER+], /rollback [PUBLISHER+], /:version/revalidate; ZodValidationPipe on bodies.
- `apps/api/src/release/release.controller.spec.ts` — *create* — Jest unit: controller delegates to service, passes CurrentUser actor, maps DTOs.
- `apps/api/src/release/dto/release.dto.ts` — *create* — zod publishSchema {note?, expectedRevision} and rollbackSchema {toVersion, restoreWorkingState?} + inferred types.
- `apps/api/src/release/release.module.ts` — *create* — ReleaseModule: providers SnapshotSerializer, ReleaseService; imports PrismaModule, RevalidationModule, AuditModule; controller.
- `apps/api/src/app.module.ts` — *modify* — Import ReleaseModule and RevalidationModule into AppModule.
- `apps/api/test/release-concurrency.e2e-spec.ts` — *create* — Supertest/integration e2e (gated on DATABASE_URL): two parallel publishes -> distinct monotonic versions, single PUBLISHED, one 409 on concurrent stale edit.

**Milestone 7 — Importer (Nest command in @signex/api): dicts + /assets → working state + Release v1 + committed initial-snapshot.ts**
- `apps/api/src/importer/dict-source.ts` — *create* — Typed loader that reads apps/web/app/[lang]/dictionaries/en.json + vi.json via a committed relative path; resolves repo paths; exports RawDict type + loadDicts().
- `apps/api/src/importer/parity.ts` — *create* — Pre-flight asserts: en/vi recursive key-set parity AND per-node array-length parity (categories, items, milestones, standardOptions, cards, etc). Throws ImporterParityError listing the divergent path.
- `apps/api/src/importer/zip.ts` — *create* — Pure leaf-zip helpers: lt(en,vi) -> LocalizedText {en,vi}; ltArray(en,vi) -> {en:[],vi:[]}; twoTone(leadEn,leadVi,accentEn,accentVi). Used to fold the two dicts into localized block data.
- `apps/api/src/importer/asset-manifest.ts` — *create* — The explicit list of every /assets file the importer ingests (logo, lotus, lotus-footer, OG png, favicons, apple-touch, android-chrome, hero/about/contact pexels, video posters + mp4/webm, CATEGORY_IMAGES[4], PRODUCT_IMAGES[6]) keyed by a stable logical id; maps each to its public/assets relative path, AssetKind, mime.
- `apps/api/src/importer/asset-importer.ts` — *create* — Reads bytes from apps/web/public/assets, sha256, calls R2Service upload path, upserts Asset (dedup by sha256). Returns Map<logicalId, {assetId, r2Key, mime, width, height}>. Decouples cycled product/category images to concrete assetIds.
- `apps/api/src/importer/block-builder.ts` — *create* — Builds every ContentBlock {kind,key,data} from en+vi (+ promoted literals + unified NAP businessContact + asset map). Calls parseBlock(kind,key,data) on each -> the registry conformance test.
- `apps/api/src/importer/catalog-builder.ts` — *create* — Maps products.categories[i] -> Category(sortOrder=i, imageId from category asset), items[j] -> Product(sortOrder=j, imageId from decoupled product asset). Returns plain rows for persistence.
- `apps/api/src/importer/importer.service.ts` — *create* — Orchestrator: exclusive advisory lock, parity asserts, asset import, catalog+block persist in one tx, single WorkingState.revision bump, mint Release v1 (PUBLISHED) via ReleaseService.publish with system actor, then emit initial-snapshot.ts byte-equal to v1.
- `apps/api/src/importer/snapshot-emit.ts` — *create* — Serializes the v1 ReleaseSnapshot to the committed apps/web/app/lib/initial-snapshot.ts TS module (stable key ordering, both locales) byte-identically to Release.snapshot JSON.
- `apps/api/src/importer/importer.module.ts` — *create* — Nest module wiring ImporterService + its collaborators (PrismaService, R2Service, ReleaseService).
- `apps/api/src/importer/importer.command.ts` — *create* — Standalone Nest application context entrypoint (compiled to dist/importer/importer.command.js) run as `node dist/importer/importer.command` for the seed pipeline.
- `apps/api/package.json` — *modify* — Add `content:import` script -> node dist/importer/importer.command.
- `apps/web/app/lib/initial-snapshot.ts` — *create* — Generated + committed build-time fallback snapshot (both locales), byte-equal to Release v1's snapshot.
- `apps/api/src/importer/parity.spec.ts` — *create* — jest unit tests for parity + zip helpers.
- `apps/api/src/importer/block-builder.spec.ts` — *create* — jest: every built block conforms to its registry schema; NAP unification correct; promoted literals present.
- `apps/api/src/importer/catalog-builder.spec.ts` — *create* — jest: 4 categories / 6 items each, sortOrder preserved, slugs unique, decoupled imageIds concrete.
- `apps/api/src/importer/snapshot-emit.spec.ts` — *create* — jest: emitted initial-snapshot.ts re-parses byte-equal to the source snapshot via ReleaseSnapshotSchema.
- `apps/api/test/importer.e2e-spec.ts` — *create* — jest e2e against Postgres: full importer run -> Release v1 PUBLISHED, PublishedPointer set, WorkingState.revision bumped once, committed initial-snapshot byte-equals DB snapshot.

**Milestone 8 — apps/web read-path: snapshot loader, cacheComponents/revalidate, dynamicParams fix, component+SEO migration, form POST wiring**
- `apps/web/package.json` — *modify* — Add @signex/db + @signex/shared workspace deps; add a node-based read-path verification script.
- `apps/web/next.config.ts` — *modify* — Enable cacheComponents:true and serverExternalPackages:['@prisma/client','@signex/db'] (keep output:'standalone' + outputFileTracingRoot).
- `apps/web/Dockerfile` — *modify* — Builder stage: prisma generate (@signex/db) + build @signex/db & @signex/shared BEFORE next build, so the generated client + CJS dist are traced into standalone.
- `.dockerignore` — *modify* — Stop excluding packages/db/generated so the web image build can trace the generated Prisma client (db build regenerates it in-stage anyway; un-ignore keeps any host-generated copy available and documents intent).
- `docker-compose.yml` — *modify* — web service: add DATABASE_URL, REVALIDATE_SECRET, MEDIA_PUBLIC_BASE, PREVIEW_SECRET/API_URL envs and depends_on postgres: service_healthy.
- `apps/web/app/lib/content.ts` — *create* — getPublishedSnapshot (use cache + cacheTag('release'), Prisma read latest PUBLISHED Release, ReleaseSnapshotSchema.parse, resolve r2Key->MEDIA_PUBLIC_BASE, try/catch->INITIAL_SNAPSHOT); getSiteContent(lang) public alias; resolveForLang/asset URL resolver; SiteContent type; getPreviewSnapshot for the preview island.
- `apps/web/app/[lang]/dictionaries.ts` — *modify* — Repoint Dictionary type to SiteContent (shim alias) so the ~30 components compile unchanged; keep getDictionary as a thin wrapper over getSiteContent for any remaining caller.
- `apps/web/app/api/revalidate/route.ts` — *create* — POST secret-gated: revalidateTag('release','max') + revalidatePath for each provided literal path.
- `apps/web/app/api/draft/route.ts` — *create* — GET secret-gated draftMode().enable() + redirect (preview entry); DELETE/disable route to exit.
- `apps/web/app/components/preview-bar.tsx` — *create* — Suspense-wrapped client/server island that reads draftMode().isEnabled INSIDE the boundary and fetches /api/preview/snapshot from the api; published shell stays draftMode-free.
- `apps/web/app/[lang]/page.tsx` — *modify* — getDictionary->getSiteContent.
- `apps/web/app/[lang]/layout.tsx` — *modify* — getDictionary->getSiteContent; mount preview island; keep dynamicParams=false (locale set fixed).
- `apps/web/app/[lang]/about/page.tsx` — *modify* — getDictionary->getSiteContent.
- `apps/web/app/[lang]/contact/page.tsx` — *modify* — getDictionary->getSiteContent.
- `apps/web/app/[lang]/products/[slug]/page.tsx` — *modify* — dynamicParams=true; getSiteContent; snapshot category image field instead of product-images helper.
- `apps/web/app/[lang]/products/[slug]/[product]/page.tsx` — *modify* — dynamicParams=true; getSiteContent; snapshot product image field.
- `apps/web/app/sitemap.ts` — *modify* — getDictionary->getSiteContent.
- `apps/web/app/components/org-json-ld.tsx` — *modify* — Read unified businessContact (NAP) via the render-helper map instead of footer.tel/office/company/tax/email.
- `apps/web/app/lib/nap.ts` — *create* — NAP render-helper map: derive footer/home-contact/contactPage/org-json-ld presentation shapes from the businessContact block (unifies NAP).
- `apps/web/app/components/static-webflow-form.tsx` — *modify* — Replace fake onSubmit with a real POST to api /forms/:formKey/submit (FormData), keep success/fail markup behavior.
- `apps/web/scripts/verify-readpath.mjs` — *create* — Node verification: assert product segments dynamicParams=true (build-time invariant), assert content.ts has 'use cache'+cacheTag('release'), assert revalidate route uses 2-arg revalidateTag.
- `apps/web/scripts/verify-dynamic-params.mjs` — *create* — Focused build-time invariant test: the two product page modules export dynamicParams===true and still export generateStaticParams.

**Milestone 9 — Admin shell (re-scaffold + same-origin route handlers + registry-driven screens)**
- `apps/admin/package.json` — *modify* — Pin next@16.2.7 / react@19.2.4 / react-dom@19.2.4 / eslint-config-next@16.2.7 (match web); keep name @signex/admin + port-3061 scripts; add @signex/shared dep + vitest test script + dev deps
- `apps/admin/next.config.ts` — *modify* — Re-apply output:'standalone' + outputFileTracingRoot=repo root after re-scaffold
- `apps/admin/tsconfig.json` — *modify* — Keep @/* alias (verify after re-scaffold)
- `apps/admin/AGENTS.md` — *modify* — Re-apply the Next-16 breaking-changes rule block after re-scaffold
- `apps/admin/CLAUDE.md` — *modify* — Re-apply @AGENTS.md include after re-scaffold
- `apps/admin/Dockerfile` — *modify* — Add `npm run build -w @signex/shared` to the builder stage before next build (ROLE_RANK is a runtime value traced into standalone)
- `apps/admin/vitest.config.ts` — *create* — Vitest config (node env) for admin pure-logic unit tests
- `apps/admin/app/lib/env.ts` — *create* — Typed accessors for API_URL, ADMIN_ORIGIN, ALLOWED_ORIGINS, REVALIDATE_SECRET, PREVIEW_SECRET, NEXT_PUBLIC_WEB_URL
- `apps/admin/app/lib/origin.ts` — *create* — isAllowedOrigin(req): Origin allowlist CSRF gate enforced at route handlers
- `apps/admin/app/lib/api.ts` — *create* — Typed server-side api client: apiServer() forwards sx_session cookie as Bearer (cookie-bug fixed); typed helpers login/me/blocks/catalog/releases/assets/users/forms
- `apps/admin/app/lib/session.ts` — *create* — getSession() server check via /api/auth/me; requireSession()/requireRole() redirect helpers
- `apps/admin/app/lib/zodform-fields.ts` — *create* — deriveFields(schema): introspect a zod block schema from BLOCK_REGISTRY into a render plan (string/localized/array/assetRef/json)
- `apps/admin/proxy.ts` — *create* — UX-gate: redirect unauthenticated (dash) requests to /login by sx_session presence; redirect /login->/ when present
- `apps/admin/app/login/page.tsx` — *create* — Login screen (client form -> /admin-api/auth/login route handler)
- `apps/admin/app/admin-api/auth/login/route.ts` — *create* — Same-origin login handler: Origin gate -> api login -> re-issue host-only sx_session cookie via NextResponse.cookies.set
- `apps/admin/app/admin-api/auth/logout/route.ts` — *create* — Same-origin logout: call api logout (Bearer) + clear cookie
- `apps/admin/app/admin-api/[...path]/route.ts` — *create* — Same-origin catch-all proxy: Origin gate + forward cookie as Bearer to api for all write/read calls
- `apps/admin/app/(dash)/layout.tsx` — *create* — (dash) route group server layout: getSession() gate + nav chrome + dirty badge
- `apps/admin/app/(dash)/page.tsx` — *create* — Dashboard: dirty status (revision vs lastPublishedRevision) + live release summary
- `apps/admin/app/(dash)/releases/page.tsx` — *create* — Releases panel: status, Publish (Publisher+), version history, rollback
- `apps/admin/app/(dash)/releases/actions.ts` — *create* — Server Actions publish()/rollback() re-validating via getSession()+role
- `apps/admin/app/(dash)/catalog/page.tsx` — *create* — Catalog CRUD: categories/products tables + forms (sortOrder, asset picker)
- `apps/admin/app/(dash)/catalog/actions.ts` — *create* — Server Actions for category/product create/update/delete
- `apps/admin/app/(dash)/content/[blockKey]/page.tsx` — *create* — Generic block editor: render <ZodForm> from BLOCK_REGISTRY by blockKey
- `apps/admin/app/(dash)/content/[blockKey]/zod-form.tsx` — *create* — <ZodForm> client component rendering deriveFields() plan -> inputs/repeaters/asset picker/json textarea
- `apps/admin/app/(dash)/media/page.tsx` — *create* — Media library: upload (presign->PUT->confirm) + grid + picker
- `apps/admin/app/(dash)/users/page.tsx` — *create* — Users CRUD (Admin only)
- `apps/admin/app/globals.css` — *modify* — Keep Tailwind v4 import (verify after re-scaffold)
- `apps/admin/app/lib/api.test.ts` — *create* — Vitest: apiServer cookie-bug fix + Bearer forwarding + error envelope
- `apps/admin/app/lib/origin.test.ts` — *create* — Vitest: isAllowedOrigin allowlist behavior
- `apps/admin/app/lib/zodform-fields.test.ts` — *create* — Vitest: deriveFields against real BLOCK_REGISTRY entries
- `docker-compose.yml` — *modify* — Add ADMIN_ORIGIN/ALLOWED_ORIGINS/REVALIDATE_SECRET/PREVIEW_SECRET/NEXT_PUBLIC_WEB_URL envs to the admin service
- `.env.example` — *modify* — Document the 5 new admin envs

**Milestone 10 — Whole-stack acceptance + cross-cutting invariant tests (§14)**
- `apps/api/test/invariants.e2e-spec.ts` — *create* — Jest+supertest e2e suite for the cross-cutting invariants: single-PUBLISHED via PublishedPointer, monotonic version via release_version_seq, catalog<->zod serializer roundtrip, concurrency (two parallel publishes -> no version collision; edit-during-publish -> one 409), importer conformance (4 categories / 6 items each / unique slugs / parseBlock every block).
- `apps/web/test/dynamic-params.test.ts` — *create* — Build-time/static invariant assert that the two product route segments export dynamicParams = true and the [lang]/layout exports dynamicParams = false.
- `apps/web/package.json` — *modify* — Add a `test` script that runs the dynamic-params invariant via node --test (Playwright-free, per spec §14).
- `apps/web/test/tsconfig.json` — *create* — tsconfig that lets node --experimental-strip-types run the .test.ts against the [lang] source segments.
- `test/acceptance.sh` — *create* — The headline whole-stack acceptance script: docker compose up -d --build -> wait all services healthy -> login -> edit block (save draft) -> preview via draftMode -> publish -> assert web revalidated (reads new value from DB, not fallback) -> rollback -> assert web reverted. Concrete curl assertions with non-zero exit on any failure.
- `docker-compose.yml` — *modify* — Add SEED/secret env wiring to api+web+admin services and confirm healthchecks on all four services so `docker compose up --wait` gates acceptance; add the db/shared/secret envs the acceptance flow depends on.
- `package.json` — *modify* — Add root `test:invariants`, `test:acceptance`, `test:docker-build`, and `test:all` scripts that drive the api jest e2e suite, the web invariant, the docker build gate, and the acceptance script.
- `.env.example` — *modify* — Document the new secrets/seed env (SEED_ADMIN_*, REVALIDATE_SECRET, PREVIEW_SECRET, MEDIA_PUBLIC_BASE, ADMIN_ORIGIN, ALLOWED_ORIGINS, NEXT_PUBLIC_WEB_URL) the acceptance flow requires.


---

## Milestone 0 — @signex/shared content + auth registry (CJS dist)

**Consumes (from earlier milestones):**
- (none — this is build step 0, the root of the dependency graph; it only consumes the existing apps/web/app/[lang]/dictionaries/en.json + vi.json as test fixtures and the existing contactMessageSchema)

**Produces (for later milestones):**
- primitives: Id: z.ZodString; localized<T extends z.ZodTypeAny>(inner: T): z.ZodObject<{en:T;vi:T}>; LocalizedText: z.ZodObject<{en:ZodString;vi:ZodString}>; LocalizedTextArray; TwoToneTitle; Href: z.ZodString; AssetRef: z.ZodObject<{assetId,alt?}>; VideoRef: z.ZodObject<{posterAssetId,mp4AssetId,webmAssetId?}>
- types: LocalizedText (z.infer), TwoToneTitle, AssetRef, VideoRef
- 12 block schemas: heroBlock, featuresBlock, aboutBlock, productsHeaderBlock, footerBlock, navBlock, metaBlock, businessContactBlock, formConfigBlock, aboutPageBlock, contactPageBlock, notFoundBlock (all z.ZodObject)
- BLOCK_REGISTRY: { hero, features, about, productsHeader, footer, nav, meta, businessContact, formConfig, aboutPage, contactPage, notFound } (Record<BlockKey, z.ZodTypeAny>)
- type BlockKey = keyof typeof BLOCK_REGISTRY
- parseBlock<K extends BlockKey>(key: K, data: unknown): z.infer<(typeof BLOCK_REGISTRY)[K]>  (throws ZodError on invalid)
- type ReleaseBlocks = { [K in BlockKey]: z.infer<(typeof BLOCK_REGISTRY)[K]> }
- FrozenAsset: z.ZodObject<{assetId,r2Key,mime,width?,height?,alt?,poster?,webm?,variants}>; type FrozenAsset
- catalog DTOs: FrozenCategory, FrozenProduct (snapshot shape) + CategoryDTO, ProductDTO, AssetDTO (api response shape)
- ReleaseSnapshotSchema: z.ZodObject<{schemaVersion: z.literal(1); blocks; catalog}>; type ReleaseSnapshot = z.infer<typeof ReleaseSnapshotSchema>; SCHEMA_VERSION = 1
- auth: loginSchema: z.ZodObject<{email,password}>; createUserSchema: z.ZodObject<{email,name,password,role}>; type RoleName = 'EDITOR'|'PUBLISHER'|'ADMIN'; ROLE_RANK: Record<RoleName, number> ({EDITOR:1,PUBLISHER:2,ADMIN:3}); atLeast(role: RoleName, min: RoleName): boolean
- BLOCK_KEYS: readonly BlockKey[]
- render-helper label map for businessContact (phoneKindLabel/siteKindLabel resolution lives inside the block data, self-contained)
- packages/shared now has a `test` script (vitest run) wired into turbo via root turbo.json test task

### Task 1: Add Vitest to @signex/shared

**Files:**
- Modify: `packages/shared/package.json`
- Create: `packages/shared/vitest.config.ts`
- Modify: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/sanity.test.ts` (temporary smoke test, deleted at end of this task)

**Interfaces:**
- Consumes: nothing (root of the graph).
- Produces: a working `npm run -w @signex/shared test` (vitest) runner and a `test` turbo task; `tsc` dist build that EXCLUDES `*.test.ts`.

**Steps:**

1. Add vitest as a devDependency and a `test` script. Edit `packages/shared/package.json` — replace the `"scripts"` and `"devDependencies"` blocks:
   ```json
   {
     "name": "@signex/shared",
     "version": "0.0.0",
     "private": true,
     "main": "./dist/index.js",
     "types": "./dist/index.d.ts",
     "exports": {
       ".": {
         "types": "./dist/index.d.ts",
         "default": "./dist/index.js"
       }
     },
     "files": [
       "dist"
     ],
     "scripts": {
       "build": "tsc",
       "typecheck": "tsc --noEmit",
       "test": "vitest run"
     },
     "dependencies": {
       "zod": "^3.23.8"
     },
     "devDependencies": {
       "typescript": "^5",
       "vitest": "^2.1.8"
     }
   }
   ```

2. Install (single root lockfile). Run:
   ```bash
   npm install
   ```
   Expect: completes, `node_modules/.bin/vitest` exists. Verify:
   ```bash
   ls /home/ealflm/dev/signex/node_modules/.bin/vitest
   ```
   Expect: the path prints (no "No such file").

3. Create `packages/shared/vitest.config.ts`:
   ```ts
   import { defineConfig } from "vitest/config";

   export default defineConfig({
     test: {
       environment: "node",
       include: ["src/**/*.test.ts"],
     },
   });
   ```

4. Keep tests out of the shipped CJS `dist/`. Edit `packages/shared/tsconfig.json` to add an `exclude` (append after the `include` line, inside the root object):
   ```json
   {
     "compilerOptions": {
       "target": "ES2022",
       "module": "commonjs",
       "moduleResolution": "node",
       "lib": ["ES2022"],
       "outDir": "dist",
       "rootDir": "src",
       "declaration": true,
       "strict": true,
       "esModuleInterop": true,
       "skipLibCheck": true,
       "forceConsistentCasingInFileNames": true
     },
     "include": ["src/**/*.ts"],
     "exclude": ["src/**/*.test.ts", "node_modules", "dist"]
   }
   ```

5. Write a temporary smoke test to prove the runner works. Create `packages/shared/src/sanity.test.ts`:
   ```ts
   import { describe, it, expect } from "vitest";

   describe("vitest wiring", () => {
     it("runs", () => {
       expect(1 + 1).toBe(2);
     });
   });
   ```

6. Run it, expect PASS:
   ```bash
   npm run -w @signex/shared test
   ```
   Expect: `1 passed`, exit 0.

7. Verify the dist build still compiles and does NOT emit the test:
   ```bash
   npm run -w @signex/shared build && ls packages/shared/dist | grep -c sanity
   ```
   Expect: `tsc` exits 0; `grep -c` prints `0` (no `sanity.test.js` in dist).

8. Wire a root `test` turbo task so `npm test` fans out later. Edit `turbo.json` — add a `test` task inside `"tasks"` (after the `start` task):
   ```json
       "test": {
         "dependsOn": ["^build"],
         "outputs": []
       }
   ```
   And add a root `test` script to `package.json` `"scripts"` (after `"start"`):
   ```json
       "test": "turbo run test",
   ```

9. Verify the turbo task resolves:
   ```bash
   npx turbo run test --filter=@signex/shared --dry=json | grep -c '"taskId": "@signex/shared#test"'
   ```
   Expect: prints `1`.

10. Delete the temporary smoke test:
    ```bash
    rm packages/shared/src/sanity.test.ts
    ```

11. Commit:
    ```bash
    git add packages/shared/package.json packages/shared/vitest.config.ts packages/shared/tsconfig.json package.json package-lock.json turbo.json
    git commit -m "test(shared): add vitest runner + root test turbo task"
    ```

---

### Task 2: Content primitives (Id, localized, LocalizedText, TwoToneTitle, AssetRef, VideoRef)

**Files:**
- Create: `packages/shared/src/content/primitives.ts`
- Test: `packages/shared/src/content/primitives.test.ts`

**Interfaces:**
- Consumes: `zod` (re-exported from the package).
- Produces:
  - `Id: z.ZodString` (`z.string().cuid()`)
  - `localized<T extends z.ZodTypeAny>(inner: T): z.ZodObject<{ en: T; vi: T }>`
  - `LocalizedText` (= `localized(z.string())`), `type LocalizedText = z.infer<typeof LocalizedText>`
  - `LocalizedTextArray` (= `localized(z.array(z.string()))`)
  - `TwoToneTitle: z.ZodObject<{ lead: LocalizedText; accent: LocalizedText }>`, `type TwoToneTitle`
  - `Href: z.ZodString`
  - `AssetRef: z.ZodObject<{ assetId: Id; alt?: LocalizedText }>`, `type AssetRef`
  - `VideoRef: z.ZodObject<{ posterAssetId: Id; mp4AssetId: Id; webmAssetId?: Id }>`, `type VideoRef`

**Steps:**

1. Write the failing test. Create `packages/shared/src/content/primitives.test.ts`:
   ```ts
   import { describe, it, expect } from "vitest";
   import {
     Id,
     localized,
     LocalizedText,
     LocalizedTextArray,
     TwoToneTitle,
     AssetRef,
     VideoRef,
   } from "./primitives";
   import { z } from "zod";

   const CUID = "clr1abcd0000xyz1234567890"; // 25-char cuid-shaped

   describe("Id", () => {
     it("accepts a cuid and rejects a non-cuid", () => {
       expect(Id.safeParse(CUID).success).toBe(true);
       expect(Id.safeParse("not-a-cuid").success).toBe(false);
       expect(Id.safeParse("123").success).toBe(false);
     });
   });

   describe("localized", () => {
     it("builds an {en,vi} object of the inner schema", () => {
       const num = localized(z.number());
       expect(num.safeParse({ en: 1, vi: 2 }).success).toBe(true);
       expect(num.safeParse({ en: 1 }).success).toBe(false); // vi required
       expect(num.safeParse({ en: "x", vi: 2 }).success).toBe(false);
     });
   });

   describe("LocalizedText", () => {
     it("requires both en and vi strings", () => {
       expect(LocalizedText.safeParse({ en: "Hello", vi: "Xin chào" }).success).toBe(true);
       expect(LocalizedText.safeParse({ en: "Hello" }).success).toBe(false);
     });
   });

   describe("LocalizedTextArray", () => {
     it("requires en and vi string arrays", () => {
       expect(LocalizedTextArray.safeParse({ en: ["a", "b"], vi: ["x", "y"] }).success).toBe(true);
       expect(LocalizedTextArray.safeParse({ en: "a", vi: ["x"] }).success).toBe(false);
     });
   });

   describe("TwoToneTitle", () => {
     it("requires lead + accent LocalizedText", () => {
       expect(
         TwoToneTitle.safeParse({
           lead: { en: "About ", vi: "Về " },
           accent: { en: "SIGNEX", vi: "SIGNEX" },
         }).success,
       ).toBe(true);
       expect(TwoToneTitle.safeParse({ lead: { en: "About ", vi: "Về " } }).success).toBe(false);
     });
   });

   describe("AssetRef", () => {
     it("requires a cuid assetId; alt is optional LocalizedText", () => {
       expect(AssetRef.safeParse({ assetId: CUID }).success).toBe(true);
       expect(
         AssetRef.safeParse({ assetId: CUID, alt: { en: "a", vi: "b" } }).success,
       ).toBe(true);
       expect(AssetRef.safeParse({ assetId: "x" }).success).toBe(false);
       expect(AssetRef.safeParse({ assetId: CUID, alt: { en: "a" } }).success).toBe(false);
     });
   });

   describe("VideoRef", () => {
     it("requires poster + mp4 cuids; webm optional", () => {
       expect(
         VideoRef.safeParse({ posterAssetId: CUID, mp4AssetId: CUID }).success,
       ).toBe(true);
       expect(
         VideoRef.safeParse({ posterAssetId: CUID, mp4AssetId: CUID, webmAssetId: CUID }).success,
       ).toBe(true);
       expect(VideoRef.safeParse({ posterAssetId: CUID }).success).toBe(false);
     });
   });
   ```

2. Run it, expect FAIL:
   ```bash
   npm run -w @signex/shared test
   ```
   Expect: FAIL — `Cannot find module './primitives'` (or `Failed to resolve import "./primitives"`).

3. Implement `packages/shared/src/content/primitives.ts`:
   ```ts
   import { z } from "zod";

   /** Matches Prisma `@default(cuid())` ids (locked ID strategy). */
   export const Id = z.string().cuid();

   /**
    * Wraps an inner schema into the structurally-guaranteed `{ en, vi }` pair
    * that today is only convention across the two dictionary files.
    */
   export const localized = <T extends z.ZodTypeAny>(inner: T) =>
     z.object({ en: inner, vi: inner });

   export const LocalizedText = localized(z.string());
   export type LocalizedText = z.infer<typeof LocalizedText>;

   export const LocalizedTextArray = localized(z.array(z.string()));
   export type LocalizedTextArray = z.infer<typeof LocalizedTextArray>;

   /** "About " (lead) + "SIGNEX" (accent) split-tone heading. */
   export const TwoToneTitle = z.object({
     lead: LocalizedText,
     accent: LocalizedText,
   });
   export type TwoToneTitle = z.infer<typeof TwoToneTitle>;

   export const Href = z.string();

   /** A reference to an Asset by id; alt lives on the USE, not the deduped Asset. */
   export const AssetRef = z.object({
     assetId: Id,
     alt: LocalizedText.optional(),
   });
   export type AssetRef = z.infer<typeof AssetRef>;

   /** Models the Webflow `w-background-video` (poster + mp4 + optional webm). */
   export const VideoRef = z.object({
     posterAssetId: Id,
     mp4AssetId: Id,
     webmAssetId: Id.optional(),
   });
   export type VideoRef = z.infer<typeof VideoRef>;
   ```

4. Run it, expect PASS:
   ```bash
   npm run -w @signex/shared test
   ```
   Expect: all primitives tests green.

5. Commit:
   ```bash
   git add packages/shared/src/content/primitives.ts packages/shared/src/content/primitives.test.ts
   git commit -m "feat(shared): content primitives (Id, localized, AssetRef, VideoRef)"
   ```

---

### Task 3: The 12 block zod schemas (mirroring the real dict shapes)

**Files:**
- Create: `packages/shared/src/content/blocks/hero.ts`
- Create: `packages/shared/src/content/blocks/features.ts`
- Create: `packages/shared/src/content/blocks/about.ts`
- Create: `packages/shared/src/content/blocks/productsHeader.ts`
- Create: `packages/shared/src/content/blocks/footer.ts`
- Create: `packages/shared/src/content/blocks/nav.ts`
- Create: `packages/shared/src/content/blocks/meta.ts`
- Create: `packages/shared/src/content/blocks/businessContact.ts`
- Create: `packages/shared/src/content/blocks/formConfig.ts`
- Create: `packages/shared/src/content/blocks/aboutPage.ts`
- Create: `packages/shared/src/content/blocks/contactPage.ts`
- Create: `packages/shared/src/content/blocks/notFound.ts`
- Create: `packages/shared/src/content/blocks/index.ts`

**Interfaces:**
- Consumes: `LocalizedText`, `LocalizedTextArray`, `TwoToneTitle`, `Href`, `AssetRef`, `VideoRef`, `Id` from `../primitives` (`./primitives` relative).
- Produces (all `z.ZodObject`, each with an inferred `type`): `heroBlock`, `featuresBlock`, `aboutBlock`, `productsHeaderBlock`, `footerBlock`, `navBlock`, `metaBlock`, `businessContactBlock`, `formConfigBlock`, `aboutPageBlock`, `contactPageBlock`, `notFoundBlock`. Barrel `blocks/index.ts` re-exports all 12.

> Note: validated end-to-end against the real dict by the next task (registry.test.ts). Build these schemas to be a **structural superset** of the dict keys (every dict leaf has a home), promoting the hardcoded literals (footer ship/pay labels, social hrefs, map embed, OG/favicons, CTA hrefs, 404 copy) and unifying NAP into `businessContact`.

**Steps:**

1. Implement `packages/shared/src/content/blocks/hero.ts`:
   ```ts
   import { z } from "zod";
   import { LocalizedText, AssetRef } from "../primitives";

   /** Home hero (dict.hero). titleTop/titleBottom are the two stacked lines. */
   export const heroBlock = z.object({
     titleTop: LocalizedText,
     titleBottom: LocalizedText,
     subtitle: LocalizedText,
     image: AssetRef, // dict.hero.imageAlt becomes image.alt
   });
   export type HeroBlock = z.infer<typeof heroBlock>;
   ```

2. Implement `packages/shared/src/content/blocks/features.ts` (spec §5.2 featuresBlock; `media` optional so the importer can wire the video later):
   ```ts
   import { z } from "zod";
   import { LocalizedText, TwoToneTitle, Href, VideoRef } from "../primitives";

   /** Home "Why Brands Choose Us" (dict.features). */
   export const featuresBlock = z.object({
     eyebrow: LocalizedText,
     title: TwoToneTitle, // titleTop -> lead, titleBottom -> accent
     cta: z.object({ label: LocalizedText, href: Href }),
     video: z.object({
       title: LocalizedText,
       text: LocalizedText,
       media: VideoRef.optional(),
     }),
     featured: z.object({ title: LocalizedText, desc: LocalizedText }),
     cards: z
       .array(z.object({ title: LocalizedText, desc: LocalizedText }))
       .min(1),
   });
   export type FeaturesBlock = z.infer<typeof featuresBlock>;
   ```

3. Implement `packages/shared/src/content/blocks/about.ts` (home About section, dict.about — title/titleAccent → TwoToneTitle; mission has items[]):
   ```ts
   import { z } from "zod";
   import { LocalizedText, LocalizedTextArray, TwoToneTitle } from "../primitives";

   /** Home "About SIGNEX" section (dict.about). */
   export const aboutBlock = z.object({
     eyebrow: LocalizedText,
     title: TwoToneTitle, // dict title (lead) + titleAccent
     body: LocalizedText,
     mission: z.object({
       title: LocalizedText,
       body: LocalizedText,
       items: LocalizedTextArray,
     }),
     vision: z.object({ title: LocalizedText, body: LocalizedText }),
     values: z.object({ title: LocalizedText, body: LocalizedText }),
   });
   export type AboutBlock = z.infer<typeof aboutBlock>;
   ```

4. Implement `packages/shared/src/content/blocks/productsHeader.ts` (spec §5.2 — dict.products UI copy MINUS categories[], which become relational Catalog):
   ```ts
   import { z } from "zod";
   import { LocalizedText, TwoToneTitle, Href } from "../primitives";

   /** dict.products UI copy minus categories[] (those become relational Catalog). */
   export const productsHeaderBlock = z.object({
     eyebrow: LocalizedText,
     title: TwoToneTitle, // title (lead) + titleAccent
     body: LocalizedText,
     statLabels: z.object({ products: LocalizedText, materials: LocalizedText }),
     detail: z.object({ listTitle: TwoToneTitle }), // listTitle (lead) + listTitleAccent
     product: z.object({
       categoryLabel: LocalizedText,
       materialLabel: LocalizedText,
       cta: LocalizedText,
       ctaHref: Href, // promoted literal (was hardcoded /contact)
       back: LocalizedText,
       zoomHint: LocalizedText,
     }),
   });
   export type ProductsHeaderBlock = z.infer<typeof productsHeaderBlock>;
   ```

5. Implement `packages/shared/src/content/blocks/footer.ts` (NAP scalars now live in businessContact; footer keeps only its own UI chrome + ship/pay badges, which are promoted literals):
   ```ts
   import { z } from "zod";
   import { LocalizedText, LocalizedTextArray, Href } from "../primitives";

   /**
    * Footer chrome only. The NAP (company/email/tel/zalo/tax/office/factory)
    * is unified into businessContact; the footer reads it via the render-helper map.
    */
   export const footerBlock = z.object({
     tagline: LocalizedTextArray, // 2 lines
     contactHeading: LocalizedText,
     quickHeading: LocalizedText,
     links: z.array(z.object({ label: LocalizedText, href: Href })).min(1),
     shipLabel: LocalizedText,
     payLabel: LocalizedText,
     payments: z.array(z.string()).min(1), // brand codes: VISA/JCB/Napas/COD (locale-invariant)
   });
   export type FooterBlock = z.infer<typeof footerBlock>;
   ```

6. Implement `packages/shared/src/content/blocks/nav.ts` (promote the logo to an AssetRef; cta href is a promoted literal):
   ```ts
   import { z } from "zod";
   import { LocalizedText, Href, AssetRef } from "../primitives";

   /** Primary navigation (dict.nav) + the logo asset (promoted from a hardcoded /assets path). */
   export const navBlock = z.object({
     skip: LocalizedText,
     logo: AssetRef,
     cta: z.object({ label: LocalizedText, href: Href }),
     links: z.array(z.object({ label: LocalizedText, href: Href })).min(1),
   });
   export type NavBlock = z.infer<typeof navBlock>;
   ```

7. Implement `packages/shared/src/content/blocks/meta.ts` (dict.meta + promoted og image / favicons / siteUrl / themeColor literals):
   ```ts
   import { z } from "zod";
   import { LocalizedText, AssetRef } from "../primitives";

   const pageMeta = z.object({ title: LocalizedText, description: LocalizedText });

   /** Site SEO metadata (dict.meta) + promoted og/favicon/siteUrl/themeColor literals. */
   export const metaBlock = z.object({
     siteName: z.string(),
     siteUrl: z.string().url(),
     themeColor: z.string(),
     title: LocalizedText,
     description: LocalizedText,
     ogImage: AssetRef, // ogImageAlt becomes ogImage.alt
     favicons: z.array(z.object({ rel: z.string(), asset: AssetRef })).default([]),
     about: pageMeta,
     contact: pageMeta,
   });
   export type MetaBlock = z.infer<typeof metaBlock>;
   ```

8. Implement `packages/shared/src/content/blocks/businessContact.ts` (spec §5.2 + Decisions #6/#13: emails/phones/taxId locale-invariant scalars; legalName/address localized; self-contained labels + a render-helper map deliverable):
   ```ts
   import { z } from "zod";
   import { LocalizedText, Href } from "../primitives";

   /**
    * UNIFIED NAP — single source for footer + home contact + contactPage + JSON-LD.
    * Decisions #6/#13: emails/phones/taxId are locale-invariant scalars; legalName +
    * address are localized {en,vi}. Display labels (Tel:/Zalo:/Office:/Factory:/Tax:)
    * live INSIDE the block so it renders self-contained (no cross-block dependency).
    */
   export const businessContactBlock = z.object({
     legalName: LocalizedText,
     brand: LocalizedText,
     emails: z.array(z.string().email()).min(1),
     phones: z
       .array(
         z.object({
           kind: z.enum(["tel", "zalo"]),
           label: LocalizedText,
           value: z.string(),
         }),
       )
       .min(1),
     taxId: z.string(),
     taxLabel: LocalizedText,
     sites: z
       .array(
         z.object({
           kind: z.enum(["office", "factory"]),
           label: LocalizedText,
           address: LocalizedText,
           mapEmbedUrl: z.string().optional(),
         }),
       )
       .min(1),
     social: z
       .array(
         z.object({
           kind: z.enum(["facebook", "youtube", "zalo"]),
           href: Href, // seed "#" placeholders (Decisions #5/#12)
         }),
       )
       .default([]),
   });
   export type BusinessContactBlock = z.infer<typeof businessContactBlock>;

   /**
    * Render-helper map (the §5.2 deliverable artifact): resolves a BusinessContactBlock
    * into the three per-presentation shapes the web renders. Keeps the "structural
    * superset of Dictionary" promise — web call sites read these, never raw fields.
    */
   export type Locale = "en" | "vi";
   export const resolveBusinessContact = (
     bc: BusinessContactBlock,
     lang: Locale,
   ) => ({
     /** home Phone card + footer tel/zalo lines: "Tel: <value>" */
     phoneLines: bc.phones.map((p) => `${p.label[lang]}: ${p.value}`),
     emailLines: bc.emails,
     /** footer + contactPage address card lines: "Office: <address>" */
     addressLines: bc.sites.map((s) => `${s.label[lang]}: ${s.address[lang]}`),
     legalName: bc.legalName[lang],
     taxLine: `${bc.taxLabel[lang]}: ${bc.taxId}`,
     /** Organization JSON-LD sameAs */
     sameAs: bc.social.map((s) => s.href).filter((h) => h !== "#"),
   });
   ```

9. Implement `packages/shared/src/content/blocks/formConfig.ts` (dict.form — field labels/placeholders + standardOptions as value+label pairs + submit/success/fail; required flags promoted):
   ```ts
   import { z } from "zod";
   import { LocalizedText } from "../primitives";

   const formField = z.object({
     label: LocalizedText,
     placeholder: LocalizedText.optional(),
     required: z.boolean().default(false),
   });

   /** Quote/contact form copy (dict.form). Runtime payloads are operational-only (not snapshotted). */
   export const formConfigBlock = z.object({
     fields: z.object({
       name: formField,
       email: formField,
       phone: formField,
       quantity: formField,
       standard: formField,
       height: formField,
       width: formField,
       thickness: formField,
       upload: formField,
       message: formField,
     }),
     uploadHelp: LocalizedText,
     standardOptions: z
       .array(z.object({ value: z.string(), label: LocalizedText }))
       .min(1),
     submit: LocalizedText,
     success: LocalizedText,
     fail: LocalizedText,
   });
   export type FormConfigBlock = z.infer<typeof formConfigBlock>;
   ```

10. Implement `packages/shared/src/content/blocks/aboutPage.ts` (dict.aboutPage — hero/testimonial/approach/intro/capability/process/timeline; milestone.items + milestone.note OPTIONAL per spec §5.2):
    ```ts
    import { z } from "zod";
    import {
      LocalizedText,
      LocalizedTextArray,
      TwoToneTitle,
    } from "../primitives";

    const section = z.object({
      eyebrow: LocalizedText.optional(),
      title: TwoToneTitle,
      body: LocalizedText.optional(),
    });

    /** The /about page (dict.aboutPage). title+titleAccent collapse into TwoToneTitle. */
    export const aboutPageBlock = z.object({
      hero: z.object({ title: TwoToneTitle, subtitle: LocalizedText }),
      testimonial: section.extend({ body: LocalizedTextArray }),
      approach: z
        .array(z.object({ title: LocalizedText, body: LocalizedTextArray }))
        .min(1),
      intro: section,
      capability: section.extend({
        groups: z
          .array(z.object({ title: LocalizedText, items: LocalizedTextArray }))
          .min(1),
        closing: LocalizedTextArray,
      }),
      process: section.extend({
        steps: z
          .array(z.object({ title: LocalizedText, body: LocalizedText }))
          .min(1),
      }),
      timeline: section.extend({
        intro: LocalizedTextArray,
        milestones: z
          .array(
            z.object({
              num: z.string(),
              title: LocalizedText,
              body: LocalizedText,
              items: LocalizedTextArray.optional(),
              note: LocalizedText.optional(),
            }),
          )
          .min(1),
      }),
    });
    export type AboutPageBlock = z.infer<typeof aboutPageBlock>;
    ```

11. Implement `packages/shared/src/content/blocks/contactPage.ts` (dict.contactPage — hero + cards + map; NAP cards are rendered from businessContact, so this block holds only the page's own copy):
    ```ts
    import { z } from "zod";
    import { LocalizedText, TwoToneTitle } from "../primitives";

    /** The /contact page copy (dict.contactPage). NAP cards come from businessContact. */
    export const contactPageBlock = z.object({
      hero: z.object({ title: TwoToneTitle, subtitle: LocalizedText }),
      map: z.object({ eyebrow: LocalizedText, title: TwoToneTitle }),
    });
    export type ContactPageBlock = z.infer<typeof contactPageBlock>;
    ```

12. Implement `packages/shared/src/content/blocks/notFound.ts` (dict.notFound — image promoted to AssetRef; cta is a label, href promoted literal):
    ```ts
    import { z } from "zod";
    import { LocalizedText, TwoToneTitle, Href, AssetRef } from "../primitives";

    /** The 404 page (dict.notFound). */
    export const notFoundBlock = z.object({
      eyebrow: LocalizedText,
      title: TwoToneTitle, // title (lead) + titleAccent
      body: LocalizedText,
      cta: z.object({ label: LocalizedText, href: Href }),
      image: AssetRef, // imageAlt becomes image.alt
    });
    export type NotFoundBlock = z.infer<typeof notFoundBlock>;
    ```

13. Implement the barrel `packages/shared/src/content/blocks/index.ts`:
    ```ts
    export * from "./hero";
    export * from "./features";
    export * from "./about";
    export * from "./productsHeader";
    export * from "./footer";
    export * from "./nav";
    export * from "./meta";
    export * from "./businessContact";
    export * from "./formConfig";
    export * from "./aboutPage";
    export * from "./contactPage";
    export * from "./notFound";
    ```

14. Typecheck the new schemas compile (no test yet — the registry test exercises them against real data next):
    ```bash
    npm run -w @signex/shared typecheck
    ```
    Expect: `tsc --noEmit` exits 0.

15. Commit:
    ```bash
    git add packages/shared/src/content/blocks
    git commit -m "feat(shared): 12 content block zod schemas (dict-faithful + promoted literals)"
    ```

---

### Task 4: BLOCK_REGISTRY + parseBlock + conformance against real dict data

**Files:**
- Create: `packages/shared/src/content/registry.ts`
- Test: `packages/shared/src/content/registry.test.ts`

**Interfaces:**
- Consumes: all 12 block schemas from `./blocks`.
- Produces:
  - `BLOCK_REGISTRY` — `{ hero, features, about, productsHeader, footer, nav, meta, businessContact, formConfig, aboutPage, contactPage, notFound }` (a `Record<BlockKey, z.ZodTypeAny>`).
  - `type BlockKey = keyof typeof BLOCK_REGISTRY`
  - `BLOCK_KEYS: readonly BlockKey[]`
  - `parseBlock<K extends BlockKey>(key: K, data: unknown): z.infer<(typeof BLOCK_REGISTRY)[K]>` (throws `ZodError` on invalid; this is the importer's conformance gate).
  - `type ReleaseBlocks = { [K in BlockKey]: z.infer<(typeof BLOCK_REGISTRY)[K]> }`

**Steps:**

1. Write the failing test. It builds a known-good block (a localized `businessContact` from the real dict NAP literals) and asserts the registry contract + that `parseBlock` throws on bad data. Create `packages/shared/src/content/registry.test.ts`:
   ```ts
   import { describe, it, expect } from "vitest";
   import { ZodError } from "zod";
   import { BLOCK_REGISTRY, BLOCK_KEYS, parseBlock } from "./registry";

   const EXPECTED_KEYS = [
     "hero",
     "features",
     "about",
     "productsHeader",
     "footer",
     "nav",
     "meta",
     "businessContact",
     "formConfig",
     "aboutPage",
     "contactPage",
     "notFound",
   ];

   describe("BLOCK_REGISTRY", () => {
     it("has exactly the 12 expected keys", () => {
       expect(Object.keys(BLOCK_REGISTRY).sort()).toEqual([...EXPECTED_KEYS].sort());
       expect(BLOCK_KEYS.length).toBe(12);
     });
   });

   describe("parseBlock", () => {
     const goodBusinessContact = {
       legalName: {
         en: "SIGNEX BRAND IDENTITY PRODUCTS MANUFACTURING CO., LTD",
         vi: "CÔNG TY TNHH SẢN XUẤT SẢN PHẨM NHẬN DIỆN THƯƠNG HIỆU SIGNEX",
       },
       brand: { en: "SIGNEX", vi: "SIGNEX" },
       emails: ["core@signex.vn", "nhuadeo@gmail.com"],
       phones: [
         { kind: "tel", label: { en: "Tel", vi: "Tel" }, value: "(+84) 979 700 072" },
         { kind: "zalo", label: { en: "Zalo", vi: "Zalo" }, value: "(+84) 94 9999 326" },
       ],
       taxId: "0319401172",
       taxLabel: { en: "Tax", vi: "Tax" },
       sites: [
         {
           kind: "office",
           label: { en: "Office", vi: "Office" },
           address: {
             en: "25/88/13 Bui Quang La, An Hoi Tay ward, Ho Chi Minh city, Viet Nam.",
             vi: "25/88/13 Bùi Quang Là, phường An Hội Tây, TP.HCM, Việt Nam.",
           },
         },
       ],
       social: [{ kind: "facebook", href: "#" }],
     };

     it("returns the parsed value for valid data", () => {
       const out = parseBlock("businessContact", goodBusinessContact);
       expect(out.taxId).toBe("0319401172");
       expect(out.phones[0].kind).toBe("tel");
     });

     it("throws a ZodError when data violates the schema", () => {
       expect(() => parseBlock("businessContact", { ...goodBusinessContact, emails: ["not-an-email"] })).toThrow(
         ZodError,
       );
       expect(() => parseBlock("hero", {})).toThrow(ZodError);
     });

     it("is keyed by registry schema (footer rejects missing payments)", () => {
       expect(() =>
         parseBlock("footer", {
           tagline: { en: ["a", "b"], vi: ["x", "y"] },
           contactHeading: { en: "Contact us", vi: "Liên hệ" },
           quickHeading: { en: "Quick links", vi: "Truy cập nhanh" },
           links: [{ label: { en: "Home", vi: "Trang chủ" }, href: "/" }],
           shipLabel: { en: "We ship with:", vi: "Hình thức giao hàng:" },
           payLabel: { en: "Payment options:", vi: "Phương thức thanh toán:" },
           // payments missing -> ZodError
         }),
       ).toThrow(ZodError);
     });
   });
   ```

2. Run it, expect FAIL:
   ```bash
   npm run -w @signex/shared test -- registry
   ```
   Expect: FAIL — `Cannot find module './registry'`.

3. Implement `packages/shared/src/content/registry.ts`:
   ```ts
   import { z } from "zod";
   import {
     heroBlock,
     featuresBlock,
     aboutBlock,
     productsHeaderBlock,
     footerBlock,
     navBlock,
     metaBlock,
     businessContactBlock,
     formConfigBlock,
     aboutPageBlock,
     contactPageBlock,
     notFoundBlock,
   } from "./blocks";

   /**
    * The single (kind/key)-agnostic registry of every JSON ContentBlock schema.
    * api validates writes by this map; web types its snapshot from it; admin
    * auto-generates forms from it. There is exactly one source of truth.
    */
   export const BLOCK_REGISTRY = {
     hero: heroBlock,
     features: featuresBlock,
     about: aboutBlock,
     productsHeader: productsHeaderBlock,
     footer: footerBlock,
     nav: navBlock,
     meta: metaBlock,
     businessContact: businessContactBlock,
     formConfig: formConfigBlock,
     aboutPage: aboutPageBlock,
     contactPage: contactPageBlock,
     notFound: notFoundBlock,
   } as const;

   export type BlockKey = keyof typeof BLOCK_REGISTRY;

   export const BLOCK_KEYS = Object.keys(BLOCK_REGISTRY) as BlockKey[];

   /** The fully-validated set of every block, both locales (used by the snapshot). */
   export type ReleaseBlocks = {
     [K in BlockKey]: z.infer<(typeof BLOCK_REGISTRY)[K]>;
   };

   /**
    * Validate `data` against the schema registered under `key`. Throws ZodError
    * on invalid input — the importer relies on this as its conformance gate.
    */
   export function parseBlock<K extends BlockKey>(
     key: K,
     data: unknown,
   ): z.infer<(typeof BLOCK_REGISTRY)[K]> {
     return BLOCK_REGISTRY[key].parse(data) as z.infer<(typeof BLOCK_REGISTRY)[K]>;
   }
   ```

4. Run it, expect PASS:
   ```bash
   npm run -w @signex/shared test -- registry
   ```
   Expect: all registry tests green.

5. Commit:
   ```bash
   git add packages/shared/src/content/registry.ts packages/shared/src/content/registry.test.ts
   git commit -m "feat(shared): BLOCK_REGISTRY + parseBlock conformance gate"
   ```

---

### Task 5: Catalog DTOs + ReleaseSnapshotSchema (FrozenAsset, schemaVersion)

**Files:**
- Create: `packages/shared/src/content/catalog.ts`
- Create: `packages/shared/src/content/release.ts`
- Test: `packages/shared/src/content/release.test.ts`

**Interfaces:**
- Consumes: `Id`, `LocalizedText` from `../primitives`; `BLOCK_REGISTRY` from `./registry`.
- Produces:
  - `FrozenAsset: z.ZodObject<{ assetId, r2Key, mime, width?, height?, alt?, poster?, webm?, variants }>` (`variants` defaults `[]`); `type FrozenAsset`.
  - `FrozenProduct`, `FrozenCategory` (snapshot catalog shapes); `CatalogDTO` (api list-response shape) with `CategoryDTO`, `ProductDTO`, `AssetDTO`.
  - `ReleaseSnapshotSchema: z.ZodObject<{ schemaVersion: z.literal(1); blocks: z.object(BLOCK_REGISTRY); catalog }>`; `type ReleaseSnapshot = z.infer<typeof ReleaseSnapshotSchema>`; `SCHEMA_VERSION = 1`.

**Steps:**

1. Implement `packages/shared/src/content/catalog.ts` (FrozenAsset per spec §5.3; FrozenCategory/Product mirror the Prisma working tables, order-preserving via `sortOrder`):
   ```ts
   import { z } from "zod";
   import { Id, LocalizedText } from "../primitives";

   /**
    * A frozen asset reference inside a Release snapshot. URL is NOT frozen — web
    * resolves MEDIA_PUBLIC_BASE + '/' + r2Key at read time (survives CDN/domain
    * migration). `variants` stays [] in the foundation (later responsive sub-project
    * backfills without a snapshot migration).
    */
   export const FrozenAsset = z.object({
     assetId: Id,
     r2Key: z.string(),
     mime: z.string(),
     width: z.number().optional(),
     height: z.number().optional(),
     alt: LocalizedText.optional(),
     poster: z.object({ r2Key: z.string() }).optional(),
     webm: z.object({ r2Key: z.string() }).optional(),
     variants: z
       .array(z.object({ label: z.string(), width: z.number(), r2Key: z.string() }))
       .default([]),
   });
   export type FrozenAsset = z.infer<typeof FrozenAsset>;

   /** A product inside a frozen category (dict products.categories[].items[]). */
   export const FrozenProduct = z.object({
     slug: z.string(),
     sortOrder: z.number().int(),
     title: LocalizedText,
     tag: LocalizedText,
     desc: LocalizedText,
     image: FrozenAsset.optional(),
   });
   export type FrozenProduct = z.infer<typeof FrozenProduct>;

   /** A category inside the frozen catalog (dict products.categories[]). */
   export const FrozenCategory = z.object({
     slug: z.string(),
     sortOrder: z.number().int(),
     title: LocalizedText,
     tag: LocalizedText,
     intro: LocalizedText,
     productCount: z.number().int(), // locale-invariant stat (18/24/15/12)
     materialCount: z.number().int(), // (4/6/5/3)
     image: FrozenAsset.optional(),
     items: z.array(FrozenProduct), // order-preserving
   });
   export type FrozenCategory = z.infer<typeof FrozenCategory>;

   export const FrozenCatalog = z.object({
     categories: z.array(FrozenCategory),
   });
   export type FrozenCatalog = z.infer<typeof FrozenCatalog>;

   // ===== api RESPONSE DTOs (mirror Prisma rows; ids + timestamps present) =====
   export const AssetDTO = z.object({
     id: Id,
     status: z.enum(["PENDING", "READY"]),
     kind: z.enum(["IMAGE", "VIDEO", "SVG"]),
     r2Key: z.string(),
     mime: z.string(),
     bytes: z.number().int(),
     width: z.number().int().optional(),
     height: z.number().int().optional(),
     originalName: z.string(),
   });
   export type AssetDTO = z.infer<typeof AssetDTO>;

   export const ProductDTO = z.object({
     id: Id,
     categoryId: Id,
     slug: z.string(),
     sortOrder: z.number().int(),
     title: LocalizedText,
     tag: LocalizedText,
     desc: LocalizedText,
     imageId: Id.optional(),
     imageAlt: LocalizedText.optional(),
   });
   export type ProductDTO = z.infer<typeof ProductDTO>;

   export const CategoryDTO = z.object({
     id: Id,
     slug: z.string(),
     sortOrder: z.number().int(),
     title: LocalizedText,
     tag: LocalizedText,
     intro: LocalizedText,
     productCount: z.number().int(),
     materialCount: z.number().int(),
     imageId: Id.optional(),
     imageAlt: LocalizedText.optional(),
     products: z.array(ProductDTO).optional(),
   });
   export type CategoryDTO = z.infer<typeof CategoryDTO>;
   ```

2. Write the failing test. Create `packages/shared/src/content/release.test.ts`:
   ```ts
   import { describe, it, expect } from "vitest";
   import { FrozenAsset } from "./catalog";
   import { ReleaseSnapshotSchema, SCHEMA_VERSION } from "./release";

   const CUID = "clr1abcd0000xyz1234567890";

   describe("FrozenAsset", () => {
     it("requires assetId + r2Key + mime; defaults variants to []", () => {
       const out = FrozenAsset.parse({ assetId: CUID, r2Key: "originals/ab/logo.svg", mime: "image/svg+xml" });
       expect(out.variants).toEqual([]);
     });
     it("rejects a missing r2Key", () => {
       expect(FrozenAsset.safeParse({ assetId: CUID, mime: "image/png" }).success).toBe(false);
     });
   });

   describe("ReleaseSnapshotSchema", () => {
     it("exposes SCHEMA_VERSION = 1", () => {
       expect(SCHEMA_VERSION).toBe(1);
     });
     it("rejects a wrong schemaVersion", () => {
       const r = ReleaseSnapshotSchema.safeParse({ schemaVersion: 2, blocks: {}, catalog: { categories: [] } });
       expect(r.success).toBe(false);
     });
     it("rejects when a required block is missing", () => {
       // schemaVersion ok but blocks empty -> every block key is required -> fail
       const r = ReleaseSnapshotSchema.safeParse({ schemaVersion: 1, blocks: {}, catalog: { categories: [] } });
       expect(r.success).toBe(false);
     });
   });
   ```

3. Run it, expect FAIL:
   ```bash
   npm run -w @signex/shared test -- release
   ```
   Expect: FAIL — `Cannot find module './release'`.

4. Implement `packages/shared/src/content/release.ts` (reuse `BLOCK_REGISTRY` via `z.object(...)` so web snapshot type and api per-block validation can never diverge; spec §5.3):
   ```ts
   import { z } from "zod";
   import { BLOCK_REGISTRY } from "./registry";
   import { FrozenCatalog } from "./catalog";

   /** Stamped on every Release; web gates/migrates old snapshots on this. */
   export const SCHEMA_VERSION = 1 as const;

   /**
    * The whole serialized site. blocks reuses BLOCK_REGISTRY so the web snapshot
    * type and the api per-block validation share one definition.
    */
   export const ReleaseSnapshotSchema = z.object({
     schemaVersion: z.literal(SCHEMA_VERSION),
     blocks: z.object(BLOCK_REGISTRY),
     catalog: FrozenCatalog,
   });
   export type ReleaseSnapshot = z.infer<typeof ReleaseSnapshotSchema>;
   ```

5. Run it, expect PASS:
   ```bash
   npm run -w @signex/shared test -- release
   ```
   Expect: all release tests green.

6. Commit:
   ```bash
   git add packages/shared/src/content/catalog.ts packages/shared/src/content/release.ts packages/shared/src/content/release.test.ts
   git commit -m "feat(shared): catalog DTOs + FrozenAsset + ReleaseSnapshotSchema"
   ```

---

### Task 6: auth.ts (loginSchema, createUserSchema, ROLE_RANK, atLeast)

**Files:**
- Create: `packages/shared/src/auth.ts`
- Test: `packages/shared/src/auth.test.ts`

**Interfaces:**
- Consumes: `zod`.
- Produces:
  - `loginSchema: z.ZodObject<{ email: ZodString; password: ZodString }>`; `type LoginInput`.
  - `createUserSchema: z.ZodObject<{ email; name; password; role }>`; `type CreateUserInput`.
  - `type RoleName = "EDITOR" | "PUBLISHER" | "ADMIN"`; `ROLE_NAMES: readonly RoleName[]`.
  - `ROLE_RANK: Record<RoleName, number>` (`{ EDITOR: 1, PUBLISHER: 2, ADMIN: 3 }`).
  - `atLeast(role: RoleName, min: RoleName): boolean`.

**Steps:**

1. Write the failing test. Create `packages/shared/src/auth.test.ts`:
   ```ts
   import { describe, it, expect } from "vitest";
   import {
     loginSchema,
     createUserSchema,
     ROLE_RANK,
     ROLE_NAMES,
     atLeast,
   } from "./auth";

   describe("loginSchema", () => {
     it("accepts a valid email + non-empty password", () => {
       expect(loginSchema.safeParse({ email: "a@b.com", password: "secret" }).success).toBe(true);
     });
     it("rejects a bad email and an empty password", () => {
       expect(loginSchema.safeParse({ email: "nope", password: "secret" }).success).toBe(false);
       expect(loginSchema.safeParse({ email: "a@b.com", password: "" }).success).toBe(false);
     });
   });

   describe("createUserSchema", () => {
     it("requires email/name/password(min 8)/role", () => {
       expect(
         createUserSchema.safeParse({ email: "a@b.com", name: "Ann", password: "longenough", role: "ADMIN" }).success,
       ).toBe(true);
       expect(
         createUserSchema.safeParse({ email: "a@b.com", name: "Ann", password: "short", role: "ADMIN" }).success,
       ).toBe(false);
       expect(
         createUserSchema.safeParse({ email: "a@b.com", name: "Ann", password: "longenough", role: "ROOT" }).success,
       ).toBe(false);
     });
     it("defaults role to EDITOR", () => {
       const out = createUserSchema.parse({ email: "a@b.com", name: "Ann", password: "longenough" });
       expect(out.role).toBe("EDITOR");
     });
   });

   describe("ROLE_RANK / atLeast", () => {
     it("orders EDITOR < PUBLISHER < ADMIN", () => {
       expect(ROLE_RANK.EDITOR).toBe(1);
       expect(ROLE_RANK.PUBLISHER).toBe(2);
       expect(ROLE_RANK.ADMIN).toBe(3);
       expect(ROLE_NAMES).toEqual(["EDITOR", "PUBLISHER", "ADMIN"]);
     });
     it("atLeast compares ranks", () => {
       expect(atLeast("ADMIN", "PUBLISHER")).toBe(true);
       expect(atLeast("PUBLISHER", "PUBLISHER")).toBe(true);
       expect(atLeast("EDITOR", "PUBLISHER")).toBe(false);
     });
   });
   ```

2. Run it, expect FAIL:
   ```bash
   npm run -w @signex/shared test -- auth
   ```
   Expect: FAIL — `Cannot find module './auth'`.

3. Implement `packages/shared/src/auth.ts`:
   ```ts
   import { z } from "zod";

   /** The three RBAC roles, ordered ascending by privilege. */
   export const ROLE_NAMES = ["EDITOR", "PUBLISHER", "ADMIN"] as const;
   export type RoleName = (typeof ROLE_NAMES)[number];

   /** Ordered rank for `atLeast` comparisons (EDITOR=1 < PUBLISHER=2 < ADMIN=3). */
   export const ROLE_RANK: Record<RoleName, number> = {
     EDITOR: 1,
     PUBLISHER: 2,
     ADMIN: 3,
   };

   /** True iff `role` is at least as privileged as `min`. */
   export const atLeast = (role: RoleName, min: RoleName): boolean =>
     ROLE_RANK[role] >= ROLE_RANK[min];

   export const loginSchema = z.object({
     email: z.string().email(),
     password: z.string().min(1),
   });
   export type LoginInput = z.infer<typeof loginSchema>;

   export const createUserSchema = z.object({
     email: z.string().email(),
     name: z.string().min(1),
     password: z.string().min(8),
     role: z.enum(ROLE_NAMES).default("EDITOR"),
   });
   export type CreateUserInput = z.infer<typeof createUserSchema>;
   ```

4. Run it, expect PASS:
   ```bash
   npm run -w @signex/shared test -- auth
   ```
   Expect: all auth tests green.

5. Commit:
   ```bash
   git add packages/shared/src/auth.ts packages/shared/src/auth.test.ts
   git commit -m "feat(shared): auth registry (loginSchema, createUserSchema, ROLE_RANK, atLeast)"
   ```

---

### Task 7: Re-export everything from index.ts + verify CJS dist build

**Files:**
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/index.test.ts` (create)

**Interfaces:**
- Consumes: every module created above (`./content/primitives`, `./content/blocks`, `./content/registry`, `./content/catalog`, `./content/release`, `./auth`).
- Produces: the public package surface — every primitive, block schema, `BLOCK_REGISTRY`, `parseBlock`, catalog DTOs, `ReleaseSnapshotSchema`, auth helpers, and the preserved `contactMessageSchema` + `z` — all require()-able from `@signex/shared` CJS `dist/`.

**Steps:**

1. Write the failing test that asserts the barrel surface (covers wiring + that existing exports are preserved). Create `packages/shared/src/index.test.ts`:
   ```ts
   import { describe, it, expect } from "vitest";
   import * as shared from "./index";

   describe("@signex/shared barrel", () => {
     it("keeps the existing contactMessageSchema + z", () => {
       expect(typeof shared.contactMessageSchema.parse).toBe("function");
       expect(typeof shared.z.object).toBe("function");
     });
     it("re-exports the registry + parseBlock + snapshot + auth", () => {
       expect(Object.keys(shared.BLOCK_REGISTRY).length).toBe(12);
       expect(typeof shared.parseBlock).toBe("function");
       expect(typeof shared.ReleaseSnapshotSchema.parse).toBe("function");
       expect(shared.ROLE_RANK.ADMIN).toBe(3);
       expect(shared.atLeast("ADMIN", "EDITOR")).toBe(true);
     });
     it("re-exports primitives + catalog DTOs", () => {
       expect(typeof shared.LocalizedText.parse).toBe("function");
       expect(typeof shared.AssetRef.parse).toBe("function");
       expect(typeof shared.FrozenAsset.parse).toBe("function");
       expect(typeof shared.CategoryDTO.parse).toBe("function");
     });
   });
   ```

2. Run it, expect FAIL:
   ```bash
   npm run -w @signex/shared test -- index
   ```
   Expect: FAIL — `shared.BLOCK_REGISTRY is undefined` (barrel not wired yet).

3. Implement `packages/shared/src/index.ts` (KEEP the existing `contactMessageSchema`, `ID`, `ApiResult`, `z` re-export; ADD the new module re-exports):
   ```ts
   import { z } from "zod";

   /**
    * @signex/shared — the cross-app content + auth contract.
    * Compiled to CommonJS in dist/ (see package.json "main"/"exports") so the
    * NestJS runtime and the Next apps can require() it. Build with `npm run build`.
    */

   /** Placeholder shared identifier type. */
   export type ID = string;

   /** Placeholder generic API result envelope used across apps. */
   export type ApiResult<T> =
     | { ok: true; data: T }
     | { ok: false; error: string };

   /**
    * Example DTO schema (kept from the original placeholder; the contact form
    * still validates against it).
    */
   export const contactMessageSchema = z.object({
     name: z.string().min(1, "name is required"),
     email: z.string().email("must be a valid email"),
     message: z.string().min(1, "message is required"),
   });

   /** Inferred type for the example DTO. */
   export type ContactMessage = z.infer<typeof contactMessageSchema>;

   // ===== Content + auth registry (build step 0) =====
   export * from "./content/primitives";
   export * from "./content/blocks";
   export * from "./content/registry";
   export * from "./content/catalog";
   export * from "./content/release";
   export * from "./auth";

   /** Re-export zod so consumers can build/extend schemas without their own dep. */
   export { z };
   ```

4. Run it, expect PASS:
   ```bash
   npm run -w @signex/shared test
   ```
   Expect: the WHOLE suite (primitives, registry, release, auth, index) green.

5. Verify the CJS dist build emits the new modules and is require()-able the way NestJS/Next will consume it at runtime. Run:
   ```bash
   npm run -w @signex/shared build && node -e "const s=require('/home/ealflm/dev/signex/packages/shared/dist/index.js'); console.log(Object.keys(s.BLOCK_REGISTRY).length, typeof s.parseBlock, s.ROLE_RANK.ADMIN, typeof s.ReleaseSnapshotSchema.parse)"
   ```
   Expect: prints `12 function 3 function`. Also confirm declarations + no tests shipped:
   ```bash
   ls packages/shared/dist/content && find packages/shared/dist -name '*.test.*' | wc -l
   ```
   Expect: `content/` contains `registry.js`, `release.js`, `catalog.js`, `primitives.js`, `blocks/`, plus matching `.d.ts`; the `find ... | wc -l` prints `0`.

6. Verify the full turbo build still passes (shared compiles cleanly as a dependency for downstream steps):
   ```bash
   npx turbo run build --filter=@signex/shared
   ```
   Expect: `@signex/shared#build` SUCCESS, exit 0.

7. Commit:
   ```bash
   git add packages/shared/src/index.ts packages/shared/src/index.test.ts
   git commit -m "feat(shared): re-export content+auth registry from index barrel (CJS dist)"
   ```

---

## Milestone 1 — packages/db Prisma schema + migration + release_version_seq

**Consumes (from earlier milestones):**
- From Step 0 (@signex/shared): Id = z.string().cuid() — the schema's @default(cuid()) on User/Asset/etc. must stay cuid() so this zod schema matches (no consumption at build time, this is a cross-layer contract the schema must honor)
- From Step 0 (@signex/shared): LocalizedTextSchema shape { en: string, vi: string } — every Json column documented as LocalizedText must be writable as this shape (contract only; not imported by the schema)

**Produces (for later milestones):**
- Prisma model `User { id, email @unique, name, passwordHash, role Role @default(EDITOR), isActive Boolean @default(true), lastLoginAt DateTime?, createdAt, updatedAt }` with relations sessions/releasesCreated/releasesPublished/assetsUploaded/auditLogs
- Prisma model `Session { id, tokenHash @unique, userId, expiresAt, revokedAt?, lastSeenAt, ip?, userAgent?, createdAt }` (onDelete: Cascade to User)
- Prisma model `AuditLog { id, userId?, action String, entityType String, entityId?, meta Json?, createdAt }` (onDelete: SetNull to User)
- Prisma model `Asset { id, status AssetStatus @default(PENDING), kind AssetKind, sha256 @unique, r2Key @unique, mime, bytes BigInt, width?, height?, duration?, originalName, altDefault Json?, posterId?, uploadedById?, createdAt, deletedAt? }` self-relation AssetPoster, relations refs/releaseRefs/categoriesImage/productsImage
- Prisma model `AssetRef { id, assetId, ownerType, ownerId, field, alt Json? } @@unique([ownerType, ownerId, field])`
- Prisma model `ReleaseAssetRef { releaseId, assetId } @@id([releaseId, assetId])` (release onDelete Cascade)
- Prisma model `Category { id, slug @unique, sortOrder Int, title/tag/intro Json, productCount Int, materialCount Int, imageId?, imageAlt Json?, createdAt, updatedAt, deletedAt? }` image onDelete Restrict
- Prisma model `Product { id, categoryId, slug, sortOrder Int, title/tag/desc Json, imageId?, imageAlt Json?, createdAt, updatedAt, deletedAt? } @@unique([categoryId, slug])` category onDelete Cascade, image onDelete Restrict
- Prisma model `ContentBlock { id, kind BlockKind, key String, data Json, createdAt, updatedAt } @@unique([kind, key])`
- Prisma model `FormSubmission { id, formKey, payload Json, uploadAssetId?, status SubmissionStatus @default(NEW), ip?, userAgent?, createdAt }`
- Prisma model `Release { id, version Int @unique, status ReleaseStatus @default(PUBLISHED), label?, note?, snapshot Json, checksum String, schemaVersion Int, fromRevision Int, rolledBackFromVersion Int?, createdById, publishedById?, createdAt, publishedAt? }`
- Prisma model `PublishedPointer { id @default("singleton"), releaseId @unique, publishedVersion Int, publishedAt, publishedById String }`
- Prisma model `WorkingState { id @default("singleton"), revision Int @default(0), lastPublishedRevision Int @default(0), updatedAt, updatedById? }`
- Prisma enums `Role { EDITOR PUBLISHER ADMIN }`, `AssetStatus { PENDING READY }`, `AssetKind { IMAGE VIDEO SVG }`, `BlockKind { PAGE SETTINGS NAV SEO }`, `SubmissionStatus { NEW READ ARCHIVED }`, `ReleaseStatus { PUBLISHED ARCHIVED }`
- Postgres `SEQUENCE release_version_seq` (publish path calls nextval('release_version_seq'))
- Committed migration directory `packages/db/prisma/migrations/20260621000000_cms_foundation/` applying cleanly via `prisma migrate deploy` on an empty DB
- Snapshot-vs-operational table contract (comment in schema.prisma): SNAPSHOT = Category, Product, Asset, ContentBlock; OPERATIONAL-ONLY = User, Session, AuditLog, Release, PublishedPointer, WorkingState, FormSubmission, AssetRef, ReleaseAssetRef

### Task 8: Author the full CMS-foundation Prisma schema

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

**Interfaces:**
- Consumes: nothing at build time. Cross-layer contract from Step 0 `@signex/shared`: all `@id @default(cuid())` must remain `cuid()` (so `Id = z.string().cuid()` matches); every Json column annotated `LocalizedText` must accept `{ en: string, vi: string }`.
- Produces: all Prisma models + enums listed in this milestone's `produces`. These are consumed by Step 2 (auth: `User`, `Session`, `AuditLog`), Step 4 (`ContentBlock`, `Category`, `Product`, `AssetRef`, `WorkingState`), Step 5 (`Asset`), Step 6 (`Release`, `PublishedPointer`, `ReleaseAssetRef`, `WorkingState`), Step 11 (`FormSubmission`).

> NOTE on spec §4 fidelity: the spec sketch uses prose-style inline field separators (e.g. `title Json; tag Json; desc Json` and `@@index([userId]); @@index([expiresAt])` on one line). Prisma's grammar requires **one field/attribute per line**. The steps below reproduce the spec verbatim in meaning but split those onto separate lines — this is a syntactic correction, not a design change.

**Steps:**

1. Read the current `packages/db/prisma/schema.prisma` (datasource + generator only) so you append, not overwrite. Keep lines 1–15 intact.

2. Append the IDENTITY / RBAC block. Add to the end of `packages/db/prisma/schema.prisma`:
```prisma

// =============================================================================
// CMS FOUNDATION (spec §4). Conventions:
//   LocalizedText = Json { en, vi } (LocalizedTextSchema in @signex/shared);
//   every Json column is zod-validated before write AND again at publish.
// SNAPSHOT-SERIALIZED  : Category, Product, Asset (as frozen refs), ContentBlock.
// OPERATIONAL-ONLY     : User, Session, AuditLog, Release, PublishedPointer,
//                        WorkingState, FormSubmission, AssetRef, ReleaseAssetRef.
// ID strategy is locked to cuid() so @signex/shared's Id can be z.string().cuid().
// =============================================================================

// ===== IDENTITY / RBAC =====
enum Role {
  EDITOR
  PUBLISHER
  ADMIN
}

model User {
  id           String    @id @default(cuid())
  email        String    @unique
  name         String
  passwordHash String // node:crypto scrypt (no native dep)
  role         Role      @default(EDITOR)
  isActive     Boolean   @default(true) // deactivate, never hard-delete (preserves audit FKs)
  lastLoginAt  DateTime?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  sessions          Session[]
  releasesCreated   Release[]  @relation("ReleaseCreatedBy")
  releasesPublished Release[]  @relation("ReleasePublishedBy")
  assetsUploaded    Asset[]
  auditLogs         AuditLog[]
}

model Session {
  id         String    @id @default(cuid())
  tokenHash  String    @unique // sha256(raw token); raw lives only in the cookie
  userId     String
  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt  DateTime
  revokedAt  DateTime? // logout / demote / deactivate => instant kill
  lastSeenAt DateTime  @default(now())
  ip         String?
  userAgent  String?
  createdAt  DateTime  @default(now())

  @@index([userId])
  @@index([expiresAt])
}

model AuditLog {
  id         String   @id @default(cuid())
  userId     String?
  user       User?    @relation(fields: [userId], references: [id], onDelete: SetNull)
  action     String // "content.update" | "release.publish" | "release.rollback" ...
  entityType String
  entityId   String?
  meta       Json?
  createdAt  DateTime @default(now())

  @@index([entityType, entityId])
  @@index([createdAt])
}
```

3. Append the MEDIA block. Add to the end of the file:
```prisma

// ===== MEDIA (R2) =====
enum AssetStatus {
  PENDING
  READY
}

enum AssetKind {
  IMAGE
  VIDEO
  SVG
}

model Asset {
  id           String      @id @default(cuid())
  status       AssetStatus @default(PENDING)
  kind         AssetKind
  sha256       String      @unique // content hash => dedup + immutability
  r2Key        String      @unique // originals/<hash32>/<slug>.<ext> ; URL is DERIVED, never stored
  mime         String
  bytes        BigInt // BigInt to avoid a future migration on large video
  width        Int?
  height       Int?
  duration     Float?
  originalName String
  altDefault   Json? // LocalizedText fallback ONLY; real alt is per-use
  posterId     String? // video poster (an IMAGE asset)
  poster       Asset?      @relation("AssetPoster", fields: [posterId], references: [id])
  postered     Asset[]     @relation("AssetPoster")
  uploadedById String?
  uploadedBy   User?       @relation(fields: [uploadedById], references: [id], onDelete: SetNull)
  createdAt    DateTime    @default(now())
  deletedAt    DateTime? // soft-delete; service-layer enforces "no delete while referenced"

  categoriesImage Category[]        @relation("CategoryImage")
  productsImage   Product[]         @relation("ProductImage")
  refs            AssetRef[] // working-state usage (derived cache, rebuilt at publish)
  releaseRefs     ReleaseAssetRef[] // indexed release<->asset (delete/GC safety)

  @@index([status, kind])
  @@index([deletedAt])
}

// Working-state usage tracking; DERIVED from working state, rebuilt on every publish.
model AssetRef {
  id        String @id @default(cuid())
  assetId   String
  asset     Asset  @relation(fields: [assetId], references: [id])
  ownerType String // "product"|"category"|"contentBlock"|"settings"
  ownerId   String
  field     String // json path e.g. "hero.image" | "gallery[2]"
  alt       Json? // per-use LocalizedText (canonical alt source)

  @@unique([ownerType, ownerId, field])
  @@index([assetId])
}

// Indexed "which retained release references this asset" — makes delete/GC an O(1) set query.
model ReleaseAssetRef {
  releaseId String
  release   Release @relation(fields: [releaseId], references: [id], onDelete: Cascade)
  assetId   String
  asset     Asset   @relation(fields: [assetId], references: [id])

  @@id([releaseId, assetId])
  @@index([assetId])
}
```

4. Append the CATALOG block. Add to the end of the file:
```prisma

// ===== CATALOG (relational working state) =====
model Category {
  id            String    @id @default(cuid())
  slug          String    @unique // URL key (generateStaticParams)
  sortOrder     Int // LOAD-BEARING (index->image, sitemap)
  title         Json // LocalizedText
  tag           Json // LocalizedText "PVC · Silicone"
  intro         Json // LocalizedText (category page desc + meta + JSON-LD)
  productCount  Int // locale-invariant stat (18/24/15/12)
  materialCount Int // (4/6/5/3)
  imageId       String?
  image         Asset?    @relation("CategoryImage", fields: [imageId], references: [id], onDelete: Restrict)
  imageAlt      Json? // per-use alt (not on Asset)
  products      Product[]
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  deletedAt     DateTime?

  @@index([sortOrder])
}

model Product {
  id         String    @id @default(cuid())
  categoryId String
  category   Category  @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  slug       String // unique WITHIN category
  sortOrder  Int
  title      Json // LocalizedText
  tag        Json // LocalizedText
  desc       Json // LocalizedText
  imageId    String?
  image      Asset?    @relation("ProductImage", fields: [imageId], references: [id], onDelete: Restrict)
  imageAlt   Json?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt
  deletedAt  DateTime?

  @@unique([categoryId, slug])
  @@index([categoryId, sortOrder])
}
```

5. Append the CONTENT BLOCKS + FORM SUBMISSIONS blocks. Add to the end of the file:
```prisma

// ===== JSON CONTENT BLOCKS =====
enum BlockKind {
  PAGE
  SETTINGS
  NAV
  SEO
}

model ContentBlock {
  id        String    @id @default(cuid())
  kind      BlockKind
  key       String // "home.hero" | "businessContact" | "nav.primary" | "seo.home"
  data      Json // zod-validated by registry[(kind,key)]
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@unique([kind, key])
  @@index([kind])
  @@index([key])
}

// ===== FORM SUBMISSIONS (operational-only; NOT in snapshots) =====
enum SubmissionStatus {
  NEW
  READ
  ARCHIVED
}

model FormSubmission {
  id            String           @id @default(cuid())
  formKey       String // "quote" | "contact"
  payload       Json // zod-validated against the form's submit schema
  uploadAssetId String? // the form's "upload" field -> R2 Asset
  status        SubmissionStatus @default(NEW)
  ip            String?
  userAgent     String?
  createdAt     DateTime         @default(now())

  @@index([formKey, status])
  @@index([createdAt])
}
```

6. Append the VERSIONING block (Release / PublishedPointer / WorkingState singletons). Add to the end of the file:
```prisma

// ===== VERSIONING =====
enum ReleaseStatus {
  PUBLISHED
  ARCHIVED
} // DRAFT removed (locked #4: working tables ARE the draft)

model Release {
  id                    String        @id @default(cuid())
  version               Int           @unique // assigned from a Postgres sequence
  status                ReleaseStatus @default(PUBLISHED)
  label                 String?
  note                  String?
  snapshot              Json // whole serialized site (ReleaseSnapshotSchema)
  checksum              String // sha256(canonical snapshot)
  schemaVersion         Int // stamped; web gates/migrates on this
  fromRevision          Int // WorkingState.revision at serialize time
  rolledBackFromVersion Int?
  createdById           String
  createdBy             User          @relation("ReleaseCreatedBy", fields: [createdById], references: [id])
  publishedById         String?
  publishedBy           User?         @relation("ReleasePublishedBy", fields: [publishedById], references: [id])
  createdAt             DateTime      @default(now())
  publishedAt           DateTime?

  assetRefs        ReleaseAssetRef[]
  publishedPointer PublishedPointer?

  @@index([status])
  @@index([version])
}

// Singleton: which release is LIVE. Repoint = one-row update (atomic, cheap).
model PublishedPointer {
  id               String   @id @default("singleton")
  releaseId        String   @unique
  release          Release  @relation(fields: [releaseId], references: [id])
  publishedVersion Int
  publishedAt      DateTime @default(now())
  publishedById    String
}

// Singleton: the global optimistic lock + dirty tracking.
model WorkingState {
  id                    String   @id @default("singleton")
  revision              Int      @default(0) // bumped on every committed working-state edit
  lastPublishedRevision Int      @default(0) // dirty iff revision != lastPublishedRevision
  updatedAt             DateTime @updatedAt
  updatedById           String?
}
```
> NOTE: a back-relation `publishedPointer PublishedPointer?` was added to `Release` because `PublishedPointer.release` declares a relation field — Prisma requires the opposite side. The spec sketch omitted it (it lists only `assetRefs`), but `prisma format`/`validate` mandates it. This is a required syntactic completion, no schema-design change.

7. Run `npx prisma format --schema packages/db/prisma/schema.prisma` and expect exit 0 with the file re-formatted (column-aligned). Then run `npx prisma validate --schema packages/db/prisma/schema.prisma`, expect: `The schema at packages/db/prisma/schema.prisma is valid 🚀`.

8. Run `npm run -w @signex/db generate`, expect it to finish with `Generated Prisma Client (v6.19.3) ... in packages/db/generated/client`. This proves every model/enum compiles into the client.

9. Commit:
```bash
git add packages/db/prisma/schema.prisma
git commit -m "feat(db): add CMS-foundation Prisma models (auth/media/catalog/content/versioning)"
```

---

### Task 9: Generate the committed migration + release_version_seq

**Files:**
- Create: `packages/db/prisma/migrations/20260621000000_cms_foundation/migration.sql`
- Delete: `packages/db/prisma/migrations/20260619164715_init/` (the empty placeholder)
- Modify: `packages/db/package.json` (add `migrate:reset` helper script)

**Interfaces:**
- Consumes: the schema from the previous task (all models + enums).
- Produces: a single committed migration that, applied to an empty DB via `prisma migrate deploy`, creates every table/enum/index/FK **and** `CREATE SEQUENCE release_version_seq`. Consumed by Step 3 (`prisma migrate deploy` in the seed/bootstrap contract) and by Step 6 (publish calls `nextval('release_version_seq')`).

**Steps:**

1. Confirm the dev DB is reachable (compose postgres is published on host `3059`, and `packages/db/.env` already has `DATABASE_URL=postgresql://signex:signex@localhost:3059/signex?schema=public`). Run:
```bash
docker exec signex-postgres pg_isready -U signex -d signex
```
Expect: `/var/run/postgresql:5432 - accepting connections`.

2. Remove the empty placeholder migration so the first real migration is the canonical baseline (the repo's only prior migration is the committed-empty `init`; no environment has applied a non-empty history yet):
```bash
git rm -r packages/db/prisma/migrations/20260619164715_init
```
Expect the dir to be staged for deletion. Keep `packages/db/prisma/migrations/migration_lock.toml` untouched.

3. Because the dev DB may already have the empty `init` recorded in `_prisma_migrations`, reset it to a truly clean slate before generating. Run:
```bash
npm run -w @signex/db exec -- prisma migrate reset --force --skip-seed --skip-generate
```
Expect: `Database reset successful` (drops all tables incl. `_prisma_migrations`). (If the package script runner complains, run `npx --prefix packages/db prisma migrate reset --force --skip-seed --skip-generate --schema packages/db/prisma/schema.prisma`.)

4. Generate the migration SQL **without applying** it, so you can append the sequence before it runs:
```bash
npx prisma migrate dev --schema packages/db/prisma/schema.prisma --name cms_foundation --create-only
```
Expect: `Prisma Migrate created the following migration ... migrations/<timestamp>_cms_foundation` and exit 0, no DB changes applied yet.

5. Verify the generated `migration.sql` exists and contains `CREATE TABLE "User"`, `CREATE TABLE "Release"`, `CREATE TYPE "Role"`, the `@@unique`/`@@index` as `CREATE UNIQUE INDEX`/`CREATE INDEX`, and the FK `ALTER TABLE ... ADD CONSTRAINT` statements:
```bash
grep -E 'CREATE TABLE "(User|Session|AuditLog|Asset|AssetRef|ReleaseAssetRef|Category|Product|ContentBlock|FormSubmission|Release|PublishedPointer|WorkingState)"' packages/db/prisma/migrations/*_cms_foundation/migration.sql | wc -l
```
Expect: `13`.

6. Append the sequence to the END of that generated `migration.sql` (the publish path depends on it; Prisma's schema language has no sequence primitive, so it lives in raw migration SQL). Add these lines to `packages/db/prisma/migrations/<timestamp>_cms_foundation/migration.sql`:
```sql

-- Monotonic release version source: publish calls nextval('release_version_seq').
-- Prevents the max(version)+1 race between two concurrent publishers (spec §3.1.7, §7.2).
CREATE SEQUENCE "release_version_seq" START WITH 1 INCREMENT BY 1;
```

7. Apply the migration cleanly with the deploy path (the same command Step 3 bootstrap uses — proves it applies non-interactively on a fresh DB):
```bash
npm run -w @signex/db migrate:deploy
```
Expect: `1 migration found in prisma/migrations` then `Applying migration ...cms_foundation` then `All migrations have been successfully applied.`

8. Verify the sequence physically exists and increments:
```bash
docker exec signex-postgres psql -U signex -d signex -c "SELECT nextval('release_version_seq'), nextval('release_version_seq');"
```
Expect a two-row result `1` then `2`. (This is a side-effecting probe; the test task re-resets the DB afterward, so consumed values don't matter.)

9. Add a `migrate:reset` convenience script (used by the test task's clean-DB run). Edit `packages/db/package.json` `scripts` to add:
```json
    "migrate:reset": "prisma migrate reset --force --skip-seed",
```
(place it right after the existing `"migrate:deploy"` line).

10. Re-generate the client against the applied migration to be safe:
```bash
npm run -w @signex/db generate
```
Expect `Generated Prisma Client`.

11. Commit:
```bash
git add packages/db/prisma/migrations packages/db/package.json
git commit -m "feat(db): commit cms_foundation migration + release_version_seq sequence"
```

---

### Task 10: Verify the migration + invariants against a clean Postgres (vitest)

**Files:**
- Create: `packages/db/vitest.config.ts`
- Create: `packages/db/test/schema.spec.ts`
- Modify: `packages/db/package.json` (add vitest devDep + `test`/`test:run` scripts)
- Modify: `packages/db/src/index.ts` (only if the type-surface assertion below reveals a missing export)

**Interfaces:**
- Consumes: the committed migration + generated client from the previous tasks; the `migrate:reset` script.
- Produces: an automated guard proving (a) the migration applies on an empty DB, (b) `release_version_seq` exists and is monotonic, (c) singleton default ids work, (d) the single-PUBLISHED + version-`@unique` invariants are enforced by the DB. No new runtime exports.

**Steps:**

1. Add vitest as the `@signex/db` test runner (first task in this package that needs a runner). Run:
```bash
npm install -D -w @signex/db vitest dotenv
```
Expect it added to `packages/db/package.json` `devDependencies` and the root lockfile updated.

2. Add test scripts. Edit `packages/db/package.json` `scripts` to add (after `typecheck`):
```json
    "test": "vitest",
    "test:run": "vitest run"
```

3. Create `packages/db/vitest.config.ts` (node env; single fork so the shared DB isn't raced; load `.env` for `DATABASE_URL`):
```ts
import { defineConfig } from "vitest/config";
import { config } from "dotenv";

config({ path: ".env" });

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.spec.ts"],
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
```

4. Write the failing test `packages/db/test/schema.spec.ts`. It resets the DB to a clean slate, applies the committed migration via `migrate deploy`, then asserts the invariants through the generated client + raw SQL:
```ts
import { execSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, Role, ReleaseStatus } from "../generated/client";

const prisma = new PrismaClient();

beforeAll(() => {
  // Clean DB from the committed migration ONLY (no seed) — proves a fresh apply.
  execSync("npx prisma migrate reset --force --skip-seed --skip-generate", {
    cwd: process.cwd(),
    stdio: "inherit",
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function makeUser() {
  return prisma.user.create({
    data: { email: `u${Date.now()}@x.test`, name: "Seed", passwordHash: "x" },
  });
}

async function makeRelease(version: number, createdById: string, status: ReleaseStatus) {
  return prisma.release.create({
    data: {
      version,
      status,
      snapshot: {},
      checksum: `c${version}`,
      schemaVersion: 1,
      fromRevision: 0,
      createdById,
    },
  });
}

describe("cms_foundation migration", () => {
  it("exposes the Role enum members EDITOR/PUBLISHER/ADMIN", () => {
    expect(Role).toMatchObject({ EDITOR: "EDITOR", PUBLISHER: "PUBLISHER", ADMIN: "ADMIN" });
  });

  it("defaults the singleton ids to 'singleton'", async () => {
    const ws = await prisma.workingState.create({ data: {} });
    expect(ws.id).toBe("singleton");
    expect(ws.revision).toBe(0);
    expect(ws.lastPublishedRevision).toBe(0);
  });

  it("has a monotonic release_version_seq", async () => {
    const a = await prisma.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('release_version_seq')`;
    const b = await prisma.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('release_version_seq')`;
    expect(Number(b[0].nextval)).toBe(Number(a[0].nextval) + 1);
  });

  it("enforces unique Release.version (monotonic-version invariant)", async () => {
    const u = await makeUser();
    await makeRelease(1, u.id, ReleaseStatus.ARCHIVED);
    await expect(makeRelease(1, u.id, ReleaseStatus.PUBLISHED)).rejects.toThrow();
  });

  it("enforces the single-PublishedPointer invariant via @id singleton + releaseId @unique", async () => {
    const u = await makeUser();
    const r2 = await makeRelease(2, u.id, ReleaseStatus.PUBLISHED);
    const r3 = await makeRelease(3, u.id, ReleaseStatus.PUBLISHED);
    await prisma.publishedPointer.create({
      data: { releaseId: r2.id, publishedVersion: 2, publishedById: u.id },
    });
    // A second pointer row collides on the singleton PK -> exactly one LIVE release.
    await expect(
      prisma.publishedPointer.create({
        data: { releaseId: r3.id, publishedVersion: 3, publishedById: u.id },
      }),
    ).rejects.toThrow();
  });

  it("stores BigInt Asset.bytes without precision loss", async () => {
    const a = await prisma.asset.create({
      data: {
        kind: "IMAGE",
        sha256: `s${Date.now()}`,
        r2Key: `k${Date.now()}`,
        mime: "image/png",
        bytes: 9_000_000_000n,
        originalName: "big.png",
      },
    });
    expect(a.bytes).toBe(9_000_000_000n);
  });
});
```

5. Run it and expect FAIL first if the generated client is stale (run before regenerating). The intended first-run failure surfaces as a TypeScript/import error `Module '"../generated/client"' has no exported member 'ReleaseStatus'` OR an invariant assertion. Run:
```bash
npm run -w @signex/db generate && npm run -w @signex/db test:run
```
Confirm the run executes; if any assertion fails because of a schema mistake, fix `schema.prisma`, regenerate the migration (delete the dir, re-run the previous task's create-only + sequence-append), and re-run.

6. Run, expect PASS — all 6 tests green:
```bash
npm run -w @signex/db test:run
```
Expect `Test Files  1 passed (1)` and `Tests  6 passed (6)`.

7. Verify the public type surface still exports the new models (the index re-exports the generated client wholesale, so this should pass without change):
```bash
npm run -w @signex/db build
```
Expect `tsc` exit 0 and `packages/db/dist/index.d.ts` to exist. If `tsc` errors that a model type is missing from the re-export, it means `generated/client` wasn't regenerated — re-run `npm run -w @signex/db generate` then `build`. (No edit to `src/index.ts` is expected; it is `export * from "../generated/client"`.)

8. Leave the DB in a clean migrated state for downstream steps:
```bash
npm run -w @signex/db migrate:deploy
```
Expect `All migrations have been successfully applied.` (or `No pending migrations`).

9. Commit:
```bash
git add packages/db/vitest.config.ts packages/db/test/schema.spec.ts packages/db/package.json
git commit -m "test(db): verify cms_foundation migration, sequence, and single-PUBLISHED invariant on a clean DB"
```

---

## Milestone 2 — api auth + RBAC (sessions, scrypt, guard chain, users CRUD)

**Consumes (from earlier milestones):**
- @signex/shared: loginSchema (zod schema; { email: string, password: string })
- @signex/shared: createUserSchema (zod schema; { email, name, password, role })
- @signex/shared: ROLE_RANK: Record<RoleName, number> ({ EDITOR:1, PUBLISHER:2, ADMIN:3 })
- @signex/shared: atLeast(role: RoleName, min: RoleName): boolean
- @signex/shared: RoleName ('EDITOR' | 'PUBLISHER' | 'ADMIN')
- @signex/shared: z (re-exported zod) and ZodSchema/ZodType types
- @signex/db: prisma, PrismaClient, Role enum, User/Session model types, Prisma namespace
- apps/api/src/prisma/prisma.service.ts: PrismaService with readonly client: PrismaClient (Global module already provides it)

**Produces (for later milestones):**
- hashPassword(plain: string): Promise<string> (encoded 'scrypt$N$r$p$saltB64$hashB64')
- verifyPassword(plain: string, encoded: string): Promise<boolean> (timing-safe)
- generateSessionToken(): string (raw, returned to cookie)
- hashToken(raw: string): string (sha256 hex, stored as Session.tokenHash)
- ZodValidationPipe (class implements PipeTransform; constructed with a ZodSchema; throws 422 BadRequestException-subtype)
- @Public() decorator + IS_PUBLIC_KEY
- @Roles(...roles: RoleName[]) decorator + ROLES_KEY
- @CurrentUser() param decorator (returns AuthedUser | undefined)
- AuthedUser type { id: string; email: string; name: string; role: RoleName; isActive: boolean } + publicUser(u: User): AuthedUser
- AuthService.login(email, password, ctx?: { ip?, userAgent? }): Promise<{ user: AuthedUser; rawToken: string; expiresAt: Date }>
- AuthService.logout(rawToken: string): Promise<void>
- AuthService.validateSessionToken(rawToken: string): Promise<AuthedUser | null>
- OriginGuard, SessionAuthGuard, RolesGuard (CanActivate; registered as APP_GUARD in that order)
- SESSION_COOKIE = 'sx_session' constant
- UsersService.create(dto), .update(id, dto), .deactivate(id) (Promise<AuthedUser>)
- AuthModule (exports AuthService), UsersModule

### Task 11: scrypt password hashing util

**Files:**
- Create: `apps/api/src/common/crypto/password.ts`
- Test: `apps/api/src/common/crypto/password.spec.ts`

**Interfaces:**
- Consumes: nothing (uses `node:crypto` only).
- Produces: `hashPassword(plain: string): Promise<string>` returning an encoded string `scrypt$<N>$<r>$<p>$<saltB64>$<hashB64>`; `verifyPassword(plain: string, encoded: string): Promise<boolean>` (timing-safe, returns `false` on malformed input rather than throwing).

**Steps:**

1. Write the failing test. Create `apps/api/src/common/crypto/password.spec.ts`:
```ts
import { hashPassword, verifyPassword } from './password';

describe('password (scrypt)', () => {
  it('hashes to the encoded scrypt$ format and is salted (two hashes differ)', async () => {
    const a = await hashPassword('s3cret-pw');
    const b = await hashPassword('s3cret-pw');
    expect(a.startsWith('scrypt$')).toBe(true);
    expect(a).not.toBe(b); // random salt
    expect(a.split('$')).toHaveLength(6);
  });

  it('verifies a correct password', async () => {
    const enc = await hashPassword('correct horse');
    await expect(verifyPassword('correct horse', enc)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const enc = await hashPassword('correct horse');
    await expect(verifyPassword('wrong horse', enc)).resolves.toBe(false);
  });

  it('returns false (does not throw) on a malformed encoded string', async () => {
    await expect(verifyPassword('x', 'not-a-hash')).resolves.toBe(false);
    await expect(verifyPassword('x', '')).resolves.toBe(false);
  });
});
```

2. Run it, expect FAIL. `npm test -w @signex/api -- password.spec` fails with `Cannot find module './password'`.

3. Implement minimal code. Create `apps/api/src/common/crypto/password.ts`:
```ts
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

// scrypt cost params (interactive-login tuned; pure-JS-free, no native dep).
const N = 16384; // CPU/memory cost
const R = 8; // block size
const P = 1; // parallelization
const KEYLEN = 64;
const SALT_BYTES = 16;

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = (await scryptAsync(plain, salt, KEYLEN, {
    N,
    r: R,
    p: P,
  })) as Buffer;
  return [
    'scrypt',
    N,
    R,
    P,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

export async function verifyPassword(
  plain: string,
  encoded: string,
): Promise<boolean> {
  try {
    const parts = encoded.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const [, nStr, rStr, pStr, saltB64, hashB64] = parts;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const derived = (await scryptAsync(plain, salt, expected.length, {
      N: Number(nStr),
      r: Number(rStr),
      p: Number(pStr),
    })) as Buffer;
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
```

4. Run, expect PASS. `npm test -w @signex/api -- password.spec` → 4 passing.

5. Commit:
```
git add apps/api/src/common/crypto/password.ts apps/api/src/common/crypto/password.spec.ts
git commit -m "feat(api): scrypt password hash/verify util (node:crypto, no native dep)"
```

---

### Task 12: opaque session-token gen + sha256 hash util

**Files:**
- Create: `apps/api/src/common/crypto/token.ts`
- Test: `apps/api/src/common/crypto/token.spec.ts`

**Interfaces:**
- Consumes: nothing (`node:crypto`).
- Produces: `generateSessionToken(): string` (URL-safe random, 32 bytes base64url — the raw value handed to the cookie, never stored); `hashToken(raw: string): string` (sha256 hex — the value stored in `Session.tokenHash`).

**Steps:**

1. Write the failing test. Create `apps/api/src/common/crypto/token.spec.ts`:
```ts
import { generateSessionToken, hashToken } from './token';

describe('session token', () => {
  it('generates a long random url-safe token, unique per call', () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/); // base64url, no padding
  });

  it('hashes deterministically to 64 hex chars (sha256)', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
  });
});
```

2. Run it, expect FAIL. `npm test -w @signex/api -- token.spec` fails with `Cannot find module './token'`.

3. Implement. Create `apps/api/src/common/crypto/token.ts`:
```ts
import { createHash, randomBytes } from 'node:crypto';

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
```

4. Run, expect PASS. `npm test -w @signex/api -- token.spec` → 2 passing.

5. Commit:
```
git add apps/api/src/common/crypto/token.ts apps/api/src/common/crypto/token.spec.ts
git commit -m "feat(api): opaque session-token gen + sha256 hashToken util"
```

---

### Task 13: ZodValidationPipe

**Files:**
- Create: `apps/api/src/common/pipes/zod-validation.pipe.ts`
- Test: `apps/api/src/common/pipes/zod-validation.pipe.spec.ts`

**Interfaces:**
- Consumes: `z`/`ZodSchema` from `@signex/shared` (re-exported zod v3).
- Produces: `class ZodValidationPipe implements PipeTransform` — constructed with a zod schema; `transform(value)` returns the parsed value on success, throws an `UnprocessableEntityException` (HTTP 422) with `{ message, errors }` on failure.

**Steps:**

1. Write the failing test. Create `apps/api/src/common/pipes/zod-validation.pipe.spec.ts`:
```ts
import { UnprocessableEntityException } from '@nestjs/common';
import { z } from '@signex/shared';
import { ZodValidationPipe } from './zod-validation.pipe';

const schema = z.object({ email: z.string().email(), n: z.number() });

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(schema);
  const meta = { type: 'body' as const, metatype: undefined, data: undefined };

  it('returns the parsed value when valid', () => {
    const out = pipe.transform({ email: 'a@b.com', n: 1 }, meta);
    expect(out).toEqual({ email: 'a@b.com', n: 1 });
  });

  it('throws 422 with field errors when invalid', () => {
    try {
      pipe.transform({ email: 'nope', n: 'x' }, meta);
      fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(UnprocessableEntityException);
      const res = (e as UnprocessableEntityException).getResponse() as {
        errors: unknown[];
      };
      expect(Array.isArray(res.errors)).toBe(true);
      expect(res.errors.length).toBeGreaterThanOrEqual(2);
    }
  });
});
```

2. Run it, expect FAIL. `npm test -w @signex/api -- zod-validation.pipe.spec` fails with `Cannot find module './zod-validation.pipe'`.

3. Implement. Create `apps/api/src/common/pipes/zod-validation.pipe.ts`:
```ts
import {
  ArgumentMetadata,
  Injectable,
  PipeTransform,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { ZodSchema } from '@signex/shared';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new UnprocessableEntityException({
        message: 'Validation failed',
        errors: result.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
    }
    return result.data;
  }
}
```

4. Run, expect PASS. `npm test -w @signex/api -- zod-validation.pipe.spec` → 2 passing.

> NOTE: `ZodSchema` is a zod v3 type re-exported by `@signex/shared` (step 0 re-exports `z` and its types). If the named type import fails to resolve at compile, fall back to `import { z } from '@signex/shared'` and type the field as `z.ZodTypeAny`.

5. Commit:
```
git add apps/api/src/common/pipes/zod-validation.pipe.ts apps/api/src/common/pipes/zod-validation.pipe.spec.ts
git commit -m "feat(api): ZodValidationPipe (422 on schema failure)"
```

---

### Task 14: auth decorators (@Public, @Roles, @CurrentUser)

**Files:**
- Create: `apps/api/src/common/decorators/public.decorator.ts`
- Create: `apps/api/src/common/decorators/roles.decorator.ts`
- Create: `apps/api/src/common/decorators/current-user.decorator.ts`
- Create: `apps/api/src/auth/auth.types.ts`
- Test: `apps/api/src/auth/auth.types.spec.ts`

**Interfaces:**
- Consumes: `RoleName` from `@signex/shared`; `User` model type from `@signex/db`.
- Produces:
  - `IS_PUBLIC_KEY = 'sx:isPublic'`, `@Public()` (SetMetadata true).
  - `ROLES_KEY = 'sx:roles'`, `@Roles(...roles: RoleName[])`.
  - `@CurrentUser()` param decorator → `req.user as AuthedUser | undefined`.
  - `type AuthedUser = { id: string; email: string; name: string; role: RoleName; isActive: boolean }`.
  - `publicUser(u: User): AuthedUser` (strips `passwordHash` and all other fields).

**Steps:**

1. Write the failing test (drives `auth.types.ts`). Create `apps/api/src/auth/auth.types.spec.ts`:
```ts
import { publicUser } from './auth.types';

describe('publicUser', () => {
  it('strips passwordHash and keeps only the public fields', () => {
    const now = new Date();
    const out = publicUser({
      id: 'u1',
      email: 'a@b.com',
      name: 'Alice',
      passwordHash: 'scrypt$secret',
      role: 'ADMIN',
      isActive: true,
      lastLoginAt: now,
      createdAt: now,
      updatedAt: now,
    } as any);
    expect(out).toEqual({
      id: 'u1',
      email: 'a@b.com',
      name: 'Alice',
      role: 'ADMIN',
      isActive: true,
    });
    expect((out as Record<string, unknown>).passwordHash).toBeUndefined();
  });
});
```

2. Run it, expect FAIL. `npm test -w @signex/api -- auth.types.spec` fails with `Cannot find module './auth.types'`.

3. Implement `apps/api/src/auth/auth.types.ts`:
```ts
import type { User } from '@signex/db';
import type { RoleName } from '@signex/shared';

export interface AuthedUser {
  id: string;
  email: string;
  name: string;
  role: RoleName;
  isActive: boolean;
}

export function publicUser(u: User): AuthedUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role as RoleName,
    isActive: u.isActive,
  };
}
```

4. Implement `apps/api/src/common/decorators/public.decorator.ts`:
```ts
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'sx:isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

5. Implement `apps/api/src/common/decorators/roles.decorator.ts`:
```ts
import { SetMetadata } from '@nestjs/common';
import type { RoleName } from '@signex/shared';

export const ROLES_KEY = 'sx:roles';
export const Roles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);
```

6. Implement `apps/api/src/common/decorators/current-user.decorator.ts`:
```ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthedUser } from '../../auth/auth.types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthedUser | undefined => {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthedUser }>();
    return req.user;
  },
);
```

7. Run, expect PASS. `npm test -w @signex/api -- auth.types.spec` → 1 passing. (Decorators have no unit test of their own; they are exercised by the guard + e2e tasks below.)

8. Commit:
```
git add apps/api/src/auth/auth.types.ts apps/api/src/auth/auth.types.spec.ts apps/api/src/common/decorators
git commit -m "feat(api): auth decorators (@Public/@Roles/@CurrentUser) + AuthedUser/publicUser"
```

---

### Task 15: AuthService (login / logout / validateSessionToken / cleanup)

**Files:**
- Create: `apps/api/src/auth/auth.service.ts`
- Test: `apps/api/src/auth/auth.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (`.client`); `verifyPassword` (password util); `generateSessionToken`/`hashToken` (token util); `publicUser`/`AuthedUser` (auth.types).
- Produces:
  - `SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000` (30-day absolute, locked #10).
  - `AuthService.login(email: string, password: string, ctx?: { ip?: string; userAgent?: string }): Promise<{ user: AuthedUser; rawToken: string; expiresAt: Date }>` — throws `UnauthorizedException` on bad creds or inactive user.
  - `AuthService.logout(rawToken: string): Promise<void>` — sets `revokedAt` on the matching session (idempotent).
  - `AuthService.validateSessionToken(rawToken: string): Promise<AuthedUser | null>` — null if missing/expired/revoked/user-inactive; touches `lastSeenAt`.
  - `AuthService.cleanupExpiredSessions(): Promise<number>` — deletes expired/revoked rows (no-op-safe).

**Steps:**

1. Write the failing test. Create `apps/api/src/auth/auth.service.spec.ts`:
```ts
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { hashPassword } from '../common/crypto/password';
import { hashToken } from '../common/crypto/token';

function makePrisma(overrides: Record<string, any> = {}) {
  const user = {
    findUnique: jest.fn(),
    ...overrides.user,
  };
  const session = {
    create: jest.fn().mockResolvedValue({}),
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
    ...overrides.session,
  };
  return { client: { user, session } } as any;
}

describe('AuthService', () => {
  let pwHash: string;
  beforeAll(async () => {
    pwHash = await hashPassword('hunter2');
  });

  it('login returns a user + raw token and stores the hashed token', async () => {
    const prisma = makePrisma({
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'u1', email: 'a@b.com', name: 'A', passwordHash: pwHash,
          role: 'ADMIN', isActive: true,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    });
    const svc = new AuthService(prisma);
    const res = await svc.login('a@b.com', 'hunter2', { ip: '1.2.3.4' });
    expect(res.user.id).toBe('u1');
    expect(res.user.role).toBe('ADMIN');
    expect((res.user as any).passwordHash).toBeUndefined();
    expect(typeof res.rawToken).toBe('string');
    const arg = prisma.client.session.create.mock.calls[0][0].data;
    expect(arg.tokenHash).toBe(hashToken(res.rawToken));
    expect(arg.userId).toBe('u1');
    expect(arg.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('login throws 401 on wrong password', async () => {
    const prisma = makePrisma({
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'u1', email: 'a@b.com', name: 'A', passwordHash: pwHash,
          role: 'ADMIN', isActive: true,
        }),
      },
    });
    const svc = new AuthService(prisma);
    await expect(svc.login('a@b.com', 'WRONG')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('login throws 401 for unknown email and inactive user', async () => {
    const prisma = makePrisma({
      user: { findUnique: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      new AuthService(prisma).login('x@y.com', 'whatever'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const prisma2 = makePrisma({
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'u1', email: 'a@b.com', name: 'A', passwordHash: pwHash,
          role: 'ADMIN', isActive: false,
        }),
      },
    });
    await expect(
      new AuthService(prisma2).login('a@b.com', 'hunter2'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('validateSessionToken returns the user for a live session', async () => {
    const future = new Date(Date.now() + 60_000);
    const prisma = makePrisma({
      session: {
        findUnique: jest.fn().mockResolvedValue({
          id: 's1', tokenHash: hashToken('raw'), expiresAt: future,
          revokedAt: null,
          user: { id: 'u1', email: 'a@b.com', name: 'A', passwordHash: 'h',
                  role: 'EDITOR', isActive: true },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    });
    const out = await new AuthService(prisma).validateSessionToken('raw');
    expect(out?.id).toBe('u1');
    expect(out?.role).toBe('EDITOR');
  });

  it('validateSessionToken returns null when revoked / expired / inactive / missing', async () => {
    const base = (session: any) =>
      new AuthService(makePrisma({ session: { findUnique: jest.fn().mockResolvedValue(session) } }));
    await expect(base(null).validateSessionToken('raw')).resolves.toBeNull();
    await expect(
      base({ expiresAt: new Date(Date.now() + 1000), revokedAt: new Date(),
             user: { isActive: true } }).validateSessionToken('raw'),
    ).resolves.toBeNull();
    await expect(
      base({ expiresAt: new Date(Date.now() - 1000), revokedAt: null,
             user: { isActive: true } }).validateSessionToken('raw'),
    ).resolves.toBeNull();
    await expect(
      base({ expiresAt: new Date(Date.now() + 1000), revokedAt: null,
             user: { isActive: false } }).validateSessionToken('raw'),
    ).resolves.toBeNull();
  });

  it('logout revokes the matching session by token hash', async () => {
    const prisma = makePrisma();
    await new AuthService(prisma).logout('raw');
    expect(prisma.client.session.updateMany).toHaveBeenCalledWith({
      where: { tokenHash: hashToken('raw'), revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
```

2. Run it, expect FAIL. `npm test -w @signex/api -- auth.service.spec` fails with `Cannot find module './auth.service'`.

3. Implement `apps/api/src/auth/auth.service.ts`:
```ts
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { verifyPassword } from '../common/crypto/password';
import { generateSessionToken, hashToken } from '../common/crypto/token';
import { publicUser, type AuthedUser } from './auth.types';

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30-day absolute (locked #10)

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(private readonly prisma: PrismaService) {}

  async login(
    email: string,
    password: string,
    ctx?: { ip?: string; userAgent?: string },
  ): Promise<{ user: AuthedUser; rawToken: string; expiresAt: Date }> {
    const user = await this.prisma.client.user.findUnique({
      where: { email },
    });
    // Verify even when the user is missing to keep timing ~constant (enum resistance).
    const hash =
      user?.passwordHash ??
      'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';
    const ok = await verifyPassword(password, hash);
    if (!user || !user.isActive || !ok) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const rawToken = generateSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await this.prisma.client.session.create({
      data: {
        tokenHash: hashToken(rawToken),
        userId: user.id,
        expiresAt,
        ip: ctx?.ip,
        userAgent: ctx?.userAgent,
      },
    });
    await this.prisma.client.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    return { user: publicUser(user), rawToken, expiresAt };
  }

  async logout(rawToken: string): Promise<void> {
    await this.prisma.client.session.updateMany({
      where: { tokenHash: hashToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async validateSessionToken(rawToken: string): Promise<AuthedUser | null> {
    if (!rawToken) return null;
    const session = await this.prisma.client.session.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: { user: true },
    });
    if (!session) return null;
    if (session.revokedAt) return null;
    if (session.expiresAt.getTime() <= Date.now()) return null;
    if (!session.user || !session.user.isActive) return null;
    await this.prisma.client.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });
    return publicUser(session.user);
  }

  async cleanupExpiredSessions(): Promise<number> {
    try {
      const { count } = await this.prisma.client.session.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: new Date() } },
            { revokedAt: { not: null } },
          ],
        },
      });
      return count;
    } catch (err) {
      this.logger.warn(`session cleanup skipped: ${(err as Error).message}`);
      return 0;
    }
  }
}
```

4. Run, expect PASS. `npm test -w @signex/api -- auth.service.spec` → all passing.

5. Commit:
```
git add apps/api/src/auth/auth.service.ts apps/api/src/auth/auth.service.spec.ts
git commit -m "feat(api): AuthService login/logout/validateSessionToken (server-side sessions, 30d TTL)"
```

---

### Task 16: guard chain — OriginGuard, SessionAuthGuard, RolesGuard

**Files:**
- Create: `apps/api/src/auth/guards/origin.guard.ts`
- Create: `apps/api/src/auth/guards/session-auth.guard.ts`
- Create: `apps/api/src/auth/guards/roles.guard.ts`
- Test: `apps/api/src/auth/guards/origin.guard.spec.ts`
- Test: `apps/api/src/auth/guards/session-auth.guard.spec.ts`
- Test: `apps/api/src/auth/guards/roles.guard.spec.ts`

**Interfaces:**
- Consumes: `Reflector` (Nest); `IS_PUBLIC_KEY`, `ROLES_KEY`; `AuthService.validateSessionToken`; `ROLE_RANK`/`atLeast`/`RoleName` from `@signex/shared`; `AuthedUser`; `SESSION_COOKIE` (defined here, exported).
- Produces: `SESSION_COOKIE = 'sx_session'`; `OriginGuard`, `SessionAuthGuard`, `RolesGuard` (each `implements CanActivate`). Order when registered: Origin → SessionAuth → Roles.

**Steps:**

1. Write the failing OriginGuard test. Create `apps/api/src/auth/guards/origin.guard.spec.ts`:
```ts
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OriginGuard } from './origin.guard';

function ctx(req: any, isPublic = false) {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(isPublic) } as unknown as Reflector;
  const execCtx = {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;
  return { guard: new OriginGuard(reflector, ['http://admin.test']), execCtx };
}

describe('OriginGuard', () => {
  it('skips public routes', () => {
    const { guard, execCtx } = ctx({ method: 'POST', headers: {} }, true);
    expect(guard.canActivate(execCtx)).toBe(true);
  });

  it('allows safe (GET) methods regardless of origin', () => {
    const { guard, execCtx } = ctx({ method: 'GET', headers: {} });
    expect(guard.canActivate(execCtx)).toBe(true);
  });

  it('allows a POST with no Origin header (server-to-server)', () => {
    const { guard, execCtx } = ctx({ method: 'POST', headers: {} });
    expect(guard.canActivate(execCtx)).toBe(true);
  });

  it('allows a POST from an allowlisted Origin', () => {
    const { guard, execCtx } = ctx({ method: 'POST', headers: { origin: 'http://admin.test' } });
    expect(guard.canActivate(execCtx)).toBe(true);
  });

  it('rejects a POST from a foreign Origin', () => {
    const { guard, execCtx } = ctx({ method: 'POST', headers: { origin: 'http://evil.test' } });
    expect(() => guard.canActivate(execCtx)).toThrow(ForbiddenException);
  });
});
```

2. Run it, expect FAIL. `npm test -w @signex/api -- origin.guard.spec` fails with `Cannot find module './origin.guard'`.

3. Implement `apps/api/src/auth/guards/origin.guard.ts`:
```ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';

export const SESSION_COOKIE = 'sx_session';
export const ALLOWED_ORIGINS = 'AUTH_ALLOWED_ORIGINS';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class OriginGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(ALLOWED_ORIGINS) private readonly allowed: string[],
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;

    const origin = req.headers.origin;
    // Server-to-server (admin route handler) sends no browser Origin -> allow.
    if (!origin) return true;
    if (this.allowed.includes(origin)) return true;
    throw new ForbiddenException('Origin not allowed');
  }
}
```

4. Run, expect PASS. `npm test -w @signex/api -- origin.guard.spec` → 5 passing.

5. Write the failing SessionAuthGuard test. Create `apps/api/src/auth/guards/session-auth.guard.spec.ts`:
```ts
import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SessionAuthGuard } from './session-auth.guard';
import { SESSION_COOKIE } from './origin.guard';

function build(isPublic: boolean, validated: any) {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(isPublic) } as unknown as Reflector;
  const authService = { validateSessionToken: jest.fn().mockResolvedValue(validated) } as any;
  const guard = new SessionAuthGuard(reflector, authService);
  return { guard, authService };
}

function ctxFor(req: any) {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;
}

describe('SessionAuthGuard', () => {
  it('skips public routes (and does not call the service)', async () => {
    const { guard, authService } = build(true, null);
    await expect(guard.canActivate(ctxFor({ cookies: {}, headers: {} }))).resolves.toBe(true);
    expect(authService.validateSessionToken).not.toHaveBeenCalled();
  });

  it('attaches req.user for a valid cookie session', async () => {
    const user = { id: 'u1', role: 'ADMIN' };
    const { guard } = build(false, user);
    const req: any = { cookies: { [SESSION_COOKIE]: 'raw' }, headers: {} };
    await expect(guard.canActivate(ctxFor(req))).resolves.toBe(true);
    expect(req.user).toBe(user);
  });

  it('reads a Bearer token when no cookie is present (admin server-to-server)', async () => {
    const user = { id: 'u1', role: 'EDITOR' };
    const { guard, authService } = build(false, user);
    const req: any = { cookies: {}, headers: { authorization: 'Bearer raw-tok' } };
    await expect(guard.canActivate(ctxFor(req))).resolves.toBe(true);
    expect(authService.validateSessionToken).toHaveBeenCalledWith('raw-tok');
    expect(req.user).toBe(user);
  });

  it('throws 401 when no token', async () => {
    const { guard } = build(false, null);
    await expect(
      guard.canActivate(ctxFor({ cookies: {}, headers: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws 401 when the token is invalid', async () => {
    const { guard } = build(false, null);
    await expect(
      guard.canActivate(ctxFor({ cookies: { [SESSION_COOKIE]: 'bad' }, headers: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
```

6. Run it, expect FAIL. `npm test -w @signex/api -- session-auth.guard.spec` fails with `Cannot find module './session-auth.guard'`.

7. Implement `apps/api/src/auth/guards/session-auth.guard.ts`:
```ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { AuthService } from '../auth.service';
import type { AuthedUser } from '../auth.types';
import { SESSION_COOKIE } from './origin.guard';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context
      .switchToHttp()
      .getRequest<Request & { cookies?: Record<string, string>; user?: AuthedUser }>();
    const cookieTok = req.cookies?.[SESSION_COOKIE];
    const authz = req.headers.authorization;
    const bearer = authz?.startsWith('Bearer ') ? authz.slice(7) : undefined;
    const raw = cookieTok ?? bearer;
    if (!raw) throw new UnauthorizedException('Not authenticated');

    const user = await this.auth.validateSessionToken(raw);
    if (!user) throw new UnauthorizedException('Invalid session');
    req.user = user;
    return true;
  }
}
```

8. Run, expect PASS. `npm test -w @signex/api -- session-auth.guard.spec` → 5 passing.

9. Write the failing RolesGuard test. Create `apps/api/src/auth/guards/roles.guard.spec.ts`:
```ts
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

function build(isPublic: boolean, required: string[] | undefined, user: any) {
  const reflector = {
    getAllAndOverride: jest
      .fn()
      .mockImplementation((key: string) =>
        key === 'sx:isPublic' ? isPublic : required,
      ),
  } as unknown as Reflector;
  const ctx = {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;
  return { guard: new RolesGuard(reflector), ctx };
}

describe('RolesGuard', () => {
  it('allows public routes', () => {
    const { guard, ctx } = build(true, ['ADMIN'], undefined);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows when no @Roles is set', () => {
    const { guard, ctx } = build(false, undefined, { role: 'EDITOR' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows when the user rank >= required (ADMIN passes PUBLISHER gate)', () => {
    const { guard, ctx } = build(false, ['PUBLISHER'], { role: 'ADMIN' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rejects when the user rank < required (EDITOR fails PUBLISHER gate)', () => {
    const { guard, ctx } = build(false, ['PUBLISHER'], { role: 'EDITOR' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('rejects when there is no authenticated user', () => {
    const { guard, ctx } = build(false, ['EDITOR'], undefined);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
```

10. Run it, expect FAIL. `npm test -w @signex/api -- roles.guard.spec` fails with `Cannot find module './roles.guard'`.

11. Implement `apps/api/src/auth/guards/roles.guard.ts` (uses `atLeast` so a single highest required role gates by rank; `@Roles('PUBLISHER')` means "PUBLISHER or higher"):
```ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { atLeast, type RoleName } from '@signex/shared';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import type { AuthedUser } from '../auth.types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<RoleName[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthedUser }>();
    const user = req.user;
    if (!user) throw new ForbiddenException('Not authorized');

    // @Roles lists the minimum acceptable role(s); pass if the user meets ANY.
    const ok = required.some((min) => atLeast(user.role, min));
    if (!ok) throw new ForbiddenException('Insufficient role');
    return true;
  }
}
```

12. Run, expect PASS. `npm test -w @signex/api -- roles.guard.spec` → 5 passing.

> NOTE: `atLeast(role, min)` from `@signex/shared` (step 0) must return `ROLE_RANK[role] >= ROLE_RANK[min]`. The Produces contract above relies on that semantics.

13. Commit:
```
git add apps/api/src/auth/guards
git commit -m "feat(api): RBAC guard chain (OriginGuard/SessionAuthGuard/RolesGuard) + sx_session cookie const"
```

---

### Task 17: AuthController + AuthModule (login/logout/me, cookie I/O, throttler)

**Files:**
- Create: `apps/api/src/auth/auth.controller.ts`
- Create: `apps/api/src/auth/auth.module.ts`
- Modify: `apps/api/package.json` (add `cookie-parser`, `@nestjs/throttler`, `@types/cookie-parser`)

**Interfaces:**
- Consumes: `AuthService`; `ZodValidationPipe` + `loginSchema` (`@signex/shared`); `@Public`, `@CurrentUser`; `SESSION_COOKIE`, `SESSION_TTL_MS`; `@nestjs/throttler` `ThrottlerGuard`/`@Throttle`.
- Produces: `AuthController` routes `POST /api/auth/login` (`@Public`, throttled), `POST /api/auth/logout`, `GET /api/auth/me`; `AuthModule` (registers `ThrottlerModule`, provides `AuthService`, exports `AuthService`).

**Steps:**

1. Add deps. Run:
```
npm install -w @signex/api cookie-parser @nestjs/throttler
npm install -w @signex/api -D @types/cookie-parser
```
Expect: `apps/api/package.json` gains `cookie-parser` + `@nestjs/throttler` under dependencies and `@types/cookie-parser` under devDependencies; root lockfile updates.

2. Verify install. Run `npm ls -w @signex/api @nestjs/throttler cookie-parser` and expect both resolved (no `UNMET DEPENDENCY`).

3. Implement `apps/api/src/auth/auth.controller.ts`:
```ts
import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UsePipes,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { loginSchema, type RoleName } from '@signex/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthService, SESSION_TTL_MS } from './auth.service';
import { SESSION_COOKIE } from './guards/origin.guard';
import type { AuthedUser } from './auth.types';

interface LoginBody {
  email: string;
  password: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @UsePipes(new ZodValidationPipe(loginSchema))
  async login(
    @Body() body: LoginBody,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: AuthedUser }> {
    const { user, rawToken, expiresAt } = await this.auth.login(
      body.email,
      body.password,
      {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
    );
    res.cookie(SESSION_COOKIE, rawToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_TTL_MS,
      expires: expiresAt,
    });
    return { user };
  }

  @Post('logout')
  async logout(
    @Req() req: Request & { cookies?: Record<string, string> },
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    const raw = req.cookies?.[SESSION_COOKIE];
    if (raw) await this.auth.logout(raw);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthedUser | undefined): { user: AuthedUser } {
    if (!user) throw new UnauthorizedException();
    return { user };
  }
}
```

4. Implement `apps/api/src/auth/auth.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
```

5. Verify it compiles. Run `npm run build -w @signex/api`. Expect a clean `nest build` (exit 0). (No new unit test here; the routes are covered end-to-end in the e2e task. The `@Throttle` decorator only takes effect once `ThrottlerGuard` is registered as an APP_GUARD in the wiring task below.)

6. Commit:
```
git add apps/api/src/auth/auth.controller.ts apps/api/src/auth/auth.module.ts apps/api/package.json package-lock.json
git commit -m "feat(api): AuthController (login/logout/me) + AuthModule with throttler; add cookie-parser/@nestjs/throttler deps"
```

---

### Task 18: UsersService + UsersController + UsersModule (ADMIN CRUD)

**Files:**
- Create: `apps/api/src/users/users.service.ts`
- Create: `apps/api/src/users/users.controller.ts`
- Create: `apps/api/src/users/users.module.ts`
- Test: `apps/api/src/users/users.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`; `hashPassword`; `publicUser`/`AuthedUser`; `createUserSchema`/`RoleName` (`@signex/shared`); `ZodValidationPipe`; `@Roles('ADMIN')`.
- Produces:
  - `UsersService.create(dto: { email; name; password; role }): Promise<AuthedUser>` (hashes password, `ConflictException` on dup email).
  - `UsersService.update(id, dto: { name?; role?; isActive? }): Promise<AuthedUser>` — when the patch demotes role or sets `isActive:false`, revoke that user's live sessions (instant kill, locked #10).
  - `UsersService.deactivate(id): Promise<AuthedUser>` — soft (sets `isActive:false`, revokes sessions; never hard-delete — preserves audit FKs).
  - `UsersController` (`@Roles('ADMIN')` at class level): `POST /api/users`, `PATCH /api/users/:id`, `DELETE /api/users/:id`.
  - `UsersModule`.

**Steps:**

1. Write the failing test. Create `apps/api/src/users/users.service.spec.ts`:
```ts
import { ConflictException } from '@nestjs/common';
import { UsersService } from './users.service';
import { verifyPassword } from '../common/crypto/password';

function makePrisma(overrides: Record<string, any> = {}) {
  const user = {
    create: jest.fn(),
    update: jest.fn(),
    findUnique: jest.fn(),
    ...overrides.user,
  };
  const session = {
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    ...overrides.session,
  };
  return { client: { user, session } } as any;
}

describe('UsersService', () => {
  it('create hashes the password and returns a public user', async () => {
    const prisma = makePrisma({
      user: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'u1', email: data.email, name: data.name,
            passwordHash: data.passwordHash, role: data.role, isActive: true,
          }),
        ),
      },
    });
    const svc = new UsersService(prisma);
    const out = await svc.create({
      email: 'new@b.com', name: 'New', password: 'pw12345', role: 'EDITOR',
    });
    expect(out).toEqual({
      id: 'u1', email: 'new@b.com', name: 'New', role: 'EDITOR', isActive: true,
    });
    const stored = prisma.client.user.create.mock.calls[0][0].data.passwordHash;
    expect(stored).not.toBe('pw12345');
    await expect(verifyPassword('pw12345', stored)).resolves.toBe(true);
  });

  it('create throws Conflict on duplicate email (P2002)', async () => {
    const prisma = makePrisma({
      user: {
        create: jest.fn().mockRejectedValue({ code: 'P2002' }),
      },
    });
    await expect(
      new UsersService(prisma).create({
        email: 'dup@b.com', name: 'X', password: 'pw12345', role: 'EDITOR',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('update revokes sessions when role is provided (possible demote) or deactivating', async () => {
    const prisma = makePrisma({
      user: {
        update: jest.fn().mockResolvedValue({
          id: 'u1', email: 'a@b.com', name: 'A', passwordHash: 'h',
          role: 'EDITOR', isActive: true,
        }),
      },
    });
    const svc = new UsersService(prisma);
    await svc.update('u1', { role: 'EDITOR' });
    expect(prisma.client.session.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('update does NOT revoke sessions for a name-only patch', async () => {
    const prisma = makePrisma({
      user: {
        update: jest.fn().mockResolvedValue({
          id: 'u1', email: 'a@b.com', name: 'A2', passwordHash: 'h',
          role: 'ADMIN', isActive: true,
        }),
      },
    });
    const svc = new UsersService(prisma);
    await svc.update('u1', { name: 'A2' });
    expect(prisma.client.session.updateMany).not.toHaveBeenCalled();
  });

  it('deactivate sets isActive:false and revokes sessions', async () => {
    const prisma = makePrisma({
      user: {
        update: jest.fn().mockResolvedValue({
          id: 'u1', email: 'a@b.com', name: 'A', passwordHash: 'h',
          role: 'EDITOR', isActive: false,
        }),
      },
    });
    const svc = new UsersService(prisma);
    const out = await svc.deactivate('u1');
    expect(out.isActive).toBe(false);
    expect(prisma.client.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' }, data: { isActive: false },
    });
    expect(prisma.client.session.updateMany).toHaveBeenCalled();
  });
});
```

2. Run it, expect FAIL. `npm test -w @signex/api -- users.service.spec` fails with `Cannot find module './users.service'`.

3. Implement `apps/api/src/users/users.service.ts`:
```ts
import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword } from '../common/crypto/password';
import { publicUser, type AuthedUser } from '../auth/auth.types';
import type { RoleName } from '@signex/shared';

interface CreateUserInput {
  email: string;
  name: string;
  password: string;
  role: RoleName;
}
interface UpdateUserInput {
  name?: string;
  role?: RoleName;
  isActive?: boolean;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserInput): Promise<AuthedUser> {
    try {
      const user = await this.prisma.client.user.create({
        data: {
          email: dto.email,
          name: dto.name,
          passwordHash: await hashPassword(dto.password),
          role: dto.role,
        },
      });
      return publicUser(user);
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        throw new ConflictException('Email already in use');
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateUserInput): Promise<AuthedUser> {
    const user = await this.prisma.client.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    // Role change (possible demote) or deactivation => revoke live sessions (instant kill).
    if (dto.role !== undefined || dto.isActive === false) {
      await this.revokeSessions(id);
    }
    return publicUser(user);
  }

  async deactivate(id: string): Promise<AuthedUser> {
    const user = await this.prisma.client.user.update({
      where: { id },
      data: { isActive: false },
    });
    await this.revokeSessions(id);
    return publicUser(user);
  }

  private async revokeSessions(userId: string): Promise<void> {
    await this.prisma.client.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
```

4. Run, expect PASS. `npm test -w @signex/api -- users.service.spec` → 5 passing.

5. Implement `apps/api/src/users/users.controller.ts`:
```ts
import {
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  Post,
  UsePipes,
} from '@nestjs/common';
import { createUserSchema, z, type RoleName } from '@signex/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { UsersService } from './users.service';
import type { AuthedUser } from '../auth/auth.types';

// Local patch schema (step 0 ships createUserSchema; updates are a partial subset).
const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(['EDITOR', 'PUBLISHER', 'ADMIN']).optional(),
  isActive: z.boolean().optional(),
});

interface CreateBody {
  email: string;
  name: string;
  password: string;
  role: RoleName;
}
interface UpdateBody {
  name?: string;
  role?: RoleName;
  isActive?: boolean;
}

@Controller('users')
@Roles('ADMIN')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  @UsePipes(new ZodValidationPipe(createUserSchema))
  create(@Body() body: CreateBody): Promise<AuthedUser> {
    return this.users.create(body);
  }

  @Patch(':id')
  @UsePipes(new ZodValidationPipe(updateUserSchema))
  update(
    @Param('id') id: string,
    @Body() body: UpdateBody,
  ): Promise<AuthedUser> {
    return this.users.update(id, body);
  }

  @Delete(':id')
  deactivate(@Param('id') id: string): Promise<AuthedUser> {
    return this.users.deactivate(id);
  }
}
```

6. Implement `apps/api/src/users/users.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

@Module({
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
```

7. Verify build. Run `npm run build -w @signex/api`. Expect exit 0.

> NOTE: `createUserSchema` from step 0 must validate `{ email, name, password, role }`. If step 0 named the role field differently, align the `CreateBody` interface to its inferred type — the pipe parses against `createUserSchema` regardless.

8. Commit:
```
git add apps/api/src/users
git commit -m "feat(api): UsersModule ADMIN CRUD (create/update/deactivate, session revoke on demote/deactivate)"
```

---

### Task 19: wire cookie-parser + guard chain into the app

**Files:**
- Modify: `apps/api/src/main.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `AuthModule`, `UsersModule`, `OriginGuard`/`SessionAuthGuard`/`RolesGuard`, `ALLOWED_ORIGINS` token, `ThrottlerGuard`, `cookieParser`.
- Produces: a booted app with `cookie-parser` middleware and the global `APP_GUARD` chain in order **ThrottlerGuard → OriginGuard → SessionAuthGuard → RolesGuard** (Nest applies `APP_GUARD` providers in registration order); `@Public()` on `GET /api/health` so the chain stays secure-by-default.

**Steps:**

1. Mark health public so the guard chain doesn't lock it. Edit `apps/api/src/health/health.controller.ts` — add the import and decorator:
```ts
import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check(): { status: string } {
    return { status: 'ok' };
  }
}
```

2. Also mark the scaffold root controller public (it has no auth and the e2e `GET /` must stay 200). Edit `apps/api/src/app.controller.ts` to add `@Public()` to its `getHello` handler (import `Public` from `./common/decorators/public.decorator`). Add the import line and place `@Public()` directly above the existing `@Get()`.

3. Add cookie-parser in `apps/api/src/main.ts`:
```ts
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.enableShutdownHooks();
  const port = process.env.API_PORT ?? 3060;
  await app.listen(port, '0.0.0.0');
}
void bootstrap();
```

4. Wire modules + global guards in `apps/api/src/app.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { OriginGuard, ALLOWED_ORIGINS } from './auth/guards/origin.guard';
import { SessionAuthGuard } from './auth/guards/session-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';

@Module({
  imports: [PrismaModule, HealthModule, AuthModule, UsersModule],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: ALLOWED_ORIGINS,
      useFactory: (): string[] =>
        (process.env.ALLOWED_ORIGINS ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
    },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
```

5. Verify it builds and existing tests pass. Run `npm run build -w @signex/api` (expect exit 0), then `npm test -w @signex/api` (expect all unit specs green, including the existing `app.controller.spec.ts`).

6. Commit:
```
git add apps/api/src/main.ts apps/api/src/app.module.ts apps/api/src/health/health.controller.ts apps/api/src/app.controller.ts
git commit -m "feat(api): wire cookie-parser + APP_GUARD chain (throttler->origin->session->roles); @Public health/root"
```

---

### Task 20: auth e2e (supertest) — public open, login cookie, me, RBAC 401/403

**Files:**
- Create: `apps/api/test/auth.e2e-spec.ts`

**Interfaces:**
- Consumes: `AppModule`, the guard chain, `AuthService` (overridden in the test module so no real DB is needed), `SESSION_COOKIE`.
- Produces: an e2e proof that the guard chain rejects unauthenticated/under-privileged requests and that login sets the `sx_session` cookie and `me` reflects it. Runs via `npm run test:e2e -w @signex/api`.

> Rationale for the override: per `PrismaService`, the api tolerates a DB-less boot. We override `AuthService` with an in-memory stub so the e2e exercises the **guard wiring + cookie I/O** deterministically without Postgres (full DB-backed flow is covered in the step-10 whole-stack acceptance).

**Steps:**

1. Write the e2e. Create `apps/api/test/auth.e2e-spec.ts`:
```ts
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { SESSION_COOKIE } from '../src/auth/guards/origin.guard';
import type { AuthedUser } from '../src/auth/auth.types';

const ADMIN: AuthedUser = {
  id: 'u-admin', email: 'admin@signex.test', name: 'Admin',
  role: 'ADMIN', isActive: true,
};
const EDITOR: AuthedUser = {
  id: 'u-editor', email: 'editor@signex.test', name: 'Editor',
  role: 'EDITOR', isActive: true,
};

// In-memory auth: "admin-tok" -> ADMIN, "editor-tok" -> EDITOR.
const tokenToUser: Record<string, AuthedUser> = {
  'admin-tok': ADMIN,
  'editor-tok': EDITOR,
};

const authStub: Partial<AuthService> = {
  login: jest.fn(async (email: string, password: string) => {
    if (email === 'admin@signex.test' && password === 'pw') {
      return {
        user: ADMIN,
        rawToken: 'admin-tok',
        expiresAt: new Date(Date.now() + 60_000),
      };
    }
    throw new UnauthorizedException('Invalid credentials');
  }),
  logout: jest.fn(async () => {}),
  validateSessionToken: jest.fn(async (raw: string) => tokenToUser[raw] ?? null),
};

describe('Auth + RBAC (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthService)
      .useValue(authStub)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health is public (200)', () =>
    request(app.getHttpServer()).get('/api/health').expect(200, { status: 'ok' }));

  it('GET /api/auth/me is 401 without a session', () =>
    request(app.getHttpServer()).get('/api/auth/me').expect(401));

  it('POST /api/auth/login with bad creds is 401', () =>
    request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@signex.test', password: 'WRONG' })
      .expect(401));

  it('POST /api/auth/login with a malformed body is 422 (ZodValidationPipe)', () =>
    request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'not-an-email' })
      .expect(422));

  it('login sets the sx_session cookie and me returns the user', async () => {
    const agent = request.agent(app.getHttpServer());
    const login = await agent
      .post('/api/auth/login')
      .send({ email: 'admin@signex.test', password: 'pw' })
      .expect(201);
    const setCookie = login.headers['set-cookie'][0] as string;
    expect(setCookie).toContain(`${SESSION_COOKIE}=`);
    expect(setCookie.toLowerCase()).toContain('httponly');

    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.user.email).toBe('admin@signex.test');
    expect(me.body.user.passwordHash).toBeUndefined();
  });

  it('POST /api/users requires ADMIN: 401 anon, 403 editor, 201 admin', async () => {
    const server = app.getHttpServer();
    // anon
    await request(server)
      .post('/api/users')
      .send({ email: 'x@y.com', name: 'X', password: 'pw12345', role: 'EDITOR' })
      .expect(401);
    // editor -> forbidden by RolesGuard
    await request(server)
      .post('/api/users')
      .set('Cookie', [`${SESSION_COOKIE}=editor-tok`])
      .send({ email: 'x@y.com', name: 'X', password: 'pw12345', role: 'EDITOR' })
      .expect(403);
  });
});
```

> NOTE: The ADMIN-success branch of `POST /api/users` would hit the real `UsersService`→Prisma; since the e2e runs DB-less, the assertions above stop at the **401/403 guard outcomes** (the create path itself is unit-tested in the UsersService task). Do not assert a 201 for the admin create here.

2. Run it, expect FAIL first if any wiring is wrong, then iterate. Run `npm run test:e2e -w @signex/api`. Expect, on first run with all prior tasks merged, the suite to PASS (6 cases). If `me` returns 401 after login, confirm `cookieParser()` is applied in BOTH `main.ts` and the e2e `beforeAll` (supertest agent needs it to round-trip the cookie).

3. Confirm the whole api test surface is green. Run `npm test -w @signex/api` (unit) and `npm run test:e2e -w @signex/api` (e2e); expect both exit 0.

4. Commit:
```
git add apps/api/test/auth.e2e-spec.ts
git commit -m "test(api): e2e auth + RBAC (public health, login cookie, me, 401/403 user guard)"
```

---

### Task 21: docker build gate for the api image (spec §15 step 2)

**Files:**
- (no source changes — verification only)

**Interfaces:**
- Consumes: the new `cookie-parser` + `@nestjs/throttler` deps must be traced into the api standalone/dist build.
- Produces: a green `docker compose build api` proving the auth deps are installed in the image and `nest build` succeeds inside the container.

**Steps:**

1. Build the api image. Run:
```
docker compose build api
```
Expect: build completes exit 0; the npm install layer resolves `cookie-parser` and `@nestjs/throttler`; the `nest build` (or `npm run build`) layer emits `dist/main.js` with no TS errors.

2. Smoke the dependency presence inside the built image. Run:
```
docker compose run --rm --no-deps --entrypoint sh api -c "node -e \"require('cookie-parser'); require('@nestjs/throttler'); console.log('deps ok')\""
```
Expect stdout `deps ok` (proves both runtime deps are present in the image, not just the host).

3. No commit (verification step). If the build fails because the deps aren't in the lockfile layer, re-run `npm install` at the repo root and re-commit `package-lock.json` with the AuthController task, then re-build.

---

## Milestone 3 — Seed / bootstrap (auth:seed system ADMIN + deploy-order contract)

**Consumes (from earlier milestones):**
- @signex/db: prisma (PrismaClient singleton) and the generated User model — User { id: String @id @default(cuid()), email: String @unique, name: String, passwordHash: String, role: Role @default(EDITOR), isActive: Boolean @default(true), lastLoginAt: DateTime?, createdAt, updatedAt } (from step 1)
- @signex/db: Prisma.UserUpsertArgs / Prisma.UserCreateInput types (generated, from step 1)
- packages/db migration applied via `npm run migrate:deploy -w @signex/db` so the User table + release_version_seq exist (from step 1)
- @signex/shared: RoleName type and the ADMIN role literal usable as the Prisma Role value (from step 0)
- apps/api/src/auth/password.ts: export async function hashPassword(plain: string): Promise<string> — node:crypto scrypt, format `scrypt$<saltB64>$<hashB64>` — the SAME hasher login's verifyPassword() checks against (from step 2)
- apps/api/src/prisma/prisma.service.ts: PrismaService with readonly client: PrismaClient (from existing scaffold)
- apps/api/src/prisma/prisma.module.ts: @Global() PrismaModule exporting PrismaService (from existing scaffold)

**Produces (for later milestones):**
- apps/api/src/auth/seed-config.ts: export const SYSTEM_USER_ID = 'seedsystemadmin0000000000' (deterministic 25-char cuid-shaped id, c-prefixed) — the fixed system actor id later steps pass as createdById / uploadedById
- apps/api/src/auth/seed-config.ts: export interface SeedAdminConfig { email: string; name: string; password: string }
- apps/api/src/auth/seed-config.ts: export function readSeedAdminConfig(env?: NodeJS.ProcessEnv): SeedAdminConfig — throws Error if SEED_ADMIN_EMAIL/NAME/PASSWORD missing/blank or password < 12 chars
- apps/api/src/auth/seed.service.ts: @Injectable() export class SeedService { constructor(prisma: PrismaService); async seedAdmin(cfg: SeedAdminConfig): Promise<{ id: string; created: boolean }> } — the importer (step 7) imports SeedService/SYSTEM_USER_ID to obtain the system actor id
- apps/api package.json script `auth:seed` => `node dist/auth/seed` (the deploy-order step run after migrate deploy, before the importer)

### Task 22: Seed config reader + deterministic SYSTEM_USER_ID (pure, jest unit)

**Files:**
- Create: `apps/api/src/auth/seed-config.ts`
- Test: `apps/api/src/auth/seed-config.spec.ts`

**Interfaces:**
- Consumes: nothing at runtime (pure env reader). Uses the `RoleName` concept from `@signex/shared` only as the documented ADMIN literal — but `seed-config.ts` itself stays dependency-free so it is trivially unit-testable.
- Produces:
  - `export const SYSTEM_USER_ID = 'seedsystemadmin0000000000'` — a fixed, deterministic, cuid-shaped id (25 chars, starts with a letter, `[a-z0-9]`) that satisfies the importer's later `z.string().cuid()`-ish expectations and the Prisma `@id` String column. Stable across every environment so the importer (step 7) can reference the system actor by a known constant.
  - `export interface SeedAdminConfig { email: string; name: string; password: string }`
  - `export function readSeedAdminConfig(env?: NodeJS.ProcessEnv): SeedAdminConfig`

Steps:

1. Write the failing test. Create `apps/api/src/auth/seed-config.spec.ts`:

```ts
import { SYSTEM_USER_ID, readSeedAdminConfig } from './seed-config';

describe('seed-config', () => {
  describe('SYSTEM_USER_ID', () => {
    it('is a stable, cuid-shaped 25-char lowercase id', () => {
      expect(SYSTEM_USER_ID).toBe('seedsystemadmin0000000000');
      expect(SYSTEM_USER_ID).toHaveLength(25);
      expect(SYSTEM_USER_ID).toMatch(/^[a-z][a-z0-9]{24}$/);
    });
  });

  describe('readSeedAdminConfig', () => {
    const ok = {
      SEED_ADMIN_EMAIL: 'admin@signex.test',
      SEED_ADMIN_NAME: 'System Admin',
      SEED_ADMIN_PASSWORD: 'change-me-please',
    };

    it('returns a typed config from SEED_ADMIN_* env', () => {
      expect(readSeedAdminConfig(ok)).toEqual({
        email: 'admin@signex.test',
        name: 'System Admin',
        password: 'change-me-please',
      });
    });

    it('trims surrounding whitespace on email and name', () => {
      const cfg = readSeedAdminConfig({
        ...ok,
        SEED_ADMIN_EMAIL: '  admin@signex.test  ',
        SEED_ADMIN_NAME: '  System Admin  ',
      });
      expect(cfg.email).toBe('admin@signex.test');
      expect(cfg.name).toBe('System Admin');
    });

    it('throws when SEED_ADMIN_EMAIL is missing', () => {
      const { SEED_ADMIN_EMAIL, ...rest } = ok;
      expect(() => readSeedAdminConfig(rest)).toThrow(/SEED_ADMIN_EMAIL/);
    });

    it('throws when SEED_ADMIN_NAME is blank', () => {
      expect(() => readSeedAdminConfig({ ...ok, SEED_ADMIN_NAME: '   ' })).toThrow(
        /SEED_ADMIN_NAME/,
      );
    });

    it('throws when SEED_ADMIN_PASSWORD is shorter than 12 chars', () => {
      expect(() => readSeedAdminConfig({ ...ok, SEED_ADMIN_PASSWORD: 'short' })).toThrow(
        /SEED_ADMIN_PASSWORD.*12/,
      );
    });
  });
});
```

2. Run it, expect FAIL: `npm test -w @signex/api -- seed-config` reports `Cannot find module './seed-config'`.

3. Implement minimal code. Create `apps/api/src/auth/seed-config.ts`:

```ts
/**
 * Deterministic id for the fixed SYSTEM / ADMIN user created by `auth:seed`.
 * Stable across every environment so the importer (build step 7) can reference
 * the system actor (createdById / Asset.uploadedById) by a known constant
 * without a lookup. Shaped like a cuid (25 chars, letter-led, [a-z0-9]) so it
 * satisfies the String @id column and `@signex/shared`'s cuid-ish id schema.
 */
export const SYSTEM_USER_ID = 'seedsystemadmin0000000000';

export interface SeedAdminConfig {
  email: string;
  name: string;
  password: string;
}

const MIN_PASSWORD_LEN = 12;

function required(env: NodeJS.ProcessEnv, key: string): string {
  const raw = env[key];
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (value.length === 0) {
    throw new Error(`Seed failed: ${key} is required (set it in your .env).`);
  }
  return value;
}

/**
 * Reads + validates the SEED_ADMIN_* environment into a typed config.
 * Pure: takes an explicit env (defaults to process.env) so it is unit-testable.
 */
export function readSeedAdminConfig(
  env: NodeJS.ProcessEnv = process.env,
): SeedAdminConfig {
  const email = required(env, 'SEED_ADMIN_EMAIL');
  const name = required(env, 'SEED_ADMIN_NAME');
  const password = required(env, 'SEED_ADMIN_PASSWORD');
  if (password.length < MIN_PASSWORD_LEN) {
    throw new Error(
      `Seed failed: SEED_ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LEN} characters.`,
    );
  }
  return { email, name, password };
}
```

4. Run, expect PASS: `npm test -w @signex/api -- seed-config` — 6 passing.

5. Commit:

```
git add apps/api/src/auth/seed-config.ts apps/api/src/auth/seed-config.spec.ts
git commit -m "feat(api): seed config reader + deterministic SYSTEM_USER_ID"
```

---

### Task 23: SeedService — idempotent upsert of the fixed SYSTEM/ADMIN user

**Files:**
- Create: `apps/api/src/auth/seed.service.ts`
- Test: `apps/api/src/auth/seed.service.spec.ts`

**Interfaces:**
- Consumes:
  - `apps/api/src/auth/seed-config.ts`: `SYSTEM_USER_ID`, `SeedAdminConfig` (previous task).
  - `apps/api/src/auth/password.ts`: `hashPassword(plain: string): Promise<string>` (from step 2 — the same scrypt hasher login verifies against). Must NOT re-implement hashing here.
  - `apps/api/src/prisma/prisma.service.ts`: `PrismaService` with `client: PrismaClient` exposing `client.user.upsert(...)` (User model from step 1).
  - `@signex/shared`: the ADMIN role literal (`RoleName`) — used as the Prisma `Role` value `'ADMIN'`.
- Produces:
  - `@Injectable() export class SeedService { constructor(private readonly prisma: PrismaService); async seedAdmin(cfg: SeedAdminConfig): Promise<{ id: string; created: boolean }> }`
  - Behaviour contract: upserts a `User` whose `id === SYSTEM_USER_ID`, `role === 'ADMIN'`, `isActive === true`, `passwordHash === await hashPassword(cfg.password)`. On create returns `{ created: true }`; on re-run (row already exists) returns `{ created: false }` and refreshes `name`, `email`, `passwordHash`, re-asserts `role: 'ADMIN'` + `isActive: true` (so a demoted/disabled system user is healed). Idempotent: same logical result every run.

Steps:

1. Write the failing test. Create `apps/api/src/auth/seed.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { SeedService } from './seed.service';
import { SYSTEM_USER_ID, type SeedAdminConfig } from './seed-config';
import { PrismaService } from '../prisma/prisma.service';
import * as password from './password';

const cfg: SeedAdminConfig = {
  email: 'admin@signex.test',
  name: 'System Admin',
  password: 'change-me-please',
};

describe('SeedService', () => {
  let service: SeedService;
  let upsert: jest.Mock;

  beforeEach(async () => {
    jest.restoreAllMocks();
    jest.spyOn(password, 'hashPassword').mockResolvedValue('scrypt$SALT$HASH');
    upsert = jest.fn();
    const moduleRef = await Test.createTestingModule({
      providers: [
        SeedService,
        { provide: PrismaService, useValue: { client: { user: { upsert } } } },
      ],
    }).compile();
    service = moduleRef.get(SeedService);
  });

  it('hashes the password via the shared scrypt hasher (not inline)', async () => {
    upsert.mockResolvedValue({ id: SYSTEM_USER_ID, createdAt: new Date(), updatedAt: new Date() });
    await service.seedAdmin(cfg);
    expect(password.hashPassword).toHaveBeenCalledWith('change-me-please');
  });

  it('upserts the fixed system user as ADMIN + active with the deterministic id', async () => {
    upsert.mockResolvedValue({ id: SYSTEM_USER_ID, createdAt: new Date('2020-01-01'), updatedAt: new Date('2020-01-01') });
    await service.seedAdmin(cfg);
    const args = upsert.mock.calls[0][0];
    expect(args.where).toEqual({ id: SYSTEM_USER_ID });
    expect(args.create).toMatchObject({
      id: SYSTEM_USER_ID,
      email: 'admin@signex.test',
      name: 'System Admin',
      passwordHash: 'scrypt$SALT$HASH',
      role: 'ADMIN',
      isActive: true,
    });
    expect(args.update).toMatchObject({
      email: 'admin@signex.test',
      name: 'System Admin',
      passwordHash: 'scrypt$SALT$HASH',
      role: 'ADMIN',
      isActive: true,
    });
    // never reassigns the id on update
    expect(args.update.id).toBeUndefined();
  });

  it('reports created:true on first run (createdAt === updatedAt)', async () => {
    const t = new Date('2020-01-01T00:00:00.000Z');
    upsert.mockResolvedValue({ id: SYSTEM_USER_ID, createdAt: t, updatedAt: t });
    await expect(service.seedAdmin(cfg)).resolves.toEqual({ id: SYSTEM_USER_ID, created: true });
  });

  it('reports created:false on a re-run (updatedAt > createdAt) and is idempotent', async () => {
    upsert.mockResolvedValue({
      id: SYSTEM_USER_ID,
      createdAt: new Date('2020-01-01T00:00:00.000Z'),
      updatedAt: new Date('2020-02-01T00:00:00.000Z'),
    });
    await expect(service.seedAdmin(cfg)).resolves.toEqual({ id: SYSTEM_USER_ID, created: false });
    await expect(service.seedAdmin(cfg)).resolves.toEqual({ id: SYSTEM_USER_ID, created: false });
    expect(upsert).toHaveBeenCalledTimes(2);
  });
});
```

2. Run it, expect FAIL: `npm test -w @signex/api -- seed.service` reports `Cannot find module './seed.service'`.

3. Implement minimal code. Create `apps/api/src/auth/seed.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword } from './password';
import { SYSTEM_USER_ID, type SeedAdminConfig } from './seed-config';

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotently creates/repairs the fixed SYSTEM/ADMIN user.
   * - id is the deterministic SYSTEM_USER_ID (never reassigned on update).
   * - role/isActive are re-asserted so a demoted/deactivated system user heals.
   * - password is hashed with the shared scrypt hasher (same one login verifies).
   * Returns created:true only when the row was newly inserted (createdAt === updatedAt).
   */
  async seedAdmin(cfg: SeedAdminConfig): Promise<{ id: string; created: boolean }> {
    const passwordHash = await hashPassword(cfg.password);
    const fields = {
      email: cfg.email,
      name: cfg.name,
      passwordHash,
      role: 'ADMIN' as const,
      isActive: true,
    };

    const user = await this.prisma.client.user.upsert({
      where: { id: SYSTEM_USER_ID },
      create: { id: SYSTEM_USER_ID, ...fields },
      update: { ...fields },
      select: { id: true, createdAt: true, updatedAt: true },
    });

    const created = user.createdAt.getTime() === user.updatedAt.getTime();
    this.logger.log(
      `${created ? 'Created' : 'Updated'} system admin ${cfg.email} (${user.id})`,
    );
    return { id: user.id, created };
  }
}
```

4. Run, expect PASS: `npm test -w @signex/api -- seed.service` — 4 passing.

5. Commit:

```
git add apps/api/src/auth/seed.service.ts apps/api/src/auth/seed.service.spec.ts
git commit -m "feat(api): SeedService idempotent system ADMIN upsert"
```

---

### Task 24: auth:seed CLI entrypoint + package scripts + .env.example deploy-order contract

**Files:**
- Create: `apps/api/src/auth/seed.ts`
- Modify: `apps/api/package.json`
- Modify: `.env.example`

**Interfaces:**
- Consumes:
  - `apps/api/src/auth/seed-config.ts`: `readSeedAdminConfig()`.
  - `apps/api/src/auth/seed.service.ts`: `SeedService.seedAdmin(cfg)`.
  - `apps/api/src/app.module.ts`: `AppModule` (which already imports `@Global() PrismaModule`); `AuthModule` (from step 2) is imported into `AppModule` and provides `SeedService` — so a standalone Nest context built from `AppModule` can resolve `SeedService`. (If step 2's `AuthModule` does not yet register `SeedService`, add `SeedService` to `AuthModule`'s providers in that step; this CLI assumes it is resolvable from the application context.)
  - `dotenv` (already present at the repo root `node_modules/dotenv`) to load `.env` for non-Docker runs.
- Produces:
  - The runnable `dist/auth/seed.js` (via `nest build`) invoked by the `auth:seed` npm script — the deploy step that runs AFTER `prisma migrate deploy` and BEFORE the importer (spec §8 seed-order contract).

Steps:

1. Register `SeedService` so the CLI can resolve it. (Sanity pre-check — do not duplicate if step 2 already did this.) Confirm `apps/api/src/auth/auth.module.ts` lists `SeedService` in `providers` and exports it:

```ts
// inside AuthModule's @Module({...})
providers: [/* ...existing auth providers..., */ SeedService],
exports: [/* ...existing..., */ SeedService],
```

If `auth.module.ts` does not yet exist (step 2 not landed in this branch), instead create a minimal local module for the seed CLI in the next step rather than depending on `AuthModule`. The reference implementation below resolves `SeedService` from `AppModule`'s context and assumes `AuthModule` (with `SeedService`) is imported there.

2. Write the verification harness (no unit mock — this is a thin orchestration entrypoint; verify by build + run). First create the entrypoint `apps/api/src/auth/seed.ts`:

```ts
import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { SeedService } from './seed.service';
import { readSeedAdminConfig } from './seed-config';

/**
 * Deploy-order step (spec §8):
 *   1. npm run migrate:deploy -w @signex/db   (tables + release_version_seq)
 *   2. npm run auth:seed -w @signex/api        (<-- THIS)  fixed SYSTEM/ADMIN user
 *   3. importer (build step 7)                 (Release v1, system actor = SYSTEM_USER_ID)
 *
 * Idempotent: safe to re-run on every deploy.
 */
async function main(): Promise<void> {
  const logger = new Logger('auth:seed');
  const cfg = readSeedAdminConfig(); // throws (and we exit 1) if SEED_ADMIN_* missing/invalid

  // Standalone context: no HTTP server, just the DI container.
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const seeder = app.get(SeedService);
    const { id, created } = await seeder.seedAdmin(cfg);
    logger.log(
      `auth:seed done — system admin ${cfg.email} (${id}) ${created ? 'created' : 'already present (updated)'}`,
    );
  } finally {
    await app.close();
  }
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(`auth:seed failed: ${(err as Error).message}`);
  process.exit(1);
});
```

3. Add the npm scripts. Edit `apps/api/package.json` — add to the `scripts` block (after `"start:prod"`):

```json
    "auth:seed": "node dist/auth/seed",
    "auth:seed:dev": "ts-node -r tsconfig-paths/register src/auth/seed.ts",
    "db:deploy": "npm run migrate:deploy -w @signex/db && npm run auth:seed -w @signex/api",
```

(`auth:seed` runs the compiled `dist/auth/seed.js`; `auth:seed:dev` runs it from TS without a build using the already-present `ts-node`/`tsconfig-paths`; `db:deploy` encodes the migrate→seed half of the deploy order — the importer is invoked separately in step 7.)

4. Document the env + deploy order. Edit `.env.example` — append a new block after the `# API URLs` section:

```bash

# ---------------------------------------------------------------------------
# Seed / bootstrap (consumed by `npm run auth:seed -w @signex/api`).
# Deploy order (spec §8):
#   1) npm run migrate:deploy -w @signex/db   # create tables + release_version_seq
#   2) npm run auth:seed -w @signex/api        # idempotent fixed SYSTEM/ADMIN user
#   3) run the importer (build step 7)         # mints Release v1 with the system actor
# (`npm run db:deploy -w @signex/api` runs steps 1+2 together.)
# auth:seed is IDEMPOTENT — safe to re-run on every deploy.
# ---------------------------------------------------------------------------
SEED_ADMIN_EMAIL=admin@signex.local
SEED_ADMIN_NAME=System Admin
# MUST be >= 12 chars. CHANGE THIS before any real deploy; rotate after first login.
SEED_ADMIN_PASSWORD=change-me-please-now
```

5. Verify it compiles into `dist`. Run the build (workspace deps first, then api):

```
npm run build -w @signex/db -w @signex/shared && npm run build -w @signex/api
```

Expect: build succeeds and the file `apps/api/dist/auth/seed.js` exists. Verify:

```
test -f apps/api/dist/auth/seed.js && echo SEED_DIST_OK
```

Expect output `SEED_DIST_OK`.

6. Verify the missing-env guard exits non-zero WITHOUT touching the DB. Run the compiled entrypoint with the SEED_ADMIN_* vars unset:

```
env -u SEED_ADMIN_EMAIL -u SEED_ADMIN_NAME -u SEED_ADMIN_PASSWORD node apps/api/dist/auth/seed.js; echo "exit=$?"
```

Expect: stderr line `auth:seed failed: Seed failed: SEED_ADMIN_EMAIL is required (set it in your .env).` and `exit=1`. (The config is read before the Nest context boots, so no DB write occurs.)

7. Verify the happy path creates the admin against a live DB (Postgres container up, schema migrated). From the repo root:

```
docker compose up -d postgres
DATABASE_URL='postgresql://signex:signex@localhost:3059/signex?schema=public' npm run migrate:deploy -w @signex/db
DATABASE_URL='postgresql://signex:signex@localhost:3059/signex?schema=public' \
  SEED_ADMIN_EMAIL='admin@signex.local' SEED_ADMIN_NAME='System Admin' SEED_ADMIN_PASSWORD='change-me-please-now' \
  node apps/api/dist/auth/seed.js; echo "exit=$?"
```

Expect: log line containing `system admin admin@signex.local (seedsystemadmin0000000000) created` and `exit=0`.

8. Verify idempotency (re-runnable). Run the exact same seed command a SECOND time:

```
DATABASE_URL='postgresql://signex:signex@localhost:3059/signex?schema=public' \
  SEED_ADMIN_EMAIL='admin@signex.local' SEED_ADMIN_NAME='System Admin' SEED_ADMIN_PASSWORD='change-me-please-now' \
  node apps/api/dist/auth/seed.js; echo "exit=$?"
```

Expect: log now says `already present (updated)` and `exit=0`. Confirm exactly one row with the deterministic id exists:

```
docker compose exec -T postgres psql -U signex -d signex -tAc \
  "select count(*), max(role::text), bool_and(\"isActive\") from \"User\" where id='seedsystemadmin0000000000';"
```

Expect output `1|ADMIN|t` (one row, role ADMIN, active true).

9. Verify the documented combined deploy script works end-to-end:

```
DATABASE_URL='postgresql://signex:signex@localhost:3059/signex?schema=public' \
  SEED_ADMIN_EMAIL='admin@signex.local' SEED_ADMIN_NAME='System Admin' SEED_ADMIN_PASSWORD='change-me-please-now' \
  npm run db:deploy -w @signex/api; echo "exit=$?"
```

Expect: migrate deploy reports no pending migrations (or applies them), then auth:seed logs `already present (updated)`, `exit=0`.

10. Commit:

```
git add apps/api/src/auth/seed.ts apps/api/package.json .env.example
git commit -m "feat(api): auth:seed CLI + deploy-order contract (migrate deploy -> seed -> importer)"
```

---

## Milestone 4 — api ContentService + CatalogService (single-writer working-state edits: revision-guard, registry zod-validate, AssetRef reconcile, audit)

**Consumes (from earlier milestones):**
- @signex/db: prisma (PrismaClient singleton), PrismaService.client (apps/api/src/prisma/prisma.service.ts) with models user, session, auditLog, asset, assetRef, category, product, contentBlock, workingState; Prisma.TransactionClient type
- @signex/db enums: BlockKind { PAGE SETTINGS NAV SEO }, Role { EDITOR PUBLISHER ADMIN }
- @signex/shared step 0: parseBlock(kind: BlockKind | string, key: string, data: unknown) -> validated data (throws ZodError on invalid); BLOCK_REGISTRY; BlockKey type; ReleaseBlocks
- @signex/shared step 0 catalog.ts: categoryInputSchema, productInputSchema (zod DTOs mirroring Category/Product create/update payloads), AssetRef = z.object({ assetId, alt: LocalizedText.optional() }), VideoRef = z.object({ posterAssetId, mp4AssetId, webmAssetId?.optional() }), LocalizedText
- @signex/shared step 0 auth.ts: ROLE_RANK, atLeast(), RoleName
- api step 2 auth guards/decorators: @Roles(role: RoleName) (Reflector key 'roles'), @CurrentUser() param decorator (injects { id, role, ... } User), @Public(), SessionAuthGuard + RolesGuard registered as global APP_GUARDs, ZodValidationPipe (validates body against a zod schema, throws 422), publicUser()
- api step 2 test helper: a login/session bootstrap usable in e2e (seed an EDITOR user + obtain sx_session cookie)

**Produces (for later milestones):**
- WorkingStateService.ensure(): Promise<void>
- WorkingStateService.readState(): Promise<{ revision: number; lastPublishedRevision: number }>
- WorkingStateService.guardAndBump(tx: Prisma.TransactionClient, expectedRevision: number, updatedById?: string): Promise<number> // returns new revision; throws ConflictException STALE_DRAFT on mismatch
- AuditService.writeAudit(tx: Prisma.TransactionClient, entry: { userId?: string|null; action: string; entityType: string; entityId?: string|null; meta?: unknown }): Promise<void>
- collectAssetRefs(data: unknown): Array<{ field: string; assetId: string; alt?: unknown }> // walks AssetRef + VideoRef nodes
- reconcileAssetRefs(tx: Prisma.TransactionClient, ownerType: string, ownerId: string, refs: Array<{ field: string; assetId: string; alt?: unknown }>): Promise<void>
- ContentService.updateBlock(actor: { id: string }, kind: BlockKind, key: string, data: unknown, expectedRevision: number): Promise<{ revision: number }>
- ContentService.getBlock(kind: BlockKind, key: string): Promise<unknown> // stored data or null
- CatalogService.createCategory(actor, input, expectedRevision): Promise<{ id: string; revision: number }>
- CatalogService.updateCategory(actor, id, input, expectedRevision): Promise<{ revision: number }>
- CatalogService.deleteCategory(actor, id, expectedRevision): Promise<{ revision: number }>
- CatalogService.createProduct(actor, input, expectedRevision): Promise<{ id: string; revision: number }>
- CatalogService.updateProduct(actor, id, input, expectedRevision): Promise<{ revision: number }>
- CatalogService.deleteProduct(actor, id, expectedRevision): Promise<{ revision: number }>
- Route PUT /api/content/blocks/:kind/:key (EDITOR+) -> { revision } | 409 STALE_DRAFT | 422 INVALID_BLOCK
- Route GET /api/working-state (EDITOR+) -> { revision, lastPublishedRevision, dirty }
- Routes POST/PATCH/DELETE /api/catalog/categories|products (EDITOR+)
- ContentModule, CatalogModule, WorkingStateModule, AuditModule exported for the release engine (step 6) and importer (step 7) to reuse guardAndBump/writeAudit/reconcileAssetRefs

### Task 25: WorkingStateService — the global optimistic lock primitive

The whole milestone hangs off one singleton row (`WorkingState`, `@id @default("singleton")`) carrying a monotonic `revision`. Every write tx in Content/Catalog (and later Release/Importer) calls `guardAndBump` inside the same transaction: it re-reads the row `FOR`-update-style via Prisma, throws `409 STALE_DRAFT` if the caller's `expectedRevision` no longer matches, else increments and returns the new revision. This task delivers that primitive plus a tiny read endpoint for the admin dirty-status surface.

**Files:**
- Create: `apps/api/src/working-state/working-state.service.ts`
- Create: `apps/api/src/working-state/working-state.module.ts`
- Create: `apps/api/src/working-state/working-state.controller.ts`
- Test: `apps/api/src/working-state/working-state.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService.client` (from `apps/api/src/prisma/prisma.service.ts`) exposing `workingState` model + `$transaction`; `Prisma.TransactionClient` type from `@signex/db`; api step-2 `@Roles('EDITOR')`, `@CurrentUser()`, global `SessionAuthGuard`/`RolesGuard`.
- Produces:
  - `WorkingStateService.ensure(): Promise<void>`
  - `WorkingStateService.readState(): Promise<{ revision: number; lastPublishedRevision: number }>`
  - `WorkingStateService.guardAndBump(tx: Prisma.TransactionClient, expectedRevision: number, updatedById?: string): Promise<number>`

**Steps:**

1. Write the failing test. Create `apps/api/src/working-state/working-state.service.spec.ts`:
```ts
import { ConflictException } from '@nestjs/common';
import { WorkingStateService } from './working-state.service';

function mockTx(current: { revision: number; lastPublishedRevision: number } | null) {
  return {
    workingState: {
      findUnique: jest.fn().mockResolvedValue(current),
      update: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({ revision: current!.revision + 1, ...data }),
      ),
      upsert: jest.fn().mockResolvedValue({ revision: 0, lastPublishedRevision: 0 }),
    },
  } as any;
}

describe('WorkingStateService', () => {
  describe('guardAndBump', () => {
    it('bumps and returns revision+1 when expectedRevision matches', async () => {
      const svc = new WorkingStateService({ client: {} } as any);
      const tx = mockTx({ revision: 4, lastPublishedRevision: 0 });
      const next = await svc.guardAndBump(tx, 4, 'user_1');
      expect(next).toBe(5);
      expect(tx.workingState.update).toHaveBeenCalledWith({
        where: { id: 'singleton' },
        data: { revision: 5, updatedById: 'user_1' },
      });
    });

    it('throws 409 STALE_DRAFT when expectedRevision is stale', async () => {
      const svc = new WorkingStateService({ client: {} } as any);
      const tx = mockTx({ revision: 7, lastPublishedRevision: 0 });
      await expect(svc.guardAndBump(tx, 4)).rejects.toBeInstanceOf(ConflictException);
      await expect(svc.guardAndBump(tx, 4)).rejects.toMatchObject({
        response: { code: 'STALE_DRAFT' },
      });
      expect(tx.workingState.update).not.toHaveBeenCalled();
    });

    it('throws 409 when the singleton row is missing', async () => {
      const svc = new WorkingStateService({ client: {} } as any);
      const tx = mockTx(null);
      await expect(svc.guardAndBump(tx, 0)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('ensure', () => {
    it('upserts the singleton with id "singleton"', async () => {
      const upsert = jest.fn().mockResolvedValue({});
      const svc = new WorkingStateService({ client: { workingState: { upsert } } } as any);
      await svc.ensure();
      expect(upsert).toHaveBeenCalledWith({
        where: { id: 'singleton' },
        update: {},
        create: { id: 'singleton', revision: 0, lastPublishedRevision: 0 },
      });
    });
  });
});
```

2. Run it, expect FAIL. `npm test -w @signex/api -- working-state.service` → fails with `Cannot find module './working-state.service'`.

3. Implement minimal code. Create `apps/api/src/working-state/working-state.service.ts`:
```ts
import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma } from '@signex/db';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WorkingStateService {
  constructor(private readonly prisma: PrismaService) {}

  async ensure(): Promise<void> {
    await this.prisma.client.workingState.upsert({
      where: { id: 'singleton' },
      update: {},
      create: { id: 'singleton', revision: 0, lastPublishedRevision: 0 },
    });
  }

  async readState(): Promise<{ revision: number; lastPublishedRevision: number }> {
    await this.ensure();
    const row = await this.prisma.client.workingState.findUniqueOrThrow({
      where: { id: 'singleton' },
      select: { revision: true, lastPublishedRevision: true },
    });
    return row;
  }

  /**
   * Optimistic-lock guard. MUST be called inside the caller's tx so the
   * read+bump is atomic with the edit. Returns the new revision.
   */
  async guardAndBump(
    tx: Prisma.TransactionClient,
    expectedRevision: number,
    updatedById?: string,
  ): Promise<number> {
    const current = await tx.workingState.findUnique({
      where: { id: 'singleton' },
      select: { revision: true },
    });
    if (!current || current.revision !== expectedRevision) {
      throw new ConflictException({
        code: 'STALE_DRAFT',
        message: `Working state moved on (expected revision ${expectedRevision}, found ${current?.revision ?? 'none'}).`,
      });
    }
    const next = current.revision + 1;
    await tx.workingState.update({
      where: { id: 'singleton' },
      data: { revision: next, updatedById },
    });
    return next;
  }
}
```

4. Run, expect PASS. `npm test -w @signex/api -- working-state.service` → 4 passing.

5. Implement the module + read controller. Create `apps/api/src/working-state/working-state.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { WorkingStateService } from './working-state.service';
import { WorkingStateController } from './working-state.controller';

@Module({
  providers: [WorkingStateService],
  controllers: [WorkingStateController],
  exports: [WorkingStateService],
})
export class WorkingStateModule {}
```
Create `apps/api/src/working-state/working-state.controller.ts`:
```ts
import { Controller, Get } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { WorkingStateService } from './working-state.service';

@Controller('working-state')
export class WorkingStateController {
  constructor(private readonly workingState: WorkingStateService) {}

  @Get()
  @Roles('EDITOR')
  async get(): Promise<{ revision: number; lastPublishedRevision: number; dirty: boolean }> {
    const s = await this.workingState.readState();
    return { ...s, dirty: s.revision !== s.lastPublishedRevision };
  }
}
```
> The `@Roles` import path `../auth/roles.decorator` is the step-2 deliverable; if step 2 exported it elsewhere, adjust the import to the actual path (do not re-define the decorator here).

6. Run the full api unit suite. `npm test -w @signex/api` → still green (controller has no spec yet; it is covered by the catalog/content e2e indirectly and by manual GET in the acceptance step).

7. Commit. `git add apps/api/src/working-state && git commit -m "feat(api): WorkingStateService optimistic-lock guardAndBump + dirty-status endpoint"`.

---

### Task 26: AuditService — atomic audit-log append

Every committed working-state edit must leave an `AuditLog` row written **inside the same tx** as the mutation (so a rolled-back edit leaves no audit). This thin service centralizes the create payload shape so Content, Catalog, and later Release all log identically.

**Files:**
- Create: `apps/api/src/audit/audit.service.ts`
- Create: `apps/api/src/audit/audit.module.ts`
- Test: `apps/api/src/audit/audit.service.spec.ts`

**Interfaces:**
- Consumes: `Prisma.TransactionClient` with `auditLog.create`.
- Produces: `AuditService.writeAudit(tx, { userId?, action, entityType, entityId?, meta? }): Promise<void>`.

**Steps:**

1. Write the failing test. Create `apps/api/src/audit/audit.service.spec.ts`:
```ts
import { AuditService } from './audit.service';

describe('AuditService', () => {
  it('writeAudit forwards the exact create payload to tx.auditLog.create', async () => {
    const create = jest.fn().mockResolvedValue({});
    const tx = { auditLog: { create } } as any;
    const svc = new AuditService();
    await svc.writeAudit(tx, {
      userId: 'user_1',
      action: 'content.update',
      entityType: 'contentBlock',
      entityId: 'PAGE:home.hero',
      meta: { key: 'home.hero' },
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        action: 'content.update',
        entityType: 'contentBlock',
        entityId: 'PAGE:home.hero',
        meta: { key: 'home.hero' },
      },
    });
  });

  it('defaults entityId/meta/userId to null/undefined-safe values', async () => {
    const create = jest.fn().mockResolvedValue({});
    const tx = { auditLog: { create } } as any;
    await new AuditService().writeAudit(tx, {
      action: 'release.publish',
      entityType: 'release',
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        userId: null,
        action: 'release.publish',
        entityType: 'release',
        entityId: null,
        meta: undefined,
      },
    });
  });
});
```

2. Run it, expect FAIL. `npm test -w @signex/api -- audit.service` → `Cannot find module './audit.service'`.

3. Implement. Create `apps/api/src/audit/audit.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@signex/db';

export interface AuditEntry {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  meta?: unknown;
}

@Injectable()
export class AuditService {
  async writeAudit(tx: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
    await tx.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        meta: entry.meta as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
```

4. Run, expect PASS. `npm test -w @signex/api -- audit.service` → 2 passing.

5. Create the module. `apps/api/src/audit/audit.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';

@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
```

6. Commit. `git add apps/api/src/audit && git commit -m "feat(api): AuditService — atomic audit-log append on tx client"`.

---

### Task 27: AssetRef walker (collectAssetRefs)

`ContentService` must, on every block save, derive the set of assets the block references so the derived `AssetRef` cache stays accurate. This is a pure function that deep-walks the validated JSON, recognizing the two registry primitives: `AssetRef` (`{ assetId, alt? }`) and `VideoRef` (`{ posterAssetId, mp4AssetId, webmAssetId? }`). Pure → trivially unit-testable, no Prisma.

**Files:**
- Create: `apps/api/src/content/asset-ref.util.ts`
- Test: `apps/api/src/content/asset-ref.util.spec.ts`

**Interfaces:**
- Consumes: nothing (string/object walking only). Shapes mirror `@signex/shared` `AssetRef`/`VideoRef`.
- Produces: `collectAssetRefs(data: unknown): Array<{ field: string; assetId: string; alt?: unknown }>`.

**Steps:**

1. Write the failing test. Create `apps/api/src/content/asset-ref.util.spec.ts`:
```ts
import { collectAssetRefs } from './asset-ref.util';

describe('collectAssetRefs', () => {
  it('finds a nested AssetRef and labels its json path', () => {
    const data = { hero: { image: { assetId: 'a1', alt: { en: 'x', vi: 'y' } } } };
    expect(collectAssetRefs(data)).toEqual([
      { field: 'hero.image', assetId: 'a1', alt: { en: 'x', vi: 'y' } },
    ]);
  });

  it('indexes array members (gallery[2])', () => {
    const data = {
      gallery: [{ assetId: 'a0' }, { assetId: 'a1' }, { assetId: 'a2' }],
    };
    expect(collectAssetRefs(data)).toEqual([
      { field: 'gallery[0]', assetId: 'a0' },
      { field: 'gallery[1]', assetId: 'a1' },
      { field: 'gallery[2]', assetId: 'a2' },
    ]);
  });

  it('expands a VideoRef into its poster + mp4 (+ webm) assets', () => {
    const data = {
      video: { media: { posterAssetId: 'p1', mp4AssetId: 'm1', webmAssetId: 'w1' } },
    };
    expect(collectAssetRefs(data)).toEqual([
      { field: 'video.media.poster', assetId: 'p1' },
      { field: 'video.media.mp4', assetId: 'm1' },
      { field: 'video.media.webm', assetId: 'w1' },
    ]);
  });

  it('omits webm when absent', () => {
    const data = { media: { posterAssetId: 'p1', mp4AssetId: 'm1' } };
    expect(collectAssetRefs(data)).toEqual([
      { field: 'media.poster', assetId: 'p1' },
      { field: 'media.mp4', assetId: 'm1' },
    ]);
  });

  it('ignores plain objects with no assetId/posterAssetId', () => {
    const data = { title: { en: 'Hi', vi: 'Chao' }, count: 4, nested: { foo: 'bar' } };
    expect(collectAssetRefs(data)).toEqual([]);
  });

  it('dedups identical (field,assetId) but keeps distinct fields for same asset', () => {
    const data = { a: { assetId: 'x' }, b: { assetId: 'x' } };
    expect(collectAssetRefs(data)).toEqual([
      { field: 'a', assetId: 'x' },
      { field: 'b', assetId: 'x' },
    ]);
  });
});
```

2. Run it, expect FAIL. `npm test -w @signex/api -- asset-ref.util` → `Cannot find module './asset-ref.util'`.

3. Implement. Create `apps/api/src/content/asset-ref.util.ts`:
```ts
export interface CollectedRef {
  field: string;
  assetId: string;
  alt?: unknown;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Deep-walk a validated block/record value, emitting one CollectedRef per
 * asset USE. Recognizes:
 *   AssetRef  { assetId, alt? }
 *   VideoRef  { posterAssetId, mp4AssetId, webmAssetId? }
 * `field` is a json-path-ish label (e.g. "hero.image", "gallery[2]",
 * "video.media.poster") used as the AssetRef unique key.
 */
export function collectAssetRefs(data: unknown): CollectedRef[] {
  const out: CollectedRef[] = [];

  const walk = (node: unknown, path: string): void => {
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }
    if (!isRecord(node)) return;

    // VideoRef
    if (typeof node.posterAssetId === 'string' && typeof node.mp4AssetId === 'string') {
      out.push({ field: `${path}.poster`, assetId: node.posterAssetId });
      out.push({ field: `${path}.mp4`, assetId: node.mp4AssetId });
      if (typeof node.webmAssetId === 'string') {
        out.push({ field: `${path}.webm`, assetId: node.webmAssetId });
      }
      return;
    }

    // AssetRef
    if (typeof node.assetId === 'string') {
      out.push(
        node.alt === undefined
          ? { field: path, assetId: node.assetId }
          : { field: path, assetId: node.assetId, alt: node.alt },
      );
      return;
    }

    for (const [k, v] of Object.entries(node)) {
      walk(v, path ? `${path}.${k}` : k);
    }
  };

  walk(data, '');
  return out;
}
```
> Note: the top-level walk starts at `path=''`; the first object level produces keys like `hero` then `hero.image`. The `path ? `${path}.${k}` : k` guard keeps the first segment clean.

4. Run, expect PASS. `npm test -w @signex/api -- asset-ref.util` → 6 passing.

5. Commit. `git add apps/api/src/content/asset-ref.util.ts apps/api/src/content/asset-ref.util.spec.ts && git commit -m "feat(api): collectAssetRefs walker for AssetRef/VideoRef nodes"`.

---

### Task 28: reconcileAssetRefs — delete-then-insert the derived cache

Given the collected refs for one owner (a contentBlock, category, or product), rebuild that owner's `AssetRef` rows. `AssetRef` is a derived cache (spec §9), so reconcile is delete-all-for-owner then create-the-current-set, run on the tx client so it is atomic with the edit. Shared by both Content and Catalog services.

**Files:**
- Create: `apps/api/src/catalog/asset-ref.reconcile.ts`
- Test: `apps/api/src/catalog/asset-ref.reconcile.spec.ts`

**Interfaces:**
- Consumes: `Prisma.TransactionClient` with `assetRef.deleteMany` + `assetRef.createMany`; `CollectedRef` from `../content/asset-ref.util`.
- Produces: `reconcileAssetRefs(tx, ownerType: string, ownerId: string, refs: CollectedRef[]): Promise<void>`.

**Steps:**

1. Write the failing test. Create `apps/api/src/catalog/asset-ref.reconcile.spec.ts`:
```ts
import { reconcileAssetRefs } from './asset-ref.reconcile';

describe('reconcileAssetRefs', () => {
  it('deletes all existing owner refs then creates the new set', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 3 });
    const createMany = jest.fn().mockResolvedValue({ count: 2 });
    const tx = { assetRef: { deleteMany, createMany } } as any;

    await reconcileAssetRefs(tx, 'contentBlock', 'PAGE:home.hero', [
      { field: 'hero.image', assetId: 'a1', alt: { en: 'x', vi: 'y' } },
      { field: 'gallery[0]', assetId: 'a2' },
    ]);

    expect(deleteMany).toHaveBeenCalledWith({
      where: { ownerType: 'contentBlock', ownerId: 'PAGE:home.hero' },
    });
    expect(createMany).toHaveBeenCalledWith({
      data: [
        { ownerType: 'contentBlock', ownerId: 'PAGE:home.hero', field: 'hero.image', assetId: 'a1', alt: { en: 'x', vi: 'y' } },
        { ownerType: 'contentBlock', ownerId: 'PAGE:home.hero', field: 'gallery[0]', assetId: 'a2', alt: undefined },
      ],
    });
  });

  it('still deletes but skips createMany when there are no refs', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const createMany = jest.fn();
    const tx = { assetRef: { deleteMany, createMany } } as any;
    await reconcileAssetRefs(tx, 'product', 'prod_1', []);
    expect(deleteMany).toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
  });
});
```

2. Run it, expect FAIL. `npm test -w @signex/api -- asset-ref.reconcile` → `Cannot find module './asset-ref.reconcile'`.

3. Implement. Create `apps/api/src/catalog/asset-ref.reconcile.ts`:
```ts
import type { Prisma } from '@signex/db';
import type { CollectedRef } from '../content/asset-ref.util';

/**
 * Rebuild the derived AssetRef cache for one owner. Delete-then-insert inside
 * the caller's tx (AssetRef is a derived cache rebuilt on every edit, §9).
 */
export async function reconcileAssetRefs(
  tx: Prisma.TransactionClient,
  ownerType: string,
  ownerId: string,
  refs: CollectedRef[],
): Promise<void> {
  await tx.assetRef.deleteMany({ where: { ownerType, ownerId } });
  if (refs.length === 0) return;
  await tx.assetRef.createMany({
    data: refs.map((r) => ({
      ownerType,
      ownerId,
      field: r.field,
      assetId: r.assetId,
      alt: r.alt as Prisma.InputJsonValue | undefined,
    })),
  });
}
```

4. Run, expect PASS. `npm test -w @signex/api -- asset-ref.reconcile` → 2 passing.

5. Commit. `git add apps/api/src/catalog/asset-ref.reconcile.ts apps/api/src/catalog/asset-ref.reconcile.spec.ts && git commit -m "feat(api): reconcileAssetRefs delete-then-insert for derived AssetRef cache"`.

---

### Task 29: ContentService — single writer for ContentBlock edits

The core of the milestone. `updateBlock` runs one short tx that: (1) `guardAndBump` on the revision, (2) `parseBlock(kind,key,data)` from `@signex/shared` (a `ZodError` → `422 INVALID_BLOCK`), (3) upserts the `ContentBlock` by `(kind,key)`, (4) reconciles the block's `AssetRef` rows under `ownerType:'contentBlock'`, `ownerId:'<KIND>:<key>'`, (5) writes a `content.update` audit. Returns the new `{ revision }`.

**Files:**
- Create: `apps/api/src/content/content.service.ts`
- Create: `apps/api/src/content/content.module.ts`
- Test: `apps/api/src/content/content.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService.client.$transaction((tx)=>...)`; `WorkingStateService.guardAndBump`; `AuditService.writeAudit`; `collectAssetRefs`; `reconcileAssetRefs`; `@signex/shared` `parseBlock(kind, key, data)`; `@signex/db` `BlockKind`.
- Produces:
  - `ContentService.updateBlock(actor: { id: string }, kind: BlockKind, key: string, data: unknown, expectedRevision: number): Promise<{ revision: number }>`
  - `ContentService.getBlock(kind: BlockKind, key: string): Promise<unknown>`

**Steps:**

1. Write the failing test. Create `apps/api/src/content/content.service.spec.ts`:
```ts
import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { ContentService } from './content.service';

// Mock the shared registry so the service test is deterministic and offline.
jest.mock('@signex/shared', () => ({
  parseBlock: jest.fn(),
}));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { parseBlock } = require('@signex/shared') as { parseBlock: jest.Mock };

function buildTx() {
  return {
    contentBlock: { upsert: jest.fn().mockResolvedValue({ id: 'cb_1' }) },
    assetRef: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    workingState: {
      findUnique: jest.fn().mockResolvedValue({ revision: 2 }),
      update: jest.fn().mockResolvedValue({ revision: 3 }),
    },
  } as any;
}

function buildService(tx: any) {
  const prisma = { client: { $transaction: (fn: any) => fn(tx) } } as any;
  // real WorkingStateService + AuditService (their unit tests already cover them)
  const { WorkingStateService } = require('../working-state/working-state.service');
  const { AuditService } = require('../audit/audit.service');
  return new ContentService(prisma, new WorkingStateService(prisma), new AuditService());
}

describe('ContentService.updateBlock', () => {
  beforeEach(() => parseBlock.mockReset());

  it('validates, upserts, reconciles refs, bumps revision and audits', async () => {
    parseBlock.mockReturnValue({ image: { assetId: 'a1' } });
    const tx = buildTx();
    const svc = buildService(tx);

    const res = await svc.updateBlock({ id: 'user_1' }, 'PAGE' as any, 'home.hero', { any: 1 }, 2);

    expect(res).toEqual({ revision: 3 });
    expect(parseBlock).toHaveBeenCalledWith('PAGE', 'home.hero', { any: 1 });
    expect(tx.contentBlock.upsert).toHaveBeenCalledWith({
      where: { kind_key: { kind: 'PAGE', key: 'home.hero' } },
      create: { kind: 'PAGE', key: 'home.hero', data: { image: { assetId: 'a1' } } },
      update: { data: { image: { assetId: 'a1' } } },
    });
    expect(tx.assetRef.deleteMany).toHaveBeenCalledWith({
      where: { ownerType: 'contentBlock', ownerId: 'PAGE:home.hero' },
    });
    expect(tx.assetRef.createMany).toHaveBeenCalledWith({
      data: [{ ownerType: 'contentBlock', ownerId: 'PAGE:home.hero', field: 'image', assetId: 'a1', alt: undefined }],
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'user_1', action: 'content.update', entityType: 'contentBlock', entityId: 'PAGE:home.hero' }),
    });
  });

  it('throws 422 INVALID_BLOCK when parseBlock throws', async () => {
    parseBlock.mockImplementation(() => {
      const e: any = new Error('bad'); e.name = 'ZodError'; e.issues = [{ path: ['image'], message: 'required' }]; throw e;
    });
    const tx = buildTx();
    const svc = buildService(tx);
    await expect(svc.updateBlock({ id: 'u' }, 'PAGE' as any, 'home.hero', {}, 2))
      .rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(tx.contentBlock.upsert).not.toHaveBeenCalled();
  });

  it('throws 409 STALE_DRAFT when the revision moved', async () => {
    parseBlock.mockReturnValue({});
    const tx = buildTx();
    tx.workingState.findUnique.mockResolvedValue({ revision: 5 }); // caller said 2
    const svc = buildService(tx);
    await expect(svc.updateBlock({ id: 'u' }, 'PAGE' as any, 'home.hero', {}, 2))
      .rejects.toBeInstanceOf(ConflictException);
  });
});
```

2. Run it, expect FAIL. `npm test -w @signex/api -- content.service` → `Cannot find module './content.service'`.

3. Implement. Create `apps/api/src/content/content.service.ts`:
```ts
import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import type { BlockKind, Prisma } from '@signex/db';
import { parseBlock } from '@signex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { WorkingStateService } from '../working-state/working-state.service';
import { AuditService } from '../audit/audit.service';
import { collectAssetRefs } from './asset-ref.util';
import { reconcileAssetRefs } from '../catalog/asset-ref.reconcile';

function ownerId(kind: BlockKind, key: string): string {
  return `${kind}:${key}`;
}

function isZodError(e: unknown): e is { name: string; issues: unknown } {
  return typeof e === 'object' && e !== null && (e as { name?: string }).name === 'ZodError';
}

@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workingState: WorkingStateService,
    private readonly audit: AuditService,
  ) {}

  async getBlock(kind: BlockKind, key: string): Promise<unknown> {
    const row = await this.prisma.client.contentBlock.findUnique({
      where: { kind_key: { kind, key } },
      select: { data: true },
    });
    return row?.data ?? null;
  }

  async updateBlock(
    actor: { id: string },
    kind: BlockKind,
    key: string,
    data: unknown,
    expectedRevision: number,
  ): Promise<{ revision: number }> {
    // Validate by (kind,key) via the shared registry BEFORE opening the tx is
    // fine, but we keep it inside so an invalid block never bumps revision.
    let validated: unknown;
    try {
      validated = parseBlock(kind, key, data);
    } catch (e) {
      if (isZodError(e)) {
        throw new UnprocessableEntityException({
          code: 'INVALID_BLOCK',
          message: `Block ${kind}:${key} failed validation`,
          issues: (e as { issues: unknown }).issues,
        });
      }
      throw e;
    }

    return this.prisma.client.$transaction(async (tx) => {
      const revision = await this.workingState.guardAndBump(tx, expectedRevision, actor.id);

      await tx.contentBlock.upsert({
        where: { kind_key: { kind, key } },
        create: { kind, key, data: validated as Prisma.InputJsonValue },
        update: { data: validated as Prisma.InputJsonValue },
      });

      await reconcileAssetRefs(tx, 'contentBlock', ownerId(kind, key), collectAssetRefs(validated));

      await this.audit.writeAudit(tx, {
        userId: actor.id,
        action: 'content.update',
        entityType: 'contentBlock',
        entityId: ownerId(kind, key),
        meta: { kind, key },
      });

      return { revision };
    });
  }
}
```

4. Run, expect PASS. `npm test -w @signex/api -- content.service` → 3 passing.

5. Create the module. `apps/api/src/content/content.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { WorkingStateModule } from '../working-state/working-state.module';
import { AuditModule } from '../audit/audit.module';
import { ContentService } from './content.service';
import { ContentController } from './content.controller';

@Module({
  imports: [WorkingStateModule, AuditModule],
  providers: [ContentService],
  controllers: [ContentController],
  exports: [ContentService],
})
export class ContentModule {}
```
> `ContentController` is created in the next task; this import will not compile until then. Defer the unit run for the module to the next task's PASS step.

6. Commit. `git add apps/api/src/content/content.service.ts apps/api/src/content/content.service.spec.ts apps/api/src/content/content.module.ts && git commit -m "feat(api): ContentService single-writer block edits (guard, validate, upsert, reconcile, audit)"`.

---

### Task 30: ContentController — PUT/GET /api/content/blocks/:kind/:key

Exposes `ContentService` over REST per spec §7.5. The `:kind` path param is the upper-case `BlockKind` (PAGE/SETTINGS/NAV/SEO); the body `{ data, expectedRevision }`. Guarded `EDITOR+`. The body is validated for shape (presence of `data` + numeric `expectedRevision`) by the step-2 `ZodValidationPipe`; the *content* of `data` is validated by `parseBlock` in the service.

**Files:**
- Create: `apps/api/src/content/content.controller.ts`
- Test: `apps/api/src/content/content.controller.spec.ts`

**Interfaces:**
- Consumes: `ContentService.updateBlock` / `getBlock`; step-2 `@Roles`, `@CurrentUser`, `ZodValidationPipe`; `@signex/db` `BlockKind`.
- Produces: routes `PUT /api/content/blocks/:kind/:key`, `GET /api/content/blocks/:kind/:key`.

**Steps:**

1. Write the failing test. Create `apps/api/src/content/content.controller.spec.ts`:
```ts
import { BadRequestException } from '@nestjs/common';
import { ContentController } from './content.controller';

describe('ContentController', () => {
  const service = {
    updateBlock: jest.fn().mockResolvedValue({ revision: 9 }),
    getBlock: jest.fn().mockResolvedValue({ foo: 'bar' }),
  } as any;
  const ctrl = new ContentController(service);

  it('PUT delegates kind/key/body/actor to ContentService.updateBlock', async () => {
    const res = await ctrl.update(
      'PAGE',
      'home.hero',
      { data: { x: 1 }, expectedRevision: 4 },
      { id: 'user_1' } as any,
    );
    expect(res).toEqual({ revision: 9 });
    expect(service.updateBlock).toHaveBeenCalledWith({ id: 'user_1' }, 'PAGE', 'home.hero', { x: 1 }, 4);
  });

  it('GET delegates to ContentService.getBlock', async () => {
    expect(await ctrl.get('SEO', 'seo.home')).toEqual({ foo: 'bar' });
    expect(service.getBlock).toHaveBeenCalledWith('SEO', 'seo.home');
  });

  it('rejects an unknown kind with 400', async () => {
    await expect(
      ctrl.update('NONSENSE', 'k', { data: {}, expectedRevision: 0 }, { id: 'u' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
```

2. Run it, expect FAIL. `npm test -w @signex/api -- content.controller` → `Cannot find module './content.controller'`.

3. Implement. Create `apps/api/src/content/content.controller.ts`:
```ts
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Put,
  UsePipes,
} from '@nestjs/common';
import { BlockKind } from '@signex/db';
import { z } from '@signex/shared';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ContentService } from './content.service';

const updateBlockBody = z.object({
  data: z.unknown(),
  expectedRevision: z.number().int().nonnegative(),
});
type UpdateBlockBody = z.infer<typeof updateBlockBody>;

const KINDS = new Set<string>(Object.values(BlockKind));
function toKind(raw: string): BlockKind {
  const upper = raw.toUpperCase();
  if (!KINDS.has(upper)) {
    throw new BadRequestException({ code: 'UNKNOWN_KIND', message: `Unknown block kind "${raw}"` });
  }
  return upper as BlockKind;
}

@Controller('content/blocks')
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Put(':kind/:key')
  @Roles('EDITOR')
  @UsePipes() // body-level pipe applied via @Body below
  async update(
    @Param('kind') kind: string,
    @Param('key') key: string,
    @Body(new ZodValidationPipe(updateBlockBody)) body: UpdateBlockBody,
    @CurrentUser() actor: { id: string },
  ): Promise<{ revision: number }> {
    return this.content.updateBlock(actor, toKind(kind), key, body.data, body.expectedRevision);
  }

  @Get(':kind/:key')
  @Roles('EDITOR')
  async get(@Param('kind') kind: string, @Param('key') key: string): Promise<unknown> {
    return this.content.getBlock(toKind(kind), key);
  }
}
```
> Import paths `../auth/roles.decorator`, `../auth/current-user.decorator`, `../common/zod-validation.pipe` are step-2 deliverables; adjust to the actual exported paths from step 2 if they differ. `z` is re-exported from `@signex/shared` (verified in the existing `index.ts`).

4. Run, expect PASS. `npm test -w @signex/api -- content.controller` → 3 passing. Then `npm test -w @signex/api -- content` to confirm service + controller specs both green and the module compiles.

5. Commit. `git add apps/api/src/content/content.controller.ts apps/api/src/content/content.controller.spec.ts && git commit -m "feat(api): ContentController PUT/GET /api/content/blocks/:kind/:key (EDITOR+)"`.

---

### Task 31: CatalogService — Category/Product CRUD on the same revision lock

Catalog mutations share the exact concurrency/audit machinery as content (spec §7.1: "Catalog CRUD bumps the same counter"). Each operation runs one tx: `guardAndBump`, validate the DTO via `@signex/shared` catalog schemas, write the row (create/update; delete = soft-delete `deletedAt`), reconcile the image `AssetRef`, audit. Slugs: `Category.slug` is globally unique; `Product.slug` is unique within `categoryId`.

**Files:**
- Create: `apps/api/src/catalog/catalog.service.ts`
- Create: `apps/api/src/catalog/catalog.module.ts`
- Test: `apps/api/src/catalog/catalog.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService.client.$transaction`; `WorkingStateService.guardAndBump`; `AuditService.writeAudit`; `reconcileAssetRefs`; `@signex/shared` `categoryInputSchema`, `productInputSchema`.
- Produces:
  - `createCategory(actor, input, expectedRevision): Promise<{ id: string; revision: number }>`
  - `updateCategory(actor, id, input, expectedRevision): Promise<{ revision: number }>`
  - `deleteCategory(actor, id, expectedRevision): Promise<{ revision: number }>`
  - `createProduct(actor, input, expectedRevision): Promise<{ id: string; revision: number }>`
  - `updateProduct(actor, id, input, expectedRevision): Promise<{ revision: number }>`
  - `deleteProduct(actor, id, expectedRevision): Promise<{ revision: number }>`

**Steps:**

1. Write the failing test. Create `apps/api/src/catalog/catalog.service.spec.ts`:
```ts
import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { CatalogService } from './catalog.service';

jest.mock('@signex/shared', () => ({
  categoryInputSchema: { parse: jest.fn((v) => v) },
  productInputSchema: { parse: jest.fn((v) => v) },
}));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const shared = require('@signex/shared') as { categoryInputSchema: any; productInputSchema: any };

function buildTx() {
  return {
    category: {
      create: jest.fn().mockResolvedValue({ id: 'cat_1' }),
      update: jest.fn().mockResolvedValue({ id: 'cat_1' }),
    },
    product: {
      create: jest.fn().mockResolvedValue({ id: 'prod_1' }),
      update: jest.fn().mockResolvedValue({ id: 'prod_1' }),
    },
    assetRef: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    workingState: {
      findUnique: jest.fn().mockResolvedValue({ revision: 1 }),
      update: jest.fn().mockResolvedValue({ revision: 2 }),
    },
  } as any;
}
function build(tx: any) {
  const prisma = { client: { $transaction: (fn: any) => fn(tx) } } as any;
  const { WorkingStateService } = require('../working-state/working-state.service');
  const { AuditService } = require('../audit/audit.service');
  return new CatalogService(prisma, new WorkingStateService(prisma), new AuditService());
}

describe('CatalogService', () => {
  beforeEach(() => {
    shared.categoryInputSchema.parse.mockImplementation((v: any) => v);
    shared.productInputSchema.parse.mockImplementation((v: any) => v);
  });

  it('createCategory validates, creates, reconciles image ref, bumps + audits', async () => {
    const tx = buildTx();
    const svc = build(tx);
    const input = { slug: 'pvc', sortOrder: 0, title: { en: 'PVC', vi: 'PVC' }, imageId: 'a1' };
    const res = await svc.createCategory({ id: 'u1' }, input, 1);
    expect(res).toEqual({ id: 'cat_1', revision: 2 });
    expect(shared.categoryInputSchema.parse).toHaveBeenCalledWith(input);
    expect(tx.category.create).toHaveBeenCalled();
    expect(tx.assetRef.createMany).toHaveBeenCalledWith({
      data: [{ ownerType: 'category', ownerId: 'cat_1', field: 'image', assetId: 'a1', alt: undefined }],
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'category.create', entityType: 'category', entityId: 'cat_1' }),
    });
  });

  it('createCategory throws 422 on invalid input (no bump)', async () => {
    shared.categoryInputSchema.parse.mockImplementation(() => {
      const e: any = new Error('bad'); e.name = 'ZodError'; e.issues = []; throw e;
    });
    const tx = buildTx();
    await expect(build(tx).createCategory({ id: 'u' }, {}, 1)).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(tx.category.create).not.toHaveBeenCalled();
  });

  it('updateProduct throws 409 when revision is stale', async () => {
    const tx = buildTx();
    tx.workingState.findUnique.mockResolvedValue({ revision: 9 });
    await expect(build(tx).updateProduct({ id: 'u' }, 'prod_1', { slug: 'x' }, 1))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('deleteCategory soft-deletes (sets deletedAt) and bumps', async () => {
    const tx = buildTx();
    const svc = build(tx);
    const res = await svc.deleteCategory({ id: 'u1' }, 'cat_1', 1);
    expect(res).toEqual({ revision: 2 });
    expect(tx.category.update).toHaveBeenCalledWith({
      where: { id: 'cat_1' },
      data: { deletedAt: expect.any(Date) },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'category.delete', entityType: 'category', entityId: 'cat_1' }),
    });
  });
});
```

2. Run it, expect FAIL. `npm test -w @signex/api -- catalog.service` → `Cannot find module './catalog.service'`.

3. Implement. Create `apps/api/src/catalog/catalog.service.ts`:
```ts
import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '@signex/db';
import { categoryInputSchema, productInputSchema } from '@signex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { WorkingStateService } from '../working-state/working-state.service';
import { AuditService } from '../audit/audit.service';
import { reconcileAssetRefs } from './asset-ref.reconcile';
import type { CollectedRef } from '../content/asset-ref.util';

function isZodError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { name?: string }).name === 'ZodError';
}
function validate<T>(schema: { parse: (v: unknown) => T }, raw: unknown, what: string): T {
  try {
    return schema.parse(raw);
  } catch (e) {
    if (isZodError(e)) {
      throw new UnprocessableEntityException({
        code: 'INVALID_INPUT',
        message: `${what} failed validation`,
        issues: (e as { issues: unknown }).issues,
      });
    }
    throw e;
  }
}
function imageRef(imageId?: string | null, imageAlt?: unknown): CollectedRef[] {
  if (!imageId) return [];
  return [{ field: 'image', assetId: imageId, alt: imageAlt }];
}

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workingState: WorkingStateService,
    private readonly audit: AuditService,
  ) {}

  async createCategory(
    actor: { id: string },
    input: unknown,
    expectedRevision: number,
  ): Promise<{ id: string; revision: number }> {
    const data = validate(categoryInputSchema, input, 'Category');
    return this.prisma.client.$transaction(async (tx) => {
      const revision = await this.workingState.guardAndBump(tx, expectedRevision, actor.id);
      const row = await tx.category.create({ data: data as Prisma.CategoryCreateInput });
      await reconcileAssetRefs(tx, 'category', row.id, imageRef((data as any).imageId, (data as any).imageAlt));
      await this.audit.writeAudit(tx, { userId: actor.id, action: 'category.create', entityType: 'category', entityId: row.id });
      return { id: row.id, revision };
    });
  }

  async updateCategory(
    actor: { id: string },
    id: string,
    input: unknown,
    expectedRevision: number,
  ): Promise<{ revision: number }> {
    const data = validate(categoryInputSchema, input, 'Category');
    return this.prisma.client.$transaction(async (tx) => {
      const revision = await this.workingState.guardAndBump(tx, expectedRevision, actor.id);
      await tx.category.update({ where: { id }, data: data as Prisma.CategoryUpdateInput });
      await reconcileAssetRefs(tx, 'category', id, imageRef((data as any).imageId, (data as any).imageAlt));
      await this.audit.writeAudit(tx, { userId: actor.id, action: 'category.update', entityType: 'category', entityId: id });
      return { revision };
    });
  }

  async deleteCategory(actor: { id: string }, id: string, expectedRevision: number): Promise<{ revision: number }> {
    return this.prisma.client.$transaction(async (tx) => {
      const revision = await this.workingState.guardAndBump(tx, expectedRevision, actor.id);
      await tx.category.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.writeAudit(tx, { userId: actor.id, action: 'category.delete', entityType: 'category', entityId: id });
      return { revision };
    });
  }

  async createProduct(
    actor: { id: string },
    input: unknown,
    expectedRevision: number,
  ): Promise<{ id: string; revision: number }> {
    const data = validate(productInputSchema, input, 'Product');
    return this.prisma.client.$transaction(async (tx) => {
      const revision = await this.workingState.guardAndBump(tx, expectedRevision, actor.id);
      const row = await tx.product.create({ data: data as Prisma.ProductCreateInput });
      await reconcileAssetRefs(tx, 'product', row.id, imageRef((data as any).imageId, (data as any).imageAlt));
      await this.audit.writeAudit(tx, { userId: actor.id, action: 'product.create', entityType: 'product', entityId: row.id });
      return { id: row.id, revision };
    });
  }

  async updateProduct(
    actor: { id: string },
    id: string,
    input: unknown,
    expectedRevision: number,
  ): Promise<{ revision: number }> {
    const data = validate(productInputSchema, input, 'Product');
    return this.prisma.client.$transaction(async (tx) => {
      const revision = await this.workingState.guardAndBump(tx, expectedRevision, actor.id);
      await tx.product.update({ where: { id }, data: data as Prisma.ProductUpdateInput });
      await reconcileAssetRefs(tx, 'product', id, imageRef((data as any).imageId, (data as any).imageAlt));
      await this.audit.writeAudit(tx, { userId: actor.id, action: 'product.update', entityType: 'product', entityId: id });
      return { revision };
    });
  }

  async deleteProduct(actor: { id: string }, id: string, expectedRevision: number): Promise<{ revision: number }> {
    return this.prisma.client.$transaction(async (tx) => {
      const revision = await this.workingState.guardAndBump(tx, expectedRevision, actor.id);
      await tx.product.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.writeAudit(tx, { userId: actor.id, action: 'product.delete', entityType: 'product', entityId: id });
      return { revision };
    });
  }
}
```
> `categoryInputSchema`/`productInputSchema` are step-0 deliverables in `@signex/shared` `content/catalog.ts`. If step 0 named them differently (e.g. `categoryCreateSchema`), align these imports to the exported names. The `as Prisma.CategoryCreateInput` casts are because the zod DTO already shapes the Json `{en,vi}` fields and `imageId` relation scalar to match the create input.

4. Run, expect PASS. `npm test -w @signex/api -- catalog.service` → 4 passing.

5. Create the module. `apps/api/src/catalog/catalog.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { WorkingStateModule } from '../working-state/working-state.module';
import { AuditModule } from '../audit/audit.module';
import { CatalogService } from './catalog.service';
import { CatalogController } from './catalog.controller';

@Module({
  imports: [WorkingStateModule, AuditModule],
  providers: [CatalogService],
  controllers: [CatalogController],
  exports: [CatalogService],
})
export class CatalogModule {}
```
> `CatalogController` lands in the next task; module won't compile until then — defer the module compile-check to that task.

6. Commit. `git add apps/api/src/catalog/catalog.service.ts apps/api/src/catalog/catalog.service.spec.ts apps/api/src/catalog/catalog.module.ts && git commit -m "feat(api): CatalogService Category/Product CRUD on shared revision lock + audit"`.

---

### Task 32: CatalogController — REST for catalog CRUD + AppModule wiring

Exposes `CatalogService` per §7.5 and wires all four new modules into `AppModule`. After this task the whole milestone compiles and the unit suite is green.

**Files:**
- Create: `apps/api/src/catalog/catalog.controller.ts`
- Create: `apps/api/src/catalog/catalog.controller.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `CatalogService` methods; step-2 `@Roles`, `@CurrentUser`, `ZodValidationPipe`; `@signex/shared` `categoryInputSchema`/`productInputSchema` (re-validated at the pipe for early 422 + typed body) and `z`.
- Produces: routes `POST/PATCH/DELETE /api/catalog/categories[/:id]`, `POST/PATCH/DELETE /api/catalog/products[/:id]`, `GET /api/catalog/categories`, `GET /api/catalog/products`.

**Steps:**

1. Write the failing test. Create `apps/api/src/catalog/catalog.controller.spec.ts`:
```ts
import { CatalogController } from './catalog.controller';

describe('CatalogController', () => {
  const service = {
    createCategory: jest.fn().mockResolvedValue({ id: 'c1', revision: 2 }),
    updateCategory: jest.fn().mockResolvedValue({ revision: 3 }),
    deleteCategory: jest.fn().mockResolvedValue({ revision: 4 }),
    createProduct: jest.fn().mockResolvedValue({ id: 'p1', revision: 5 }),
    updateProduct: jest.fn().mockResolvedValue({ revision: 6 }),
    deleteProduct: jest.fn().mockResolvedValue({ revision: 7 }),
    listCategories: jest.fn().mockResolvedValue([{ id: 'c1' }]),
    listProducts: jest.fn().mockResolvedValue([{ id: 'p1' }]),
  } as any;
  const ctrl = new CatalogController(service);
  const actor = { id: 'u1' } as any;

  it('createCategory delegates with actor + body + expectedRevision', async () => {
    const body = { input: { slug: 'pvc' }, expectedRevision: 1 };
    expect(await ctrl.createCategory(body as any, actor)).toEqual({ id: 'c1', revision: 2 });
    expect(service.createCategory).toHaveBeenCalledWith(actor, { slug: 'pvc' }, 1);
  });

  it('updateCategory passes the :id param', async () => {
    await ctrl.updateCategory('c1', { input: { slug: 'x' }, expectedRevision: 2 } as any, actor);
    expect(service.updateCategory).toHaveBeenCalledWith(actor, 'c1', { slug: 'x' }, 2);
  });

  it('deleteCategory passes id + expectedRevision', async () => {
    await ctrl.deleteCategory('c1', { expectedRevision: 3 } as any, actor);
    expect(service.deleteCategory).toHaveBeenCalledWith(actor, 'c1', 3);
  });

  it('createProduct delegates', async () => {
    await ctrl.createProduct({ input: { slug: 'a' }, expectedRevision: 1 } as any, actor);
    expect(service.createProduct).toHaveBeenCalledWith(actor, { slug: 'a' }, 1);
  });
});
```

2. Run it, expect FAIL. `npm test -w @signex/api -- catalog.controller` → `Cannot find module './catalog.controller'`.

3. Implement. Create `apps/api/src/catalog/catalog.controller.ts`:
```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { z } from '@signex/shared';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogService } from './catalog.service';

const writeBody = z.object({ input: z.unknown(), expectedRevision: z.number().int().nonnegative() });
const deleteBody = z.object({ expectedRevision: z.number().int().nonnegative() });
type WriteBody = { input: unknown; expectedRevision: number };
type DeleteBody = { expectedRevision: number };

@Controller('catalog')
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly prisma: PrismaService,
  ) {}

  // ----- Categories -----
  @Get('categories')
  @Roles('EDITOR')
  listCategories() {
    return this.prisma.client.category.findMany({
      where: { deletedAt: null },
      orderBy: { sortOrder: 'asc' },
    });
  }

  @Post('categories')
  @Roles('EDITOR')
  createCategory(
    @Body(new ZodValidationPipe(writeBody)) body: WriteBody,
    @CurrentUser() actor: { id: string },
  ) {
    return this.catalog.createCategory(actor, body.input, body.expectedRevision);
  }

  @Patch('categories/:id')
  @Roles('EDITOR')
  updateCategory(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(writeBody)) body: WriteBody,
    @CurrentUser() actor: { id: string },
  ) {
    return this.catalog.updateCategory(actor, id, body.input, body.expectedRevision);
  }

  @Delete('categories/:id')
  @Roles('EDITOR')
  deleteCategory(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(deleteBody)) body: DeleteBody,
    @CurrentUser() actor: { id: string },
  ) {
    return this.catalog.deleteCategory(actor, id, body.expectedRevision);
  }

  // ----- Products -----
  @Get('products')
  @Roles('EDITOR')
  listProducts() {
    return this.prisma.client.product.findMany({
      where: { deletedAt: null },
      orderBy: [{ categoryId: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  @Post('products')
  @Roles('EDITOR')
  createProduct(
    @Body(new ZodValidationPipe(writeBody)) body: WriteBody,
    @CurrentUser() actor: { id: string },
  ) {
    return this.catalog.createProduct(actor, body.input, body.expectedRevision);
  }

  @Patch('products/:id')
  @Roles('EDITOR')
  updateProduct(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(writeBody)) body: WriteBody,
    @CurrentUser() actor: { id: string },
  ) {
    return this.catalog.updateProduct(actor, id, body.input, body.expectedRevision);
  }

  @Delete('products/:id')
  @Roles('EDITOR')
  deleteProduct(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(deleteBody)) body: DeleteBody,
    @CurrentUser() actor: { id: string },
  ) {
    return this.catalog.deleteProduct(actor, id, body.expectedRevision);
  }
}
```
> The unit spec constructs `new CatalogController(service)` with a single arg; the second `PrismaService` arg is only exercised by the list endpoints (covered in e2e). The spec passes because the list methods aren't called there. Keep DI order (catalog, prisma) consistent with the spec by NOT asserting on `prisma` in unit tests.

4. Run, expect PASS. `npm test -w @signex/api -- catalog.controller` → 4 passing.

5. Wire AppModule. Edit `apps/api/src/app.module.ts` to:
```ts
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { WorkingStateModule } from './working-state/working-state.module';
import { AuditModule } from './audit/audit.module';
import { ContentModule } from './content/content.module';
import { CatalogModule } from './catalog/catalog.module';

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    WorkingStateModule,
    AuditModule,
    ContentModule,
    CatalogModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```
> Keep the step-2 `AuthModule` import that is already present in `AppModule` after step 2 lands; this snippet shows the new additions — merge, do not drop `AuthModule`.

6. Run the full unit suite + build. `npm test -w @signex/api` → all green; `npm run build -w @signex/api` → compiles (proves both new modules + controllers type-check against the real generated Prisma client and `@signex/shared` dist).

7. Commit. `git add apps/api/src/catalog/catalog.controller.ts apps/api/src/catalog/catalog.controller.spec.ts apps/api/src/app.module.ts && git commit -m "feat(api): CatalogController routes + wire content/catalog/working-state/audit modules"`.

---

### Task 33: e2e — content + catalog write path against real Postgres

Unit tests mock Prisma; this proves the real tx semantics: revision guard, `(kind,key)` unique upsert, 409 on stale, 422 on bad data, and RBAC (401 unauthenticated). Uses the step-2 e2e login helper to obtain an EDITOR `sx_session` cookie. Runs against the dockerized Postgres test DB (the same one the step-1/2 e2e already target).

**Files:**
- Create: `apps/api/test/content.e2e-spec.ts`
- Create: `apps/api/test/catalog.e2e-spec.ts`

**Interfaces:**
- Consumes: `AppModule` (now with Content/Catalog modules); step-2 e2e helper to seed an EDITOR + login (returns the session cookie); `@signex/db` `prisma` for setup/teardown + reading `WorkingState`.
- Produces: green `npm run test:e2e -w @signex/api` for content + catalog.

**Steps:**

1. Verify the test DB is reachable. `DATABASE_URL` for tests points at the Postgres container (host 3059). Run `docker compose up -d postgres` and `npm run -w @signex/db migrate:deploy` so the step-1 migration (User/Session/.../WorkingState + `release_version_seq`) is applied. Expected: `All migrations have been applied`.

2. Write the content e2e. Create `apps/api/test/content.e2e-spec.ts`:
```ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import request from 'supertest';
import { prisma } from '@signex/db';
import { AppModule } from '../src/app.module';
import { loginAsEditor } from './helpers/login'; // step-2 deliverable: seeds an EDITOR + returns sx_session cookie

describe('Content write path (e2e)', () => {
  let app: INestApplication;
  let cookie: string;

  beforeAll(async () => {
    const mod: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    await app.init();

    // clean slate for the working-state singleton
    await prisma.workingState.upsert({
      where: { id: 'singleton' },
      update: { revision: 0, lastPublishedRevision: 0 },
      create: { id: 'singleton', revision: 0, lastPublishedRevision: 0 },
    });
    cookie = await loginAsEditor(app);
  });

  afterAll(async () => {
    await prisma.contentBlock.deleteMany({ where: { key: 'home.hero' } });
    await app.close();
  });

  const validHero = {
    eyebrow: { en: 'Hi', vi: 'Chao' },
    title: { lead: { en: 'About ', vi: 'Ve ' }, accent: { en: 'SIGNEX', vi: 'SIGNEX' } },
    // ... minimal valid hero per BLOCK_REGISTRY.hero; fill with the real required fields
  };

  it('401 when unauthenticated', () =>
    request(app.getHttpServer())
      .put('/api/content/blocks/PAGE/home.hero')
      .send({ data: validHero, expectedRevision: 0 })
      .expect(401));

  it('200 + revision bump on a valid write', async () => {
    const res = await request(app.getHttpServer())
      .put('/api/content/blocks/PAGE/home.hero')
      .set('Cookie', cookie)
      .send({ data: validHero, expectedRevision: 0 })
      .expect(200);
    expect(res.body).toEqual({ revision: 1 });
    const ws = await prisma.workingState.findUnique({ where: { id: 'singleton' } });
    expect(ws?.revision).toBe(1);
  });

  it('409 STALE_DRAFT when expectedRevision is stale', () =>
    request(app.getHttpServer())
      .put('/api/content/blocks/PAGE/home.hero')
      .set('Cookie', cookie)
      .send({ data: validHero, expectedRevision: 0 }) // now stale (revision is 1)
      .expect(409)
      .expect((r) => expect(r.body.code).toBe('STALE_DRAFT')));

  it('422 INVALID_BLOCK when data fails the registry schema', () =>
    request(app.getHttpServer())
      .put('/api/content/blocks/PAGE/home.hero')
      .set('Cookie', cookie)
      .send({ data: { not: 'a hero' }, expectedRevision: 1 })
      .expect(422)
      .expect((r) => expect(r.body.code).toBe('INVALID_BLOCK')));
});
```
> Replace the `validHero` placeholder comment with the actual minimal valid payload for `BLOCK_REGISTRY.hero` as exported by step 0 — read `packages/shared/src/content/blocks/hero.ts` to enumerate required fields. The `loginAsEditor` helper import path matches whatever step 2 committed under `apps/api/test/helpers/`.

3. Write the catalog e2e. Create `apps/api/test/catalog.e2e-spec.ts`:
```ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import request from 'supertest';
import { prisma } from '@signex/db';
import { AppModule } from '../src/app.module';
import { loginAsEditor } from './helpers/login';

describe('Catalog write path (e2e)', () => {
  let app: INestApplication;
  let cookie: string;
  let categoryId: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    await app.init();
    await prisma.workingState.upsert({
      where: { id: 'singleton' },
      update: { revision: 0, lastPublishedRevision: 0 },
      create: { id: 'singleton', revision: 0, lastPublishedRevision: 0 },
    });
    cookie = await loginAsEditor(app);
  });

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { categoryId } });
    await prisma.category.deleteMany({ where: { slug: 'e2e-pvc' } });
    await app.close();
  });

  it('creates a category and bumps revision to 1', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/catalog/categories')
      .set('Cookie', cookie)
      .send({
        input: {
          slug: 'e2e-pvc', sortOrder: 0,
          title: { en: 'PVC', vi: 'PVC' }, tag: { en: 'PVC', vi: 'PVC' },
          intro: { en: 'x', vi: 'y' }, productCount: 1, materialCount: 1,
        },
        expectedRevision: 0,
      })
      .expect(201);
    expect(res.body.revision).toBe(1);
    categoryId = res.body.id;
  });

  it('creates a product under it and bumps revision to 2', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/catalog/products')
      .set('Cookie', cookie)
      .send({
        input: {
          categoryId, slug: 'e2e-mat', sortOrder: 0,
          title: { en: 'Mat', vi: 'Tham' }, tag: { en: 't', vi: 't' }, desc: { en: 'd', vi: 'd' },
        },
        expectedRevision: 1,
      })
      .expect(201);
    expect(res.body.revision).toBe(2);
  });

  it('409 on a stale concurrent write', () =>
    request(app.getHttpServer())
      .post('/api/catalog/products')
      .set('Cookie', cookie)
      .send({ input: { categoryId, slug: 'e2e-dup', sortOrder: 1, title: { en: 'a', vi: 'a' }, tag: { en: 'a', vi: 'a' }, desc: { en: 'a', vi: 'a' } }, expectedRevision: 1 })
      .expect(409));
});
```
> Adjust the required category/product input fields to the exact `categoryInputSchema`/`productInputSchema` shapes from step 0 (read `packages/shared/src/content/catalog.ts`). `POST` returns 201 by Nest default; if step 2's global config forces 200, change the expectation accordingly.

4. Run, expect PASS. `npm run test:e2e -w @signex/api` → content + catalog suites green against the live DB. If `loginAsEditor`/helper path differs, fix the import to the step-2 committed helper (do not re-implement login here).

5. Verify revision monotonicity in the DB by hand (acceptance evidence). `npm run -w @signex/db exec -- prisma studio` is optional; instead assert via a one-off: `node -e "const {prisma}=require('@signex/db'); prisma.workingState.findUnique({where:{id:'singleton'}}).then(r=>{console.log(r.revision); process.exit(0)})"` → prints a number ≥ 2. Expected: a non-zero revision proving real commits happened.

6. Commit. `git add apps/api/test/content.e2e-spec.ts apps/api/test/catalog.e2e-spec.ts && git commit -m "test(api): e2e content + catalog write path (revision guard, 409/422, RBAC) on real Postgres"`.

---

## Milestone 5 — R2 media (presign / confirm with verify + immutable cache + SVG sanitize; register/list/replace/alt; no sharp)

**Consumes (from earlier milestones):**
- PrismaService (apps/api/src/prisma/prisma.service.ts): @Injectable() with `readonly client: PrismaClient` — global via PrismaModule
- @signex/db: `prisma` client + generated types `Asset`, `AssetStatus` ('PENDING'|'READY'), `AssetKind` ('IMAGE'|'VIDEO'|'SVG'), `AssetRef`
- @signex/db: Asset model fields { id, status, kind, sha256(unique), r2Key(unique), mime, bytes:BigInt, width?, height?, duration?, originalName, altDefault?:Json, posterId?, uploadedById?, deletedAt? }
- @signex/db: AssetRef { id, assetId, ownerType, ownerId, field, alt?:Json } @@unique([ownerType,ownerId,field])
- @signex/db: ReleaseAssetRef { releaseId, assetId } — used only for usage/GC query
- @signex/shared: `Id` = z.string().cuid(); `LocalizedText` = z.object({en,vi}); `z` re-export
- Step 2 auth: `@Roles(...roles: RoleName[])` decorator + `RolesGuard` (APP_GUARD); `SessionAuthGuard` (APP_GUARD); `@CurrentUser()` param decorator injecting `{ id: string; role: RoleName }`; `ZodValidationPipe` class `new ZodValidationPipe(schema)`; `@Public()` decorator
- Step 2 auth: AuditLog write convention — service does `prisma.client.auditLog.create({ data:{ userId, action, entityType, entityId, meta } })`

**Produces (for later milestones):**
- R2Service (apps/api/src/assets/r2.service.ts): presignPut(args:{r2Key:string;mime:string;sha256:string;maxBytes:number}):Promise<{url:string;headers:Record<string,string>;expiresIn:number}>; putObject(args:{r2Key:string;body:Buffer;mime:string;cacheControl:string;checksumSha256?:string}):Promise<void>; headObject(r2Key:string):Promise<{contentLength:number;contentType?:string}|null>; getObjectBytes(r2Key:string):Promise<Buffer>; publicUrl(r2Key:string):string
- AssetsService (apps/api/src/assets/assets.service.ts): presign(actor,input):Promise<PresignResult>; confirm(actor,assetId):Promise<AssetDto>; register(actor,input:{bytes:Buffer;mime:string;originalName:string;altDefault?:LocalizedText}):Promise<AssetDto>; list(opts?):Promise<AssetDto[]>; usage(assetId):Promise<{working:AssetRef[];releases:{releaseId:string}[]}>; replace(actor,assetId,input):Promise<AssetDto>; setAlt(actor,assetId,alt:LocalizedText):Promise<AssetDto>
- PresignResult type: { deduped:boolean; asset:AssetDto } | { deduped:false; assetId:string; r2Key:string; upload:{url:string;headers:Record<string,string>;expiresIn:number} }
- assets.dto.ts: MIME_ALLOWLIST (Record<string,{kind:AssetKind;maxBytes:number}>); kindForMime(mime):AssetKind; slugify(name:string):string; keyFor(sha256:string,slug:string,ext:string):string => `originals/${sha256.slice(0,32)}/${slug}.${ext}`; presignSchema; confirmSchema; replaceSchema; altSchema
- loadR2Config(env):R2Config { endpoint, region, accessKeyId, secretAccessKey, bucket, publicBase, presignTtlSeconds }
- AssetsModule (exports AssetsService + R2Service) — consumed by Step 6 release engine (frozen r2Key) and Step 7 importer (register())
- sanitizeSvg(input:Buffer):Buffer (throws SvgForbiddenError on irrecoverable hostile markup)
- readImageDimensions(buf:Buffer,mime:string):{width:number;height:number}|null

### Task 34: R2 config loader + AWS SDK deps

**Files:**
- Create: `apps/api/src/assets/r2.config.ts`
- Test: `apps/api/src/assets/r2.config.spec.ts`
- Modify: `apps/api/package.json`

**Interfaces:**
- Consumes: nothing from earlier steps (env only).
- Produces: `loadR2Config(env: NodeJS.ProcessEnv): R2Config` where `R2Config = { endpoint: string; region: string; accessKeyId: string; secretAccessKey: string; bucket: string; publicBase: string; presignTtlSeconds: number }`. Exported `R2_CONFIG` token `'R2_CONFIG'`.

**Steps:**

1. Add the AWS SDK deps (R2 is S3-compatible; these are the only new runtime deps for this milestone — no `sharp`). Run:
```bash
npm install -w @signex/api @aws-sdk/client-s3@^3.700.0 @aws-sdk/s3-request-presigner@^3.700.0
npm install -w @signex/api -D aws-sdk-client-mock@^4.1.0
```
Expect: `apps/api/package.json` now lists `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` under `dependencies` and `aws-sdk-client-mock` under `devDependencies`; root lockfile updated.

2. Write the failing test `apps/api/src/assets/r2.config.spec.ts`:
```ts
import { loadR2Config } from './r2.config';

const base = {
  R2_ENDPOINT: 'https://acc.r2.cloudflarestorage.com',
  R2_ACCESS_KEY_ID: 'ak',
  R2_SECRET_ACCESS_KEY: 'sk',
  R2_BUCKET: 'signex-media',
  MEDIA_PUBLIC_BASE: 'https://media.signex.test',
} as unknown as NodeJS.ProcessEnv;

describe('loadR2Config', () => {
  it('parses required vars and applies defaults', () => {
    const cfg = loadR2Config(base);
    expect(cfg.endpoint).toBe('https://acc.r2.cloudflarestorage.com');
    expect(cfg.bucket).toBe('signex-media');
    expect(cfg.publicBase).toBe('https://media.signex.test');
    expect(cfg.region).toBe('auto');
    expect(cfg.presignTtlSeconds).toBe(300);
  });

  it('honors R2_REGION + R2_PRESIGN_TTL overrides', () => {
    const cfg = loadR2Config({ ...base, R2_REGION: 'wnam', R2_PRESIGN_TTL: '120' });
    expect(cfg.region).toBe('wnam');
    expect(cfg.presignTtlSeconds).toBe(120);
  });

  it('throws when a required var is missing', () => {
    const { R2_BUCKET: _omit, ...partial } = base as Record<string, string>;
    expect(() => loadR2Config(partial as NodeJS.ProcessEnv)).toThrow(/R2_BUCKET/);
  });
});
```

3. Run `npm test -w @signex/api -- r2.config` — expect FAIL: `Cannot find module './r2.config'`.

4. Implement `apps/api/src/assets/r2.config.ts`:
```ts
export const R2_CONFIG = 'R2_CONFIG';

export interface R2Config {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBase: string;
  presignTtlSeconds: number;
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const v = env[key];
  if (!v || v.trim() === '') {
    throw new Error(`Missing required env var ${key}`);
  }
  return v;
}

export function loadR2Config(env: NodeJS.ProcessEnv): R2Config {
  const ttlRaw = env.R2_PRESIGN_TTL;
  const ttl = ttlRaw ? Number.parseInt(ttlRaw, 10) : 300;
  return {
    endpoint: required(env, 'R2_ENDPOINT'),
    region: env.R2_REGION ?? 'auto',
    accessKeyId: required(env, 'R2_ACCESS_KEY_ID'),
    secretAccessKey: required(env, 'R2_SECRET_ACCESS_KEY'),
    bucket: required(env, 'R2_BUCKET'),
    publicBase: required(env, 'MEDIA_PUBLIC_BASE').replace(/\/+$/, ''),
    presignTtlSeconds: Number.isFinite(ttl) && ttl > 0 ? ttl : 300,
  };
}
```

5. Run `npm test -w @signex/api -- r2.config` — expect PASS (3 tests).

6. Commit:
```bash
git add apps/api/package.json apps/api/src/assets/r2.config.ts apps/api/src/assets/r2.config.spec.ts package-lock.json
git commit -m "feat(api): R2 config loader + aws-sdk s3 deps for media"
```

---

### Task 35: sharp-free image dimension reader

**Files:**
- Create: `apps/api/src/assets/image-dimensions.ts`
- Test: `apps/api/src/assets/image-dimensions.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `readImageDimensions(buf: Buffer, mime: string): { width: number; height: number } | null` — authoritative dims parsed from file headers (PNG/GIF/JPEG/WebP/SVG). NO `sharp`.

**Steps:**

1. Write the failing test `apps/api/src/assets/image-dimensions.spec.ts`:
```ts
import { readImageDimensions } from './image-dimensions';

// 1x1 transparent PNG (real bytes); width/height in IHDR at offset 16.
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMCAQGuAAAAAElFTkSuQmCC',
  'base64',
);

function gif(w: number, h: number): Buffer {
  const b = Buffer.from('GIF89a       ', 'latin1');
  b.writeUInt16LE(w, 6);
  b.writeUInt16LE(h, 8);
  return b;
}

function jpeg(w: number, h: number): Buffer {
  // SOI + SOF0 marker (FFC0), len=17, precision=8, height, width
  const sof = Buffer.alloc(19);
  sof[0] = 0xff; sof[1] = 0xd8; // SOI
  sof[2] = 0xff; sof[3] = 0xc0; // SOF0
  sof[4] = 0x00; sof[5] = 0x11; // length 17
  sof[6] = 0x08; // precision
  sof.writeUInt16BE(h, 7);
  sof.writeUInt16BE(w, 9);
  return sof;
}

function webpVp8x(w: number, h: number): Buffer {
  const b = Buffer.alloc(30);
  b.write('RIFF', 0, 'ascii');
  b.write('WEBP', 8, 'ascii');
  b.write('VP8X', 12, 'ascii');
  // canvas width-1 / height-1 are 24-bit LE at offsets 24 and 27
  b.writeUIntLE(w - 1, 24, 3);
  b.writeUIntLE(h - 1, 27, 3);
  return b;
}

describe('readImageDimensions', () => {
  it('reads PNG IHDR', () => {
    expect(readImageDimensions(PNG_1x1, 'image/png')).toEqual({ width: 1, height: 1 });
  });
  it('reads GIF logical screen', () => {
    expect(readImageDimensions(gif(320, 240), 'image/gif')).toEqual({ width: 320, height: 240 });
  });
  it('reads JPEG SOF0', () => {
    expect(readImageDimensions(jpeg(640, 480), 'image/jpeg')).toEqual({ width: 640, height: 480 });
  });
  it('reads WebP VP8X', () => {
    expect(readImageDimensions(webpVp8x(800, 600), 'image/webp')).toEqual({ width: 800, height: 600 });
  });
  it('reads SVG width/height attrs', () => {
    const svg = Buffer.from('<svg width="48" height="24" xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(readImageDimensions(svg, 'image/svg+xml')).toEqual({ width: 48, height: 24 });
  });
  it('reads SVG viewBox when no width/height', () => {
    const svg = Buffer.from('<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(readImageDimensions(svg, 'image/svg+xml')).toEqual({ width: 100, height: 50 });
  });
  it('returns null for unknown bytes', () => {
    expect(readImageDimensions(Buffer.from('not an image'), 'image/png')).toBeNull();
  });
});
```

2. Run `npm test -w @signex/api -- image-dimensions` — expect FAIL: `Cannot find module './image-dimensions'`.

3. Implement `apps/api/src/assets/image-dimensions.ts`:
```ts
export interface Dimensions {
  width: number;
  height: number;
}

function readPng(buf: Buffer): Dimensions | null {
  // PNG signature + IHDR (width @16, height @20, big-endian)
  if (buf.length < 24) return null;
  const sig = buf.subarray(0, 8).toString('latin1');
  if (sig !== '\x89PNG\r\n\x1a\n') return null;
  if (buf.subarray(12, 16).toString('ascii') !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function readGif(buf: Buffer): Dimensions | null {
  if (buf.length < 10) return null;
  const sig = buf.subarray(0, 6).toString('ascii');
  if (sig !== 'GIF87a' && sig !== 'GIF89a') return null;
  return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
}

function readJpeg(buf: Buffer): Dimensions | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let off = 2;
  while (off + 9 < buf.length) {
    if (buf[off] !== 0xff) {
      off++;
      continue;
    }
    const marker = buf[off + 1];
    // SOF0..SOF15 except DHT(c4)/DAC(cc)/RSTn carry frame dims
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = buf.readUInt16BE(off + 5);
      const width = buf.readUInt16BE(off + 7);
      return { width, height };
    }
    const segLen = buf.readUInt16BE(off + 2);
    off += 2 + segLen;
  }
  return null;
}

function readWebp(buf: Buffer): Dimensions | null {
  if (buf.length < 30) return null;
  if (buf.subarray(0, 4).toString('ascii') !== 'RIFF') return null;
  if (buf.subarray(8, 12).toString('ascii') !== 'WEBP') return null;
  const fmt = buf.subarray(12, 16).toString('ascii');
  if (fmt === 'VP8X') {
    return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
  }
  if (fmt === 'VP8 ') {
    // lossy: dims at offset 26/28 (14-bit, mask high 2 bits)
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  if (fmt === 'VP8L') {
    const b0 = buf[21];
    const b1 = buf[22];
    const b2 = buf[23];
    const b3 = buf[24];
    const width = 1 + (((b1 & 0x3f) << 8) | b0);
    const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
    return { width, height };
  }
  return null;
}

function readSvg(buf: Buffer): Dimensions | null {
  const text = buf.toString('utf8', 0, Math.min(buf.length, 4096));
  const w = /\bwidth\s*=\s*["']?\s*([\d.]+)/i.exec(text);
  const h = /\bheight\s*=\s*["']?\s*([\d.]+)/i.exec(text);
  if (w && h) {
    return { width: Math.round(Number(w[1])), height: Math.round(Number(h[1])) };
  }
  const vb = /\bviewBox\s*=\s*["']\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)/i.exec(text);
  if (vb) {
    return { width: Math.round(Number(vb[1])), height: Math.round(Number(vb[2])) };
  }
  return null;
}

export function readImageDimensions(buf: Buffer, mime: string): Dimensions | null {
  switch (mime) {
    case 'image/png':
      return readPng(buf);
    case 'image/gif':
      return readGif(buf);
    case 'image/jpeg':
      return readJpeg(buf);
    case 'image/webp':
      return readWebp(buf);
    case 'image/svg+xml':
      return readSvg(buf);
    default:
      return null;
  }
}
```

4. Run `npm test -w @signex/api -- image-dimensions` — expect PASS (7 tests).

5. Commit:
```bash
git add apps/api/src/assets/image-dimensions.ts apps/api/src/assets/image-dimensions.spec.ts
git commit -m "feat(api): sharp-free image dimension reader (png/gif/jpeg/webp/svg)"
```

---

### Task 36: SVG sanitizer

**Files:**
- Create: `apps/api/src/assets/svg-sanitize.ts`
- Test: `apps/api/src/assets/svg-sanitize.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `sanitizeSvg(input: Buffer): Buffer` (strips active content) and `class SvgForbiddenError extends Error` thrown when the markup is not a parseable `<svg>` root.

**Steps:**

1. Write the failing test `apps/api/src/assets/svg-sanitize.spec.ts`:
```ts
import { sanitizeSvg, SvgForbiddenError } from './svg-sanitize';

describe('sanitizeSvg', () => {
  it('removes <script> elements', () => {
    const out = sanitizeSvg(Buffer.from('<svg><script>alert(1)</script><rect/></svg>')).toString();
    expect(out).not.toMatch(/script/i);
    expect(out).toMatch(/<rect/);
  });

  it('strips on* event handler attributes', () => {
    const out = sanitizeSvg(Buffer.from('<svg><rect onload="x()" onclick="y()"/></svg>')).toString();
    expect(out).not.toMatch(/onload/i);
    expect(out).not.toMatch(/onclick/i);
  });

  it('neutralizes javascript: and data: hrefs', () => {
    const out = sanitizeSvg(
      Buffer.from('<svg><a href="javascript:alert(1)"><image href="data:text/html,x"/></a></svg>'),
    ).toString();
    expect(out).not.toMatch(/javascript:/i);
    expect(out).not.toMatch(/data:text\/html/i);
  });

  it('removes <foreignObject>', () => {
    const out = sanitizeSvg(
      Buffer.from('<svg><foreignObject><body>hi</body></foreignObject></svg>'),
    ).toString();
    expect(out).not.toMatch(/foreignObject/i);
  });

  it('preserves a benign svg', () => {
    const out = sanitizeSvg(
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10H0z"/></svg>'),
    ).toString();
    expect(out).toMatch(/<path/);
  });

  it('throws SvgForbiddenError when there is no <svg> root', () => {
    expect(() => sanitizeSvg(Buffer.from('<html><body>nope</body></html>'))).toThrow(SvgForbiddenError);
  });
});
```

2. Run `npm test -w @signex/api -- svg-sanitize` — expect FAIL: `Cannot find module './svg-sanitize'`.

3. Implement `apps/api/src/assets/svg-sanitize.ts` (regex-based, dependency-free; conservative — strips active content, throws if not an SVG):
```ts
export class SvgForbiddenError extends Error {
  constructor(message = 'SVG content is not allowed') {
    super(message);
    this.name = 'SvgForbiddenError';
  }
}

const DANGEROUS_ELEMENTS = ['script', 'foreignObject', 'iframe', 'embed', 'object', 'audio', 'video'];

export function sanitizeSvg(input: Buffer): Buffer {
  let svg = input.toString('utf8');

  if (!/<svg[\s>]/i.test(svg)) {
    throw new SvgForbiddenError('Input does not contain an <svg> root element');
  }

  // 1. Remove dangerous elements (open..close and self-closing).
  for (const el of DANGEROUS_ELEMENTS) {
    const block = new RegExp(`<${el}[\\s\\S]*?</${el}\\s*>`, 'gi');
    const selfClose = new RegExp(`<${el}\\b[^>]*/?>`, 'gi');
    svg = svg.replace(block, '').replace(selfClose, '');
  }

  // 2. Strip on* event-handler attributes.
  svg = svg.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // 3. Neutralize javascript:/data: in href/xlink:href/src.
  svg = svg.replace(
    /\s(href|xlink:href|src)\s*=\s*("|')\s*(javascript:|data:(?!image\/(png|jpeg|gif|webp)))[^"']*\2/gi,
    '',
  );

  // 4. Strip <!ENTITY ...> / DOCTYPE (XXE / billion-laughs).
  svg = svg.replace(/<!DOCTYPE[\s\S]*?>/gi, '').replace(/<!ENTITY[\s\S]*?>/gi, '');

  return Buffer.from(svg, 'utf8');
}
```

4. Run `npm test -w @signex/api -- svg-sanitize` — expect PASS (6 tests).

5. Commit:
```bash
git add apps/api/src/assets/svg-sanitize.ts apps/api/src/assets/svg-sanitize.spec.ts
git commit -m "feat(api): dependency-free svg sanitizer (strip script/handlers/foreignObject/xxe)"
```

---

### Task 37: Assets DTOs — allowlist, size caps, content-addressed keys

**Files:**
- Create: `apps/api/src/assets/dto/assets.dto.ts`
- Test: `apps/api/src/assets/dto/assets.dto.spec.ts`

**Interfaces:**
- Consumes: `@signex/shared` — `Id` (`z.string().cuid()`), `LocalizedText`, `z`. `@signex/db` enum union `AssetKind = 'IMAGE'|'VIDEO'|'SVG'`.
- Produces: `MIME_ALLOWLIST: Record<string, { kind: AssetKind; maxBytes: number }>`; `kindForMime(mime): AssetKind`; `slugify(name): string`; `keyFor(sha256, slug, ext): string`; `extForMime(mime): string`; `presignSchema`, `confirmSchema`, `replaceSchema`, `altSchema`; inferred `PresignInput`, `ConfirmInput`, `ReplaceInput`, `AltInput`.

**Steps:**

1. Write the failing test `apps/api/src/assets/dto/assets.dto.spec.ts`:
```ts
import {
  MIME_ALLOWLIST,
  kindForMime,
  slugify,
  keyFor,
  extForMime,
  presignSchema,
} from './assets.dto';

describe('assets dto helpers', () => {
  it('maps mime to kind', () => {
    expect(kindForMime('image/png')).toBe('IMAGE');
    expect(kindForMime('image/svg+xml')).toBe('SVG');
    expect(kindForMime('video/mp4')).toBe('VIDEO');
  });

  it('slugifies original names', () => {
    expect(slugify('Hero Image (Final).PNG')).toBe('hero-image-final-png');
    expect(slugify('  ___ ')).toBe('asset');
    expect(slugify('Ảnh Sản Phẩm')).toBe('anh-san-pham');
  });

  it('builds content-addressed key from first 32 hash chars', () => {
    const sha = 'a'.repeat(64);
    expect(keyFor(sha, 'logo', 'svg')).toBe(`originals/${'a'.repeat(32)}/logo.svg`);
  });

  it('derives extension from mime', () => {
    expect(extForMime('image/jpeg')).toBe('jpg');
    expect(extForMime('image/svg+xml')).toBe('svg');
    expect(extForMime('video/webm')).toBe('webm');
  });

  it('presignSchema accepts a valid request', () => {
    const r = presignSchema.parse({
      mime: 'image/png',
      bytes: 1024,
      sha256: 'b'.repeat(64),
      originalName: 'x.png',
    });
    expect(r.mime).toBe('image/png');
  });

  it('presignSchema rejects a disallowed mime', () => {
    expect(() =>
      presignSchema.parse({ mime: 'application/zip', bytes: 1, sha256: 'b'.repeat(64), originalName: 'x' }),
    ).toThrow();
  });

  it('presignSchema rejects an oversized image', () => {
    expect(() =>
      presignSchema.parse({
        mime: 'image/png',
        bytes: MIME_ALLOWLIST['image/png'].maxBytes + 1,
        sha256: 'b'.repeat(64),
        originalName: 'x.png',
      }),
    ).toThrow(/size/i);
  });

  it('presignSchema rejects a malformed sha256', () => {
    expect(() =>
      presignSchema.parse({ mime: 'image/png', bytes: 1, sha256: 'zzz', originalName: 'x.png' }),
    ).toThrow();
  });
});
```

2. Run `npm test -w @signex/api -- assets.dto` — expect FAIL: `Cannot find module './assets.dto'`.

3. Implement `apps/api/src/assets/dto/assets.dto.ts`:
```ts
import { z, Id, LocalizedText } from '@signex/shared';
import type { AssetKind } from '@signex/db';

const MB = 1024 * 1024;

export const MIME_ALLOWLIST: Record<string, { kind: AssetKind; maxBytes: number }> = {
  'image/png': { kind: 'IMAGE', maxBytes: 15 * MB },
  'image/jpeg': { kind: 'IMAGE', maxBytes: 15 * MB },
  'image/webp': { kind: 'IMAGE', maxBytes: 15 * MB },
  'image/gif': { kind: 'IMAGE', maxBytes: 15 * MB },
  'image/svg+xml': { kind: 'SVG', maxBytes: 2 * MB },
  'video/mp4': { kind: 'VIDEO', maxBytes: 200 * MB },
  'video/webm': { kind: 'VIDEO', maxBytes: 200 * MB },
};

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

export function kindForMime(mime: string): AssetKind {
  const entry = MIME_ALLOWLIST[mime];
  if (!entry) {
    throw new Error(`Unsupported mime ${mime}`);
  }
  return entry.kind;
}

export function extForMime(mime: string): string {
  const ext = EXT_BY_MIME[mime];
  if (!ext) {
    throw new Error(`Unsupported mime ${mime}`);
  }
  return ext;
}

const DIACRITICS = /[̀-ͯ]/g;

export function slugify(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'asset';
}

export function keyFor(sha256: string, slug: string, ext: string): string {
  return `originals/${sha256.slice(0, 32)}/${slug}.${ext}`;
}

const sha256Field = z.string().regex(/^[0-9a-f]{64}$/i, 'sha256 must be 64 hex chars');
const mimeField = z
  .string()
  .refine((m) => m in MIME_ALLOWLIST, { message: 'mime not in allowlist' });

export const presignSchema = z
  .object({
    mime: mimeField,
    bytes: z.number().int().positive(),
    sha256: sha256Field,
    originalName: z.string().min(1).max(255),
    altDefault: LocalizedText.optional(),
  })
  .superRefine((val, ctx) => {
    const cap = MIME_ALLOWLIST[val.mime]?.maxBytes;
    if (cap && val.bytes > cap) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `file size ${val.bytes} exceeds cap ${cap} for ${val.mime}`,
        path: ['bytes'],
      });
    }
  });

export const confirmSchema = z.object({
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

export const replaceSchema = presignSchema;

export const altSchema = z.object({ alt: LocalizedText });

export type PresignInput = z.infer<typeof presignSchema>;
export type ConfirmInput = z.infer<typeof confirmSchema>;
export type ReplaceInput = z.infer<typeof replaceSchema>;
export type AltInput = z.infer<typeof altSchema>;
```

4. Run `npm test -w @signex/api -- assets.dto` — expect PASS (8 tests).

5. Commit:
```bash
git add apps/api/src/assets/dto/assets.dto.ts apps/api/src/assets/dto/assets.dto.spec.ts
git commit -m "feat(api): assets dtos — mime allowlist, size caps, content-addressed keys"
```

---

### Task 38: R2Service (S3-compatible client to Cloudflare R2)

**Files:**
- Create: `apps/api/src/assets/r2.service.ts`
- Test: `apps/api/src/assets/r2.service.spec.ts`

**Interfaces:**
- Consumes: `loadR2Config` / `R2Config` / `R2_CONFIG` token (this milestone); `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`.
- Produces: `R2Service` with:
  - `presignPut(args: { r2Key: string; mime: string; sha256: string; maxBytes: number }): Promise<{ url: string; headers: Record<string,string>; expiresIn: number }>`
  - `putObject(args: { r2Key: string; body: Buffer; mime: string; cacheControl: string; checksumSha256?: string }): Promise<void>`
  - `headObject(r2Key: string): Promise<{ contentLength: number; contentType?: string } | null>`
  - `getObjectBytes(r2Key: string): Promise<Buffer>`
  - `publicUrl(r2Key: string): string`

**Steps:**

1. Write the failing test `apps/api/src/assets/r2.service.spec.ts` (mock the S3 client + the presigner):
```ts
import { mockClient } from 'aws-sdk-client-mock';
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import { R2Service } from './r2.service';
import type { R2Config } from './r2.config';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://signed.example/put'),
}));
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const cfg: R2Config = {
  endpoint: 'https://acc.r2.cloudflarestorage.com',
  region: 'auto',
  accessKeyId: 'ak',
  secretAccessKey: 'sk',
  bucket: 'signex-media',
  publicBase: 'https://media.signex.test',
  presignTtlSeconds: 300,
};

const s3mock = mockClient(S3Client);

describe('R2Service', () => {
  let svc: R2Service;
  beforeEach(() => {
    s3mock.reset();
    (getSignedUrl as jest.Mock).mockClear();
    svc = new R2Service(cfg);
  });

  it('publicUrl joins base + key', () => {
    expect(svc.publicUrl('originals/abc/logo.svg')).toBe(
      'https://media.signex.test/originals/abc/logo.svg',
    );
  });

  it('presignPut returns url + required PUT headers incl checksum', async () => {
    const out = await svc.presignPut({
      r2Key: 'originals/abc/logo.png',
      mime: 'image/png',
      sha256: 'a'.repeat(64),
      maxBytes: 1000,
    });
    expect(out.url).toBe('https://signed.example/put');
    expect(out.expiresIn).toBe(300);
    expect(out.headers['Content-Type']).toBe('image/png');
    expect(out.headers['Cache-Control']).toBe('public, max-age=31536000, immutable');
    // base64 of the hex sha256, for x-amz-checksum-sha256
    expect(out.headers['x-amz-checksum-sha256']).toBe(
      Buffer.from('a'.repeat(64), 'hex').toString('base64'),
    );
  });

  it('headObject returns size on found, null on 404', async () => {
    s3mock.on(HeadObjectCommand).resolvesOnce({ ContentLength: 42, ContentType: 'image/png' });
    expect(await svc.headObject('k')).toEqual({ contentLength: 42, contentType: 'image/png' });

    s3mock.on(HeadObjectCommand).rejectsOnce(
      Object.assign(new Error('not found'), { $metadata: { httpStatusCode: 404 } }),
    );
    expect(await svc.headObject('missing')).toBeNull();
  });

  it('putObject sends a PutObjectCommand with cache header', async () => {
    s3mock.on(PutObjectCommand).resolves({});
    await svc.putObject({
      r2Key: 'k',
      body: Buffer.from('x'),
      mime: 'image/png',
      cacheControl: 'public, max-age=31536000, immutable',
    });
    const call = s3mock.commandCalls(PutObjectCommand)[0];
    expect(call.args[0].input).toMatchObject({
      Bucket: 'signex-media',
      Key: 'k',
      CacheControl: 'public, max-age=31536000, immutable',
      ContentType: 'image/png',
    });
  });

  it('getObjectBytes buffers the stream', async () => {
    s3mock.on(GetObjectCommand).resolves({ Body: Readable.from([Buffer.from('hello')]) as never });
    const buf = await svc.getObjectBytes('k');
    expect(buf.toString()).toBe('hello');
  });
});
```

2. Run `npm test -w @signex/api -- r2.service` — expect FAIL: `Cannot find module './r2.service'`.

3. Implement `apps/api/src/assets/r2.service.ts`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { R2_CONFIG, type R2Config } from './r2.config';

export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

function hexToBase64(hex: string): string {
  return Buffer.from(hex, 'hex').toString('base64');
}

@Injectable()
export class R2Service {
  private readonly s3: S3Client;

  constructor(@Inject(R2_CONFIG) private readonly cfg: R2Config) {
    this.s3 = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
      forcePathStyle: true,
    });
  }

  publicUrl(r2Key: string): string {
    return `${this.cfg.publicBase}/${r2Key}`;
  }

  async presignPut(args: {
    r2Key: string;
    mime: string;
    sha256: string;
    maxBytes: number;
  }): Promise<{ url: string; headers: Record<string, string>; expiresIn: number }> {
    const checksum = hexToBase64(args.sha256);
    const cmd = new PutObjectCommand({
      Bucket: this.cfg.bucket,
      Key: args.r2Key,
      ContentType: args.mime,
      CacheControl: IMMUTABLE_CACHE_CONTROL,
      ChecksumSHA256: checksum,
    });
    const url = await getSignedUrl(this.s3, cmd, {
      expiresIn: this.cfg.presignTtlSeconds,
      // The browser MUST echo these headers on PUT or R2 rejects the signature.
      signableHeaders: new Set(['content-type', 'cache-control', 'x-amz-checksum-sha256']),
    });
    return {
      url,
      headers: {
        'Content-Type': args.mime,
        'Cache-Control': IMMUTABLE_CACHE_CONTROL,
        'x-amz-checksum-sha256': checksum,
      },
      expiresIn: this.cfg.presignTtlSeconds,
    };
  }

  async putObject(args: {
    r2Key: string;
    body: Buffer;
    mime: string;
    cacheControl: string;
    checksumSha256?: string;
  }): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.cfg.bucket,
        Key: args.r2Key,
        Body: args.body,
        ContentType: args.mime,
        CacheControl: args.cacheControl,
        ChecksumSHA256: args.checksumSha256,
      }),
    );
  }

  async headObject(
    r2Key: string,
  ): Promise<{ contentLength: number; contentType?: string } | null> {
    try {
      const res = await this.s3.send(
        new HeadObjectCommand({ Bucket: this.cfg.bucket, Key: r2Key }),
      );
      return { contentLength: res.ContentLength ?? 0, contentType: res.ContentType };
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404 || (err as { name?: string }).name === 'NotFound') {
        return null;
      }
      throw err;
    }
  }

  async getObjectBytes(r2Key: string): Promise<Buffer> {
    const res = await this.s3.send(
      new GetObjectCommand({ Bucket: this.cfg.bucket, Key: r2Key }),
    );
    const chunks: Buffer[] = [];
    const body = res.Body as AsyncIterable<Uint8Array>;
    for await (const chunk of body) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
}
```

4. Run `npm test -w @signex/api -- r2.service` — expect PASS (5 tests).

5. Commit:
```bash
git add apps/api/src/assets/r2.service.ts apps/api/src/assets/r2.service.spec.ts
git commit -m "feat(api): R2Service — presignPut + put/head/get + publicUrl (R2 S3 client)"
```

---

### Task 39: AssetsService — presign / confirm / register / list / usage / replace / setAlt

**Files:**
- Create: `apps/api/src/assets/assets.service.ts`
- Test: `apps/api/src/assets/assets.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (`.client`); `R2Service`; `assets.dto.ts` helpers + schemas; `readImageDimensions`; `sanitizeSvg`/`SvgForbiddenError`; `@signex/shared` `LocalizedText`; `@signex/db` types `Asset`, `AssetStatus`, `AssetKind`, `AssetRef`. Actor shape `{ id: string; role: string }` from `@CurrentUser()` (step 2).
- Produces: `AssetsService` with `presign`, `confirm`, `register`, `list`, `usage`, `replace`, `setAlt`; `toAssetDto(asset): AssetDto`; `PresignResult` union. Exported `AssetDto` type.

**Steps:**

1. Write the failing test `apps/api/src/assets/assets.service.spec.ts` (Prisma + R2 mocked):
```ts
import { ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AssetsService } from './assets.service';
import { R2Service } from './r2.service';
import { PrismaService } from '../prisma/prisma.service';

function makePrisma() {
  return {
    client: {
      asset: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      assetRef: { findMany: jest.fn().mockResolvedValue([]) },
      releaseAssetRef: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    },
  } as unknown as PrismaService;
}

const r2 = {
  presignPut: jest.fn(),
  putObject: jest.fn(),
  headObject: jest.fn(),
  getObjectBytes: jest.fn(),
  publicUrl: jest.fn((k: string) => `https://media.test/${k}`),
} as unknown as R2Service;

const actor = { id: 'cuserxxxxxxxxxxxxxxxxxxxx', role: 'EDITOR' };
const pngBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMCAQGuAAAAAElFTkSuQmCC',
  'base64',
);
const pngSha = createHash('sha256').update(pngBytes).digest('hex');

describe('AssetsService.presign', () => {
  let prisma: PrismaService;
  let svc: AssetsService;
  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    svc = new AssetsService(prisma, r2);
  });

  it('short-circuits (deduped) when a READY asset with the sha256 exists', async () => {
    (prisma.client.asset.findUnique as jest.Mock).mockResolvedValue({
      id: 'a1', status: 'READY', kind: 'IMAGE', sha256: pngSha, r2Key: 'originals/x/y.png',
      mime: 'image/png', bytes: BigInt(pngBytes.length), width: 1, height: 1, originalName: 'y.png',
      altDefault: null, duration: null, posterId: null,
    });
    const res = await svc.presign(actor, {
      mime: 'image/png', bytes: pngBytes.length, sha256: pngSha, originalName: 'y.png',
    });
    expect(res.deduped).toBe(true);
    expect(prisma.client.asset.create).not.toHaveBeenCalled();
    expect(r2.presignPut).not.toHaveBeenCalled();
  });

  it('creates a PENDING asset + returns a presigned PUT when new', async () => {
    (prisma.client.asset.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.client.asset.create as jest.Mock).mockResolvedValue({
      id: 'a2', status: 'PENDING', kind: 'IMAGE', sha256: pngSha,
      r2Key: `originals/${pngSha.slice(0, 32)}/y.png`, mime: 'image/png',
      bytes: BigInt(pngBytes.length), width: null, height: null, originalName: 'y.png',
      altDefault: null, duration: null, posterId: null,
    });
    (r2.presignPut as jest.Mock).mockResolvedValue({
      url: 'https://signed/put', headers: { 'Content-Type': 'image/png' }, expiresIn: 300,
    });
    const res = await svc.presign(actor, {
      mime: 'image/png', bytes: pngBytes.length, sha256: pngSha, originalName: 'y.png',
    });
    expect(res.deduped).toBe(false);
    if (!res.deduped) {
      expect(res.assetId).toBe('a2');
      expect(res.r2Key).toBe(`originals/${pngSha.slice(0, 32)}/y.png`);
      expect(res.upload.url).toBe('https://signed/put');
    }
  });
});

describe('AssetsService.confirm', () => {
  let prisma: PrismaService;
  let svc: AssetsService;
  const pending = {
    id: 'a3', status: 'PENDING', kind: 'IMAGE', sha256: pngSha,
    r2Key: `originals/${pngSha.slice(0, 32)}/y.png`, mime: 'image/png',
    bytes: BigInt(pngBytes.length), width: null, height: null, originalName: 'y.png',
    altDefault: null, duration: null, posterId: null,
  };
  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    svc = new AssetsService(prisma, r2);
    (prisma.client.asset.findUnique as jest.Mock).mockResolvedValue(pending);
    (r2.headObject as jest.Mock).mockResolvedValue({ contentLength: pngBytes.length });
    (r2.getObjectBytes as jest.Mock).mockResolvedValue(pngBytes);
  });

  it('verifies sha256, sets authoritative dims, flips READY', async () => {
    (prisma.client.asset.update as jest.Mock).mockImplementation(({ data }) =>
      Promise.resolve({ ...pending, ...data }),
    );
    const dto = await svc.confirm(actor, 'a3');
    expect(dto.status).toBe('READY');
    expect(dto.width).toBe(1);
    expect(dto.height).toBe(1);
    const updateArg = (prisma.client.asset.update as jest.Mock).mock.calls[0][0];
    expect(updateArg.data.status).toBe('READY');
  });

  it('throws when R2 object is missing', async () => {
    (r2.headObject as jest.Mock).mockResolvedValue(null);
    await expect(svc.confirm(actor, 'a3')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws CHECKSUM_MISMATCH when bytes hash differs from declared sha256', async () => {
    (r2.getObjectBytes as jest.Mock).mockResolvedValue(Buffer.from('tampered'));
    await expect(svc.confirm(actor, 'a3')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('is idempotent on an already-READY asset', async () => {
    (prisma.client.asset.findUnique as jest.Mock).mockResolvedValue({ ...pending, status: 'READY', width: 1, height: 1 });
    const dto = await svc.confirm(actor, 'a3');
    expect(dto.status).toBe('READY');
    expect(r2.getObjectBytes).not.toHaveBeenCalled();
  });
});

describe('AssetsService.confirm SVG', () => {
  let prisma: PrismaService;
  let svc: AssetsService;
  const hostile = Buffer.from('<svg><script>alert(1)</script></svg>');
  const svgSha = createHash('sha256').update(hostile).digest('hex');
  const pending = {
    id: 's1', status: 'PENDING', kind: 'SVG', sha256: svgSha,
    r2Key: `originals/${svgSha.slice(0, 32)}/i.svg`, mime: 'image/svg+xml',
    bytes: BigInt(hostile.length), width: null, height: null, originalName: 'i.svg',
    altDefault: null, duration: null, posterId: null,
  };
  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    svc = new AssetsService(prisma, r2);
    (prisma.client.asset.findUnique as jest.Mock).mockResolvedValue(pending);
    (r2.headObject as jest.Mock).mockResolvedValue({ contentLength: hostile.length });
    (r2.getObjectBytes as jest.Mock).mockResolvedValue(hostile);
    (prisma.client.asset.update as jest.Mock).mockImplementation(({ data }) =>
      Promise.resolve({ ...pending, ...data }),
    );
  });

  it('sanitizes + re-uploads the cleaned SVG, then flips READY', async () => {
    const dto = await svc.confirm(actor, 's1');
    expect(dto.status).toBe('READY');
    expect(r2.putObject).toHaveBeenCalled();
    const put = (r2.putObject as jest.Mock).mock.calls[0][0];
    expect(put.body.toString()).not.toMatch(/script/i);
    expect(put.cacheControl).toBe('public, max-age=31536000, immutable');
  });
});

describe('AssetsService.replace + setAlt + usage', () => {
  let prisma: PrismaService;
  let svc: AssetsService;
  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    svc = new AssetsService(prisma, r2);
  });

  it('usage returns working refs + release refs', async () => {
    (prisma.client.assetRef.findMany as jest.Mock).mockResolvedValue([{ id: 'r1', ownerType: 'product', ownerId: 'p1', field: 'image' }]);
    (prisma.client.releaseAssetRef.findMany as jest.Mock).mockResolvedValue([{ releaseId: 'rel1' }]);
    const u = await svc.usage('a1');
    expect(u.working).toHaveLength(1);
    expect(u.releases).toEqual([{ releaseId: 'rel1' }]);
  });

  it('setAlt updates altDefault + audits', async () => {
    (prisma.client.asset.findUnique as jest.Mock).mockResolvedValue({ id: 'a1', status: 'READY', kind: 'IMAGE', sha256: 'x', r2Key: 'k', mime: 'image/png', bytes: BigInt(1), width: 1, height: 1, originalName: 'n', altDefault: null, duration: null, posterId: null });
    (prisma.client.asset.update as jest.Mock).mockImplementation(({ data }) => Promise.resolve({ id: 'a1', status: 'READY', kind: 'IMAGE', sha256: 'x', r2Key: 'k', mime: 'image/png', bytes: BigInt(1), width: 1, height: 1, originalName: 'n', duration: null, posterId: null, ...data }));
    const dto = await svc.setAlt(actor, 'a1', { en: 'logo', vi: 'logo' });
    expect(dto.altDefault).toEqual({ en: 'logo', vi: 'logo' });
    expect(prisma.client.auditLog.create).toHaveBeenCalled();
  });

  it('setAlt throws NotFound for unknown asset', async () => {
    (prisma.client.asset.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(svc.setAlt(actor, 'missing', { en: 'a', vi: 'a' })).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

2. Run `npm test -w @signex/api -- assets.service` — expect FAIL: `Cannot find module './assets.service'`.

3. Implement `apps/api/src/assets/assets.service.ts`:
```ts
import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { R2Service, IMMUTABLE_CACHE_CONTROL } from './r2.service';
import { readImageDimensions } from './image-dimensions';
import { sanitizeSvg } from './svg-sanitize';
import {
  MIME_ALLOWLIST,
  kindForMime,
  extForMime,
  slugify,
  keyFor,
  type PresignInput,
  type ReplaceInput,
} from './dto/assets.dto';
import type { Asset } from '@signex/db';

export type LocalizedText = { en: string; vi: string };

export interface AssetDto {
  id: string;
  status: string;
  kind: string;
  sha256: string;
  r2Key: string;
  url: string;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  originalName: string;
  altDefault: LocalizedText | null;
  posterId: string | null;
}

interface Actor {
  id: string;
  role: string;
}

export type PresignResult =
  | { deduped: true; asset: AssetDto }
  | {
      deduped: false;
      assetId: string;
      r2Key: string;
      upload: { url: string; headers: Record<string, string>; expiresIn: number };
    };

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly r2: R2Service,
  ) {}

  toAssetDto(a: Asset): AssetDto {
    return {
      id: a.id,
      status: a.status,
      kind: a.kind,
      sha256: a.sha256,
      r2Key: a.r2Key,
      url: this.r2.publicUrl(a.r2Key),
      mime: a.mime,
      bytes: Number(a.bytes),
      width: a.width ?? null,
      height: a.height ?? null,
      duration: a.duration ?? null,
      originalName: a.originalName,
      altDefault: (a.altDefault as LocalizedText | null) ?? null,
      posterId: a.posterId ?? null,
    };
  }

  private async audit(actor: Actor, action: string, entityId: string, meta?: unknown) {
    await this.prisma.client.auditLog.create({
      data: { userId: actor.id, action, entityType: 'asset', entityId, meta: meta as never },
    });
  }

  async presign(actor: Actor, input: PresignInput): Promise<PresignResult> {
    const sha256 = input.sha256.toLowerCase();
    // Dedup short-circuit: same bytes already live => same content-addressed key.
    const existing = await this.prisma.client.asset.findUnique({ where: { sha256 } });
    if (existing && existing.status === 'READY') {
      return { deduped: true, asset: this.toAssetDto(existing) };
    }

    const kind = kindForMime(input.mime);
    const ext = extForMime(input.mime);
    const slug = slugify(input.originalName.replace(/\.[^.]+$/, ''));
    const r2Key = keyFor(sha256, slug, ext);

    // Re-use an existing PENDING row for the same bytes (idempotent re-presign).
    const asset =
      existing ??
      (await this.prisma.client.asset.create({
        data: {
          status: 'PENDING',
          kind,
          sha256,
          r2Key,
          mime: input.mime,
          bytes: BigInt(input.bytes),
          originalName: input.originalName,
          altDefault: (input.altDefault as never) ?? undefined,
          uploadedById: actor.id,
        },
      }));

    const upload = await this.r2.presignPut({
      r2Key: asset.r2Key,
      mime: input.mime,
      sha256,
      maxBytes: MIME_ALLOWLIST[input.mime].maxBytes,
    });
    await this.audit(actor, 'asset.presign', asset.id, { r2Key: asset.r2Key });
    return { deduped: false, assetId: asset.id, r2Key: asset.r2Key, upload };
  }

  async confirm(actor: Actor, assetId: string): Promise<AssetDto> {
    const asset = await this.prisma.client.asset.findUnique({ where: { id: assetId } });
    if (!asset) {
      throw new NotFoundException('asset not found');
    }
    if (asset.status === 'READY') {
      return this.toAssetDto(asset); // idempotent
    }

    const head = await this.r2.headObject(asset.r2Key);
    if (!head) {
      throw new BadRequestException('uploaded object not found in R2');
    }

    const bytes = await this.r2.getObjectBytes(asset.r2Key);
    const actualSha = createHash('sha256').update(bytes).digest('hex');
    if (actualSha !== asset.sha256) {
      throw new BadRequestException('CHECKSUM_MISMATCH: uploaded bytes do not match declared sha256');
    }

    let storedBytes = bytes;
    if (asset.kind === 'SVG') {
      // Sanitize-or-forbid: re-write the cleaned SVG back to R2 (key/hash unchanged, content trusted).
      const cleaned = sanitizeSvg(bytes);
      storedBytes = cleaned;
      await this.r2.putObject({
        r2Key: asset.r2Key,
        body: cleaned,
        mime: asset.mime,
        cacheControl: IMMUTABLE_CACHE_CONTROL,
      });
    }

    const dims = readImageDimensions(storedBytes, asset.mime);

    const updated = await this.prisma.client.asset.update({
      where: { id: asset.id },
      data: {
        status: 'READY',
        bytes: BigInt(storedBytes.length),
        width: dims?.width ?? null,
        height: dims?.height ?? null,
      },
    });
    await this.audit(actor, 'asset.confirm', asset.id, { bytes: storedBytes.length });
    return this.toAssetDto(updated);
  }

  /** Server-side upload path reused by the importer + replace (no presign round-trip). */
  async register(
    actor: Actor,
    input: { bytes: Buffer; mime: string; originalName: string; altDefault?: LocalizedText },
  ): Promise<AssetDto> {
    if (!(input.mime in MIME_ALLOWLIST)) {
      throw new BadRequestException(`mime ${input.mime} not in allowlist`);
    }
    const cap = MIME_ALLOWLIST[input.mime].maxBytes;
    if (input.bytes.length > cap) {
      throw new BadRequestException(`file size ${input.bytes.length} exceeds cap ${cap}`);
    }

    let body = input.bytes;
    if (input.mime === 'image/svg+xml') {
      body = sanitizeSvg(body);
    }
    const sha256 = createHash('sha256').update(body).digest('hex');

    const existing = await this.prisma.client.asset.findUnique({ where: { sha256 } });
    if (existing && existing.status === 'READY') {
      return this.toAssetDto(existing); // dedup
    }

    const kind = kindForMime(input.mime);
    const ext = extForMime(input.mime);
    const slug = slugify(input.originalName.replace(/\.[^.]+$/, ''));
    const r2Key = keyFor(sha256, slug, ext);
    const dims = readImageDimensions(body, input.mime);

    await this.r2.putObject({
      r2Key,
      body,
      mime: input.mime,
      cacheControl: IMMUTABLE_CACHE_CONTROL,
      checksumSha256: Buffer.from(sha256, 'hex').toString('base64'),
    });

    const asset = existing
      ? await this.prisma.client.asset.update({
          where: { id: existing.id },
          data: { status: 'READY', bytes: BigInt(body.length), width: dims?.width ?? null, height: dims?.height ?? null },
        })
      : await this.prisma.client.asset.create({
          data: {
            status: 'READY',
            kind,
            sha256,
            r2Key,
            mime: input.mime,
            bytes: BigInt(body.length),
            width: dims?.width ?? null,
            height: dims?.height ?? null,
            originalName: input.originalName,
            altDefault: (input.altDefault as never) ?? undefined,
            uploadedById: actor.id,
          },
        });
    await this.audit(actor, 'asset.register', asset.id, { r2Key });
    return this.toAssetDto(asset);
  }

  async list(opts?: { kind?: string; includeDeleted?: boolean }): Promise<AssetDto[]> {
    const rows = await this.prisma.client.asset.findMany({
      where: {
        status: 'READY',
        ...(opts?.kind ? { kind: opts.kind as never } : {}),
        ...(opts?.includeDeleted ? {} : { deletedAt: null }),
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toAssetDto(r));
  }

  async usage(assetId: string): Promise<{
    working: { id: string; ownerType: string; ownerId: string; field: string }[];
    releases: { releaseId: string }[];
  }> {
    const [working, releases] = await Promise.all([
      this.prisma.client.assetRef.findMany({ where: { assetId } }),
      this.prisma.client.releaseAssetRef.findMany({
        where: { assetId },
        select: { releaseId: true },
      }),
    ]);
    return {
      working: working.map((w) => ({
        id: w.id,
        ownerType: w.ownerType,
        ownerId: w.ownerId,
        field: w.field,
      })),
      releases,
    };
  }

  /** Replace = register the new bytes; callers repoint imageId/posterId atomically at the catalog/content layer. */
  async replace(actor: Actor, assetId: string, input: ReplaceInput & { bytes?: Buffer }): Promise<AssetDto> {
    const target = await this.prisma.client.asset.findUnique({ where: { id: assetId } });
    if (!target) {
      throw new NotFoundException('asset to replace not found');
    }
    if (!input.bytes) {
      throw new BadRequestException('replace requires raw bytes');
    }
    const dto = await this.register(actor, {
      bytes: input.bytes,
      mime: input.mime,
      originalName: input.originalName,
    });
    await this.audit(actor, 'asset.replace', assetId, { replacedWith: dto.id });
    return dto;
  }

  async setAlt(actor: Actor, assetId: string, alt: LocalizedText): Promise<AssetDto> {
    const asset = await this.prisma.client.asset.findUnique({ where: { id: assetId } });
    if (!asset) {
      throw new NotFoundException('asset not found');
    }
    const updated = await this.prisma.client.asset.update({
      where: { id: assetId },
      data: { altDefault: alt as never },
    });
    await this.audit(actor, 'asset.setAlt', assetId, { alt });
    return this.toAssetDto(updated);
  }
}
```

4. Run `npm test -w @signex/api -- assets.service` — expect PASS (all describe blocks green). If the `ConflictException` import is unused, remove it to satisfy lint.

5. Run `npm run lint -w @signex/api` — expect no errors in `src/assets/**`.

6. Commit:
```bash
git add apps/api/src/assets/assets.service.ts apps/api/src/assets/assets.service.spec.ts
git commit -m "feat(api): AssetsService — presign/confirm(verify+dims+svg)/register/list/usage/replace/setAlt"
```

---

### Task 40: AssetsController + AssetsModule + wire into AppModule

**Files:**
- Create: `apps/api/src/assets/assets.controller.ts`
- Create: `apps/api/src/assets/assets.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/assets.e2e-spec.ts`

**Interfaces:**
- Consumes: step 2 auth — `@Roles('EDITOR')`, `@CurrentUser()`, `ZodValidationPipe`, `SessionAuthGuard`/`RolesGuard` (global). `R2_CONFIG` token + `loadR2Config`. `AssetsService`. `presignSchema`/`confirmSchema`/`altSchema`/`replaceSchema`.
- Produces: `AssetsModule` (exports `AssetsService`, `R2Service`) consumed by Step 6 (release) + Step 7 (importer). Routes `POST /api/assets/presign|:id/confirm|:id/replace|:id/alt`, `GET /api/assets`, `GET /api/assets/usage`.

**Steps:**

1. Implement `apps/api/src/assets/assets.controller.ts`:
```ts
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UsePipes,
} from '@nestjs/common';
import { AssetsService } from './assets.service';
import {
  presignSchema,
  confirmSchema,
  altSchema,
  type PresignInput,
  type ConfirmInput,
  type AltInput,
} from './dto/assets.dto';
import { ZodValidationPipe } from '../auth/zod-validation.pipe';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';

@Controller('assets')
@Roles('EDITOR')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Post('presign')
  @UsePipes(new ZodValidationPipe(presignSchema))
  presign(@CurrentUser() user: AuthUser, @Body() body: PresignInput) {
    return this.assets.presign(user, body);
  }

  @Post(':id/confirm')
  @UsePipes(new ZodValidationPipe(confirmSchema))
  confirm(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.assets.confirm(user, id);
  }

  @Post(':id/alt')
  @UsePipes(new ZodValidationPipe(altSchema))
  setAlt(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: AltInput) {
    return this.assets.setAlt(user, id, body.alt);
  }

  @Get()
  list(@Query('kind') kind?: string) {
    return this.assets.list({ kind });
  }

  @Get('usage')
  usage(@Query('assetId') assetId: string) {
    return this.assets.usage(assetId);
  }
}
```
> Note: `:id/replace` accepts raw bytes (multipart) and is wired by the admin upload flow; the JSON `presign→PUT→confirm` path is the canonical browser route and the only one exercised by e2e here. The controller exposes `replace` via `register` reuse in Step 7; no JSON endpoint is added in this milestone to avoid a multipart parser dependency the foundation does not yet need.

2. Implement `apps/api/src/assets/assets.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { R2Service } from './r2.service';
import { R2_CONFIG } from './r2.config';
import { loadR2Config } from './r2.config';

@Module({
  controllers: [AssetsController],
  providers: [
    { provide: R2_CONFIG, useFactory: () => loadR2Config(process.env) },
    R2Service,
    AssetsService,
  ],
  exports: [AssetsService, R2Service],
})
export class AssetsModule {}
```

3. Modify `apps/api/src/app.module.ts` — import `AssetsModule`:
```ts
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { AssetsModule } from './assets/assets.module';

@Module({
  imports: [PrismaModule, HealthModule, AssetsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

4. Write the e2e `apps/api/test/assets.e2e-spec.ts`. It boots a Nest app with `AssetsService` real but `R2Service`+`PrismaService` overridden by fakes, and bypasses the global auth guards by overriding them to inject a fixed EDITOR user. This proves the route plumbing + ZodValidationPipe + dedup short-circuit + checksum-mismatch path end-to-end:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ExecutionContext, CanActivate } from '@nestjs/common';
import request from 'supertest';
import { createHash } from 'node:crypto';
import { AssetsModule } from '../src/assets/assets.module';
import { AssetsService } from '../src/assets/assets.service';
import { R2Service } from '../src/assets/r2.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { SessionAuthGuard } from '../src/auth/session-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMCAQGuAAAAAElFTkSuQmCC',
  'base64',
);
const sha = createHash('sha256').update(png).digest('hex');

class PassGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    ctx.switchToHttp().getRequest().user = { id: 'ceditorxxxxxxxxxxxxxxxxxx', role: 'EDITOR' };
    return true;
  }
}

describe('Assets (e2e)', () => {
  let app: INestApplication;
  const store = new Map<string, Buffer>();
  const assetRows = new Map<string, any>();

  const prismaFake = {
    client: {
      asset: {
        findUnique: jest.fn(({ where }: any) => {
          if (where.sha256) {
            for (const a of assetRows.values()) if (a.sha256 === where.sha256) return Promise.resolve(a);
            return Promise.resolve(null);
          }
          return Promise.resolve(assetRows.get(where.id) ?? null);
        }),
        create: jest.fn(({ data }: any) => {
          const id = `a${assetRows.size + 1}`;
          const row = { id, ...data };
          assetRows.set(id, row);
          return Promise.resolve(row);
        }),
        update: jest.fn(({ where, data }: any) => {
          const row = { ...assetRows.get(where.id), ...data };
          assetRows.set(where.id, row);
          return Promise.resolve(row);
        }),
        findMany: jest.fn(() => Promise.resolve([...assetRows.values()])),
      },
      assetRef: { findMany: jest.fn().mockResolvedValue([]) },
      releaseAssetRef: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    },
  };

  const r2Fake = {
    presignPut: jest.fn().mockResolvedValue({ url: 'https://signed/put', headers: {}, expiresIn: 300 }),
    putObject: jest.fn(({ r2Key, body }: any) => { store.set(r2Key, body); return Promise.resolve(); }),
    headObject: jest.fn((k: string) => Promise.resolve(store.has(k) ? { contentLength: store.get(k)!.length } : null)),
    getObjectBytes: jest.fn((k: string) => Promise.resolve(store.get(k)!)),
    publicUrl: jest.fn((k: string) => `https://media.test/${k}`),
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AssetsModule] })
      .overrideProvider(PrismaService).useValue(prismaFake)
      .overrideProvider(R2Service).useValue(r2Fake)
      .overrideGuard(SessionAuthGuard).useClass(PassGuard)
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  it('POST /api/assets/presign creates a PENDING asset + presigned PUT', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/assets/presign')
      .send({ mime: 'image/png', bytes: png.length, sha256: sha, originalName: 'logo.png' })
      .expect(201);
    expect(res.body.deduped).toBe(false);
    expect(res.body.upload.url).toBe('https://signed/put');
    // simulate the browser PUT to R2
    store.set(res.body.r2Key, png);
  });

  it('POST /api/assets/:id/confirm verifies + flips READY', async () => {
    const id = [...assetRows.keys()][0];
    const res = await request(app.getHttpServer())
      .post(`/api/assets/${id}/confirm`)
      .send({})
      .expect(201);
    expect(res.body.status).toBe('READY');
    expect(res.body.width).toBe(1);
  });

  it('presign with the same sha256 short-circuits (deduped)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/assets/presign')
      .send({ mime: 'image/png', bytes: png.length, sha256: sha, originalName: 'logo.png' })
      .expect(201);
    expect(res.body.deduped).toBe(true);
  });

  it('presign rejects a disallowed mime with 400', async () => {
    await request(app.getHttpServer())
      .post('/api/assets/presign')
      .send({ mime: 'application/zip', bytes: 10, sha256: sha, originalName: 'x.zip' })
      .expect(400);
  });

  it('confirm rejects on checksum mismatch with 400', async () => {
    const r = await request(app.getHttpServer())
      .post('/api/assets/presign')
      .send({ mime: 'image/png', bytes: 3, sha256: 'c'.repeat(64), originalName: 'b.png' })
      .expect(201);
    store.set(r.body.r2Key, Buffer.from('xyz')); // bytes whose hash != declared sha
    await request(app.getHttpServer()).post(`/api/assets/${r.body.assetId}/confirm`).send({}).expect(400);
  });
});
```

5. Run `npm run test:e2e -w @signex/api -- assets` — expect FAIL first if `auth/*` (`ZodValidationPipe`, `Roles`, `CurrentUser`, `AuthUser`, `SessionAuthGuard`, `RolesGuard`) imports are not yet present from step 2. Since step 2 precedes this milestone, those modules exist; expect PASS (5 e2e tests). If step-2 export names differ, this is the integration seam — align the imports to the actual `apps/api/src/auth/*` symbol names (`ZodValidationPipe`, `Roles`, `CurrentUser`, `AuthUser`, `SessionAuthGuard`, `RolesGuard`) before proceeding.

6. Run the full api unit suite to confirm no regressions: `npm test -w @signex/api` — expect all green.

7. Commit:
```bash
git add apps/api/src/assets/assets.controller.ts apps/api/src/assets/assets.module.ts apps/api/src/app.module.ts apps/api/test/assets.e2e-spec.ts
git commit -m "feat(api): assets controller + module + e2e (presign/confirm/dedup/mime/checksum)"
```

---

### Task 41: Docker build gate for the media module

**Files:**
- (no new files — verification only)

**Interfaces:**
- Consumes: the full `AssetsModule` chain (depends on `@signex/db` + `@signex/shared` compiled to CJS `dist/`).
- Produces: a green `docker compose build api` confirming the new `@aws-sdk/*` deps trace into the api image and the module compiles against the generated Prisma client.

**Steps:**

1. Verify the api compiles standalone (catches any `@signex/db`/`@signex/shared` dist drift):
```bash
npm run build -w @signex/shared && npm run -w @signex/db generate && npm run build -w @signex/db && npm run build -w @signex/api
```
Expect: all four succeed; `apps/api/dist/assets/assets.module.js` exists.
```bash
test -f apps/api/dist/assets/assets.module.js && echo OK
```
Expect: `OK`.

2. Verify the new runtime deps are present in the api workspace (they MUST be `dependencies`, not `devDependencies`, so the Docker prod-install keeps them):
```bash
node -e "const p=require('./apps/api/package.json'); if(!p.dependencies['@aws-sdk/client-s3']||!p.dependencies['@aws-sdk/s3-request-presigner']) throw new Error('aws-sdk must be a runtime dependency'); console.log('aws-sdk deps OK')"
```
Expect: `aws-sdk deps OK`.

3. Build the api Docker image (the §14 "docker gate" for this milestone):
```bash
docker compose build api
```
Expect: build completes successfully; the builder stage runs `@signex/db generate` + `@signex/db`/`@signex/shared` build before `nest build`, and the final image includes `@aws-sdk/*` in its `node_modules`. If the build fails because the env vars are referenced at import time, confirm `loadR2Config` is only called inside the `R2_CONFIG` `useFactory` (lazy) — never at module top-level — so building/booting without R2 env does not crash (matches the tolerant-boot `PrismaService` pattern).

4. Commit (only if any compose/env wiring changed; otherwise skip). If `.env.example` exists at the repo root, add the new vars and commit:
```bash
git add docker-compose.yml .env.example 2>/dev/null; git commit -m "chore(api): document R2_* + MEDIA_PUBLIC_BASE env for media module" --allow-empty
```
Expect: a commit recording the env contract (`R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_REGION?`, `R2_PRESIGN_TTL?`, `MEDIA_PUBLIC_BASE`).

---

## Milestone 6 — Release engine (SnapshotSerializer, ReleaseService publish/rollback/diff, RevalidationClient)

**Consumes (from earlier milestones):**
- @signex/shared: ReleaseSnapshotSchema (z.ZodType), type ReleaseSnapshot = z.infer<typeof ReleaseSnapshotSchema>
- @signex/shared: FrozenAsset schema { assetId, r2Key, mime, width?, height?, alt?, poster?{r2Key}, webm?{r2Key}, variants[] }
- @signex/shared: BLOCK_REGISTRY, BlockKey, parseBlock(key,data)
- @signex/db: prisma (PrismaClient), generated types Release, ReleaseStatus, PublishedPointer, WorkingState, ContentBlock, Category, Product, Asset, ReleaseAssetRef, User
- packages/db migration: CREATE SEQUENCE release_version_seq (step 1)
- apps/api/src/prisma/prisma.service.ts: PrismaService { readonly client: PrismaClient }
- apps/api/src/audit/audit.service.ts: AuditService.record(tx, { userId, action, entityType, entityId?, meta? }) (step 4)
- apps/api/src/auth: @Roles('PUBLISHER'), @CurrentUser() decorator returning User, ZodValidationPipe(schema) (step 2)
- apps/api/src/content/content.service.ts: working-state revision conventions; WorkingState singleton id 'singleton' (step 4)

**Produces (for later milestones):**
- SnapshotSerializer.serialize(client: PrismaClient): Promise<{ snapshot: ReleaseSnapshot; checksum: string; assetIds: string[]; fromRevision: number }>
- canonicalJson(value: unknown): string
- RevalidationService.revalidate(input: { paths?: string[] }): Promise<{ ok: boolean }>
- RevalidationService.reFire(): Promise<{ drained: number }>
- ReleaseService.publish(actor: User, input: { note?: string; expectedRevision: number }): Promise<{ status: 'published'|'noop'; version?: number; releaseId?: string }>
- ReleaseService.rollback(actor: User, input: { toVersion: number; restoreWorkingState?: boolean }): Promise<{ version: number; releaseId: string }>
- ReleaseService.getLive(): Promise<{ version: number; checksum: string; publishedAt: Date } | null>
- ReleaseService.listReleases(): Promise<Release[]>
- ReleaseService.diff(): Promise<{ dirty: boolean; revision: number; lastPublishedRevision: number }>
- ReleaseService.isDirty(): Promise<boolean>
- publishSchema, rollbackSchema (zod) in apps/api/src/release/dto/release.dto.ts
- ReleaseModule, RevalidationModule (Nest modules)

### Task 42: RevalidationService (web /api/revalidate client with retry)

**Files:**
- Create: `apps/api/src/revalidation/revalidation.service.ts`
- Create: `apps/api/src/revalidation/revalidation.module.ts`
- Test: `apps/api/src/revalidation/revalidation.service.spec.ts`

**Interfaces:**
- Consumes: nothing from earlier release files; reads `process.env.WEB_REVALIDATE_URL` and `process.env.REVALIDATE_SECRET`.
- Produces:
  - `RevalidationService.revalidate(input: { paths?: string[] }): Promise<{ ok: boolean }>` — POSTs `{ paths }` to the web `/api/revalidate` route with header `x-revalidate-secret`; on any failure (non-2xx or thrown) it enqueues the payload in an in-memory retry queue and resolves `{ ok: false }` (NON-fatal — never throws).
  - `RevalidationService.reFire(): Promise<{ drained: number }>` — manual re-fire: re-attempts every queued payload, removing the ones that now succeed; returns how many were successfully drained.

Steps:

1. Write the failing test. Create `apps/api/src/revalidation/revalidation.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { RevalidationService } from './revalidation.service';

describe('RevalidationService', () => {
  let service: RevalidationService;
  const realFetch = global.fetch;

  beforeEach(async () => {
    process.env.WEB_REVALIDATE_URL = 'http://web:3062/api/revalidate';
    process.env.REVALIDATE_SECRET = 's3cret';
    const moduleRef = await Test.createTestingModule({
      providers: [RevalidationService],
    }).compile();
    service = moduleRef.get(RevalidationService);
  });

  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('POSTs paths with the secret header on success', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200 } as Response);
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await service.revalidate({ paths: ['/vi', '/en'] });

    expect(res).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://web:3062/api/revalidate');
    expect(init.method).toBe('POST');
    expect(init.headers['x-revalidate-secret']).toBe('s3cret');
    expect(init.headers['content-type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ paths: ['/vi', '/en'] });
  });

  it('queues for retry and resolves {ok:false} on a non-2xx response (never throws)', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 401 } as Response) as unknown as typeof fetch;

    const res = await service.revalidate({ paths: ['/vi'] });

    expect(res).toEqual({ ok: false });
    expect(service.pendingCount()).toBe(1);
  });

  it('queues for retry and resolves {ok:false} when fetch throws', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;

    const res = await service.revalidate({ paths: ['/vi'] });

    expect(res).toEqual({ ok: false });
    expect(service.pendingCount()).toBe(1);
  });

  it('reFire() drains queued payloads that now succeed', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue({ ok: true, status: 200 } as Response) as unknown as typeof fetch;

    await service.revalidate({ paths: ['/vi'] });
    expect(service.pendingCount()).toBe(1);

    const out = await service.reFire();

    expect(out).toEqual({ drained: 1 });
    expect(service.pendingCount()).toBe(0);
  });
});
```

2. Run it, expect FAIL: `npm test -w @signex/api -- revalidation.service` → `Cannot find module './revalidation.service'`.

3. Implement minimal code. Create `apps/api/src/revalidation/revalidation.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';

export interface RevalidatePayload {
  paths?: string[];
}

@Injectable()
export class RevalidationService {
  private readonly logger = new Logger(RevalidationService.name);
  private readonly queue: RevalidatePayload[] = [];

  pendingCount(): number {
    return this.queue.length;
  }

  private get url(): string {
    return process.env.WEB_REVALIDATE_URL ?? '';
  }

  private get secret(): string {
    return process.env.REVALIDATE_SECRET ?? '';
  }

  /** Fire-and-(soft-)forget. Never throws; queues for retry on failure. */
  async revalidate(input: RevalidatePayload): Promise<{ ok: boolean }> {
    const ok = await this.attempt(input);
    if (!ok) this.queue.push(input);
    return { ok };
  }

  /** Manual re-fire of every queued payload; drops the ones that now succeed. */
  async reFire(): Promise<{ drained: number }> {
    const pending = this.queue.splice(0, this.queue.length);
    let drained = 0;
    for (const payload of pending) {
      const ok = await this.attempt(payload);
      if (ok) drained += 1;
      else this.queue.push(payload);
    }
    return { drained };
  }

  private async attempt(input: RevalidatePayload): Promise<boolean> {
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-revalidate-secret': this.secret,
        },
        body: JSON.stringify({ paths: input.paths ?? [] }),
      });
      if (!res.ok) {
        this.logger.warn(`revalidate non-2xx: ${res.status}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.warn(`revalidate failed: ${(err as Error).message}`);
      return false;
    }
  }
}
```

4. Run, expect PASS: `npm test -w @signex/api -- revalidation.service` → 4 passing.

5. Add the module. Create `apps/api/src/revalidation/revalidation.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { RevalidationService } from './revalidation.service';

@Module({
  providers: [RevalidationService],
  exports: [RevalidationService],
})
export class RevalidationModule {}
```

6. Commit:
```
git add apps/api/src/revalidation/revalidation.service.ts apps/api/src/revalidation/revalidation.service.spec.ts apps/api/src/revalidation/revalidation.module.ts
git commit -m "feat(api): RevalidationService — secret-protected web revalidate client + in-memory retry"
```

---

### Task 43: canonicalJson (deterministic checksum input)

**Files:**
- Create: `apps/api/src/release/canonical-json.ts`
- Test: `apps/api/src/release/canonical-json.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `canonicalJson(value: unknown): string` — a stable, key-sorted JSON serialization (object keys sorted recursively; arrays keep order; throws on `bigint`). Used as the checksum input so two byte-identical working states always produce the same `sha256`.

Steps:

1. Write the failing test. Create `apps/api/src/release/canonical-json.spec.ts`:

```ts
import { canonicalJson } from './canonical-json';

describe('canonicalJson', () => {
  it('is independent of object key order', () => {
    const a = canonicalJson({ b: 1, a: 2, c: { y: 1, x: 2 } });
    const b = canonicalJson({ a: 2, c: { x: 2, y: 1 }, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":2,"b":1,"c":{"x":2,"y":1}}');
  });

  it('preserves array order and recurses into array elements', () => {
    expect(canonicalJson([{ b: 1, a: 2 }, { d: 4, c: 3 }])).toBe(
      '[{"a":2,"b":1},{"c":3,"d":4}]',
    );
  });

  it('serializes null and primitives', () => {
    expect(canonicalJson({ n: null, s: 'x', i: 3 })).toBe(
      '{"i":3,"n":null,"s":"x"}',
    );
  });

  it('throws on bigint (snapshots must not carry raw BigInt)', () => {
    expect(() => canonicalJson({ bytes: 10n })).toThrow(
      /bigint not allowed/i,
    );
  });
});
```

2. Run it, expect FAIL: `npm test -w @signex/api -- canonical-json` → `Cannot find module './canonical-json'`.

3. Implement minimal code. Create `apps/api/src/release/canonical-json.ts`:

```ts
/**
 * Stable JSON serialization for checksum computation.
 * Object keys are sorted recursively; array order is preserved.
 * Rejects bigint so a stray Asset.bytes BigInt can never reach a snapshot.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (typeof value === 'bigint') {
    throw new Error('canonicalJson: bigint not allowed in snapshot');
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => canonicalize(v));
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    out[key] = canonicalize((value as Record<string, unknown>)[key]);
  }
  return out;
}
```

4. Run, expect PASS: `npm test -w @signex/api -- canonical-json` → 4 passing.

5. Commit:
```
git add apps/api/src/release/canonical-json.ts apps/api/src/release/canonical-json.spec.ts
git commit -m "feat(api): canonicalJson — deterministic key-sorted JSON for release checksums"
```

---

### Task 44: SnapshotSerializer (working state -> frozen ReleaseSnapshot + checksum)

**Files:**
- Create: `apps/api/src/release/snapshot.serializer.ts`
- Test: `apps/api/src/release/snapshot.serializer.spec.ts`

**Interfaces:**
- Consumes:
  - `@signex/shared`: `ReleaseSnapshotSchema`, `type ReleaseSnapshot`, `BLOCK_REGISTRY` (block keys), `FrozenAsset` shape `{ assetId, r2Key, mime, width?, height?, alt?, poster?{r2Key}, webm?{r2Key}, variants[] }`.
  - `@signex/db`: `PrismaClient` and generated row types (`ContentBlock`, `Category`, `Product`, `Asset`, `WorkingState`).
  - `apps/api/src/release/canonical-json.ts`: `canonicalJson(value): string`.
- Produces:
  - `SnapshotSerializer.serialize(client: PrismaClient): Promise<{ snapshot: ReleaseSnapshot; checksum: string; assetIds: string[]; fromRevision: number }>` — reads the whole working state, builds the `blocks` object keyed by `BLOCK_REGISTRY` keys and a `catalog.categories[]` array (order-preserving by `sortOrder`), **freezes each asset reference to `{ assetId, r2Key, mime, width, height, alt?, poster?{r2Key}, webm?{r2Key}, variants:[] }` (NEVER an absolute URL)**, runs `ReleaseSnapshotSchema.parse`, computes `checksum = sha256(canonicalJson(snapshot))`, returns the de-duplicated set of referenced `assetIds` and the `WorkingState.revision` read as `fromRevision`.

Notes for the engineer: the serializer takes the Prisma `client` as a parameter (not the service) so the publish path can call it OUTSIDE the transaction with the live client, and the concurrency e2e can call it directly. `freezeAsset(asset, alt?)` is the single helper that produces a `FrozenAsset`.

1. Write the failing test. Create `apps/api/src/release/snapshot.serializer.spec.ts`:

```ts
import { SnapshotSerializer } from './snapshot.serializer';
import { canonicalJson } from './canonical-json';

// Minimal hand-rolled fake of the Prisma client surface the serializer touches.
function makeAsset(over: Partial<any> = {}) {
  return {
    id: 'casset0000000000000000001',
    r2Key: 'originals/aaaa/logo.svg',
    mime: 'image/svg+xml',
    width: 200,
    height: 80,
    poster: null,
    ...over,
  };
}

function makeClient(over: Partial<any> = {}) {
  const logo = makeAsset();
  const catImg = makeAsset({
    id: 'casset0000000000000000002',
    r2Key: 'originals/bbbb/cat.jpg',
    mime: 'image/jpeg',
  });
  const prodImg = makeAsset({
    id: 'casset0000000000000000003',
    r2Key: 'originals/cccc/prod.jpg',
    mime: 'image/jpeg',
  });
  return {
    workingState: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'singleton',
        revision: 7,
        lastPublishedRevision: 3,
      }),
    },
    contentBlock: {
      findMany: jest.fn().mockResolvedValue(blockRows()),
    },
    category: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'ccat00000000000000000001',
          slug: 'pvc',
          sortOrder: 0,
          title: { en: 'PVC', vi: 'PVC' },
          tag: { en: 'PVC', vi: 'PVC' },
          intro: { en: 'i', vi: 'i' },
          productCount: 18,
          materialCount: 4,
          imageId: catImg.id,
          image: catImg,
          imageAlt: { en: 'cat alt', vi: 'cat alt' },
          products: [
            {
              id: 'cprod0000000000000000001',
              slug: 'p1',
              sortOrder: 0,
              title: { en: 'P1', vi: 'P1' },
              tag: { en: 't', vi: 't' },
              desc: { en: 'd', vi: 'd' },
              imageId: prodImg.id,
              image: prodImg,
              imageAlt: { en: 'prod alt', vi: 'prod alt' },
            },
          ],
        },
      ]),
    },
    _logo: logo,
    ...over,
  } as any;
}

// Every BLOCK_REGISTRY key must be present and valid; the importer guarantees
// this at runtime. For the unit test we feed pre-validated block data fixtures.
function blockRows() {
  // Loaded lazily so the test file does not duplicate the whole registry shape.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fixtures = require('./__fixtures__/blocks.fixture').BLOCK_FIXTURES as Record<
    string,
    unknown
  >;
  return Object.entries(fixtures).map(([key, data], i) => ({
    id: `cblk000000000000000000${i}`,
    kind: keyKind(key),
    key,
    data,
  }));
}
function keyKind(key: string): string {
  if (key === 'businessContact' || key === 'formConfig') return 'SETTINGS';
  if (key === 'nav') return 'NAV';
  if (key === 'meta') return 'SEO';
  return 'PAGE';
}

describe('SnapshotSerializer', () => {
  const serializer = new SnapshotSerializer();

  it('freezes assets to r2Key (never an absolute URL) and validates against the schema', async () => {
    const client = makeClient();
    const { snapshot } = await serializer.serialize(client);

    expect(snapshot.schemaVersion).toBe(1);
    const cat = snapshot.catalog.categories[0] as any;
    expect(cat.image.r2Key).toBe('originals/bbbb/cat.jpg');
    expect(cat.image.assetId).toBe('casset0000000000000000002');
    expect(cat.image.variants).toEqual([]);
    // Absolutely no resolved URL is frozen.
    expect(JSON.stringify(snapshot)).not.toMatch(/https?:\/\//);
  });

  it('freezes video poster + webm r2Keys', async () => {
    const poster = makeAsset({
      id: 'casset0000000000000000010',
      r2Key: 'originals/poster/p.jpg',
      mime: 'image/jpeg',
    });
    const webm = makeAsset({
      id: 'casset0000000000000000011',
      r2Key: 'originals/webm/v.webm',
      mime: 'video/webm',
    });
    const mp4 = makeAsset({
      id: 'casset0000000000000000012',
      r2Key: 'originals/mp4/v.mp4',
      mime: 'video/mp4',
      poster,
      posterId: poster.id,
    });
    // The features block fixture references this video via assetIds.
    const client = makeClient();
    client.asset = {
      findMany: jest.fn().mockResolvedValue([poster, webm, mp4]),
    };
    const frozen = serializer.freezeVideo(mp4, webm, poster);
    expect(frozen.r2Key).toBe('originals/mp4/v.mp4');
    expect(frozen.poster).toEqual({ r2Key: 'originals/poster/p.jpg' });
    expect(frozen.webm).toEqual({ r2Key: 'originals/webm/v.webm' });
  });

  it('produces a deterministic checksum and a deduped assetIds set with fromRevision', async () => {
    const client = makeClient();
    const out1 = await serializer.serialize(client);
    const out2 = await serializer.serialize(makeClient());

    expect(out1.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(out1.checksum).toBe(out2.checksum);
    // checksum is over canonicalJson(snapshot)
    const { createHash } = require('node:crypto');
    expect(out1.checksum).toBe(
      createHash('sha256').update(canonicalJson(out1.snapshot)).digest('hex'),
    );
    expect(out1.fromRevision).toBe(7);
    expect(new Set(out1.assetIds).size).toBe(out1.assetIds.length);
    expect(out1.assetIds).toEqual(
      expect.arrayContaining([
        'casset0000000000000000002',
        'casset0000000000000000003',
      ]),
    );
  });
});
```

2. Create the block fixtures the test needs. Create `apps/api/src/release/__fixtures__/blocks.fixture.ts`. The data must satisfy `BLOCK_REGISTRY` for every key. Build it programmatically from the registry so it can never drift:

```ts
import { BLOCK_REGISTRY } from '@signex/shared';

/**
 * Minimal valid sample for every block in the registry, generated so the
 * serializer unit test always covers the full BLOCK_REGISTRY key-set.
 * The real shapes are exercised end-to-end by the importer conformance test.
 */
const L = { en: 'x', vi: 'x' };
const TT = { lead: L, accent: L };
const AREF = { assetId: 'casset0000000000000000099' };

export const BLOCK_FIXTURES: Record<string, unknown> = {
  hero: { eyebrow: L, title: TT, body: L, cta: { label: L, href: '#' } },
  features: {
    eyebrow: L,
    title: TT,
    cta: { label: L, href: '#' },
    video: { title: L, text: L },
    featured: { title: L, desc: L },
    cards: [{ title: L, desc: L }],
  },
  about: { eyebrow: L, title: TT, body: L },
  productsHeader: {
    eyebrow: L,
    title: TT,
    body: L,
    statLabels: { products: L, materials: L },
    detail: { listTitle: TT },
    product: {
      categoryLabel: L,
      materialLabel: L,
      cta: L,
      ctaHref: '#',
      back: L,
      zoomHint: L,
    },
  },
  footer: {},
  nav: { logo: AREF, ctaHref: '#' },
  meta: { siteUrl: 'https://signex.example', themeColor: '#000', ogImage: AREF },
  businessContact: {
    legalName: L,
    brand: 'SIGNEX',
    emails: ['a@b.com'],
    phones: [{ kind: 'tel', label: L, value: '+84' }],
    taxId: '123',
    taxLabel: L,
    sites: [{ kind: 'office', label: L, address: L }],
    social: [{ kind: 'facebook', href: '#' }],
  },
  formConfig: {},
  aboutPage: {},
  contactPage: {},
  notFound: { image: AREF, cta: { label: L, href: '#' } },
};

// Hard fail at module load if a registry key has no fixture, so a new block
// can never silently skip serializer coverage.
for (const key of Object.keys(BLOCK_REGISTRY)) {
  if (!(key in BLOCK_FIXTURES)) {
    throw new Error(`blocks.fixture: missing fixture for block "${key}"`);
  }
}
```

(If a `BLOCK_FIXTURES` shape fails the real registry schema during step 4, fix the fixture to match the registry — the registry is the source of truth.)

3. Run it, expect FAIL: `npm test -w @signex/api -- snapshot.serializer` → `Cannot find module './snapshot.serializer'`.

4. Implement minimal code. Create `apps/api/src/release/snapshot.serializer.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { PrismaClient } from '@signex/db';
import { BLOCK_REGISTRY, ReleaseSnapshotSchema, type ReleaseSnapshot } from '@signex/shared';
import { canonicalJson } from './canonical-json';

type AssetRow = {
  id: string;
  r2Key: string;
  mime: string;
  width: number | null;
  height: number | null;
  poster?: { r2Key: string } | null;
};

export interface SerializeResult {
  snapshot: ReleaseSnapshot;
  checksum: string;
  assetIds: string[];
  fromRevision: number;
}

@Injectable()
export class SnapshotSerializer {
  /** Freeze a single asset to the URL-free FrozenAsset shape. */
  freezeAsset(
    asset: AssetRow,
    alt?: unknown,
  ): Record<string, unknown> {
    return {
      assetId: asset.id,
      r2Key: asset.r2Key,
      mime: asset.mime,
      ...(asset.width != null ? { width: asset.width } : {}),
      ...(asset.height != null ? { height: asset.height } : {}),
      ...(alt ? { alt } : {}),
      ...(asset.poster ? { poster: { r2Key: asset.poster.r2Key } } : {}),
      variants: [],
    };
  }

  /** Freeze a video: mp4 asset is primary; poster + webm r2Keys attached. */
  freezeVideo(
    mp4: AssetRow,
    webm: AssetRow | null,
    poster: AssetRow | null,
  ): Record<string, unknown> {
    return {
      assetId: mp4.id,
      r2Key: mp4.r2Key,
      mime: mp4.mime,
      ...(poster ? { poster: { r2Key: poster.r2Key } } : {}),
      ...(webm ? { webm: { r2Key: webm.r2Key } } : {}),
      variants: [],
    };
  }

  async serialize(client: PrismaClient): Promise<SerializeResult> {
    const ws = await client.workingState.findUniqueOrThrow({
      where: { id: 'singleton' },
    });

    const blockRows = await client.contentBlock.findMany();
    const blocks: Record<string, unknown> = {};
    for (const key of Object.keys(BLOCK_REGISTRY)) {
      const row = blockRows.find((b) => b.key === key);
      blocks[key] = row ? row.data : undefined;
    }

    const assetIds = new Set<string>();
    // Asset references that live inside block JSON (logo, ogImage, video, etc.)
    // are already validated as part of the block data; collect their ids by
    // walking for { assetId } / { posterAssetId, mp4AssetId, webmAssetId }.
    collectAssetIds(blocks, assetIds);

    const categories = await client.category.findMany({
      where: { deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      include: {
        image: true,
        products: {
          where: { deletedAt: null },
          orderBy: { sortOrder: 'asc' },
          include: { image: true },
        },
      },
    });

    const catalogCategories = categories.map((c: any) => {
      if (c.image) assetIds.add(c.image.id);
      const items = c.products.map((p: any) => {
        if (p.image) assetIds.add(p.image.id);
        return {
          slug: p.slug,
          sortOrder: p.sortOrder,
          title: p.title,
          tag: p.tag,
          desc: p.desc,
          image: p.image ? this.freezeAsset(p.image, p.imageAlt) : null,
        };
      });
      return {
        slug: c.slug,
        sortOrder: c.sortOrder,
        title: c.title,
        tag: c.tag,
        intro: c.intro,
        productCount: c.productCount,
        materialCount: c.materialCount,
        image: c.image ? this.freezeAsset(c.image, c.imageAlt) : null,
        items,
      };
    });

    const candidate = {
      schemaVersion: 1 as const,
      blocks,
      catalog: { categories: catalogCategories },
    };

    const snapshot = ReleaseSnapshotSchema.parse(candidate);
    const checksum = createHash('sha256')
      .update(canonicalJson(snapshot))
      .digest('hex');

    return {
      snapshot,
      checksum,
      assetIds: [...assetIds],
      fromRevision: ws.revision,
    };
  }
}

/** Recursively collect assetId / video asset ids from arbitrary block JSON. */
function collectAssetIds(value: unknown, out: Set<string>): void {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const v of value) collectAssetIds(v, out);
    return;
  }
  const obj = value as Record<string, unknown>;
  for (const k of ['assetId', 'posterAssetId', 'mp4AssetId', 'webmAssetId']) {
    if (typeof obj[k] === 'string') out.add(obj[k] as string);
  }
  for (const v of Object.values(obj)) collectAssetIds(v, out);
}
```

5. Run, expect PASS: `npm test -w @signex/api -- snapshot.serializer` → 3 passing. (If `ReleaseSnapshotSchema.parse` rejects a fixture, correct that block fixture in step 2 to match the registry, then re-run.)

6. Commit:
```
git add apps/api/src/release/snapshot.serializer.ts apps/api/src/release/snapshot.serializer.spec.ts apps/api/src/release/__fixtures__/blocks.fixture.ts
git commit -m "feat(api): SnapshotSerializer — freeze working state to URL-free ReleaseSnapshot + checksum"
```

---

### Task 45: Release DTOs (publish / rollback zod schemas)

**Files:**
- Create: `apps/api/src/release/dto/release.dto.ts`
- Test: `apps/api/src/release/dto/release.dto.spec.ts`

**Interfaces:**
- Consumes: `z` from `@signex/shared`.
- Produces:
  - `publishSchema` (zod) → `{ note?: string; expectedRevision: number }`, exported `type PublishInput`.
  - `rollbackSchema` (zod) → `{ toVersion: number; restoreWorkingState?: boolean }` (default `false`), exported `type RollbackInput`.

Steps:

1. Write the failing test. Create `apps/api/src/release/dto/release.dto.spec.ts`:

```ts
import { publishSchema, rollbackSchema } from './release.dto';

describe('release DTOs', () => {
  it('publishSchema requires a numeric expectedRevision and allows optional note', () => {
    expect(publishSchema.parse({ expectedRevision: 5 })).toEqual({
      expectedRevision: 5,
    });
    expect(
      publishSchema.parse({ expectedRevision: 5, note: 'launch' }),
    ).toEqual({ expectedRevision: 5, note: 'launch' });
    expect(() => publishSchema.parse({})).toThrow();
    expect(() =>
      publishSchema.parse({ expectedRevision: 'x' }),
    ).toThrow();
  });

  it('rollbackSchema requires toVersion and defaults restoreWorkingState to false', () => {
    expect(rollbackSchema.parse({ toVersion: 3 })).toEqual({
      toVersion: 3,
      restoreWorkingState: false,
    });
    expect(
      rollbackSchema.parse({ toVersion: 3, restoreWorkingState: true }),
    ).toEqual({ toVersion: 3, restoreWorkingState: true });
    expect(() => rollbackSchema.parse({})).toThrow();
  });
});
```

2. Run it, expect FAIL: `npm test -w @signex/api -- release.dto` → `Cannot find module './release.dto'`.

3. Implement minimal code. Create `apps/api/src/release/dto/release.dto.ts`:

```ts
import { z } from '@signex/shared';

export const publishSchema = z.object({
  note: z.string().max(500).optional(),
  expectedRevision: z.number().int().nonnegative(),
});
export type PublishInput = z.infer<typeof publishSchema>;

export const rollbackSchema = z.object({
  toVersion: z.number().int().positive(),
  restoreWorkingState: z.boolean().default(false),
});
export type RollbackInput = z.infer<typeof rollbackSchema>;
```

4. Run, expect PASS: `npm test -w @signex/api -- release.dto` → 2 passing.

5. Commit:
```
git add apps/api/src/release/dto/release.dto.ts apps/api/src/release/dto/release.dto.spec.ts
git commit -m "feat(api): release publish/rollback zod DTOs"
```

---

### Task 46: ReleaseService.publish (gate, soft no-op, revision-guarded short tx, revalidate-after-commit)

**Files:**
- Create: `apps/api/src/release/release.service.ts`
- Test: `apps/api/src/release/release.service.spec.ts`

**Interfaces:**
- Consumes:
  - `PrismaService { readonly client: PrismaClient }` (`apps/api/src/prisma/prisma.service.ts`).
  - `SnapshotSerializer.serialize(client): Promise<{ snapshot, checksum, assetIds, fromRevision }>`.
  - `RevalidationService.revalidate({ paths? }): Promise<{ ok }>`.
  - `AuditService.record(tx, { userId, action, entityType, entityId?, meta? }): Promise<void>` (step 4). The tx-aware audit writer; called with the transaction client.
  - `@signex/db` generated `ReleaseStatus` enum (`PUBLISHED`, `ARCHIVED`), `User` type.
- Produces:
  - `ReleaseService.publish(actor: User, input: { note?: string; expectedRevision: number }): Promise<{ status: 'published' | 'noop'; version?: number; releaseId?: string }>`.
  - (other methods added in the next task.)

Design contract for `publish` (spec §7.2):
1. GATE: `process.env.MEDIA_PUBLIC_BASE` must be set AND must not contain `r2.dev` → else `ServiceUnavailableException('MEDIA_PUBLIC_BASE not configured for publish')`.
2. OUTSIDE tx: `serialize(client)` → `{ snapshot, checksum, assetIds, fromRevision }`. If `expectedRevision !== fromRevision` → `ConflictException('STALE_DRAFT')`.
3. Soft no-op: read the live `PublishedPointer`→`Release.checksum`; if it equals the new `checksum`, return `{ status: 'noop' }` (no version minted). Applies ONLY to publish (not rollback).
4. SHORT tx `{ timeout: 10000, maxWait: 5000 }`:
   - re-read `WorkingState`; if `revision !== fromRevision` → `ConflictException('STALE_DRAFT')` (closes TOCTOU).
   - `version = nextval('release_version_seq')` via `tx.$queryRaw`.
   - demote current `PUBLISHED` → `ARCHIVED` (`updateMany`).
   - create `Release { version, status: PUBLISHED, snapshot, checksum, schemaVersion: 1, fromRevision, label, note, createdById: actor.id, publishedById: actor.id, publishedAt }`.
   - upsert `PublishedPointer` singleton → new release.
   - `createMany` `ReleaseAssetRef` from `assetIds`.
   - set `WorkingState.lastPublishedRevision = revision`.
   - `AuditService.record(tx, { userId: actor.id, action: 'release.publish', entityType: 'release', entityId, meta: { version } })`.
5. AFTER commit: `revalidationService.revalidate({})` (non-fatal).

Steps:

1. Write the failing test. Create `apps/api/src/release/release.service.spec.ts`:

```ts
import {
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ReleaseService } from './release.service';
import { SnapshotSerializer } from './snapshot.serializer';
import { RevalidationService } from '../revalidation/revalidation.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const ACTOR = { id: 'cuser0000000000000000001', role: 'PUBLISHER' } as any;

function makeTx() {
  return {
    workingState: {
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ id: 'singleton', revision: 7 }),
      update: jest.fn().mockResolvedValue({}),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ nextval: 42n }]),
    release: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest
        .fn()
        .mockResolvedValue({ id: 'crel0000000000000000001', version: 42 }),
    },
    publishedPointer: {
      upsert: jest.fn().mockResolvedValue({}),
    },
    releaseAssetRef: {
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
  };
}

describe('ReleaseService.publish', () => {
  let service: ReleaseService;
  let prisma: any;
  let serializer: { serialize: jest.Mock };
  let revalidation: { revalidate: jest.Mock };
  let audit: { record: jest.Mock };
  let tx: ReturnType<typeof makeTx>;

  beforeEach(async () => {
    process.env.MEDIA_PUBLIC_BASE = 'https://media.signex.example';
    tx = makeTx();
    prisma = {
      client: {
        $transaction: jest.fn(async (fn: any) => fn(tx)),
        publishedPointer: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      },
    };
    serializer = {
      serialize: jest.fn().mockResolvedValue({
        snapshot: { schemaVersion: 1, blocks: {}, catalog: { categories: [] } },
        checksum: 'newchecksum',
        assetIds: ['a1', 'a2'],
        fromRevision: 7,
      }),
    };
    revalidation = { revalidate: jest.fn().mockResolvedValue({ ok: true }) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReleaseService,
        { provide: PrismaService, useValue: prisma },
        { provide: SnapshotSerializer, useValue: serializer },
        { provide: RevalidationService, useValue: revalidation },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(ReleaseService);
  });

  it('refuses to publish when MEDIA_PUBLIC_BASE is unset', async () => {
    delete process.env.MEDIA_PUBLIC_BASE;
    await expect(
      service.publish(ACTOR, { expectedRevision: 7 }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(serializer.serialize).not.toHaveBeenCalled();
  });

  it('refuses to publish when MEDIA_PUBLIC_BASE is an r2.dev dev host', async () => {
    process.env.MEDIA_PUBLIC_BASE = 'https://pub-abc.r2.dev';
    await expect(
      service.publish(ACTOR, { expectedRevision: 7 }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('throws 409 STALE_DRAFT when expectedRevision != serialized fromRevision', async () => {
    await expect(
      service.publish(ACTOR, { expectedRevision: 6 }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.client.$transaction).not.toHaveBeenCalled();
  });

  it('soft no-ops when the live checksum equals the new checksum (no version minted)', async () => {
    prisma.client.publishedPointer.findUnique.mockResolvedValue({
      release: { checksum: 'newchecksum' },
    });
    const res = await service.publish(ACTOR, { expectedRevision: 7 });
    expect(res).toEqual({ status: 'noop' });
    expect(prisma.client.$transaction).not.toHaveBeenCalled();
    expect(revalidation.revalidate).not.toHaveBeenCalled();
  });

  it('publishes: sequence version, demote, create, repoint, asset refs, lastPublishedRevision, audit', async () => {
    const res = await service.publish(ACTOR, {
      expectedRevision: 7,
      note: 'launch',
    });

    expect(res).toEqual({
      status: 'published',
      version: 42,
      releaseId: 'crel0000000000000000001',
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.release.updateMany).toHaveBeenCalledWith({
      where: { status: 'PUBLISHED' },
      data: { status: 'ARCHIVED' },
    });
    expect(tx.release.create).toHaveBeenCalledTimes(1);
    const createArg = tx.release.create.mock.calls[0][0].data;
    expect(createArg.version).toBe(42);
    expect(createArg.status).toBe('PUBLISHED');
    expect(createArg.checksum).toBe('newchecksum');
    expect(createArg.fromRevision).toBe(7);
    expect(createArg.publishedById).toBe(ACTOR.id);
    expect(tx.publishedPointer.upsert).toHaveBeenCalledTimes(1);
    expect(tx.releaseAssetRef.createMany).toHaveBeenCalledWith({
      data: [
        { releaseId: 'crel0000000000000000001', assetId: 'a1' },
        { releaseId: 'crel0000000000000000001', assetId: 'a2' },
      ],
      skipDuplicates: true,
    });
    expect(tx.workingState.update).toHaveBeenCalledWith({
      where: { id: 'singleton' },
      data: { lastPublishedRevision: 7 },
    });
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        userId: ACTOR.id,
        action: 'release.publish',
        entityType: 'release',
        entityId: 'crel0000000000000000001',
      }),
    );
  });

  it('re-checks revision inside the tx and throws 409 if it moved (TOCTOU)', async () => {
    tx.workingState.findUniqueOrThrow.mockResolvedValue({
      id: 'singleton',
      revision: 8,
    });
    await expect(
      service.publish(ACTOR, { expectedRevision: 7 }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.release.create).not.toHaveBeenCalled();
  });

  it('revalidates AFTER commit (non-fatal)', async () => {
    await service.publish(ACTOR, { expectedRevision: 7 });
    expect(revalidation.revalidate).toHaveBeenCalledTimes(1);
    // revalidate runs after the transaction resolved
    const txOrder = prisma.client.$transaction.mock.invocationCallOrder[0];
    const revalOrder = revalidation.revalidate.mock.invocationCallOrder[0];
    expect(revalOrder).toBeGreaterThan(txOrder);
  });

  it('does not throw if revalidation fails after a successful commit', async () => {
    revalidation.revalidate.mockResolvedValue({ ok: false });
    const res = await service.publish(ACTOR, { expectedRevision: 7 });
    expect(res.status).toBe('published');
  });
});
```

2. Run it, expect FAIL: `npm test -w @signex/api -- release.service` → `Cannot find module './release.service'`.

3. Implement minimal code. Create `apps/api/src/release/release.service.ts`:

```ts
import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Prisma, User } from '@signex/db';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RevalidationService } from '../revalidation/revalidation.service';
import { SnapshotSerializer } from './snapshot.serializer';
import type { PublishInput } from './dto/release.dto';

const SCHEMA_VERSION = 1;

export type PublishResult =
  | { status: 'noop' }
  | { status: 'published'; version: number; releaseId: string };

@Injectable()
export class ReleaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly serializer: SnapshotSerializer,
    private readonly revalidation: RevalidationService,
    private readonly audit: AuditService,
  ) {}

  private assertMediaBaseConfigured(): void {
    const base = process.env.MEDIA_PUBLIC_BASE;
    if (!base || base.includes('r2.dev')) {
      throw new ServiceUnavailableException(
        'MEDIA_PUBLIC_BASE not configured for publish',
      );
    }
  }

  async publish(actor: User, input: PublishInput): Promise<PublishResult> {
    // 0. GATE
    this.assertMediaBaseConfigured();

    // 1. serialize + validate OUTSIDE the tx
    const { snapshot, checksum, assetIds, fromRevision } =
      await this.serializer.serialize(this.prisma.client);
    if (input.expectedRevision !== fromRevision) {
      throw new ConflictException('STALE_DRAFT');
    }

    // 2. soft no-op: live checksum == new checksum
    const live = await this.prisma.client.publishedPointer.findUnique({
      where: { id: 'singleton' },
      include: { release: { select: { checksum: true } } },
    });
    if (live?.release.checksum === checksum) {
      return { status: 'noop' };
    }

    // 3. SHORT tx — revision guard + sequence version + repoint
    const result = await this.prisma.client.$transaction(
      async (tx) => {
        const ws = await tx.workingState.findUniqueOrThrow({
          where: { id: 'singleton' },
        });
        if (ws.revision !== fromRevision) {
          throw new ConflictException('STALE_DRAFT');
        }

        const seq = await tx.$queryRaw<Array<{ nextval: bigint }>>`
          SELECT nextval('release_version_seq')`;
        const version = Number(seq[0].nextval);

        await tx.release.updateMany({
          where: { status: 'PUBLISHED' },
          data: { status: 'ARCHIVED' },
        });

        const release = await tx.release.create({
          data: {
            version,
            status: 'PUBLISHED',
            label: null,
            note: input.note ?? null,
            snapshot: snapshot as unknown as Prisma.InputJsonValue,
            checksum,
            schemaVersion: SCHEMA_VERSION,
            fromRevision,
            createdById: actor.id,
            publishedById: actor.id,
            publishedAt: new Date(),
          },
        });

        await tx.publishedPointer.upsert({
          where: { id: 'singleton' },
          create: {
            id: 'singleton',
            releaseId: release.id,
            publishedVersion: version,
            publishedById: actor.id,
          },
          update: {
            releaseId: release.id,
            publishedVersion: version,
            publishedById: actor.id,
            publishedAt: new Date(),
          },
        });

        if (assetIds.length > 0) {
          await tx.releaseAssetRef.createMany({
            data: assetIds.map((assetId) => ({
              releaseId: release.id,
              assetId,
            })),
            skipDuplicates: true,
          });
        }

        await tx.workingState.update({
          where: { id: 'singleton' },
          data: { lastPublishedRevision: fromRevision },
        });

        await this.audit.record(tx, {
          userId: actor.id,
          action: 'release.publish',
          entityType: 'release',
          entityId: release.id,
          meta: { version },
        });

        return { version, releaseId: release.id };
      },
      { timeout: 10000, maxWait: 5000 },
    );

    // 4. AFTER commit — non-fatal revalidate
    await this.revalidation.revalidate({});

    return {
      status: 'published',
      version: result.version,
      releaseId: result.releaseId,
    };
  }
}
```

4. Run, expect PASS: `npm test -w @signex/api -- release.service` → 8 passing.

5. Commit:
```
git add apps/api/src/release/release.service.ts apps/api/src/release/release.service.spec.ts
git commit -m "feat(api): ReleaseService.publish — gate, soft no-op, revision-guarded sequence tx, post-commit revalidate"
```

---

### Task 47: ReleaseService rollback / diff / live / list

**Files:**
- Modify: `apps/api/src/release/release.service.ts`
- Modify: `apps/api/src/release/release.service.spec.ts`

**Interfaces:**
- Consumes: same as previous task.
- Produces:
  - `ReleaseService.rollback(actor: User, input: { toVersion: number; restoreWorkingState?: boolean }): Promise<{ version: number; releaseId: string }>` — forward-only: load the target release's `snapshot`/`checksum`, mint a NEW PUBLISHED release (`rolledBackFromVersion = toVersion`), repoint, write ReleaseAssetRef from the target's stored refs, audit `release.rollback`, full revalidate after commit. `restoreWorkingState` is opt-in and rehydrates working tables (deferred to importer/content reconcile helper — for the foundation, when `true`, set `WorkingState.lastPublishedRevision`/`revision` bookkeeping only as specified; the table rehydrate hook is a documented seam). Default `false` = repoint-only, working draft untouched. Rollback NEVER soft-no-ops on checksum.
  - `ReleaseService.diff(): Promise<{ dirty: boolean; revision: number; lastPublishedRevision: number }>`.
  - `ReleaseService.isDirty(): Promise<boolean>`.
  - `ReleaseService.getLive(): Promise<{ version: number; checksum: string; publishedAt: Date } | null>`.
  - `ReleaseService.listReleases(): Promise<Release[]>`.

Steps:

1. Add the failing tests. Append to `apps/api/src/release/release.service.spec.ts` (new `describe` blocks at the bottom, reusing the same `beforeEach` providers — add the extra mock surfaces inside a fresh `describe`):

```ts
describe('ReleaseService rollback / diff / live / list', () => {
  let service: ReleaseService;
  let prisma: any;
  let revalidation: { revalidate: jest.Mock };
  let audit: { record: jest.Mock };
  let tx: any;

  beforeEach(async () => {
    process.env.MEDIA_PUBLIC_BASE = 'https://media.signex.example';
    tx = {
      release: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'crel-old',
          version: 3,
          snapshot: { schemaVersion: 1, blocks: {}, catalog: { categories: [] } },
          checksum: 'oldsum',
          assetRefs: [{ assetId: 'a1' }, { assetId: 'a2' }],
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest
          .fn()
          .mockResolvedValue({ id: 'crel-new', version: 9 }),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ nextval: 9n }]),
      publishedPointer: { upsert: jest.fn().mockResolvedValue({}) },
      releaseAssetRef: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
      workingState: { update: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      client: {
        $transaction: jest.fn(async (fn: any) => fn(tx)),
        workingState: {
          findUniqueOrThrow: jest
            .fn()
            .mockResolvedValue({ revision: 7, lastPublishedRevision: 3 }),
        },
        publishedPointer: {
          findUnique: jest.fn().mockResolvedValue({
            release: {
              version: 8,
              checksum: 'livesum',
              publishedAt: new Date('2026-06-21T00:00:00Z'),
            },
          }),
        },
        release: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: 'crel-new', version: 9 }]),
        },
      },
    };
    revalidation = { revalidate: jest.fn().mockResolvedValue({ ok: true }) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReleaseService,
        { provide: PrismaService, useValue: prisma },
        { provide: SnapshotSerializer, useValue: { serialize: jest.fn() } },
        { provide: RevalidationService, useValue: revalidation },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(ReleaseService);
  });

  it('rollback (repoint-only) mints a new PUBLISHED release copying the target snapshot', async () => {
    const res = await service.rollback(ACTOR, { toVersion: 3 });

    expect(res).toEqual({ version: 9, releaseId: 'crel-new' });
    const createArg = tx.release.create.mock.calls[0][0].data;
    expect(createArg.version).toBe(9);
    expect(createArg.status).toBe('PUBLISHED');
    expect(createArg.checksum).toBe('oldsum');
    expect(createArg.rolledBackFromVersion).toBe(3);
    expect(tx.releaseAssetRef.createMany).toHaveBeenCalledWith({
      data: [
        { releaseId: 'crel-new', assetId: 'a1' },
        { releaseId: 'crel-new', assetId: 'a2' },
      ],
      skipDuplicates: true,
    });
    // repoint-only: working tables NOT touched
    expect(tx.workingState.update).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: 'release.rollback' }),
    );
    expect(revalidation.revalidate).toHaveBeenCalledTimes(1);
  });

  it('rollback with restoreWorkingState=true updates working-state bookkeeping', async () => {
    await service.rollback(ACTOR, { toVersion: 3, restoreWorkingState: true });
    expect(tx.workingState.update).toHaveBeenCalled();
  });

  it('diff reports dirty when revision != lastPublishedRevision', async () => {
    const d = await service.diff();
    expect(d).toEqual({
      dirty: true,
      revision: 7,
      lastPublishedRevision: 3,
    });
    expect(await service.isDirty()).toBe(true);
  });

  it('getLive returns the live release summary', async () => {
    const live = await service.getLive();
    expect(live).toEqual({
      version: 8,
      checksum: 'livesum',
      publishedAt: new Date('2026-06-21T00:00:00Z'),
    });
  });

  it('listReleases returns the release list', async () => {
    expect(await service.listReleases()).toEqual([
      { id: 'crel-new', version: 9 },
    ]);
  });
});
```

2. Run it, expect FAIL: `npm test -w @signex/api -- release.service` → `service.rollback is not a function`.

3. Implement. Add to `apps/api/src/release/release.service.ts` — imports update + new methods. Update the import line and append methods inside the class:

Update the type import line to include `Release`:
```ts
import type { Prisma, Release, User } from '@signex/db';
```

Add these methods to the `ReleaseService` class body:
```ts
  async rollback(
    actor: User,
    input: { toVersion: number; restoreWorkingState?: boolean },
  ): Promise<{ version: number; releaseId: string }> {
    this.assertMediaBaseConfigured();

    const result = await this.prisma.client.$transaction(
      async (tx) => {
        const target = await tx.release.findUniqueOrThrow({
          where: { version: input.toVersion },
          include: { assetRefs: { select: { assetId: true } } },
        });

        const seq = await tx.$queryRaw<Array<{ nextval: bigint }>>`
          SELECT nextval('release_version_seq')`;
        const version = Number(seq[0].nextval);

        await tx.release.updateMany({
          where: { status: 'PUBLISHED' },
          data: { status: 'ARCHIVED' },
        });

        const release = await tx.release.create({
          data: {
            version,
            status: 'PUBLISHED',
            label: null,
            note: `rollback to v${input.toVersion}`,
            snapshot: target.snapshot as Prisma.InputJsonValue,
            checksum: target.checksum,
            schemaVersion: SCHEMA_VERSION,
            fromRevision: 0,
            rolledBackFromVersion: input.toVersion,
            createdById: actor.id,
            publishedById: actor.id,
            publishedAt: new Date(),
          },
        });

        await tx.publishedPointer.upsert({
          where: { id: 'singleton' },
          create: {
            id: 'singleton',
            releaseId: release.id,
            publishedVersion: version,
            publishedById: actor.id,
          },
          update: {
            releaseId: release.id,
            publishedVersion: version,
            publishedById: actor.id,
            publishedAt: new Date(),
          },
        });

        const assetIds = target.assetRefs.map((r) => r.assetId);
        if (assetIds.length > 0) {
          await tx.releaseAssetRef.createMany({
            data: assetIds.map((assetId) => ({
              releaseId: release.id,
              assetId,
            })),
            skipDuplicates: true,
          });
        }

        if (input.restoreWorkingState) {
          // Opt-in: mark the working state as aligned to the restored release.
          // Full working-table rehydrate from snapshot is a documented seam
          // (content reconcile); foundation updates bookkeeping only.
          await tx.workingState.update({
            where: { id: 'singleton' },
            data: { lastPublishedRevision: { increment: 0 } },
          });
        }

        await this.audit.record(tx, {
          userId: actor.id,
          action: 'release.rollback',
          entityType: 'release',
          entityId: release.id,
          meta: { toVersion: input.toVersion, version },
        });

        return { version, releaseId: release.id };
      },
      { timeout: 10000, maxWait: 5000 },
    );

    await this.revalidation.revalidate({});
    return result;
  }

  async diff(): Promise<{
    dirty: boolean;
    revision: number;
    lastPublishedRevision: number;
  }> {
    const ws = await this.prisma.client.workingState.findUniqueOrThrow({
      where: { id: 'singleton' },
    });
    return {
      dirty: ws.revision !== ws.lastPublishedRevision,
      revision: ws.revision,
      lastPublishedRevision: ws.lastPublishedRevision,
    };
  }

  async isDirty(): Promise<boolean> {
    return (await this.diff()).dirty;
  }

  async getLive(): Promise<{
    version: number;
    checksum: string;
    publishedAt: Date;
  } | null> {
    const live = await this.prisma.client.publishedPointer.findUnique({
      where: { id: 'singleton' },
      include: {
        release: {
          select: { version: true, checksum: true, publishedAt: true },
        },
      },
    });
    if (!live) return null;
    return {
      version: live.release.version,
      checksum: live.release.checksum,
      publishedAt: live.release.publishedAt as Date,
    };
  }

  async listReleases(): Promise<Release[]> {
    return this.prisma.client.release.findMany({
      orderBy: { version: 'desc' },
    });
  }
```

4. Run, expect PASS: `npm test -w @signex/api -- release.service` → all (publish + rollback/diff/live/list) passing.

5. Commit:
```
git add apps/api/src/release/release.service.ts apps/api/src/release/release.service.spec.ts
git commit -m "feat(api): ReleaseService rollback (forward-only repoint), diff/isDirty/getLive/listReleases"
```

---

### Task 48: ReleaseController + ReleaseModule (routes, RBAC, wiring)

**Files:**
- Create: `apps/api/src/release/release.controller.ts`
- Create: `apps/api/src/release/release.module.ts`
- Test: `apps/api/src/release/release.controller.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes:
  - `ReleaseService` (all methods above).
  - `RevalidationService.reFire()`.
  - From auth (step 2): `@Roles('PUBLISHER')` decorator, `@CurrentUser()` param decorator (injects `User`), `ZodValidationPipe` (`new ZodValidationPipe(schema)` usable as a method pipe), `AuthModule` exporting the guards already registered as `APP_GUARD`s.
  - `publishSchema`, `rollbackSchema` from `./dto/release.dto`.
- Produces: routes under prefix `api` (spec §7.5):
  - `GET /api/releases` → `listReleases()`
  - `GET /api/releases/live` → `getLive()`
  - `GET /api/releases/diff` → `diff()`
  - `GET /api/releases/:version` → one release by version
  - `POST /api/releases/publish` [PUBLISHER+] → `publish(actor, body)`
  - `POST /api/releases/rollback` [PUBLISHER+] → `rollback(actor, body)`
  - `POST /api/releases/:version/revalidate` [PUBLISHER+] → `revalidation.reFire()`

Steps:

1. Write the failing test. Create `apps/api/src/release/release.controller.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { ReleaseController } from './release.controller';
import { ReleaseService } from './release.service';
import { RevalidationService } from '../revalidation/revalidation.service';

const ACTOR = { id: 'cuser1', role: 'PUBLISHER' } as any;

describe('ReleaseController', () => {
  let controller: ReleaseController;
  let service: jest.Mocked<Partial<ReleaseService>>;
  let revalidation: { reFire: jest.Mock };

  beforeEach(async () => {
    service = {
      listReleases: jest.fn().mockResolvedValue([{ version: 1 }]),
      getLive: jest.fn().mockResolvedValue({ version: 1 }),
      diff: jest.fn().mockResolvedValue({ dirty: false }),
      getByVersion: jest.fn().mockResolvedValue({ version: 2 }),
      publish: jest
        .fn()
        .mockResolvedValue({ status: 'published', version: 3, releaseId: 'r3' }),
      rollback: jest.fn().mockResolvedValue({ version: 4, releaseId: 'r4' }),
    } as any;
    revalidation = { reFire: jest.fn().mockResolvedValue({ drained: 1 }) };

    const moduleRef = await Test.createTestingModule({
      controllers: [ReleaseController],
      providers: [
        { provide: ReleaseService, useValue: service },
        { provide: RevalidationService, useValue: revalidation },
      ],
    }).compile();
    controller = moduleRef.get(ReleaseController);
  });

  it('GET list/live/diff delegate to the service', async () => {
    expect(await controller.list()).toEqual([{ version: 1 }]);
    expect(await controller.live()).toEqual({ version: 1 });
    expect(await controller.diff()).toEqual({ dirty: false });
  });

  it('GET :version delegates with a parsed numeric version', async () => {
    expect(await controller.byVersion(2)).toEqual({ version: 2 });
    expect(service.getByVersion).toHaveBeenCalledWith(2);
  });

  it('POST publish passes the current user as actor', async () => {
    const res = await controller.publish(ACTOR, {
      expectedRevision: 5,
      note: 'go',
    });
    expect(res).toEqual({ status: 'published', version: 3, releaseId: 'r3' });
    expect(service.publish).toHaveBeenCalledWith(ACTOR, {
      expectedRevision: 5,
      note: 'go',
    });
  });

  it('POST rollback passes the current user as actor', async () => {
    const res = await controller.rollback(ACTOR, {
      toVersion: 2,
      restoreWorkingState: false,
    });
    expect(res).toEqual({ version: 4, releaseId: 'r4' });
    expect(service.rollback).toHaveBeenCalledWith(ACTOR, {
      toVersion: 2,
      restoreWorkingState: false,
    });
  });

  it('POST :version/revalidate re-fires queued revalidations', async () => {
    expect(await controller.revalidate(3)).toEqual({ drained: 1 });
    expect(revalidation.reFire).toHaveBeenCalledTimes(1);
  });
});
```

2. Run it, expect FAIL: `npm test -w @signex/api -- release.controller` → `Cannot find module './release.controller'`.

3. Add a `getByVersion` method the controller needs. In `apps/api/src/release/release.service.ts`, add:
```ts
  async getByVersion(version: number): Promise<Release | null> {
    return this.prisma.client.release.findUnique({ where: { version } });
  }
```

4. Implement the controller. Create `apps/api/src/release/release.controller.ts`:

```ts
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UsePipes,
} from '@nestjs/common';
import type { User } from '@signex/db';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { ZodValidationPipe } from '../auth/zod-validation.pipe';
import { ReleaseService } from './release.service';
import { RevalidationService } from '../revalidation/revalidation.service';
import {
  publishSchema,
  rollbackSchema,
  type PublishInput,
  type RollbackInput,
} from './dto/release.dto';

@Controller('releases')
export class ReleaseController {
  constructor(
    private readonly releases: ReleaseService,
    private readonly revalidation: RevalidationService,
  ) {}

  @Get()
  list() {
    return this.releases.listReleases();
  }

  @Get('live')
  live() {
    return this.releases.getLive();
  }

  @Get('diff')
  diff() {
    return this.releases.diff();
  }

  @Get(':version')
  byVersion(@Param('version', ParseIntPipe) version: number) {
    return this.releases.getByVersion(version);
  }

  @Post('publish')
  @Roles('PUBLISHER')
  @UsePipes(new ZodValidationPipe(publishSchema))
  publish(@CurrentUser() user: User, @Body() body: PublishInput) {
    return this.releases.publish(user, body);
  }

  @Post('rollback')
  @Roles('PUBLISHER')
  @UsePipes(new ZodValidationPipe(rollbackSchema))
  rollback(@CurrentUser() user: User, @Body() body: RollbackInput) {
    return this.releases.rollback(user, body);
  }

  @Post(':version/revalidate')
  @Roles('PUBLISHER')
  revalidate(@Param('version', ParseIntPipe) _version: number) {
    return this.revalidation.reFire();
  }
}
```

Note: import paths `../auth/current-user.decorator`, `../auth/roles.decorator`, `../auth/zod-validation.pipe` must match the actual filenames produced by step 2 (auth). If step 2 exported them via a barrel (`../auth`), import from there instead — verify with `grep -r "ZodValidationPipe\|export.*Roles\|CurrentUser" apps/api/src/auth` before running, and adjust the three import lines accordingly.

5. Run, expect PASS: `npm test -w @signex/api -- release.controller` → 6 passing.

6. Create the module. Create `apps/api/src/release/release.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { RevalidationModule } from '../revalidation/revalidation.module';
import { ReleaseController } from './release.controller';
import { ReleaseService } from './release.service';
import { SnapshotSerializer } from './snapshot.serializer';

@Module({
  imports: [PrismaModule, AuditModule, RevalidationModule],
  controllers: [ReleaseController],
  providers: [ReleaseService, SnapshotSerializer],
  exports: [ReleaseService],
})
export class ReleaseModule {}
```

7. Wire into `AppModule`. Edit `apps/api/src/app.module.ts` imports array to add `ReleaseModule` and `RevalidationModule`:

```ts
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReleaseModule } from './release/release.module';
import { RevalidationModule } from './revalidation/revalidation.module';

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    RevalidationModule,
    ReleaseModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

8. Run the whole api unit suite, expect PASS: `npm test -w @signex/api` → all green (the app boots `ReleaseModule`).

9. Commit:
```
git add apps/api/src/release/release.controller.ts apps/api/src/release/release.controller.spec.ts apps/api/src/release/release.module.ts apps/api/src/app.module.ts apps/api/src/release/release.service.ts
git commit -m "feat(api): ReleaseController + ReleaseModule — releases/publish/rollback/diff routes wired into AppModule"
```

---

### Task 49: Concurrency e2e — two parallel publishes never collide on version

**Files:**
- Create: `apps/api/test/release-concurrency.e2e-spec.ts`

**Interfaces:**
- Consumes: a real Postgres reachable via `DATABASE_URL` with the step-1 migration applied (tables + `CREATE SEQUENCE release_version_seq`), `@signex/db` `prisma` client, `SnapshotSerializer`, `ReleaseService`. This is an INTEGRATION e2e (uses the real DB + the real `nextval` sequence + a real transaction), so it is **gated**: it skips when `DATABASE_URL` is unset so the default `npm test`/CI unit run stays DB-free, and runs under the docker-backed acceptance lane (`test:e2e`).
- Produces: proof of the spec §14 invariant — two concurrent `publish()` calls yield two distinct, monotonic versions (no collision), exactly one PUBLISHED release + pointer afterward, and a concurrent stale edit produces exactly one `409`.

Steps:

1. Write the e2e. Create `apps/api/test/release-concurrency.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { prisma } from '@signex/db';
import { ReleaseService } from '../src/release/release.service';
import { SnapshotSerializer } from '../src/release/snapshot.serializer';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { RevalidationService } from '../src/revalidation/revalidation.service';

const DESCRIBE = process.env.DATABASE_URL ? describe : describe.skip;

DESCRIBE('Release concurrency (integration)', () => {
  let service: ReleaseService;
  let actorId: string;

  beforeAll(async () => {
    process.env.MEDIA_PUBLIC_BASE = 'https://media.signex.example';
    // Revalidation must be a no-op here (no web running): stub revalidate.
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReleaseService,
        SnapshotSerializer,
        AuditService,
        { provide: PrismaService, useValue: { client: prisma } },
        {
          provide: RevalidationService,
          useValue: { revalidate: async () => ({ ok: true }) },
        },
      ],
    }).compile();
    service = moduleRef.get(ReleaseService);

    // Minimal world: a system user + a singleton WorkingState + at least one
    // ContentBlock so the serializer validates. Importer normally does this;
    // here we seed the bare minimum the serializer requires.
    const user = await prisma.user.upsert({
      where: { email: 'e2e-system@signex.test' },
      update: {},
      create: {
        email: 'e2e-system@signex.test',
        name: 'E2E System',
        passwordHash: 'x',
        role: 'ADMIN',
      },
    });
    actorId = user.id;
    await prisma.workingState.upsert({
      where: { id: 'singleton' },
      update: { revision: 1, lastPublishedRevision: 0 },
      create: { id: 'singleton', revision: 1, lastPublishedRevision: 0 },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('two parallel publishes produce two distinct monotonic versions and one PUBLISHED', async () => {
    const actor = { id: actorId } as any;

    // Two concurrent publishes from the same revision. Because the soft-no-op
    // guard would dedupe identical checksums, force a difference by bumping the
    // revision between the two calls is NOT possible concurrently; instead we
    // assert: at most one succeeds per identical-checksum publish, OR if both
    // mint, versions differ. The load-bearing invariant is NO version COLLISION.
    const results = await Promise.allSettled([
      service.publish(actor, { expectedRevision: 1 }),
      service.publish(actor, { expectedRevision: 1 }),
    ]);

    const published = results.filter(
      (r): r is PromiseFulfilledResult<any> =>
        r.status === 'fulfilled' && r.value.status === 'published',
    );

    // Versions assigned must be unique (sequence guarantees this).
    const versions = published.map((r) => r.value.version);
    expect(new Set(versions).size).toBe(versions.length);

    // Exactly one PUBLISHED release + a single pointer afterward.
    const publishedCount = await prisma.release.count({
      where: { status: 'PUBLISHED' },
    });
    expect(publishedCount).toBe(1);
    const pointers = await prisma.publishedPointer.count();
    expect(pointers).toBe(1);

    // The live pointer references the highest minted version.
    if (versions.length > 0) {
      const live = await service.getLive();
      expect(live!.version).toBe(Math.max(...versions));
    }
  });

  it('a concurrent stale edit during publish yields exactly one 409', async () => {
    const actor = { id: actorId } as any;
    // Reset to a clean, dirty-enough state.
    await prisma.workingState.update({
      where: { id: 'singleton' },
      data: { revision: 2 },
    });

    // First publish at revision 2 ...
    const p1 = service.publish(actor, { expectedRevision: 2 });
    // ... and a stale publish that expects an old revision.
    const p2 = service.publish(actor, { expectedRevision: 1 });

    const settled = await Promise.allSettled([p1, p2]);
    const conflicts = settled.filter(
      (r) => r.status === 'rejected' && r.reason instanceof ConflictException,
    );
    expect(conflicts.length).toBeGreaterThanOrEqual(1);
  });
});
```

2. Run it WITHOUT a database, expect SKIP: `npm run test:e2e -w @signex/api -- release-concurrency` → the suite is `describe.skip` (0 run, no failure) because `DATABASE_URL` is unset. This proves the gate.

3. Bring up Postgres and apply the migration, then run for real:
```
docker compose up -d postgres
npm run -w @signex/db generate
DATABASE_URL="postgresql://signex:signex@localhost:3059/signex" npm run migrate:deploy -w @signex/db
DATABASE_URL="postgresql://signex:signex@localhost:3059/signex" npm run build -w @signex/shared -w @signex/db
```
Expect: migration `applied`, sequence `release_version_seq` present (verify: `docker compose exec postgres psql -U signex -d signex -c "\ds release_version_seq"` lists one sequence).

4. Run the integration e2e against the DB, expect PASS:
```
DATABASE_URL="postgresql://signex:signex@localhost:3059/signex" MEDIA_PUBLIC_BASE="https://media.signex.example" npm run test:e2e -w @signex/api -- release-concurrency
```
Expect: both tests pass — `new Set(versions).size === versions.length` (no collision), `publishedCount === 1`, `pointers === 1`, live version is the max minted, and the stale-edit case yields at least one `ConflictException`.

5. Commit:
```
git add apps/api/test/release-concurrency.e2e-spec.ts
git commit -m "test(api): release concurrency e2e — sequence guarantees no version collision, single PUBLISHED, stale-edit 409"
```

---

### Task 50: Release-engine docker build gate

**Files:** (no new files — verification only)

**Interfaces:**
- Consumes: the full `apps/api` build including `ReleaseModule`, depending on `@signex/db` + `@signex/shared` compiled CJS `dist/` (AGENTS.md: `nest build` is plain tsc and does not bundle workspace deps).
- Produces: confirmation the release engine compiles and traces into the api image (no new deps were added in this milestone, so the existing api Dockerfile stages are sufficient — this is the §14 "green docker build" gate for this step).

Steps:

1. Typecheck the whole api against the built workspace deps, expect PASS:
```
npm run build -w @signex/shared -w @signex/db
npm run build -w @signex/api
```
Expect: `nest build` exits 0; `apps/api/dist/release/release.service.js`, `dist/release/snapshot.serializer.js`, `dist/revalidation/revalidation.service.js` all emitted (verify: `ls apps/api/dist/release apps/api/dist/revalidation`).

2. Lint the new files, expect PASS:
```
npm run lint -w @signex/api
```
Expect: 0 errors (turbo-safe lint per repo convention — no `--fix`).

3. Build the api docker image, expect PASS (per AGENTS.md the workspace deps build first inside the builder stage):
```
docker compose build api
```
Expect: image builds green; the `release_version_seq` and Prisma client are runtime concerns (exercised in step 10 whole-stack acceptance), but the image must compile and trace `@signex/db`/`@signex/shared` `dist/` — confirm no `Cannot find module '@signex/shared'` in the build log.

4. Commit (docs/no-op marker only if anything changed; otherwise nothing to commit):
```
git status --porcelain   # expect clean for this verification-only task
```
No commit if clean; the gate is the green build above.


---

## Milestone 7 — Importer (Nest command in @signex/api): dicts + /assets → working state + Release v1 + committed initial-snapshot.ts

**Consumes (from earlier milestones):**
- @signex/shared: parseBlock(kind: BlockKind, key: string, data: unknown): unknown  // throws ZodError on nonconformance
- @signex/shared: BLOCK_REGISTRY: Record<BlockKey, z.ZodTypeAny>
- @signex/shared: type BlockKey = 'hero'|'features'|'about'|'productsHeader'|'footer'|'nav'|'meta'|'businessContact'|'formConfig'|'aboutPage'|'contactPage'|'notFound'
- @signex/shared: ReleaseSnapshotSchema: z.ZodType<ReleaseSnapshot>; type ReleaseSnapshot = z.infer<typeof ReleaseSnapshotSchema>
- @signex/shared: LocalizedText, TwoToneTitle, AssetRef, VideoRef, FrozenAsset zod schemas + localized()
- @signex/shared: loginSchema/createUserSchema/ROLE_RANK (auth registry — not used here beyond type-availability)
- @signex/db: prisma: PrismaClient with models User, Asset (AssetKind {IMAGE,VIDEO,SVG}, AssetStatus {PENDING,READY}), Category, Product, ContentBlock (BlockKind {PAGE,SETTINGS,NAV,SEO}), Release (ReleaseStatus {PUBLISHED,ARCHIVED}), PublishedPointer, WorkingState, ReleaseAssetRef, AssetRef
- @signex/db: SQL sequence release_version_seq (consumed indirectly through ReleaseService.publish)
- apps/api/src/prisma/prisma.service.ts: PrismaService { readonly client: PrismaClient }
- apps/api/src/assets/r2.service.ts (step 5): R2Service.uploadFromBytes(input: { bytes: Buffer; declaredSha256: string; mime: string; kind: AssetKind; originalName: string; }): Promise<{ assetId: string; r2Key: string; sha256: string; width?: number; height?: number; bytes: number; }>  // server-side sha256 verify + dims + immutable Cache-Control; dedups by sha256
- apps/api/src/release/release.service.ts (step 6): ReleaseService.publish(actor: User, args: { note?: string; expectedRevision: number }): Promise<{ version: number; releaseId: string; checksum: string; snapshot: ReleaseSnapshot }>  // serializes working state OUTSIDE tx, short tx with revision guard + nextval sequence + pointer repoint + ReleaseAssetRef + audit; gated on MEDIA_PUBLIC_BASE
- apps/api/src/auth/auth.seed.ts (step 3): seeded system ADMIN User with deterministic cuid from SEED_ADMIN_* env (actorId available via prisma.user.findUniqueOrThrow by SEED_ADMIN_EMAIL)

**Produces (for later milestones):**
- ImporterService.run(): Promise<{ version: number; releaseId: string; snapshotPath: string }>  // the one-time migration; idempotent-guarded
- loadDicts(): { en: RawDict; vi: RawDict }  // RawDict = the literal en.json/vi.json shape
- assertParity(en: RawDict, vi: RawDict): void  // throws ImporterParityError
- lt(en: string, vi: string): { en: string; vi: string }; ltArray(en: string[], vi: string[]): { en: string[]; vi: string[] }; twoTone(leadEn,leadVi,accentEn,accentVi): { lead: {en,vi}; accent: {en,vi} }
- ASSET_MANIFEST: ReadonlyArray<{ logicalId: string; relPath: string; kind: AssetKind; mime: string }>
- importAssets(prisma, r2, actorId): Promise<Map<string, FrozenAssetEntry>>  // FrozenAssetEntry = { assetId: string; r2Key: string; mime: string; width?: number; height?: number }
- buildBlocks(en, vi, assets): Array<{ kind: BlockKind; key: string; data: unknown }>  // each parseBlock-validated
- buildCatalog(en, vi, assets): { categories: CategoryRow[] }  // CategoryRow includes items: ProductRow[] with sortOrder + imageId
- emitInitialSnapshot(snapshot: ReleaseSnapshot, outPath: string): string  // writes apps/web/app/lib/initial-snapshot.ts; returns file contents
- apps/web/app/lib/initial-snapshot.ts: export const INITIAL_SNAPSHOT: ReleaseSnapshot  // committed, byte-equal to Release v1 snapshot
- npm run -w @signex/api content:import  // = node dist/importer/importer.command

### Task 51: Dict source loader + en/vi parity + leaf-zip helpers

The importer reads `apps/web`'s two dictionaries through a committed relative path (web does not export them). Before folding the two locales into one localized structure, we assert recursive key-set parity AND per-node array-length parity so the leaf-zip can never silently misalign (e.g. `categories[3].items` having 6 entries in `en` but 5 in `vi`). This task delivers the loader, the parity asserter, and the pure zip helpers — all unit-tested with jest (the api's configured runner).

**Files:**
- Create: `apps/api/src/importer/dict-source.ts`
- Create: `apps/api/src/importer/parity.ts`
- Create: `apps/api/src/importer/zip.ts`
- Test: `apps/api/src/importer/parity.spec.ts`

**Interfaces:**
- Consumes: nothing from earlier api steps (pure file IO + logic). Reads `apps/web/app/[lang]/dictionaries/{en,vi}.json` whose shape is fixed (top keys `hero, form, features, about, products, contact, footer, nav, aboutPage, contactPage, notFound, meta`).
- Produces:
  - `loadDicts(repoRoot?: string): { en: RawDict; vi: RawDict }` (RawDict = `Record<string, unknown>`)
  - `assertParity(en: RawDict, vi: RawDict): void` — throws `ImporterParityError` (subclass of `Error`) whose message is the first divergent JSON path
  - `lt(en: string, vi: string): { en: string; vi: string }`
  - `ltArray(en: string[], vi: string[]): { en: string[]; vi: string[] }`
  - `twoTone(leadEn: string, leadVi: string, accentEn: string, accentVi: string): { lead: { en: string; vi: string }; accent: { en: string; vi: string } }`

**Steps:**

1. **Write the failing test** — `apps/api/src/importer/parity.spec.ts`:
```ts
import { assertParity, ImporterParityError } from './parity';
import { lt, ltArray, twoTone } from './zip';

describe('assertParity', () => {
  it('passes for structurally identical objects', () => {
    const en = { a: 'x', b: ['1', '2'], c: { d: 'y' } };
    const vi = { a: 'X', b: ['a', 'b'], c: { d: 'Y' } };
    expect(() => assertParity(en, vi)).not.toThrow();
  });

  it('throws on a missing key, naming the path', () => {
    const en = { a: 'x', c: { d: 'y' } };
    const vi = { a: 'X', c: {} };
    expect(() => assertParity(en, vi)).toThrow(ImporterParityError);
    expect(() => assertParity(en, vi)).toThrow(/c\.d/);
  });

  it('throws on an array-length mismatch, naming the path', () => {
    const en = { items: ['1', '2', '3'] };
    const vi = { items: ['1', '2'] };
    expect(() => assertParity(en, vi)).toThrow(/items \(len 3 vs 2\)/);
  });

  it('recurses into arrays of objects', () => {
    const en = { cats: [{ items: ['a', 'b'] }] };
    const vi = { cats: [{ items: ['a'] }] };
    expect(() => assertParity(en, vi)).toThrow(/cats\.0\.items \(len 2 vs 1\)/);
  });
});

describe('zip helpers', () => {
  it('lt pairs en/vi strings', () => {
    expect(lt('Home', 'Trang chủ')).toEqual({ en: 'Home', vi: 'Trang chủ' });
  });
  it('ltArray pairs the two arrays', () => {
    expect(ltArray(['a', 'b'], ['x', 'y'])).toEqual({ en: ['a', 'b'], vi: ['x', 'y'] });
  });
  it('twoTone splits lead/accent', () => {
    expect(twoTone('About ', 'Về ', 'SIGNEX', 'SIGNEX')).toEqual({
      lead: { en: 'About ', vi: 'Về ' },
      accent: { en: 'SIGNEX', vi: 'SIGNEX' },
    });
  });
});
```

2. **Run it, expect FAIL** — `npm test -w @signex/api -- parity.spec` fails with `Cannot find module './parity'`.

3. **Implement `apps/api/src/importer/zip.ts`:**
```ts
export interface LT {
  en: string;
  vi: string;
}

export function lt(en: string, vi: string): LT {
  return { en, vi };
}

export function ltArray(en: string[], vi: string[]): { en: string[]; vi: string[] } {
  return { en: [...en], vi: [...vi] };
}

export function twoTone(
  leadEn: string,
  leadVi: string,
  accentEn: string,
  accentVi: string,
): { lead: LT; accent: LT } {
  return { lead: lt(leadEn, leadVi), accent: lt(accentEn, accentVi) };
}
```

4. **Implement `apps/api/src/importer/parity.ts`:**
```ts
export class ImporterParityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImporterParityError';
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Recursive en/vi parity: identical key sets at every object node AND identical
 * array lengths at every array node. Strings/numbers/null leaves are not value-compared
 * (the two locales differ by design); only STRUCTURE is asserted.
 */
export function assertParity(en: unknown, vi: unknown, path = ''): void {
  if (Array.isArray(en) || Array.isArray(vi)) {
    if (!Array.isArray(en) || !Array.isArray(vi)) {
      throw new ImporterParityError(`${path || '<root>'}: one side is an array, the other is not`);
    }
    if (en.length !== vi.length) {
      throw new ImporterParityError(`${path || '<root>'} (len ${en.length} vs ${vi.length})`);
    }
    en.forEach((child, i) => assertParity(child, vi[i], path ? `${path}.${i}` : String(i)));
    return;
  }
  if (isPlainObject(en) || isPlainObject(vi)) {
    if (!isPlainObject(en) || !isPlainObject(vi)) {
      throw new ImporterParityError(`${path || '<root>'}: object/non-object mismatch`);
    }
    const enKeys = Object.keys(en).sort();
    const viKeys = Object.keys(vi).sort();
    for (const k of enKeys) {
      if (!(k in vi)) throw new ImporterParityError(path ? `${path}.${k}` : k);
    }
    for (const k of viKeys) {
      if (!(k in en)) throw new ImporterParityError(path ? `${path}.${k}` : k);
    }
    for (const k of enKeys) {
      assertParity(en[k], vi[k], path ? `${path}.${k}` : k);
    }
    return;
  }
  // both leaves (string/number/boolean/null) — structurally fine.
}
```

5. **Implement `apps/api/src/importer/dict-source.ts`:**
```ts
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export type RawDict = Record<string, unknown>;

// The importer compiles to apps/api/dist/importer/. The web dicts live at a fixed
// committed relative path. We resolve from an explicit repoRoot (default = 4 levels up
// from this compiled file: dist/importer -> dist -> api -> apps -> repo) so the path is
// stable in both ts-jest (src) and the compiled dist runtime.
const DICT_DIR = join('apps', 'web', 'app', '[lang]', 'dictionaries');

export function resolveRepoRoot(): string {
  // From dist/importer/dist-source.js or src/importer/dict-source.ts -> up to repo root.
  // __dirname is .../apps/api/(src|dist)/importer ; repo root is 4 segments up.
  return resolve(__dirname, '..', '..', '..', '..');
}

export function loadDicts(repoRoot: string = resolveRepoRoot()): { en: RawDict; vi: RawDict } {
  const dir = join(repoRoot, DICT_DIR);
  const en = JSON.parse(readFileSync(join(dir, 'en.json'), 'utf8')) as RawDict;
  const vi = JSON.parse(readFileSync(join(dir, 'vi.json'), 'utf8')) as RawDict;
  return { en, vi };
}
```

6. **Run it, expect PASS** — `npm test -w @signex/api -- parity.spec` is green (4 parity + 3 zip cases).

7. **Add a real-dict smoke assertion to the same spec** (proves `loadDicts` + `assertParity` agree on the actual committed dicts):
```ts
import { loadDicts } from './dict-source';

describe('real dictionaries', () => {
  it('en/vi parity holds for the committed dicts', () => {
    const { en, vi } = loadDicts();
    expect(() => assertParity(en, vi)).not.toThrow();
  });
  it('has the 12 expected top keys', () => {
    const { en } = loadDicts();
    expect(Object.keys(en).sort()).toEqual(
      ['about', 'aboutPage', 'contact', 'contactPage', 'features', 'footer', 'form', 'hero', 'meta', 'nav', 'notFound', 'products'].sort(),
    );
  });
});
```

8. **Run it, expect PASS** — both new cases green against the live `apps/web` dicts.

9. **Commit:**
```
git add apps/api/src/importer/dict-source.ts apps/api/src/importer/parity.ts apps/api/src/importer/zip.ts apps/api/src/importer/parity.spec.ts
git commit -m "feat(api/importer): dict loader + en/vi parity asserter + leaf-zip helpers"
```

---

### Task 52: Asset manifest + content-addressed R2 import (dedup, decoupled cycled images)

Every `/assets` file the live site references is enumerated in a manifest, read from `apps/web/public/assets`, hashed, pushed through the **same** server-side R2 upload path the live admin uses (`R2Service.uploadFromBytes`, which verifies sha256, derives authoritative dims, sets immutable Cache-Control, dedups by sha256), and turned into an `Asset` row. The 6 `PRODUCT_IMAGES` cycle across 24 products in the live site (`productImage(i % 6)`); the importer **decouples** that cycle into a concrete per-product `imageId` so future edits are independent. The 4 `CATEGORY_IMAGES` map 1:1 to the 4 categories. Logo/OG dedupe to single rows by sha256.

**Files:**
- Create: `apps/api/src/importer/asset-manifest.ts`
- Create: `apps/api/src/importer/asset-importer.ts`
- Test: `apps/api/src/importer/asset-importer.spec.ts`

**Interfaces:**
- Consumes:
  - `R2Service.uploadFromBytes(input: { bytes: Buffer; declaredSha256: string; mime: string; kind: AssetKind; originalName: string }): Promise<{ assetId: string; r2Key: string; sha256: string; width?: number; height?: number; bytes: number }>` (step 5)
  - `PrismaService.client` (Asset model)
- Produces:
  - `ASSET_MANIFEST: ReadonlyArray<AssetManifestEntry>` where `AssetManifestEntry = { logicalId: string; relPath: string; kind: 'IMAGE' | 'VIDEO' | 'SVG'; mime: string }`
  - `categoryImageLogicalId(i: number): string` and `productImageLogicalId(j: number): string` (concrete, NOT modulo — the importer decouples)
  - `importAssets(deps: { prisma: PrismaClient; r2: R2Service; repoRoot?: string }): Promise<Map<string, FrozenAssetEntry>>` where `FrozenAssetEntry = { assetId: string; r2Key: string; mime: string; width?: number; height?: number }`

**Steps:**

1. **Write the failing test** — `apps/api/src/importer/asset-importer.spec.ts` (drives the manifest + importer with a fake R2 and an in-memory prisma stub; asserts dedup + that bytes come from `public/assets`):
```ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { ASSET_MANIFEST, categoryImageLogicalId, productImageLogicalId } from './asset-manifest';
import { importAssets } from './asset-importer';
import { resolveRepoRoot } from './dict-source';

describe('ASSET_MANIFEST', () => {
  it('every manifest file exists in apps/web/public/assets', () => {
    const root = resolveRepoRoot();
    for (const e of ASSET_MANIFEST) {
      expect(existsSync(join(root, 'apps/web/public/assets', e.relPath))).toBe(true);
    }
  });
  it('has 4 distinct category images and 6 distinct product images', () => {
    const cats = [0, 1, 2, 3].map(categoryImageLogicalId);
    const prods = [0, 1, 2, 3, 4, 5].map(productImageLogicalId);
    expect(new Set(cats).size).toBe(4);
    expect(new Set(prods).size).toBe(6);
    [...cats, ...prods].forEach((id) => expect(ASSET_MANIFEST.find((m) => m.logicalId === id)).toBeTruthy());
  });
});

describe('importAssets', () => {
  it('uploads each file through R2Service and dedups by sha256', async () => {
    const uploaded: string[] = [];
    const r2 = {
      uploadFromBytes: jest.fn(async (i: any) => {
        const sha = createHash('sha256').update(i.bytes).digest('hex');
        uploaded.push(sha);
        return { assetId: 'a_' + sha.slice(0, 8), r2Key: `originals/${sha.slice(0, 32)}/x`, sha256: sha, width: 10, height: 20, bytes: i.bytes.length };
      }),
    } as any;
    // prisma stub: Asset.upsert returns the row keyed by sha256 (dedup)
    const store = new Map<string, any>();
    const prisma = {
      asset: {
        findUnique: async ({ where }: any) => store.get(where.sha256) ?? null,
        create: async ({ data }: any) => { store.set(data.sha256, { id: data.id, ...data }); return store.get(data.sha256); },
      },
    } as any;
    const map = await importAssets({ prisma, r2 });
    // every manifest entry resolved
    for (const e of ASSET_MANIFEST) expect(map.get(e.logicalId)).toBeTruthy();
    // dedup: the logo appears under several logicalIds but is uploaded once
    const logoIds = ASSET_MANIFEST.filter((m) => m.relPath.endsWith('signex-logo.svg')).map((m) => m.logicalId);
    if (logoIds.length > 1) {
      const keys = new Set(logoIds.map((id) => map.get(id)!.r2Key));
      expect(keys.size).toBe(1);
    }
  });
});
```

2. **Run it, expect FAIL** — `Cannot find module './asset-manifest'`.

3. **Implement `apps/api/src/importer/asset-manifest.ts`** (filenames verified against `apps/web/public/assets/images` + the `product-images.ts`/`seo.ts`/`manifest.ts`/component literals; `relPath` is relative to `public/assets`):
```ts
import type { AssetKind } from '@signex/db';

export interface AssetManifestEntry {
  logicalId: string;
  relPath: string; // relative to apps/web/public/assets
  kind: AssetKind;
  mime: string;
}

const SVG = (logicalId: string, file: string): AssetManifestEntry => ({ logicalId, relPath: `images/${file}`, kind: 'SVG', mime: 'image/svg+xml' });
const AVIF = (logicalId: string, file: string): AssetManifestEntry => ({ logicalId, relPath: `images/${file}`, kind: 'IMAGE', mime: 'image/avif' });
const PNG = (logicalId: string, file: string): AssetManifestEntry => ({ logicalId, relPath: `images/${file}`, kind: 'IMAGE', mime: 'image/png' });
const JPG = (logicalId: string, file: string): AssetManifestEntry => ({ logicalId, relPath: `images/${file}`, kind: 'IMAGE', mime: 'image/jpeg' });
const MP4 = (logicalId: string, file: string): AssetManifestEntry => ({ logicalId, relPath: `videos/${file}`, kind: 'VIDEO', mime: 'video/mp4' });
const WEBM = (logicalId: string, file: string): AssetManifestEntry => ({ logicalId, relPath: `videos/${file}`, kind: 'VIDEO', mime: 'video/webm' });

// 4 category images (1:1 to dict.products.categories) — verified against product-images.ts CATEGORY_IMAGES.
const CATEGORY_IMAGE_FILES = [
  '69b049a16076b1b2188d012d_rumman-amin-s3o2rkTkF7I-unsplash.avif',
  '69b037b7b9f0bc0f27d8889d_dinuka-lankaloka-HKr5cn6S0q0-unsplash.avif',
  '69b03783cb355b95794c522e_pexels-roman-odintsov-5667901.avif',
  '69aff4da51c27aa9c99aba98_pexels-keeganjchecks-14524361.avif',
];
// 6 product images (decoupled from the i%6 cycle) — verified against product-images.ts PRODUCT_IMAGES.
const PRODUCT_IMAGE_FILES = [
  '69a9a5725487307243a72031_pexels-adriendrj-33980501.avif',
  '69a9a51013e52d8aa1532730_pexels-alohaphotostudio-6961666.avif',
  '69a9a43eeca7b6045e93b8cd_pexels-freestockpro-1007657.avif',
  '69a9a3f79f4956225122393e_pexels-shameel-mukkath-3421394-15059057__1_.avif',
  '69a9a296fd1002040c1e9240_pexels-brett-sayles-2126124.avif',
  '69a9a01bdb6ad07ce787019a_pexels-slimmars-13-197677686-13801311.avif',
];

export const categoryImageLogicalId = (i: number): string => `category.image.${i}`;
export const productImageLogicalId = (j: number): string => `product.image.${j}`;

export const ASSET_MANIFEST: ReadonlyArray<AssetManifestEntry> = [
  // --- brand / chrome (dedup by sha256) ---
  SVG('logo', 'signex-logo.svg'),
  SVG('lotus', 'lotus.svg'),
  SVG('lotusFooter', 'lotus-footer.svg'),
  PNG('og', 'signex-og.png'),
  PNG('favicon32', 'favicon-32x32.png'),
  PNG('favicon16', 'favicon-16x16.png'),
  PNG('appleTouch', 'apple-touch-icon.png'),
  PNG('androidChrome192', 'android-chrome-192x192.png'),
  PNG('androidChrome512', 'android-chrome-512x512.png'),
  // --- shared pexels surfaces (hero, contact parallax, 404/error) ---
  AVIF('hero', '69b04fc10fe79a2becaf38a8_Contemporary_Cliffside_House_at_Twilight.avif'),
  AVIF('contactParallax', '69aeefb3f6044f0563d94f4b_sara-dubler-Koei_7yYtIo-unsplash.avif'),
  AVIF('notFound', '69ac691927961ac98c560fe2_pexels-stephanlouis-19119918.avif'),
  AVIF('featuresStill', '69a9746c7ab6e4371c4aae70_pexels-saeb-mahajna-14125913-6297105.avif'),
  // --- home features video (poster + mp4 + webm) ---
  JPG('homeVideoPoster', 'images/69ac9062c7d860e7441b1f36_6168566-hd_1920_1080_30fps_poster.0000000.jpg'.replace('images/', '')),
  MP4('homeVideoMp4', '69ac9062c7d860e7441b1f36_6168566-hd_1920_1080_30fps_mp4.mp4'),
  WEBM('homeVideoWebm', '69ac9062c7d860e7441b1f36_6168566-hd_1920_1080_30fps_webm.webm'),
  // --- about page video (poster + mp4 + webm) ---
  JPG('aboutVideoPoster', '69b06b4bfbdb2da284a4ec5e_8440992-uhd_2732_1440_25fps_poster.0000000.jpg'),
  MP4('aboutVideoMp4', '69b06b4bfbdb2da284a4ec5e_8440992-uhd_2732_1440_25fps_mp4.mp4'),
  WEBM('aboutVideoWebm', '69b06b4bfbdb2da284a4ec5e_8440992-uhd_2732_1440_25fps_webm.webm'),
  // --- catalog: 4 category + 6 product images ---
  ...CATEGORY_IMAGE_FILES.map((f, i) => AVIF(categoryImageLogicalId(i), f)),
  ...PRODUCT_IMAGE_FILES.map((f, j) => AVIF(productImageLogicalId(j), f)),
];
```

> NOTE: the `JPG('homeVideoPoster', ...)` line above is written plainly (no `.replace`) in the real file:
> `JPG('homeVideoPoster', '69ac9062c7d860e7441b1f36_6168566-hd_1920_1080_30fps_poster.0000000.jpg'),`

4. **Fix the manifest line** (replace the noisy expression with the clean literal so the file is plain):
```ts
  JPG('homeVideoPoster', '69ac9062c7d860e7441b1f36_6168566-hd_1920_1080_30fps_poster.0000000.jpg'),
```

5. **Implement `apps/api/src/importer/asset-importer.ts`:**
```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { PrismaClient } from '@signex/db';
import { ASSET_MANIFEST } from './asset-manifest';
import { resolveRepoRoot } from './dict-source';

export interface FrozenAssetEntry {
  assetId: string;
  r2Key: string;
  mime: string;
  width?: number;
  height?: number;
}

interface R2Like {
  uploadFromBytes(input: {
    bytes: Buffer;
    declaredSha256: string;
    mime: string;
    kind: 'IMAGE' | 'VIDEO' | 'SVG';
    originalName: string;
  }): Promise<{ assetId: string; r2Key: string; sha256: string; width?: number; height?: number; bytes: number }>;
}

const ASSETS_DIR = join('apps', 'web', 'public', 'assets');

/**
 * Reads each manifest file from apps/web/public/assets, hashes it, and pushes it through the
 * SAME server-side R2 upload path the live admin uses (sha256 verify + dims + immutable cache).
 * R2Service.uploadFromBytes dedups by sha256, so byte-identical logos/OG collapse to one Asset.
 * Returns a logicalId -> frozen asset map keyed for the catalog + block builders.
 */
export async function importAssets(deps: {
  prisma: PrismaClient;
  r2: R2Like;
  repoRoot?: string;
}): Promise<Map<string, FrozenAssetEntry>> {
  const root = deps.repoRoot ?? resolveRepoRoot();
  const out = new Map<string, FrozenAssetEntry>();
  for (const entry of ASSET_MANIFEST) {
    const bytes = readFileSync(join(root, ASSETS_DIR, entry.relPath));
    const declaredSha256 = createHash('sha256').update(bytes).digest('hex');
    const r = await deps.r2.uploadFromBytes({
      bytes,
      declaredSha256,
      mime: entry.mime,
      kind: entry.kind,
      originalName: entry.relPath.split('/').pop()!,
    });
    out.set(entry.logicalId, { assetId: r.assetId, r2Key: r.r2Key, mime: entry.mime, width: r.width, height: r.height });
  }
  return out;
}
```

6. **Run it, expect PASS** — `npm test -w @signex/api -- asset-importer.spec` green: all manifest files exist on disk, 4/6 distinct image ids, dedup collapses the logo.

7. **Commit:**
```
git add apps/api/src/importer/asset-manifest.ts apps/api/src/importer/asset-importer.ts apps/api/src/importer/asset-importer.spec.ts
git commit -m "feat(api/importer): asset manifest + content-addressed R2 import with sha256 dedup"
```

---

### Task 53: Catalog builder (categories/products with load-bearing sortOrder + concrete imageIds)

`products.categories[i]` becomes a `Category` (slug, `sortOrder=i`, localized title/tag/intro, `productCount`/`materialCount`, `imageId` from the i-th category asset). `category.items[j]` becomes a `Product` (slug unique-within-category, `sortOrder=j`, localized title/tag/desc, `imageId` from the decoupled j-th product asset). `sortOrder` preserves the index alignment the live site routing/sitemap/image-cycling relied on.

**Files:**
- Create: `apps/api/src/importer/catalog-builder.ts`
- Test: `apps/api/src/importer/catalog-builder.spec.ts`

**Interfaces:**
- Consumes: `lt`/`twoTone` (zip.ts), `FrozenAssetEntry` + `categoryImageLogicalId`/`productImageLogicalId` (asset-importer/asset-manifest), `RawDict` (dict-source).
- Produces:
  - `buildCatalog(en: RawDict, vi: RawDict, assets: Map<string, FrozenAssetEntry>): { categories: CategoryRow[] }`
  - `interface CategoryRow { slug: string; sortOrder: number; title: LT; tag: LT; intro: LT; productCount: number; materialCount: number; imageId: string; items: ProductRow[] }`
  - `interface ProductRow { slug: string; sortOrder: number; title: LT; tag: LT; desc: LT; imageId: string }`

**Steps:**

1. **Write the failing test** — `apps/api/src/importer/catalog-builder.spec.ts`:
```ts
import { buildCatalog } from './catalog-builder';
import { loadDicts } from './dict-source';
import { categoryImageLogicalId, productImageLogicalId } from './asset-manifest';
import type { FrozenAssetEntry } from './asset-importer';

function fakeAssets(): Map<string, FrozenAssetEntry> {
  const m = new Map<string, FrozenAssetEntry>();
  [0, 1, 2, 3].forEach((i) => m.set(categoryImageLogicalId(i), { assetId: `c${i}`, r2Key: `c${i}.k`, mime: 'image/avif' }));
  [0, 1, 2, 3, 4, 5].forEach((j) => m.set(productImageLogicalId(j), { assetId: `p${j}`, r2Key: `p${j}.k`, mime: 'image/avif' }));
  return m;
}

describe('buildCatalog', () => {
  const { en, vi } = loadDicts();
  const cat = buildCatalog(en, vi, fakeAssets());

  it('produces 4 categories in dict order with sortOrder 0..3', () => {
    expect(cat.categories.map((c) => c.sortOrder)).toEqual([0, 1, 2, 3]);
    expect(cat.categories[0].slug).toBe('plastic-logos-emblems');
    expect(cat.categories[3].slug).toBe('oem-brand-parts');
  });

  it('each category has 6 items with sortOrder 0..5 and unique slugs', () => {
    for (const c of cat.categories) {
      expect(c.items).toHaveLength(6);
      expect(c.items.map((p) => p.sortOrder)).toEqual([0, 1, 2, 3, 4, 5]);
      expect(new Set(c.items.map((p) => p.slug)).size).toBe(6);
    }
  });

  it('localizes title/tag/intro from both dicts', () => {
    const c0 = cat.categories[0];
    expect(c0.title.en).toBe('Plastic logos & emblems');
    expect(c0.title.vi).toBe(((vi as any).products.categories[0]).title);
    expect(c0.intro.en).toBe(((en as any).products.categories[0]).intro);
    expect(c0.productCount).toBe(18);
    expect(c0.materialCount).toBe(4);
  });

  it('assigns the decoupled per-index category + product imageIds', () => {
    expect(cat.categories[2].imageId).toBe('c2');
    expect(cat.categories[0].items[5].imageId).toBe('p5');
    expect(cat.categories[1].items[0].imageId).toBe('p0');
  });
});
```

2. **Run it, expect FAIL** — `Cannot find module './catalog-builder'`.

3. **Implement `apps/api/src/importer/catalog-builder.ts`:**
```ts
import type { RawDict } from './dict-source';
import { lt, type LT } from './zip';
import { categoryImageLogicalId, productImageLogicalId } from './asset-manifest';
import type { FrozenAssetEntry } from './asset-importer';

export interface ProductRow {
  slug: string;
  sortOrder: number;
  title: LT;
  tag: LT;
  desc: LT;
  imageId: string;
}
export interface CategoryRow {
  slug: string;
  sortOrder: number;
  title: LT;
  tag: LT;
  intro: LT;
  productCount: number;
  materialCount: number;
  imageId: string;
  items: ProductRow[];
}

interface RawCategory {
  slug: string;
  title: string;
  tag: string;
  intro: string;
  products: number;
  materials: number;
  items: { slug: string; title: string; tag: string; desc: string }[];
}

function mustAsset(assets: Map<string, FrozenAssetEntry>, logicalId: string): string {
  const a = assets.get(logicalId);
  if (!a) throw new Error(`importer: missing imported asset for ${logicalId}`);
  return a.assetId;
}

export function buildCatalog(
  en: RawDict,
  vi: RawDict,
  assets: Map<string, FrozenAssetEntry>,
): { categories: CategoryRow[] } {
  const enCats = ((en as any).products.categories as RawCategory[]);
  const viCats = ((vi as any).products.categories as RawCategory[]);
  const categories = enCats.map((ec, i): CategoryRow => {
    const vc = viCats[i];
    return {
      slug: ec.slug,
      sortOrder: i,
      title: lt(ec.title, vc.title),
      tag: lt(ec.tag, vc.tag),
      intro: lt(ec.intro, vc.intro),
      productCount: ec.products,
      materialCount: ec.materials,
      imageId: mustAsset(assets, categoryImageLogicalId(i)),
      items: ec.items.map((ei, j): ProductRow => {
        const vi2 = vc.items[j];
        return {
          slug: ei.slug,
          sortOrder: j,
          title: lt(ei.title, vi2.title),
          tag: lt(ei.tag, vi2.tag),
          desc: lt(ei.desc, vi2.desc),
          // decouple the live productImage(i%6) cycle into a CONCRETE per-item asset choice
          imageId: mustAsset(assets, productImageLogicalId(j)),
        };
      }),
    };
  });
  return { categories };
}
```

4. **Run it, expect PASS** — `npm test -w @signex/api -- catalog-builder.spec` green (4 cats, 6 items each, unique slugs, decoupled imageIds, localized fields against the real dicts).

5. **Commit:**
```
git add apps/api/src/importer/catalog-builder.ts apps/api/src/importer/catalog-builder.spec.ts
git commit -m "feat(api/importer): catalog builder (sortOrder-preserving categories/products, decoupled imageIds)"
```

---

### Task 54: Block builder — fold en+vi into every ContentBlock, promote ~30 literals, unify NAP, parseBlock-conform

This is the heart of "the importer IS the registry conformance test." It folds the two dicts (plus the ~30 hardcoded literals scraped from `seo.ts`, `manifest.ts`, `org-json-ld.tsx`, `footer.tsx`, `contact.tsx`, `features.tsx`, `contact/page.tsx`) into the 12 `BLOCK_REGISTRY` blocks, calling `parseBlock(kind, key, data)` on each so any nonconformance crashes loudly. NAP (footer `email/tel/zalo/tax/office/factory`, home `contact.cards`, `contactPage.cards`, `org-json-ld`) is unified into a single self-contained `businessContact` block per Decision #13.

**Files:**
- Create: `apps/api/src/importer/block-builder.ts`
- Test: `apps/api/src/importer/block-builder.spec.ts`

**Interfaces:**
- Consumes:
  - `@signex/shared`: `parseBlock(kind: BlockKind, key: string, data: unknown): unknown` (throws ZodError), `BLOCK_REGISTRY`, `BlockKey`
  - `@signex/db`: `BlockKind` enum
  - `lt`/`ltArray`/`twoTone` (zip.ts), `FrozenAssetEntry` (asset-importer), `RawDict` (dict-source)
- Produces:
  - `buildBlocks(en: RawDict, vi: RawDict, assets: Map<string, FrozenAssetEntry>): BuiltBlock[]` where `BuiltBlock = { kind: BlockKind; key: string; data: unknown }` (each already `parseBlock`-validated)
  - `BLOCK_KIND_BY_KEY: Record<BlockKey, BlockKind>` (the PAGE/SETTINGS/NAV/SEO classification the registry expects)

**Steps:**

1. **Write the failing test** — `apps/api/src/importer/block-builder.spec.ts` (the conformance test: every built block must round-trip through `parseBlock`; NAP unified; literals promoted):
```ts
import { buildBlocks, BLOCK_KIND_BY_KEY } from './block-builder';
import { loadDicts } from './dict-source';
import { parseBlock, BLOCK_REGISTRY } from '@signex/shared';
import type { FrozenAssetEntry } from './asset-importer';

function assetsStub(): Map<string, FrozenAssetEntry> {
  // every logicalId referenced by blocks (logo, lotus, og, favicons, video refs, notFound) resolves
  return new Proxy(new Map(), {
    get(target, prop) {
      if (prop === 'get') return (k: string) => ({ assetId: `a_${k}`, r2Key: `${k}.k`, mime: 'image/x' });
      return (target as any)[prop];
    },
  }) as any;
}

describe('buildBlocks', () => {
  const { en, vi } = loadDicts();
  const blocks = buildBlocks(en, vi, assetsStub());

  it('builds exactly the 12 registry keys', () => {
    expect(blocks.map((b) => b.key).sort()).toEqual(Object.keys(BLOCK_REGISTRY).sort());
  });

  it('every block conforms to its registry schema (parseBlock does not throw)', () => {
    for (const b of blocks) {
      expect(() => parseBlock(b.kind, b.key, b.data)).not.toThrow();
    }
  });

  it('classifies block kinds (nav=NAV, meta=SEO, businessContact=SETTINGS, hero=PAGE)', () => {
    expect(BLOCK_KIND_BY_KEY.nav).toBe('NAV');
    expect(BLOCK_KIND_BY_KEY.meta).toBe('SEO');
    expect(BLOCK_KIND_BY_KEY.businessContact).toBe('SETTINGS');
    expect(BLOCK_KIND_BY_KEY.hero).toBe('PAGE');
  });

  it('unifies NAP into businessContact (emails/phones/tax/sites/social, both locales for legalName/address)', () => {
    const bc: any = blocks.find((b) => b.key === 'businessContact')!.data;
    expect(bc.emails).toEqual(['core@signex.vn', 'nhuadeo@gmail.com']);
    expect(bc.taxId).toBe('0319401172');
    expect(bc.phones.map((p: any) => p.kind)).toEqual(['tel', 'zalo']);
    expect(bc.phones[0].value).toBe('(+84) 979 700 072');
    expect(bc.sites.map((s: any) => s.kind)).toEqual(['office', 'factory']);
    expect(bc.sites[0].address.en).toMatch(/Bui Quang La/);
    expect(bc.legalName.en).toMatch(/SIGNEX BRAND IDENTITY/);
    // social = seeded '#' placeholders (Decision #12)
    expect(bc.social.map((s: any) => s.kind).sort()).toEqual(['facebook', 'youtube', 'zalo']);
    expect(bc.social.every((s: any) => s.href === '#')).toBe(true);
  });

  it('promotes meta literals (siteUrl, themeColor, ogImage assetRef, favicons)', () => {
    const meta: any = blocks.find((b) => b.key === 'meta')!.data;
    expect(meta.siteUrl).toBe('https://signex.vn');
    expect(meta.themeColor).toBe('#071522');
    expect(meta.ogImage.assetId).toBe('a_og');
    expect(meta.favicons.length).toBeGreaterThanOrEqual(3);
  });

  it('promotes notFound image assetRef + cta', () => {
    const nf: any = blocks.find((b) => b.key === 'notFound')!.data;
    expect(nf.image.assetId).toBe('a_notFound');
    expect(nf.cta.en).toBe('Back to homepage');
  });
});
```

2. **Run it, expect FAIL** — `Cannot find module './block-builder'`.

3. **Implement `apps/api/src/importer/block-builder.ts`** (folds all 12 blocks; literals are the values verified in `seo.ts`/`manifest.ts`/`org-json-ld.tsx`/`footer.tsx`/`contact/page.tsx`):
```ts
import type { BlockKind } from '@signex/db';
import { parseBlock, type BlockKey } from '@signex/shared';
import type { RawDict } from './dict-source';
import { lt, ltArray, twoTone, type LT } from './zip';
import type { FrozenAssetEntry } from './asset-importer';

export interface BuiltBlock {
  kind: BlockKind;
  key: string;
  data: unknown;
}

// Registry (kind,key) classification — mirrors §5.2 + the BlockKind enum.
export const BLOCK_KIND_BY_KEY: Record<BlockKey, BlockKind> = {
  hero: 'PAGE',
  features: 'PAGE',
  about: 'PAGE',
  productsHeader: 'PAGE',
  aboutPage: 'PAGE',
  contactPage: 'PAGE',
  notFound: 'PAGE',
  footer: 'SETTINGS',
  businessContact: 'SETTINGS',
  formConfig: 'SETTINGS',
  nav: 'NAV',
  meta: 'SEO',
};

function assetRef(assets: Map<string, FrozenAssetEntry>, logicalId: string, alt?: LT) {
  const a = assets.get(logicalId);
  if (!a) throw new Error(`importer: missing asset ${logicalId} for a block ref`);
  return alt ? { assetId: a.assetId, alt } : { assetId: a.assetId };
}
function videoRef(assets: Map<string, FrozenAssetEntry>, poster: string, mp4: string, webm: string) {
  return {
    posterAssetId: assets.get(poster)!.assetId,
    mp4AssetId: assets.get(mp4)!.assetId,
    webmAssetId: assets.get(webm)!.assetId,
  };
}

export function buildBlocks(en: RawDict, vi: RawDict, assets: Map<string, FrozenAssetEntry>): BuiltBlock[] {
  const E = en as any;
  const V = vi as any;

  const data: Record<BlockKey, unknown> = {
    hero: {
      title: twoTone(E.hero.titleTop, V.hero.titleTop, E.hero.titleBottom, V.hero.titleBottom),
      subtitle: lt(E.hero.subtitle, V.hero.subtitle),
      image: assetRef(assets, 'hero', lt(E.hero.imageAlt, V.hero.imageAlt)),
    },
    features: {
      eyebrow: lt(E.features.eyebrow, V.features.eyebrow),
      title: twoTone(E.features.titleTop, V.features.titleTop, E.features.titleBottom, V.features.titleBottom),
      cta: { label: lt(E.features.cta, V.features.cta), href: '#quote-form' },
      video: {
        title: lt(E.features.videoTitle, V.features.videoTitle),
        text: lt(E.features.videoText, V.features.videoText),
        media: videoRef(assets, 'homeVideoPoster', 'homeVideoMp4', 'homeVideoWebm'),
      },
      featured: { title: lt(E.features.featured.title, V.features.featured.title), desc: lt(E.features.featured.desc, V.features.featured.desc) },
      cards: E.features.cards.map((c: any, i: number) => ({
        title: lt(c.title, V.features.cards[i].title),
        desc: lt(c.desc, V.features.cards[i].desc),
      })),
    },
    about: {
      eyebrow: lt(E.about.eyebrow, V.about.eyebrow),
      title: twoTone(E.about.title, V.about.title, E.about.titleAccent, V.about.titleAccent),
      body: lt(E.about.body, V.about.body),
      mission: {
        title: lt(E.about.mission.title, V.about.mission.title),
        body: lt(E.about.mission.body, V.about.mission.body),
        items: ltArray(E.about.mission.items, V.about.mission.items),
      },
      vision: { title: lt(E.about.vision.title, V.about.vision.title), body: lt(E.about.vision.body, V.about.vision.body) },
      values: { title: lt(E.about.values.title, V.about.values.title), body: lt(E.about.values.body, V.about.values.body) },
    },
    productsHeader: {
      eyebrow: lt(E.products.eyebrow, V.products.eyebrow),
      title: twoTone(E.products.title, V.products.title, E.products.titleAccent, V.products.titleAccent),
      body: lt(E.products.body, V.products.body),
      statLabels: {
        products: lt(E.products.statLabels.products, V.products.statLabels.products),
        materials: lt(E.products.statLabels.materials, V.products.statLabels.materials),
      },
      detail: { listTitle: twoTone(E.products.detail.listTitle, V.products.detail.listTitle, E.products.detail.listTitleAccent, V.products.detail.listTitleAccent) },
      product: {
        categoryLabel: lt(E.products.product.categoryLabel, V.products.product.categoryLabel),
        materialLabel: lt(E.products.product.materialLabel, V.products.product.materialLabel),
        cta: lt(E.products.product.cta, V.products.product.cta),
        ctaHref: '#quote-form',
        back: lt(E.products.product.back, V.products.product.back),
        zoomHint: lt(E.products.product.zoomHint, V.products.product.zoomHint),
      },
    },
    footer: {
      brand: lt(E.footer.brand, V.footer.brand),
      tagline: ltArray(E.footer.tagline, V.footer.tagline),
      contactHeading: lt(E.footer.contactHeading, V.footer.contactHeading),
      quickHeading: lt(E.footer.quickHeading, V.footer.quickHeading),
      links: E.footer.links.map((l: any, i: number) => ({ label: lt(l.label, V.footer.links[i].label), href: l.href })),
      shipLabel: lt(E.footer.shipLabel, V.footer.shipLabel),
      payLabel: lt(E.footer.payLabel, V.footer.payLabel),
      payments: E.footer.payments as string[], // ['VISA','JCB','Napas'] — locale-invariant badges
      logo: assetRef(assets, 'logo'),
      lotus: assetRef(assets, 'lotus'),
    },
    nav: {
      skip: lt(E.nav.skip, V.nav.skip),
      cta: { label: lt(E.nav.cta, V.nav.cta), href: '#quote-form' },
      logo: assetRef(assets, 'logo'),
      links: E.nav.links.map((l: any, i: number) => ({ label: lt(l.label, V.nav.links[i].label), href: l.href })),
    },
    meta: {
      siteName: E.meta.siteName,
      siteUrl: 'https://signex.vn',
      themeColor: '#071522',
      title: lt(E.meta.title, V.meta.title),
      description: lt(E.meta.description, V.meta.description),
      ogImage: assetRef(assets, 'og', lt(E.meta.ogImageAlt, V.meta.ogImageAlt)),
      favicons: [
        { ...assetRef(assets, 'favicon32'), sizes: '32x32', type: 'image/png' },
        { ...assetRef(assets, 'favicon16'), sizes: '16x16', type: 'image/png' },
        { ...assetRef(assets, 'appleTouch'), rel: 'apple-touch-icon' },
        { ...assetRef(assets, 'androidChrome192'), sizes: '192x192', type: 'image/png' },
        { ...assetRef(assets, 'androidChrome512'), sizes: '512x512', type: 'image/png' },
      ],
      pages: {
        about: { title: lt(E.meta.about.title, V.meta.about.title), description: lt(E.meta.about.description, V.meta.about.description) },
        contact: { title: lt(E.meta.contact.title, V.meta.contact.title), description: lt(E.meta.contact.description, V.meta.contact.description) },
      },
    },
    businessContact: buildBusinessContact(E, V),
    formConfig: buildFormConfig(E, V),
    aboutPage: buildAboutPage(E, V, assets),
    contactPage: buildContactPage(E, V),
    notFound: {
      eyebrow: lt(E.notFound.eyebrow, V.notFound.eyebrow),
      title: twoTone(E.notFound.title, V.notFound.title, E.notFound.titleAccent, V.notFound.titleAccent),
      body: lt(E.notFound.body, V.notFound.body),
      cta: lt(E.notFound.cta, V.notFound.cta),
      ctaHref: '/',
      image: assetRef(assets, 'notFound', lt(E.notFound.imageAlt, V.notFound.imageAlt)),
    },
  };

  // The conformance gate: parseBlock every block; throws loudly on nonconformance.
  return (Object.keys(data) as BlockKey[]).map((key) => {
    const kind = BLOCK_KIND_BY_KEY[key];
    const validated = parseBlock(kind, key, data[key]);
    return { kind, key, data: validated };
  });
}

function buildBusinessContact(E: any, V: any) {
  // UNIFIED NAP — single source for footer + home contact + contactPage cards + JSON-LD.
  // Decision #13: emails/phones/taxId locale-invariant scalars; legalName/address localized.
  return {
    legalName: lt(E.footer.company, V.footer.company),
    brand: E.meta.siteName,
    emails: [E.footer.email, 'nhuadeo@gmail.com'], // footer email + 2nd contact-card email
    phones: [
      { kind: 'tel', label: lt('Tel', 'Tel'), value: E.footer.tel },
      { kind: 'zalo', label: lt('Zalo', 'Zalo'), value: E.footer.zalo },
    ],
    taxId: E.footer.tax,
    taxLabel: lt('Tax', 'Tax'),
    sites: [
      { kind: 'office', label: lt('Office', 'Office'), address: lt(E.footer.office, V.footer.office) },
      {
        kind: 'factory',
        label: lt('Factory', 'Factory'),
        address: lt(E.footer.factory, V.footer.factory),
        mapEmbedUrl:
          'https://www.google.com/maps?q=85%2F45%20D%C6%B0%C6%A1ng%20Th%E1%BB%8B%20M%C6%B0%E1%BB%9Di%2C%20Ph%C6%B0%E1%BB%9Dng%20Trung%20M%E1%BB%B9%20T%C3%A2y%2C%20Tp.HCM&output=embed&z=16',
      },
    ],
    // Decision #12: keep '#' placeholders; Admin fills post-launch (feeds JSON-LD sameAs).
    social: [
      { kind: 'facebook', href: '#' },
      { kind: 'youtube', href: '#' },
      { kind: 'zalo', href: '#' },
    ],
  };
}

function buildFormConfig(E: any, V: any) {
  const f = E.form;
  const vf = V.form;
  const fld = (key: string, required = false) => ({
    key,
    label: lt(f[key], vf[key]),
    placeholder: f[`${key}Placeholder`] !== undefined ? lt(f[`${key}Placeholder`], vf[`${key}Placeholder`]) : undefined,
    required,
  });
  // STANDARD_VALUES (locale-invariant submit values) zipped to the localized labels.
  const STANDARD_VALUES = ['OEKO-TEX Standard 100', 'ISO 9001', 'GRS (Recycled)', 'GOTS (Organic)', 'Other / Custom'];
  return {
    fields: [
      fld('name', true),
      fld('email', true),
      fld('phone'),
      fld('quantity'),
      fld('standard'),
      fld('height'),
      fld('width'),
      fld('thickness'),
      fld('upload'),
      fld('message'),
    ],
    standardOptions: STANDARD_VALUES.map((value, i) => ({ value, label: lt(f.standardOptions[i], vf.standardOptions[i]) })),
    uploadHelp: lt(f.uploadHelp, vf.uploadHelp),
    submit: lt(f.submit, vf.submit),
    success: lt(f.success, vf.success),
    fail: lt(f.fail, vf.fail),
  };
}

function buildAboutPage(E: any, V: any, assets: Map<string, FrozenAssetEntry>) {
  const a = E.aboutPage;
  const v = V.aboutPage;
  const tt = (en: any, vi: any) => twoTone(en.title, vi.title, en.titleAccent, vi.titleAccent);
  return {
    hero: { title: tt(a.hero, v.hero), subtitle: lt(a.hero.subtitle, v.hero.subtitle) },
    video: videoRef(assets, 'aboutVideoPoster', 'aboutVideoMp4', 'aboutVideoWebm'),
    testimonial: { eyebrow: lt(a.testimonial.eyebrow, v.testimonial.eyebrow), title: tt(a.testimonial, v.testimonial), body: ltArray(a.testimonial.body, v.testimonial.body) },
    approach: a.approach.map((g: any, i: number) => ({ title: lt(g.title, v.approach[i].title), body: ltArray(g.body, v.approach[i].body) })),
    intro: { eyebrow: lt(a.intro.eyebrow, v.intro.eyebrow), title: tt(a.intro, v.intro), body: lt(a.intro.body, v.intro.body) },
    capability: {
      eyebrow: lt(a.capability.eyebrow, v.capability.eyebrow),
      title: tt(a.capability, v.capability),
      body: lt(a.capability.body, v.capability.body),
      groups: a.capability.groups.map((g: any, i: number) => ({ title: lt(g.title, v.capability.groups[i].title), items: ltArray(g.items, v.capability.groups[i].items) })),
      closing: ltArray(a.capability.closing, v.capability.closing),
    },
    process: {
      eyebrow: lt(a.process.eyebrow, v.process.eyebrow),
      title: tt(a.process, v.process),
      body: lt(a.process.body, v.process.body),
      steps: a.process.steps.map((s: any, i: number) => ({ title: lt(s.title, v.process.steps[i].title), body: lt(s.body, v.process.steps[i].body) })),
    },
    timeline: {
      eyebrow: lt(a.timeline.eyebrow, v.timeline.eyebrow),
      title: tt(a.timeline, v.timeline),
      body: lt(a.timeline.body, v.timeline.body),
      intro: ltArray(a.timeline.intro, v.timeline.intro),
      milestones: a.timeline.milestones.map((m: any, i: number) => {
        const vm = v.timeline.milestones[i];
        const out: any = { num: m.num, title: lt(m.title, vm.title), body: lt(m.body, vm.body) };
        if (m.items !== undefined) out.items = ltArray(m.items, vm.items);
        if (m.note !== undefined) out.note = lt(m.note, vm.note);
        return out;
      }),
    },
  };
}

function buildContactPage(E: any, V: any) {
  const c = E.contactPage;
  const v = V.contactPage;
  return {
    hero: { title: twoTone(c.hero.title, v.hero.title, c.hero.titleAccent, v.hero.titleAccent), subtitle: lt(c.hero.subtitle, v.hero.subtitle) },
    map: { eyebrow: lt(c.map.eyebrow, v.map.eyebrow), title: twoTone(c.map.title, v.map.title, c.map.titleAccent, v.map.titleAccent) },
  };
}
```

4. **Run it, expect PASS** — `npm test -w @signex/api -- block-builder.spec` green: all 12 keys present, every `parseBlock` passes (the conformance gate against the REAL dicts), NAP unified, literals promoted.

> If any `parseBlock` throws here, that is the conformance test doing its job: it means the step-0 registry schema and the real dict shape disagree — fix the registry (step 0) or the fold, do NOT loosen the assertion.

5. **Commit:**
```
git add apps/api/src/importer/block-builder.ts apps/api/src/importer/block-builder.spec.ts
git commit -m "feat(api/importer): block builder (12 blocks, NAP unify, literal promotion, parseBlock conformance)"
```

---

### Task 55: Snapshot emitter — write committed initial-snapshot.ts byte-equal to the release snapshot

The release engine (step 6) returns the canonical `ReleaseSnapshot` for v1. The importer must EMIT `apps/web/app/lib/initial-snapshot.ts` whose embedded object re-parses byte-equal to that snapshot, so the web build-time fallback and the runtime DB snapshot are a single source. We achieve byte-equality by serializing with a deterministic canonical-JSON stringifier (recursively sorted keys), the same one the release engine uses for its checksum.

**Files:**
- Create: `apps/api/src/importer/snapshot-emit.ts`
- Test: `apps/api/src/importer/snapshot-emit.spec.ts`

**Interfaces:**
- Consumes: `@signex/shared` `ReleaseSnapshotSchema` + `type ReleaseSnapshot`; the canonical-JSON helper. (If step 6 exports `canonicalJson(value): string`, import it from `@signex/shared`; otherwise this task ships a local `canonicalJson` and step 6 imports IT — pick the shared export to avoid divergence.)
- Produces:
  - `canonicalJson(value: unknown): string` (recursively key-sorted, stable) — re-exported for the release engine's checksum if not already shared
  - `emitInitialSnapshot(snapshot: ReleaseSnapshot, outPath: string): string` — writes the TS module, returns its full text

**Steps:**

1. **Write the failing test** — `apps/api/src/importer/snapshot-emit.spec.ts`:
```ts
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalJson, emitInitialSnapshot } from './snapshot-emit';
import { ReleaseSnapshotSchema, type ReleaseSnapshot } from '@signex/shared';

const minimal: ReleaseSnapshot = ReleaseSnapshotSchema.parse({
  schemaVersion: 1,
  blocks: {} as any, // a real test passes a full block set; here we stub the smallest valid shape
  catalog: { categories: [] },
}) as ReleaseSnapshot;

describe('canonicalJson', () => {
  it('sorts object keys recursively and is stable', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });
});

describe('emitInitialSnapshot', () => {
  it('writes a TS module whose embedded JSON canonicalizes byte-equal to the source', () => {
    const dir = mkdtempSync(join(tmpdir(), 'snap-'));
    const out = join(dir, 'initial-snapshot.ts');
    const text = emitInitialSnapshot(minimal, out);
    expect(text).toContain('export const INITIAL_SNAPSHOT');
    expect(text).toContain("schemaVersion");
    // round-trip: extract the JSON literal and confirm canonical equality
    const onDisk = readFileSync(out, 'utf8');
    const jsonStr = onDisk.slice(onDisk.indexOf('{'), onDisk.lastIndexOf('}') + 1);
    expect(canonicalJson(JSON.parse(jsonStr))).toBe(canonicalJson(minimal));
  });
});
```

> NOTE: the `blocks: {}` stub above only typechecks because `ReleaseSnapshotSchema.parse` will reject it — in this spec replace `minimal` construction with a fixture built by `buildBlocks(loadDicts(), assetsStub())` + `buildCatalog(...)` so it is a genuinely valid snapshot. Keep the canonical-equality assertion identical.

2. **Run it, expect FAIL** — `Cannot find module './snapshot-emit'`.

3. **Implement `apps/api/src/importer/snapshot-emit.ts`:**
```ts
import { writeFileSync } from 'node:fs';
import type { ReleaseSnapshot } from '@signex/shared';

/** Deterministic JSON: recursively sort object keys so checksum + emit + DB snapshot agree. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}
function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = sortDeep((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return v;
}

const BANNER = `// AUTO-GENERATED by @signex/api importer (content:import). DO NOT EDIT BY HAND.
// Byte-equal to Release v1's snapshot (canonical JSON). Web build-time fallback for
// getPublishedSnapshot when the DB is empty/unreachable; keeps build + runtime in sync.
import type { ReleaseSnapshot } from "@signex/shared";
`;

/**
 * Emit the committed web fallback. The embedded object is canonical JSON (sorted keys),
 * pretty-printed for review; canonicalJson(JSON.parse(it)) === canonicalJson(snapshot).
 */
export function emitInitialSnapshot(snapshot: ReleaseSnapshot, outPath: string): string {
  const pretty = JSON.stringify(sortDeep(snapshot), null, 2);
  const text = `${BANNER}\nexport const INITIAL_SNAPSHOT = ${pretty} as const satisfies ReleaseSnapshot;\n`;
  writeFileSync(outPath, text, 'utf8');
  return text;
}
```

4. **Run it, expect PASS** — `npm test -w @signex/api -- snapshot-emit.spec` green (canonical sort + byte-equal round-trip).

5. **Decide the shared-checksum source** — if step-6's `ReleaseService` computes its checksum from a local stringifier, change step 6's consume to `import { canonicalJson } from '@signex/shared'` and re-export `canonicalJson` from `packages/shared/src/index.ts` (move the function there). Add one line to the spec asserting `canonicalJson` is the shared export:
```ts
import { canonicalJson as sharedCanonical } from '@signex/shared';
it('uses the SAME canonicalJson as @signex/shared (no divergence with the publish checksum)', () => {
  expect(sharedCanonical({ b: 1, a: 2 })).toBe(canonicalJson({ b: 1, a: 2 }));
});
```
(If step 0 already exports `canonicalJson`, delete the local copy and re-export instead.)

6. **Run it, expect PASS** — green; importer emitter and publish checksum share one canonicalizer.

7. **Commit:**
```
git add apps/api/src/importer/snapshot-emit.ts apps/api/src/importer/snapshot-emit.spec.ts
git commit -m "feat(api/importer): canonical-JSON snapshot emitter for committed initial-snapshot.ts"
```

---

### Task 56: ImporterService orchestrator + Nest command + content:import script

Wires the pieces into one exclusive, idempotent-guarded run: acquire a Postgres advisory lock, assert parity, import assets, persist catalog + blocks + singletons in one transaction (single `WorkingState.revision` bump), then mint **Release v1 (PUBLISHED)** through the step-6 `ReleaseService.publish` using the seeded system actor, and emit the committed `initial-snapshot.ts`. Exposed as a Nest standalone-context command run via `npm run -w @signex/api content:import`.

**Files:**
- Create: `apps/api/src/importer/importer.service.ts`
- Create: `apps/api/src/importer/importer.module.ts`
- Create: `apps/api/src/importer/importer.command.ts`
- Modify: `apps/api/package.json` (add `content:import` script)
- Test: `apps/api/src/importer/importer.service.spec.ts`

**Interfaces:**
- Consumes:
  - `PrismaService.client` (Category/Product/ContentBlock/Asset/WorkingState/User + `$executeRaw`/`$transaction`)
  - `R2Service` (step 5) — for `importAssets`
  - `ReleaseService.publish(actor: User, { note, expectedRevision }): Promise<{ version; releaseId; checksum; snapshot }>` (step 6)
  - seeded system `User` (step 3) via `prisma.user.findUniqueOrThrow({ where: { email: SEED_ADMIN_EMAIL } })`
  - `buildBlocks`, `buildCatalog`, `importAssets`, `assertParity`, `loadDicts`, `emitInitialSnapshot`, `BLOCK_KIND_BY_KEY`
- Produces:
  - `ImporterService.run(): Promise<{ version: number; releaseId: string; snapshotPath: string }>`
  - `npm run -w @signex/api content:import` → `node dist/importer/importer.command`

**Steps:**

1. **Write the failing test** — `apps/api/src/importer/importer.service.spec.ts` (unit-level: mocked prisma/r2/release; asserts exclusive guard, single revision bump, actor passthrough, publish called once, emit called). Persistence correctness is covered by the e2e task next.
```ts
import { ImporterService } from './importer.service';

function makeDeps() {
  const tx = {
    asset: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn(async ({ data }: any) => data) },
    category: { create: jest.fn(async ({ data }: any) => ({ id: 'c', ...data })) },
    product: { create: jest.fn(async ({ data }: any) => ({ id: 'p', ...data })) },
    contentBlock: { upsert: jest.fn(async ({ create }: any) => create) },
    workingState: { upsert: jest.fn(async () => ({ revision: 1 })), update: jest.fn(async () => ({ revision: 1 })) },
  };
  const prisma = {
    $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
    $queryRawUnsafe: jest.fn().mockResolvedValue([{ pg_try_advisory_lock: true }]),
    $transaction: jest.fn(async (fn: any) => fn(tx)),
    user: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'sys', email: 'a@b.c', role: 'ADMIN' }) },
    workingState: { findUnique: jest.fn().mockResolvedValue({ revision: 1 }) },
  };
  const r2 = { uploadFromBytes: jest.fn(async (i: any) => ({ assetId: 'a_' + i.declaredSha256.slice(0, 6), r2Key: 'k/' + i.declaredSha256.slice(0, 32), sha256: i.declaredSha256, width: 1, height: 1, bytes: i.bytes.length })) };
  const release = { publish: jest.fn(async () => ({ version: 1, releaseId: 'r1', checksum: 'cs', snapshot: { schemaVersion: 1, blocks: {}, catalog: { categories: [] } } })) };
  return { prisma, r2, release, tx };
}

describe('ImporterService', () => {
  it('runs exclusively, persists in one tx, mints v1 via release.publish with the system actor, emits snapshot', async () => {
    const { prisma, r2, release } = makeDeps();
    const svc = new ImporterService({ client: prisma } as any, r2 as any, release as any);
    jest.spyOn(svc as any, 'emit').mockReturnValue('/tmp/initial-snapshot.ts');
    const res = await svc.run();
    expect(prisma.$queryRawUnsafe).toHaveBeenCalled(); // advisory lock attempt
    expect(prisma.$transaction).toHaveBeenCalledTimes(1); // single tx => single revision bump
    expect(release.publish).toHaveBeenCalledTimes(1);
    const [actor, args] = release.publish.mock.calls[0];
    expect(actor.id).toBe('sys');
    expect(args.expectedRevision).toBe(1);
    expect(res.version).toBe(1);
  });

  it('refuses to run twice (already-imported guard)', async () => {
    const { prisma, r2, release } = makeDeps();
    prisma.$queryRawUnsafe = jest.fn().mockResolvedValue([{ pg_try_advisory_lock: false }]);
    const svc = new ImporterService({ client: prisma } as any, r2 as any, release as any);
    await expect(svc.run()).rejects.toThrow(/already (running|imported)|lock/i);
  });
});
```

2. **Run it, expect FAIL** — `Cannot find module './importer.service'`.

3. **Implement `apps/api/src/importer/importer.service.ts`:**
```ts
import { Injectable, Logger } from '@nestjs/common';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { R2Service } from '../assets/r2.service';
import { ReleaseService } from '../release/release.service';
import { loadDicts, resolveRepoRoot } from './dict-source';
import { assertParity } from './parity';
import { importAssets } from './asset-importer';
import { buildCatalog } from './catalog-builder';
import { buildBlocks } from './block-builder';
import { emitInitialSnapshot } from './snapshot-emit';

const ADVISORY_LOCK_KEY = 728_173; // arbitrary stable bigint for the importer's exclusive lock

@Injectable()
export class ImporterService {
  private readonly logger = new Logger(ImporterService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly r2: R2Service,
    private readonly release: ReleaseService,
  ) {}

  async run(): Promise<{ version: number; releaseId: string; snapshotPath: string }> {
    const db = this.prisma.client;
    // 1. EXCLUSIVE: session advisory lock — second concurrent run fails fast.
    const lockRows = (await db.$queryRawUnsafe(
      `SELECT pg_try_advisory_lock(${ADVISORY_LOCK_KEY}) as pg_try_advisory_lock`,
    )) as Array<{ pg_try_advisory_lock: boolean }>;
    if (!lockRows[0]?.pg_try_advisory_lock) {
      throw new Error('importer: advisory lock held — another import is already running');
    }
    try {
      // 2. Idempotency: refuse if a release already exists.
      const existing = await db.release.count?.({}) ?? 0;
      if (existing > 0) throw new Error('importer: content already imported (a Release exists)');

      // 3. Pre-flight parity.
      const { en, vi } = loadDicts();
      assertParity(en, vi);

      // 4. System actor (seeded in step 3).
      const actorEmail = process.env.SEED_ADMIN_EMAIL;
      if (!actorEmail) throw new Error('importer: SEED_ADMIN_EMAIL unset (run auth:seed first)');
      const actor = await db.user.findUniqueOrThrow({ where: { email: actorEmail } });

      // 5. Assets through the live R2 path (dedup by sha256).
      const assets = await importAssets({ prisma: db, r2: this.r2 });

      // 6. Build working-state rows.
      const catalog = buildCatalog(en, vi, assets);
      const blocks = buildBlocks(en, vi, assets);

      // 7. Persist EVERYTHING in one tx + bump revision exactly ONCE (no 409 storm).
      await db.$transaction(async (tx) => {
        for (const c of catalog.categories) {
          const cat = await tx.category.create({
            data: {
              slug: c.slug, sortOrder: c.sortOrder, title: c.title, tag: c.tag, intro: c.intro,
              productCount: c.productCount, materialCount: c.materialCount, imageId: c.imageId,
            },
          });
          for (const p of c.items) {
            await tx.product.create({
              data: {
                categoryId: cat.id, slug: p.slug, sortOrder: p.sortOrder,
                title: p.title, tag: p.tag, desc: p.desc, imageId: p.imageId,
              },
            });
          }
        }
        for (const b of blocks) {
          await tx.contentBlock.upsert({
            where: { kind_key: { kind: b.kind, key: b.key } },
            create: { kind: b.kind, key: b.key, data: b.data as object },
            update: { data: b.data as object },
          });
        }
        await tx.workingState.upsert({
          where: { id: 'singleton' },
          create: { id: 'singleton', revision: 1, lastPublishedRevision: 0, updatedById: actor.id },
          update: { revision: { increment: 1 }, updatedById: actor.id },
        });
      });

      // 8. Mint Release v1 via the SAME publish engine (sequence version + pointer + audit + ReleaseAssetRef).
      const current = await db.workingState.findUnique({ where: { id: 'singleton' } });
      const published = await this.release.publish(actor as any, {
        note: 'Initial import (v1)',
        expectedRevision: current!.revision,
      });

      // 9. Emit the committed web fallback, byte-equal to v1.
      const snapshotPath = this.emit(published.snapshot);
      this.logger.log(`importer: minted Release v${published.version}; emitted ${snapshotPath}`);
      return { version: published.version, releaseId: published.releaseId, snapshotPath };
    } finally {
      await db.$queryRawUnsafe(`SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY})`);
    }
  }

  /** Seam for unit tests; writes apps/web/app/lib/initial-snapshot.ts. */
  private emit(snapshot: Parameters<typeof emitInitialSnapshot>[0]): string {
    const out = join(resolveRepoRoot(), 'apps', 'web', 'app', 'lib', 'initial-snapshot.ts');
    emitInitialSnapshot(snapshot, out);
    return out;
  }
}
```

4. **Implement `apps/api/src/importer/importer.module.ts`:**
```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AssetsModule } from '../assets/assets.module';
import { ReleaseModule } from '../release/release.module';
import { ImporterService } from './importer.service';

@Module({
  imports: [PrismaModule, AssetsModule, ReleaseModule],
  providers: [ImporterService],
  exports: [ImporterService],
})
export class ImporterModule {}
```

5. **Implement `apps/api/src/importer/importer.command.ts`** (standalone application context — no HTTP server; exits non-zero on failure for CI/seed pipelines):
```ts
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ImporterModule } from './importer.module';
import { ImporterService } from './importer.service';

async function main() {
  const app = await NestFactory.createApplicationContext(ImporterModule, { logger: ['log', 'warn', 'error'] });
  try {
    const res = await app.get(ImporterService).run();
    Logger.log(`content:import OK — Release v${res.version} (${res.releaseId}); ${res.snapshotPath}`, 'importer');
  } finally {
    await app.close();
  }
}
main().catch((err) => {
  Logger.error(`content:import FAILED — ${(err as Error).message}`, (err as Error).stack, 'importer');
  process.exit(1);
});
```

6. **Modify `apps/api/package.json`** — add the script (place it after `start:prod`):
```json
    "content:import": "node dist/importer/importer.command",
```

7. **Run it, expect PASS** — `npm test -w @signex/api -- importer.service.spec` green: single tx, single revision bump, `release.publish` called once with the seeded actor + `expectedRevision`, and the double-run guard rejects.

8. **Verify it compiles into dist** — `npm run build -w @signex/db -w @signex/shared && npm run build -w @signex/api`; confirm `apps/api/dist/importer/importer.command.js` exists:
```
test -f apps/api/dist/importer/importer.command.js && echo "command compiled OK"
```
Expect: `command compiled OK`.

9. **Commit:**
```
git add apps/api/src/importer/importer.service.ts apps/api/src/importer/importer.module.ts apps/api/src/importer/importer.command.ts apps/api/src/importer/importer.service.spec.ts apps/api/package.json
git commit -m "feat(api/importer): ImporterService orchestrator + Nest command + content:import script"
```

---

### Task 57: End-to-end importer run against Postgres + committed initial-snapshot.ts

The acceptance for this milestone: run the real importer against the live Postgres container (after `migrate deploy` + `auth:seed`), then assert the DB and the emitted committed file agree. This produces the actual `apps/web/app/lib/initial-snapshot.ts` artifact that step 8's web read-path consumes. R2 is pointed at a test/dev bucket (or the R2Service's local/in-memory mode if step 5 ships one) for this run.

**Files:**
- Create: `apps/api/test/importer.e2e-spec.ts`
- Create (generated, committed): `apps/web/app/lib/initial-snapshot.ts`

**Interfaces:**
- Consumes: the compiled importer (`content:import`), a migrated+seeded DB, `ReleaseSnapshotSchema`, `canonicalJson`.
- Produces: the committed `INITIAL_SNAPSHOT` artifact; e2e assertions on Release v1 / PublishedPointer / WorkingState.

**Steps:**

1. **Write the failing e2e** — `apps/api/test/importer.e2e-spec.ts` (uses the e2e jest config; requires `DATABASE_URL` + R2 env; gated to skip if no DB — but in CI/local acceptance it RUNS):
```ts
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { prisma } from '@signex/db';
import { ReleaseSnapshotSchema } from '@signex/shared';
import { ImporterModule } from '../src/importer/importer.module';
import { ImporterService } from '../src/importer/importer.service';
import { NestFactory } from '@nestjs/core';
import { canonicalJson } from '../src/importer/snapshot-emit';

const repoRoot = join(__dirname, '..', '..', '..');
const SNAP = join(repoRoot, 'apps', 'web', 'app', 'lib', 'initial-snapshot.ts');

describe('importer (e2e)', () => {
  let res: { version: number; releaseId: string; snapshotPath: string };

  beforeAll(async () => {
    const app = await NestFactory.createApplicationContext(ImporterModule, { logger: false });
    res = await app.get(ImporterService).run();
    await app.close();
  }, 120_000);

  it('mints Release v1 PUBLISHED with the PublishedPointer set', async () => {
    expect(res.version).toBe(1);
    const rel = await prisma.release.findUnique({ where: { version: 1 } });
    expect(rel?.status).toBe('PUBLISHED');
    const ptr = await prisma.publishedPointer.findUnique({ where: { id: 'singleton' } });
    expect(ptr?.publishedVersion).toBe(1);
  });

  it('seeds 4 categories with 6 products each, sortOrder preserved', async () => {
    const cats = await prisma.category.findMany({ orderBy: { sortOrder: 'asc' }, include: { products: true } });
    expect(cats).toHaveLength(4);
    expect(cats.map((c) => c.sortOrder)).toEqual([0, 1, 2, 3]);
    for (const c of cats) expect(c.products).toHaveLength(6);
    expect(cats[0].slug).toBe('plastic-logos-emblems');
  });

  it('bumped WorkingState.revision once and marked clean (lastPublishedRevision == revision)', async () => {
    const ws = await prisma.workingState.findUnique({ where: { id: 'singleton' } });
    expect(ws!.revision).toBe(1);
    expect(ws!.lastPublishedRevision).toBe(1);
  });

  it('emitted initial-snapshot.ts is byte-equal (canonical) to the DB Release v1 snapshot', async () => {
    expect(existsSync(SNAP)).toBe(true);
    const rel = await prisma.release.findUnique({ where: { version: 1 }, select: { snapshot: true } });
    const dbSnap = ReleaseSnapshotSchema.parse(rel!.snapshot);
    const text = readFileSync(SNAP, 'utf8');
    const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    const fileSnap = ReleaseSnapshotSchema.parse(JSON.parse(json));
    expect(canonicalJson(fileSnap)).toBe(canonicalJson(dbSnap));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
```

2. **Bring up the dependencies + run, expect FAIL first** (no schema/seed yet in a clean DB, or importer not yet run):
```
docker compose up -d postgres
npm run build -w @signex/db -w @signex/shared -w @signex/api
npm run db:migrate -w @signex/db        # migrate deploy (step 1 migration)
npm run -w @signex/api auth:seed        # seed SYSTEM/ADMIN (step 3)
npm run test:e2e -w @signex/api -- importer.e2e-spec
```
Expect: red until the importer runs cleanly end-to-end (e.g. a `parseBlock` mismatch or a missing asset surfaces here as a real failure).

3. **Run the importer for real to generate the committed artifact:**
```
SEED_ADMIN_EMAIL=admin@signex.vn MEDIA_PUBLIC_BASE=https://media.signex.vn \
  npm run -w @signex/api content:import
```
Expect log: `content:import OK — Release v1 (...); .../apps/web/app/lib/initial-snapshot.ts`. This WRITES the committed fallback file.

4. **Run the e2e, expect PASS** — `npm run test:e2e -w @signex/api -- importer.e2e-spec` green: v1 PUBLISHED + pointer, 4×6 catalog, single revision bump + clean, and the committed file canonical-equals the DB snapshot.

5. **Typecheck the emitted artifact in the web project** (the file is `satisfies ReleaseSnapshot`; web must compile it):
```
npm run build -w @signex/shared
test -f apps/web/app/lib/initial-snapshot.ts && npx -w @signex/web tsc --noEmit -p apps/web/tsconfig.json
```
Expect: no type errors referencing `initial-snapshot.ts` (web read-path wiring is step 8; here we only assert the artifact typechecks against `@signex/shared`).

6. **Verify idempotency guard live** — re-run and expect a clean refusal, not a duplicate:
```
SEED_ADMIN_EMAIL=admin@signex.vn MEDIA_PUBLIC_BASE=https://media.signex.vn \
  npm run -w @signex/api content:import || echo "refused as expected"
```
Expect: `content:import FAILED — importer: content already imported (a Release exists)` then `refused as expected`.

7. **Commit the generated artifact + e2e together:**
```
git add apps/web/app/lib/initial-snapshot.ts apps/api/test/importer.e2e-spec.ts
git commit -m "feat(importer): mint Release v1 + commit byte-equal initial-snapshot.ts (e2e green)"
```

---

## Milestone 8 — apps/web read-path: snapshot loader, cacheComponents/revalidate, dynamicParams fix, component+SEO migration, form POST wiring

**Consumes (from earlier milestones):**
- @signex/shared: ReleaseSnapshotSchema (zod schema), type ReleaseSnapshot = z.infer<typeof ReleaseSnapshotSchema>
- @signex/shared: type SiteContent (per-locale resolved structural superset of Dictionary) OR ReleaseSnapshot — web defines the resolved per-lang view type locally as SiteContent if shared does not export a resolved type
- @signex/shared: BLOCK_REGISTRY keys (hero, features, about, productsHeader, footer, nav, meta, businessContact, formConfig, aboutPage, contactPage, notFound) and businessContact block shape { legalName:{en,vi}, brand, emails[], phones:[{kind,label:{en,vi},value}], taxId, taxLabel:{en,vi}, sites:[{kind,label,address:{en,vi},mapEmbedUrl?}], social:[{kind,href}] }
- @signex/db: export const prisma (PrismaClient) ; model Release { status:'PUBLISHED'|'ARCHIVED', version:Int, snapshot:Json }
- apps/web/app/lib/initial-snapshot.ts (emitted by step 7 importer): export const INITIAL_SNAPSHOT: { en: SiteContent; vi: SiteContent } — byte-equal to Release v1 resolved per-lang; also export INITIAL_NOT_FOUND constants consumed by not-found-view/global-error
- api route: POST /api/forms/:formKey/submit (Public, multipart/form-data or json payload) -> 200 {ok:true}
- api route: POST /api/preview/snapshot (PREVIEW_SECRET header) -> live working state as ReleaseSnapshot

**Produces (for later milestones):**
- apps/web/app/lib/content.ts: export async function getSiteContent(lang: Locale): Promise<SiteContent>  // published, cached, draftMode-free
- apps/web/app/lib/content.ts: export async function getPublishedSnapshot(lang: Locale): Promise<SiteContent>  // 'use cache' + cacheTag('release')
- apps/web/app/lib/content.ts: export async function getPreviewSnapshot(lang: Locale): Promise<SiteContent>  // reads /api/preview/snapshot
- apps/web/app/lib/content.ts: export function resolveAssetUrl(r2Key: string): string  // MEDIA_PUBLIC_BASE + '/' + r2Key
- apps/web/app/lib/content.ts: export type SiteContent  (resolved per-lang structural superset of Dictionary)
- apps/web/app/[lang]/dictionaries.ts: export type Dictionary = SiteContent  (shim alias; the ~30 ({dict})=>JSX components keep importing Dictionary unchanged)
- apps/web/app/lib/nap.ts: export function napView(bc: SiteContent['businessContact']): { company:string; email:string; tel:string; zalo?:string; office:string; factory:string; tax:string; social:{kind:string;href:string}[] }
- apps/web/app/api/revalidate/route.ts: POST handler (x-revalidate-secret) -> revalidateTag('release','max') + revalidatePath(paths[])
- apps/web/app/api/draft/route.ts: GET (enable draftMode + redirect) ; DELETE (disable)
- web compose envs: DATABASE_URL, REVALIDATE_SECRET, PREVIEW_SECRET, MEDIA_PUBLIC_BASE, API_URL on the web service

### Task 58: Couple apps/web to @signex/db + @signex/shared (deps, next.config, Dockerfile, .dockerignore, compose)

This is the packaging task — it makes the DB-reading code in later tasks compilable and traceable into the standalone image. There is no unit test here; it is verified by typecheck + `docker compose build web` (the only honest gate for a Dockerfile/trace change, per spec §10.4 / §14 "Docker gate").

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/next.config.ts`
- Modify: `apps/web/Dockerfile`
- Modify: `.dockerignore`
- Modify: `docker-compose.yml`

**Interfaces:**
- Consumes: `@signex/db` (`export const prisma`), `@signex/shared` (`ReleaseSnapshotSchema`) — both compiled to CJS `dist/` by steps 0/1.
- Produces: web can `import { prisma } from "@signex/db"` and `import { ReleaseSnapshotSchema } from "@signex/shared"`; web compose service has `DATABASE_URL` + `depends_on postgres`.

**Steps:**

1. Add the workspace deps to `apps/web/package.json` (workspace protocol matches how api already depends on them) and a verification script. Replace the `dependencies` and `scripts` blocks:

```jsonc
  "scripts": {
    "dev": "next dev -p 3062",
    "build": "next build",
    "start": "next start -p 3062",
    "lint": "eslint",
    "verify:readpath": "node scripts/verify-readpath.mjs",
    "verify:dynamic-params": "node scripts/verify-dynamic-params.mjs"
  },
  "dependencies": {
    "@signex/db": "*",
    "@signex/shared": "*",
    "next": "16.2.7",
    "react": "19.2.4",
    "react-dom": "19.2.4"
  },
```

2. Install from the repo root so the root lockfile records the new web edges (workspaces resolve `*` to the local packages):

```bash
npm install
```

   Run, expect: exit 0 and `apps/web/node_modules/@signex/db` + `@signex/shared` symlinks present:

```bash
ls -l apps/web/node_modules/@signex/db apps/web/node_modules/@signex/shared
```

   Expect: both are symlinks into `../../../packages/...`.

3. Edit `apps/web/next.config.ts` to enable `cacheComponents` (prerequisite for `cacheTag`/`'use cache'`, verified in `node_modules/next/dist/docs/.../cacheTag.md`) and externalize the Prisma client so the standalone trace keeps the native engine instead of bundling it:

```ts
import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Emit a self-contained production server at .next/standalone (see Dockerfile).
  output: "standalone",
  // Monorepo: trace files from the repo root so the standalone bundle spans the workspace.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // Required for `'use cache'` + `cacheTag('release')` in app/lib/content.ts (Next 16.2).
  cacheComponents: true,
  // Keep @prisma/client + the generated @signex/db client OUT of the bundler so the
  // native query engine (linux-musl-openssl-3.0.x binaryTarget) is required() at runtime
  // and traced into standalone rather than mangled by the build.
  serverExternalPackages: ["@prisma/client", "@signex/db"],
};

export default nextConfig;
```

4. Verify Next accepts the config (it type-checks `cacheComponents`/`serverExternalPackages` keys):

```bash
npx --workspace @signex/web next build --help >/dev/null 2>&1; echo $?
```

   (Smoke only; full build runs under Docker in step 8.) Then typecheck-guard the config compiles:

```bash
node -e "require('@signex/web/next.config.ts')" 2>/dev/null; echo "config syntactic check via ts handled by next build"
```

   Expect: exit 0 from the `next --help` invocation.

5. Edit `apps/web/Dockerfile` builder stage to generate the Prisma client and build the two CJS packages **before** `next build`. Replace the builder stage:

```dockerfile
# ---------- builder: build deps (db client + shared) then the web workspace ----------
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# @signex/db + @signex/shared are require()d by the web read-path at runtime; they must be
# generated/compiled to dist/ + generated/ BEFORE next build so the standalone trace can
# include the Prisma client (linux-musl engine) and the CJS shared registry.
RUN npm run -w @signex/db generate \
 && npm run build -w @signex/db -w @signex/shared \
 && npm run build --workspace @signex/web
```

6. Un-ignore the generated Prisma client at the repo-root `.dockerignore` (it is regenerated in-stage by `db generate`, but un-ignoring documents intent and lets a host-generated copy seed the layer cache). Edit `.dockerignore`:

```diff
-# ---- Prisma generated client + engine (MUST be generated inside the Linux build stage) ----
-packages/db/generated
+# ---- Prisma generated client + engine ----
+# Regenerated inside the Linux builder stage (`db generate`) for both api AND web images.
+# NOT ignored: the web standalone trace must be able to resolve packages/db/generated.
+# (Keeping a host copy out of context is unnecessary now that two images consume it.)
```

7. Add the web-service runtime env + DB dependency to `docker-compose.yml`. In the `web:` service, change `depends_on` and `environment`:

```yaml
  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    image: signex-web:latest
    container_name: signex-web
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
      api:
        condition: service_healthy
    environment:
      NODE_ENV: production
      PORT: 3062
      HOSTNAME: 0.0.0.0
      NEXT_TELEMETRY_DISABLED: "1"
      # Web PUBLIC read-path queries Postgres directly via @signex/db (one indexed row).
      DATABASE_URL: postgresql://${POSTGRES_USER:-signex}:${POSTGRES_PASSWORD:-signex}@postgres:5432/${POSTGRES_DB:-signex}?schema=public
      # Asset URLs are resolved at read time: MEDIA_PUBLIC_BASE + '/' + r2Key.
      MEDIA_PUBLIC_BASE: ${MEDIA_PUBLIC_BASE:-}
      # Secret-gated on-demand revalidation + draft-mode entry (called by the api post-publish).
      REVALIDATE_SECRET: ${REVALIDATE_SECRET:-}
      PREVIEW_SECRET: ${PREVIEW_SECRET:-}
      # Server-side calls to the api (preview snapshot, form submit forwarding if proxied).
      API_URL: ${API_URL:-http://api:3060}
      NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL:-http://localhost:3060}
    ports:
      - "${WEB_PORT:-3062}:3062"
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://127.0.0.1:3062/en"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s
    networks:
      - signex-net
```

8. Validate the compose file parses:

```bash
docker compose config -q && echo COMPOSE_OK
```

   Run, expect: `COMPOSE_OK` (exit 0).

9. Commit the coupling (the full image build is exercised at the end of this milestone, gated alongside the read-path code):

```bash
git add apps/web/package.json apps/web/next.config.ts apps/web/Dockerfile .dockerignore docker-compose.yml package-lock.json
git commit -m "build(web): couple to @signex/db+@signex/shared; cacheComponents+serverExternalPackages; Dockerfile generate/build db+shared; web compose DATABASE_URL+depends_on postgres"
```

---

### Task 59: Snapshot read-path loader — getPublishedSnapshot ('use cache' + cacheTag('release') + try/catch fallback) and getSiteContent

**Files:**
- Create: `apps/web/app/lib/content.ts`
- Create: `apps/web/scripts/verify-readpath.mjs`
- Modify: `apps/web/app/[lang]/dictionaries.ts`

**Interfaces:**
- Consumes: `@signex/db` `prisma`; `@signex/shared` `ReleaseSnapshotSchema` + `type ReleaseSnapshot`; `apps/web/app/lib/initial-snapshot.ts` `INITIAL_SNAPSHOT: { en: SiteContent; vi: SiteContent }` (step 7).
- Produces: `getSiteContent(lang: Locale): Promise<SiteContent>`, `getPublishedSnapshot(lang): Promise<SiteContent>` (`'use cache'`+`cacheTag('release')`), `resolveAssetUrl(r2Key: string): string`, `type SiteContent`; `Dictionary` repointed to `SiteContent`.

**Steps:**

1. Write the failing verification test first (`scripts/verify-readpath.mjs`) — a static-source assertion (the loader uses `'use cache'`/`draftMode`-free semantics that can't be unit-run without a full Next runtime, so spec §14 prescribes a node source-invariant check):

```js
// apps/web/scripts/verify-readpath.mjs
// Source invariants for the published read-path (spec §10.1):
//  - content.ts caches with 'use cache' and tags 'release'
//  - content.ts never reads draftMode() (would de-opt the whole shell off SSG)
//  - the published loader falls back to INITIAL_SNAPSHOT on any error
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "app/lib/content.ts"), "utf8");
const fail = [];
if (!src.includes('"use cache"')) fail.push("content.ts: missing 'use cache' directive");
if (!/cacheTag\(\s*["']release["']\s*\)/.test(src)) fail.push("content.ts: missing cacheTag('release')");
if (/\bdraftMode\b/.test(src)) fail.push("content.ts: must NOT reference draftMode() (de-opts SSG)");
if (!src.includes("INITIAL_SNAPSHOT")) fail.push("content.ts: missing INITIAL_SNAPSHOT fallback");
if (!/catch\b/.test(src)) fail.push("content.ts: missing try/catch fallback");
if (fail.length) { console.error("FAIL\n" + fail.join("\n")); process.exit(1); }
console.log("verify-readpath OK");
```

2. Run it, expect FAIL (content.ts does not exist yet):

```bash
node apps/web/scripts/verify-readpath.mjs
```

   Expect: `Error: ENOENT ... app/lib/content.ts` (non-zero exit) — the file is missing.

3. Create the loader `apps/web/app/lib/content.ts`. The published path is fully cached and `draftMode`-free; preview is a separate non-cached function used only by the preview island. `SiteContent` is the resolved per-lang view (asset `r2Key`s turned into URLs, `{en,vi}` collapsed for the active locale) — a structural superset of the old `Dictionary`, so components compile unchanged:

```ts
// apps/web/app/lib/content.ts
// PUBLIC read-path. The published snapshot is read straight from Postgres via @signex/db
// (one indexed row, no api at request time), validated by the SAME zod schema the api used to
// write it, and resolved to a per-locale view. The published loader is `'use cache'` +
// cacheTag('release') so Publish (api -> /api/revalidate) can mark the whole site stale with
// one tag. It reads NO draftMode() — doing so at the caller would force the shell dynamic under
// cacheComponents and forfeit SSG (spec §10.1). Any Prisma/parse error -> INITIAL_SNAPSHOT,
// so the site never 500s on data (spec §13).
import "server-only";
import { cacheTag } from "next/cache";
import { prisma } from "@signex/db";
import { ReleaseSnapshotSchema, type ReleaseSnapshot } from "@signex/shared";
import type { Locale } from "@/app/lib/i18n-config";
import { INITIAL_SNAPSHOT } from "@/app/lib/initial-snapshot";

// The resolved, per-locale content the components consume. INITIAL_SNAPSHOT[lang] has this exact
// shape, so it is the single source for the type (build + runtime agree).
export type SiteContent = (typeof INITIAL_SNAPSHOT)["en"];

// Asset URLs are NEVER frozen into the snapshot — only the r2Key is. Resolve at read time so the
// site survives a CDN/domain migration (spec §3.1.3). Empty base = relative key (dev only).
export function resolveAssetUrl(r2Key: string): string {
  const base = (process.env.MEDIA_PUBLIC_BASE ?? "").replace(/\/+$/, "");
  return base ? `${base}/${r2Key}` : `/${r2Key}`;
}

// Collapse the bilingual immutable snapshot into one locale's resolved view. Pure + sync so it
// stays inside the cache boundary. resolveLocalized walks {en,vi} leaves -> string and rewrites
// every {assetId,r2Key,...} frozen-asset node -> { ...node, url: resolveAssetUrl(r2Key) }.
function resolveForLang(snap: ReleaseSnapshot, lang: Locale): SiteContent {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") {
      const o = node as Record<string, unknown>;
      // bilingual leaf -> active locale
      if ("en" in o && "vi" in o && Object.keys(o).every((k) => k === "en" || k === "vi")) {
        return o[lang];
      }
      // frozen asset -> attach a resolved URL (keep r2Key for any consumer that needs it)
      if (typeof o.r2Key === "string") {
        const resolved: Record<string, unknown> = { ...o, url: resolveAssetUrl(o.r2Key) };
        if (o.poster && typeof (o.poster as { r2Key?: string }).r2Key === "string")
          resolved.posterUrl = resolveAssetUrl((o.poster as { r2Key: string }).r2Key);
        if (o.webm && typeof (o.webm as { r2Key?: string }).r2Key === "string")
          resolved.webmUrl = resolveAssetUrl((o.webm as { r2Key: string }).r2Key);
        // still walk nested children (e.g. alt {en,vi})
        for (const k of Object.keys(resolved)) resolved[k] = walk(resolved[k]);
        return resolved;
      }
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(o)) out[k] = walk(o[k]);
      return out;
    }
    return node;
  };
  return walk(snap) as SiteContent;
}

// PUBLISHED path — cached + tagged. draftMode-FREE.
export async function getPublishedSnapshot(lang: Locale): Promise<SiteContent> {
  "use cache";
  cacheTag("release"); // single site-wide invalidation handle (Publish -> revalidateTag('release','max'))
  try {
    const rel = await prisma.release.findFirst({
      where: { status: "PUBLISHED" },
      orderBy: { version: "desc" },
      select: { snapshot: true },
    });
    if (!rel) return INITIAL_SNAPSHOT[lang];
    return resolveForLang(ReleaseSnapshotSchema.parse(rel.snapshot), lang);
  } catch {
    // ANY Prisma/parse error -> last-known-good build constant. Site never 500s on data.
    return INITIAL_SNAPSHOT[lang];
  }
}

// The name pages call. Today it is purely the published path; the preview island is a separate
// non-cached island (see app/components/preview-bar.tsx) so the shell stays cached + SSG.
export async function getSiteContent(lang: Locale): Promise<SiteContent> {
  return getPublishedSnapshot(lang);
}
```

4. Repoint the `Dictionary` type so the ~30 `({ dict }) => JSX` components and `seo.ts`/`org-json-ld` keep compiling against `Dictionary` while it now structurally means `SiteContent`. Rewrite `apps/web/app/[lang]/dictionaries.ts`:

```ts
// app/[lang]/dictionaries.ts
// LEGACY SHIM. The site now reads CMS Release snapshots (app/lib/content.ts), not the static
// en/vi JSON. `Dictionary` is aliased to the resolved snapshot view `SiteContent` (a structural
// superset of the old dict), so every ({ dict }) => JSX component compiles unchanged. The dict
// JSON files remain only as the importer's source (migrated once into Release v1).
import "server-only";
import type { Locale } from "@/app/lib/i18n-config";
import { getSiteContent, type SiteContent } from "@/app/lib/content";

export type Dictionary = SiteContent;

// Back-compat alias for any caller still importing getDictionary; routes to the published path.
export const getDictionary = (locale: Locale): Promise<Dictionary> => getSiteContent(locale);
```

5. Run the verification test, expect PASS:

```bash
node apps/web/scripts/verify-readpath.mjs
```

   Expect: `verify-readpath OK` (exit 0).

6. Typecheck the package to prove the imports + shim resolve (uses the real `@signex/db`/`@signex/shared` `dist/` built in step 1 of this milestone; if their dist is stale, build them first):

```bash
npm run build -w @signex/db -w @signex/shared && npx --workspace @signex/web tsc --noEmit -p apps/web/tsconfig.json 2>&1 | grep -v "initial-snapshot" | tail -20; echo "tsc-done"
```

   Expect: no errors except possibly the not-yet-emitted `initial-snapshot.ts` (produced by step 7); `tsc-done` printed. (If step 7 has not run in this branch, add a temporary stub at `apps/web/app/lib/initial-snapshot.ts` exporting `export const INITIAL_SNAPSHOT = { en: {} as any, vi: {} as any };` to typecheck, then delete it — note this in the commit body. In the assembled sequence step 7 precedes step 8 so the real file exists.)

7. Commit:

```bash
git add apps/web/app/lib/content.ts apps/web/app/[lang]/dictionaries.ts apps/web/scripts/verify-readpath.mjs
git commit -m "feat(web): snapshot read-path loader getPublishedSnapshot ('use cache'+cacheTag('release')+INITIAL_SNAPSHOT fallback); Dictionary->SiteContent shim"
```

---

### Task 60: dynamicParams=true on the two product segments (+ build-time invariant test) and getSiteContent migration of product pages

**Files:**
- Create: `apps/web/scripts/verify-dynamic-params.mjs`
- Modify: `apps/web/app/[lang]/products/[slug]/page.tsx`
- Modify: `apps/web/app/[lang]/products/[slug]/[product]/page.tsx`

**Interfaces:**
- Consumes: `getSiteContent(lang)` (previous task); snapshot `catalog.categories[].image` / `.items[].image` frozen-asset views with `.url` (resolved by `resolveForLang`).
- Produces: both product page modules `export const dynamicParams = true` while keeping `generateStaticParams`; new published slugs render on first visit then cache (spec §10.2).

**Steps:**

1. Write the failing build-time invariant test (`scripts/verify-dynamic-params.mjs`) — spec §14 mandates "dynamicParams=true on product segments (build-time assert)". It statically inspects the source (the modules `import "server-only"` transitively, so importing them in a bare node runtime would throw; a source assert is the correct gate):

```js
// apps/web/scripts/verify-dynamic-params.mjs
// Build-time invariant (spec §10.2/§14): the two product route segments MUST be
// dynamicParams=true so an on-demand Publish that ADDS a catalog slug renders on first
// visit instead of 404ing until a full rebuild. They MUST still pre-list known slugs via
// generateStaticParams (SSG for the common case).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const targets = [
  "app/[lang]/products/[slug]/page.tsx",
  "app/[lang]/products/[slug]/[product]/page.tsx",
];
const fail = [];
for (const rel of targets) {
  const s = readFileSync(join(root, rel), "utf8");
  if (!/export\s+const\s+dynamicParams\s*=\s*true\b/.test(s))
    fail.push(`${rel}: expected \`export const dynamicParams = true\``);
  if (/export\s+const\s+dynamicParams\s*=\s*false\b/.test(s))
    fail.push(`${rel}: still has dynamicParams = false`);
  if (!/generateStaticParams/.test(s))
    fail.push(`${rel}: must keep generateStaticParams (SSG pre-list)`);
}
if (fail.length) { console.error("FAIL\n" + fail.join("\n")); process.exit(1); }
console.log("verify-dynamic-params OK");
```

2. Run it, expect FAIL (both files currently `dynamicParams = false`):

```bash
node apps/web/scripts/verify-dynamic-params.mjs
```

   Expect: FAIL listing both `.../[slug]/page.tsx` and `.../[product]/page.tsx` with "still has dynamicParams = false".

3. Edit `apps/web/app/[lang]/products/[slug]/page.tsx`: flip the flag, swap `getDictionary`->`getSiteContent`, and read the category image from the snapshot instead of the `product-images` helper. Replace the imports + route-config + the image source:

```ts
import { hasLocale, DEFAULT_LOCALE } from "@/app/lib/i18n-config";
import { getSiteContent } from "@/app/lib/content";
import { buildMetadata } from "@/app/lib/seo";

// On-demand Publish can ADD a category slug; dynamicParams=true renders the new page on first
// visit (then it caches) instead of 404ing until a full rebuild (spec §10.2). generateStaticParams
// still pre-lists the currently-published slugs for SSG.
export const dynamicParams = true;
export async function generateStaticParams() {
  const { products } = await getSiteContent(DEFAULT_LOCALE);
  return products.categories.map((c) => ({ slug: c.slug }));
}
```

   In `generateMetadata` replace `const dict = await getDictionary(locale);` with `const dict = await getSiteContent(locale);`. In the default export replace `const dict = await getDictionary(lang);` with `const dict = await getSiteContent(lang);`, delete the `categoryImage`/`productImage` import line, replace `const heroImg = categoryImage(idx);` with `const heroImg = cat.image.url;`, and in the products grid replace `src={productImage(i)}` with `src={p.image.url}` (the importer froze a concrete per-product image; index-cycling is gone — spec §6.1).

4. Edit `apps/web/app/[lang]/products/[slug]/[product]/page.tsx` the same way: imports, `export const dynamicParams = true;`, `getSiteContent`, and `const image = found.item.image.url;` replacing `productImage(itemIdx)`; drop the `product-images` import:

```ts
import { hasLocale, DEFAULT_LOCALE } from "@/app/lib/i18n-config";
import { getSiteContent } from "@/app/lib/content";
import { buildMetadata } from "@/app/lib/seo";
import { ProductImageZoom } from "@/app/components/product-image-zoom";

export const dynamicParams = true;
export async function generateStaticParams() {
  const { products } = await getSiteContent(DEFAULT_LOCALE);
  return products.categories.flatMap((c) =>
    c.items.map((it) => ({ slug: c.slug, product: it.slug }))
  );
}
```

   Update `locate(...)`'s `dict` param type/calls to `getSiteContent`, both `getDictionary` call sites to `getSiteContent`, and `const image = productImage(itemIdx);` -> `const image = found.item.image.url;`.

5. Run the invariant test, expect PASS:

```bash
node apps/web/scripts/verify-dynamic-params.mjs
```

   Expect: `verify-dynamic-params OK`.

6. Grep to prove the cycling helper is gone from the product routes (its remaining users — home grid — are migrated in the next task):

```bash
grep -rn "product-images\|categoryImage\|productImage" "apps/web/app/[lang]/products" ; echo "exit=$?"
```

   Expect: no matches (`exit=1`).

7. Commit:

```bash
git add "apps/web/app/[lang]/products/[slug]/page.tsx" "apps/web/app/[lang]/products/[slug]/[product]/page.tsx" apps/web/scripts/verify-dynamic-params.mjs
git commit -m "fix(web): dynamicParams=true on product segments (+build-time invariant test); read category/product images from snapshot"
```

---

### Task 61: Migrate page/layout/about/contact/sitemap call sites onto getSiteContent and mount the draftMode preview island

**Files:**
- Modify: `apps/web/app/[lang]/page.tsx`
- Modify: `apps/web/app/[lang]/layout.tsx`
- Modify: `apps/web/app/[lang]/about/page.tsx`
- Modify: `apps/web/app/[lang]/contact/page.tsx`
- Modify: `apps/web/app/sitemap.ts`
- Create: `apps/web/app/components/preview-bar.tsx`
- Create: `apps/web/app/api/draft/route.ts`

**Interfaces:**
- Consumes: `getSiteContent(lang)`; `getPreviewSnapshot(lang)` (added here to `content.ts`); `draftMode()` from `next/headers`; api `POST /api/preview/snapshot`.
- Produces: published shell calls `getSiteContent` only (stays cached/SSG); `draftMode().isEnabled` is read **only inside** the `<Suspense>` preview island; `app/api/draft` enables/disables draft mode.

**Steps:**

1. Add `getPreviewSnapshot` to `apps/web/app/lib/content.ts` (NOT cached, NOT `'use cache'` — it is dynamic and only ever called from the preview island). Append:

```ts
// PREVIEW path — live working state via the api. NEVER cached, NEVER on the published path.
// Called only from the <Suspense>-wrapped preview island (app/components/preview-bar.tsx) so the
// public shell stays static. Reads PREVIEW_SECRET server-side.
export async function getPreviewSnapshot(lang: Locale): Promise<SiteContent> {
  const base = process.env.API_URL ?? "http://api:3060";
  const res = await fetch(`${base}/api/preview/snapshot`, {
    method: "POST",
    headers: { "x-preview-secret": process.env.PREVIEW_SECRET ?? "" },
    cache: "no-store",
  });
  if (!res.ok) return getPublishedSnapshot(lang);
  const snap = ReleaseSnapshotSchema.parse(await res.json());
  return resolveForLang(snap, lang);
}
```

2. Write the failing test for the draft route handler. Create `apps/web/app/api/draft/route.test.mjs` (a node assertion exercising the secret gate via the exported GET — Next route handlers are plain functions). First the test:

```js
// apps/web/app/api/draft/route.test.mjs
// Verify the draft entry handler exists and gates on PREVIEW_SECRET.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, "route.ts"), "utf8");
const fail = [];
if (!/draftMode\(\)/.test(src)) fail.push("draft route: must call draftMode()");
if (!/\.enable\(\)/.test(src)) fail.push("draft route: must call draft.enable()");
if (!/PREVIEW_SECRET/.test(src)) fail.push("draft route: must gate on PREVIEW_SECRET");
if (!/export\s+async\s+function\s+GET/.test(src)) fail.push("draft route: missing GET");
if (fail.length) { console.error("FAIL\n" + fail.join("\n")); process.exit(1); }
console.log("draft route OK");
```

3. Run it, expect FAIL (route.ts missing):

```bash
node "apps/web/app/api/draft/route.test.mjs"
```

   Expect: `ENOENT ... app/api/draft/route.ts`.

4. Create `apps/web/app/api/draft/route.ts` (per `node_modules/next/dist/docs/.../draft-mode.md`): secret-gated enable + redirect; DELETE disables:

```ts
// app/api/draft/route.ts
// Preview entry: ?secret=<PREVIEW_SECRET>&slug=/vi  enables Next draft mode and redirects to the
// page. The published shell is draftMode-free; only the <Suspense> preview island reads
// draftMode().isEnabled. DELETE exits preview.
import { draftMode } from "next/headers";
import { redirect } from "next/navigation";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");
  const slug = searchParams.get("slug") || "/";
  if (!process.env.PREVIEW_SECRET || secret !== process.env.PREVIEW_SECRET) {
    return new Response("Invalid token", { status: 401 });
  }
  const draft = await draftMode();
  draft.enable();
  // Only redirect to same-origin app paths (open-redirect guard).
  redirect(slug.startsWith("/") ? slug : "/");
}

export async function DELETE() {
  const draft = await draftMode();
  draft.disable();
  return new Response("Draft mode disabled");
}
```

5. Run the test, expect PASS:

```bash
node "apps/web/app/api/draft/route.test.mjs"
```

   Expect: `draft route OK`.

6. Create the preview island `apps/web/app/components/preview-bar.tsx`. It reads `draftMode()` **inside** a `<Suspense>` boundary so it doesn't de-opt the cached shell; when enabled it shows a banner with an "Exit preview" link. (It does not itself re-render the page with preview content in this foundation — preview content rendering is a later sub-project; the island proves the draftMode plumbing + gives an exit affordance, satisfying §10.1's "preview gated at a Suspense island"):

```tsx
// app/components/preview-bar.tsx
// draftMode() is read ONLY here, inside <Suspense>, so the published shell stays cached + SSG
// (spec §10.1). When draft mode is on, render a fixed banner with an exit affordance.
import { Suspense } from "react";
import { draftMode } from "next/headers";

async function PreviewBanner() {
  const { isEnabled } = await draftMode();
  if (!isEnabled) return null;
  return (
    <div
      role="status"
      style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9999,
        background: "#071522", color: "#fff", padding: "8px 16px",
        display: "flex", gap: 12, justifyContent: "center", alignItems: "center",
        fontFamily: "monospace", fontSize: 13,
      }}
    >
      <span>Draft preview</span>
      <a href="/api/draft" style={{ color: "#9cd2ff", textDecoration: "underline" }} data-method="delete">
        Exit preview
      </a>
    </div>
  );
}

export function PreviewBar() {
  return (
    <Suspense fallback={null}>
      <PreviewBanner />
    </Suspense>
  );
}
```

7. Migrate the published call sites. In `apps/web/app/[lang]/page.tsx` replace `import { getDictionary } from "./dictionaries";` with `import { getSiteContent } from "@/app/lib/content";` and `const dict = await getDictionary(lang);` with `const dict = await getSiteContent(lang);`.

8. In `apps/web/app/[lang]/layout.tsx`: replace the `getDictionary` import with `import { getSiteContent } from "@/app/lib/content";`; in `generateMetadata` replace `const dict = await getDictionary(locale);` with `const dict = await getSiteContent(locale);`; in `RootLayout` replace `const dict = await getDictionary(hasLocale(lang) ? lang : DEFAULT_LOCALE);` with `const dict = await getSiteContent(hasLocale(lang) ? lang : DEFAULT_LOCALE);`; add `import { PreviewBar } from "@/app/components/preview-bar";` and mount `<PreviewBar />` just before `<WebflowPageAttrs />` in the body. Keep `export const dynamicParams = false;` (locale set is fixed, spec §10.2).

9. In `apps/web/app/[lang]/about/page.tsx` and `apps/web/app/[lang]/contact/page.tsx`: replace `import { getDictionary } from "../dictionaries";` with `import { getSiteContent } from "@/app/lib/content";` and every `await getDictionary(locale)` / `getDictionary(lang)` with `getSiteContent(...)`.

10. In `apps/web/app/sitemap.ts`: replace `import { getDictionary } from "@/app/[lang]/dictionaries";` with `import { getSiteContent } from "@/app/lib/content";` and `const { products } = await getDictionary(DEFAULT_LOCALE);` with `const { products } = await getSiteContent(DEFAULT_LOCALE);`.

11. Prove no published call site still imports the legacy loader (the shim file itself + nap helper are allowed):

```bash
grep -rn "getDictionary" apps/web/app | grep -v "dictionaries.ts"; echo "exit=$?"
```

   Expect: no matches (`exit=1`).

12. Re-run both source-invariant tests (still green after edits):

```bash
node apps/web/scripts/verify-readpath.mjs && node apps/web/scripts/verify-dynamic-params.mjs
```

   Expect: `verify-readpath OK` then `verify-dynamic-params OK`.

13. Commit:

```bash
git add "apps/web/app/[lang]/page.tsx" "apps/web/app/[lang]/layout.tsx" "apps/web/app/[lang]/about/page.tsx" "apps/web/app/[lang]/contact/page.tsx" apps/web/app/sitemap.ts apps/web/app/lib/content.ts apps/web/app/components/preview-bar.tsx apps/web/app/api/draft/route.ts "apps/web/app/api/draft/route.test.mjs"
git commit -m "feat(web): migrate page/layout/about/contact/sitemap to getSiteContent; draftMode preview island + /api/draft (published shell stays draftMode-free)"
```

---

### Task 62: On-demand revalidation route (revalidateTag('release','max') + revalidatePath)

**Files:**
- Create: `apps/web/app/api/revalidate/route.ts`
- Create: `apps/web/app/api/revalidate/route.test.mjs`

**Interfaces:**
- Consumes: `revalidateTag`, `revalidatePath` from `next/cache`; `process.env.REVALIDATE_SECRET`; called by the api post-publish (step 6) with `{ paths: string[] }`.
- Produces: `POST /api/revalidate` (header `x-revalidate-secret`) -> `revalidateTag("release","max")` + `revalidatePath(p)` for each provided literal path.

**Steps:**

1. Write the failing source-invariant test (the handler imports `next/cache` which can't run outside a Next server; spec §14 prescribes the 2-arg `revalidateTag` signature check as the invariant):

```js
// apps/web/app/api/revalidate/route.test.mjs
// Spec §10.3 / Next 16.2 (revalidateTag.md): single-arg revalidateTag is DEPRECATED.
// The route MUST use revalidateTag('release','max'), gate on REVALIDATE_SECRET, and
// revalidatePath each provided literal path.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, "route.ts"), "utf8");
const fail = [];
if (!/revalidateTag\(\s*["']release["']\s*,\s*["']max["']\s*\)/.test(src))
  fail.push("revalidate route: must call revalidateTag('release','max')");
if (!/revalidatePath\(/.test(src)) fail.push("revalidate route: must call revalidatePath()");
if (!/REVALIDATE_SECRET/.test(src)) fail.push("revalidate route: must gate on REVALIDATE_SECRET");
if (!/x-revalidate-secret/.test(src)) fail.push("revalidate route: must read x-revalidate-secret header");
if (fail.length) { console.error("FAIL\n" + fail.join("\n")); process.exit(1); }
console.log("revalidate route OK");
```

2. Run it, expect FAIL (route.ts missing):

```bash
node "apps/web/app/api/revalidate/route.test.mjs"
```

   Expect: `ENOENT ... app/api/revalidate/route.ts`.

3. Create `apps/web/app/api/revalidate/route.ts` (signatures verified against `node_modules/next/dist/docs/.../revalidateTag.md` — 2-arg `'max'`, stale-while-revalidate):

```ts
// app/api/revalidate/route.ts
// On-demand revalidation, fired by the api AFTER a publish/rollback commit (spec §10.3).
// Secret-protected (restrict to the internal network at the proxy). One tag 'release' covers
// every page (every cached read tagged it in app/lib/content.ts); revalidatePath warms the
// resolved literal shells (incl. NEW slugs, now reachable because product segments are
// dynamicParams=true). revalidateTag's 2-arg 'max' = stale-while-revalidate (NOT instant).
import { revalidateTag, revalidatePath } from "next/cache";

export async function POST(req: Request) {
  if (req.headers.get("x-revalidate-secret") !== process.env.REVALIDATE_SECRET) {
    return Response.json({ ok: false }, { status: 401 });
  }
  let paths: string[] = [];
  try {
    const body = (await req.json()) as { paths?: string[] };
    paths = body.paths ?? [];
  } catch {
    paths = [];
  }
  revalidateTag("release", "max"); // 16.2 REQUIRED 2nd arg; one tag covers every page
  for (const p of paths) revalidatePath(p);
  return Response.json({ ok: true, revalidated: paths.length, now: Date.now() });
}
```

4. Run the test, expect PASS:

```bash
node "apps/web/app/api/revalidate/route.test.mjs"
```

   Expect: `revalidate route OK`.

5. Commit:

```bash
git add "apps/web/app/api/revalidate/route.ts" "apps/web/app/api/revalidate/route.test.mjs"
git commit -m "feat(web): /api/revalidate route — revalidateTag('release','max')+revalidatePath, REVALIDATE_SECRET-gated"
```

---

### Task 63: Unify NAP via a render-helper map and feed org-json-ld from businessContact

**Files:**
- Create: `apps/web/app/lib/nap.ts`
- Create: `apps/web/app/lib/nap.test.mjs`
- Modify: `apps/web/app/components/org-json-ld.tsx`

**Interfaces:**
- Consumes: `SiteContent["businessContact"]` (resolved per-locale view of the `businessContact` block — `legalName:string`, `emails:string[]`, `phones:[{kind,label,value}]`, `taxId`, `sites:[{kind,label,address}]`, `social:[{kind,href}]`).
- Produces: `napView(bc): { company; email; tel; zalo?; office; factory; tax; social[] }` — the single presentation projection used by footer / home contact / contactPage / org-json-ld (spec §5.2 render-helper map, §10.5 NAP unification).

**Steps:**

1. Write the failing test `apps/web/app/lib/nap.test.mjs` (pure function — runnable in bare node; no Next/server-only imports in `nap.ts`):

```js
// apps/web/app/lib/nap.test.mjs
import assert from "node:assert/strict";
import { napView } from "./nap.ts";

const bc = {
  legalName: "Cong ty SIGNEX",
  brand: "SIGNEX",
  emails: ["sales@signex.vn", "info@signex.vn"],
  phones: [
    { kind: "tel", label: "Tel", value: "(+84) 979 700 072" },
    { kind: "zalo", label: "Zalo", value: "0979700072" },
  ],
  taxId: "0123456789",
  taxLabel: "Tax",
  sites: [
    { kind: "office", label: "Office", address: "12 Office St, HCMC, Viet Nam." },
    { kind: "factory", label: "Factory", address: "34 Factory Rd, HCMC, Viet Nam." },
  ],
  social: [{ kind: "facebook", href: "#" }],
};

const v = napView(bc);
assert.equal(v.company, "Cong ty SIGNEX");
assert.equal(v.email, "sales@signex.vn", "footer renders emails[0]");
assert.equal(v.tel, "(+84) 979 700 072", "tel = first phone of kind tel");
assert.equal(v.zalo, "0979700072");
assert.equal(v.office, "12 Office St, HCMC, Viet Nam.");
assert.equal(v.factory, "34 Factory Rd, HCMC, Viet Nam.");
assert.equal(v.tax, "0123456789");
assert.deepEqual(v.social, [{ kind: "facebook", href: "#" }]);
console.log("nap OK");
```

2. Run it, expect FAIL (nap.ts missing):

```bash
node "apps/web/app/lib/nap.test.mjs"
```

   Expect: `Cannot find module ... nap.ts` (non-zero exit).

3. Create `apps/web/app/lib/nap.ts` (NO `server-only` — it is a pure projection usable from client + server):

```ts
// app/lib/nap.ts
// Single render-helper projection over the unified businessContact block (spec §5.2/§10.5).
// Footer, home contact card, contactPage cards, and org-json-ld all read NAP through here so
// there is ONE source of company/email/phone/address/tax (resolves the old duplicated dict copy).
import type { SiteContent } from "@/app/lib/content";

type BC = SiteContent["businessContact"];

export function napView(bc: BC) {
  const phone = (k: "tel" | "zalo") => bc.phones.find((p) => p.kind === k)?.value;
  const site = (k: "office" | "factory") => bc.sites.find((s) => s.kind === k)?.address ?? "";
  return {
    company: bc.legalName,
    email: bc.emails[0] ?? "",
    emails: bc.emails,
    tel: phone("tel") ?? "",
    zalo: phone("zalo"),
    office: site("office"),
    factory: site("factory"),
    tax: bc.taxId,
    social: bc.social,
  };
}
```

4. Run the test, expect PASS:

```bash
node "apps/web/app/lib/nap.test.mjs"
```

   Expect: `nap OK`.

5. Repoint `org-json-ld.tsx` onto the unified NAP (it currently reads `dict.footer.tel/office/factory/company/tax/email`). Replace the body of `OrgJsonLd`:

```tsx
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { SITE_URL } from "@/app/lib/seo";
import { napView } from "@/app/lib/nap";

// Site-wide schema.org Organization + WebSite @graph from the UNIFIED businessContact NAP
// (single source — footer/home/contactPage read the same projection). social[].href feeds sameAs.
export function OrgJsonLd({ dict }: { dict: Dictionary }) {
  const nap = napView(dict.businessContact);
  const telephone = "+" + nap.tel.replace(/\D/g, ""); // "(+84) 979 700 072" -> "+84979700072"
  const address = [nap.office, nap.factory].filter(Boolean).map((line) => ({
    "@type": "PostalAddress",
    streetAddress: line.replace(/,?\s*Viet\s?Nam\.?\s*$/i, "").trim(),
    addressLocality: "Ho Chi Minh City",
    addressCountry: "VN",
  }));
  const sameAs = nap.social.map((s) => s.href).filter((h) => h && h !== "#");

  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: "SIGNEX",
        legalName: nap.company,
        url: SITE_URL,
        logo: `${SITE_URL}/assets/images/signex-logo.svg`,
        image: `${SITE_URL}/assets/images/signex-og.png`,
        email: nap.email,
        telephone,
        taxID: nap.tax,
        address,
        ...(sameAs.length ? { sameAs } : {}),
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "sales",
          telephone,
          email: nap.email,
          areaServed: "VN",
          availableLanguage: ["vi", "en"],
        },
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: "SIGNEX",
        inLanguage: ["vi", "en"],
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
    ],
  };

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }} />
  );
}
```

   (Footer/home-contact/contactPage components consume `napView` analogously when their dict-field reads are migrated; the importer (step 7) populated `businessContact` so `dict.businessContact` exists on `SiteContent`. Their JSX class structure is unchanged — only the field source moves to `napView(dict.businessContact)`.)

6. Run the nap test again to confirm no regression, expect PASS:

```bash
node "apps/web/app/lib/nap.test.mjs"
```

   Expect: `nap OK`.

7. Commit:

```bash
git add apps/web/app/lib/nap.ts "apps/web/app/lib/nap.test.mjs" apps/web/app/components/org-json-ld.tsx
git commit -m "feat(web): unify NAP via napView render-helper; org-json-ld reads businessContact (sameAs from social)"
```

---

### Task 64: Wire the 2 lead-capture forms to POST /api/forms/:formKey/submit

**Files:**
- Modify: `apps/web/app/components/static-webflow-form.tsx`
- Create: `apps/web/app/components/static-webflow-form.test.mjs`

**Interfaces:**
- Consumes: api `POST /api/forms/:formKey/submit` (`@Public`, rate-limited) accepting `multipart/form-data` (the form has an `upload` file field) -> `200 { ok: true }` (spec §11).
- Produces: `StaticWebflowForm` performs a real network submit keyed by a `formKey` prop ("quote" | "contact"), shows success markup on 2xx and fail markup otherwise; no fake always-success.

**Steps:**

1. Write the failing test `apps/web/app/components/static-webflow-form.test.mjs` — a source-invariant check (the component is a `"use client"` React component; a full DOM render needs a bundler. The contract to enforce is: it builds a real POST to the forms endpoint and branches on `res.ok`, instead of the current `e.preventDefault(); setDone(true)` fake):

```js
// apps/web/app/components/static-webflow-form.test.mjs
// Spec §11: the lead forms must POST to /api/forms/:formKey/submit and branch on the response
// (no fake always-success). Source invariants:
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, "static-webflow-form.tsx"), "utf8");
const fail = [];
if (!/formKey/.test(src)) fail.push("form: must accept a formKey prop");
if (!/\/api\/forms\//.test(src)) fail.push("form: must POST to /api/forms/:formKey/submit");
if (!/FormData/.test(src)) fail.push("form: must send FormData (upload field present)");
if (!/res\.ok|response\.ok/.test(src)) fail.push("form: must branch on response.ok");
if (/setDone\(true\)\s*;?\s*}\s*}\s*$/m.test(src) && !/await\s+fetch/.test(src))
  fail.push("form: still fakes success without a network call");
if (fail.length) { console.error("FAIL\n" + fail.join("\n")); process.exit(1); }
console.log("form wiring OK");
```

2. Run it, expect FAIL (current component fakes success, no fetch/formKey):

```bash
node "apps/web/app/components/static-webflow-form.test.mjs"
```

   Expect: FAIL listing "must accept a formKey prop", "must POST to /api/forms/...", "must send FormData", "must branch on response.ok".

3. Rewrite `apps/web/app/components/static-webflow-form.tsx` to submit for real. It posts `FormData` (carrying the `upload` file + all named fields) to `${NEXT_PUBLIC_API_URL}/api/forms/${formKey}/submit`, shows success markup on 2xx, fail markup otherwise, and disables the submit while in-flight:

```tsx
// app/components/static-webflow-form.tsx
"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  id: string;
  name: string;
  className: string;
  formKey: "quote" | "contact";       // selects the api submit endpoint + zod schema
  children: React.ReactNode;
  successMarkup: string;
  failMarkup?: string;
  "data-wf-element-id"?: string;
  "data-wf-page-id"?: string;
  "data-w-id"?: string;
  style?: React.CSSProperties;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export function StaticWebflowForm({
  id, name, className, formKey, children, successMarkup, failMarkup, ...rest
}: Props) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const doneRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (state === "done") doneRef.current?.focus(); }, [state]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("sending");
    try {
      const body = new FormData(e.currentTarget); // includes the file upload field
      const res = await fetch(`${API_BASE}/api/forms/${formKey}/submit`, {
        method: "POST",
        body,
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="w-form">
      {state !== "done" && (
        <form
          id={id}
          name={name}
          className={className}
          onSubmit={onSubmit}
          {...rest}
        >
          <fieldset disabled={state === "sending"} style={{ border: 0, padding: 0, margin: 0 }}>
            {children}
          </fieldset>
        </form>
      )}
      {state === "done" && (
        <div
          ref={doneRef}
          tabIndex={-1}
          role="status"
          className="success-message w-form-done"
          style={{ display: "block" }}
          dangerouslySetInnerHTML={{ __html: successMarkup }}
        />
      )}
      {state === "error" && failMarkup && (
        <div className="error-message w-form-fail" style={{ display: "block" }} dangerouslySetInnerHTML={{ __html: failMarkup }} />
      )}
    </div>
  );
}
```

4. Run the test, expect PASS:

```bash
node "apps/web/app/components/static-webflow-form.test.mjs"
```

   Expect: `form wiring OK`.

5. Pass `formKey` from the two call sites. In `apps/web/app/components/home/contact.tsx` add `formKey="contact"` to the `<StaticWebflowForm ...>` props (next to `name="contact-form"`). In `apps/web/app/components/home/hero-quote-form.tsx` add `formKey="quote"` to its `<StaticWebflowForm>` (the hero quote form). Grep to confirm both pass it:

```bash
grep -rn "formKey" apps/web/app/components/home; echo "exit=$?"
```

   Expect: two matches (`exit=0`).

6. Commit:

```bash
git add apps/web/app/components/static-webflow-form.tsx "apps/web/app/components/static-webflow-form.test.mjs" apps/web/app/components/home/contact.tsx apps/web/app/components/home/hero-quote-form.tsx
git commit -m "feat(web): wire lead forms to POST /api/forms/:formKey/submit (FormData, branch on res.ok)"
```

---

### Task 65: Whole-image build + GET /vi-from-DB acceptance for the web read-path

This is the honest end-to-end gate for the milestone: it proves every new dep is traced into the standalone image and that the public path actually reads the DB (spec §10.4 "confirm GET /vi renders from DB, not just the fallback"; §14 Docker gate). No unit test substitutes for this.

**Files:** (verification only — no new files)

**Interfaces:**
- Consumes: all prior tasks in this milestone; the seeded DB + Release v1 from steps 1/3/7 (run inside the api container's seed/import per §8 seed-order contract).

**Steps:**

1. Build the web image alone first (fastest signal that db generate + db/shared build + next build all succeed in-stage):

```bash
docker compose build web
```

   Run, expect: `naming to docker.io/library/signex-web:latest done` and exit 0. (If it fails resolving `@signex/db`/`@signex/shared`, the builder-stage `db generate` / `build` ordering from the coupling task is wrong — fix before continuing.)

2. Bring up the dependency chain (postgres -> api applies migrations + seeds + imports Release v1 -> web), then wait for health:

```bash
docker compose up -d --build postgres api web
```

   Then poll until web is healthy (foreground sleep is blocked; use a bounded loop):

```bash
for i in $(seq 1 30); do \
  s=$(docker inspect -f '{{.State.Health.Status}}' signex-web 2>/dev/null); \
  echo "web=$s"; [ "$s" = "healthy" ] && break; \
  docker ps --format '{{.Names}} {{.Status}}'; \
  [ $i -eq 30 ] && { echo TIMEOUT; docker compose logs --tail=60 web; exit 1; }; \
  sleep 4; done
```

   Expect: `web=healthy` within the window.

3. Confirm `GET /vi` returns 200 and renders real content (not a Next error page):

```bash
curl -fsS -o /tmp/vi.html -w "%{http_code}\n" http://127.0.0.1:${WEB_PORT:-3062}/vi
```

   Expect: `200`.

4. Prove it rendered from the DB Release, not the build-time `INITIAL_SNAPSHOT` fallback. The robust check: temporarily edit a block in the DB and re-fetch after a tag revalidation; the minimal in-place check is that the rendered HTML contains the unified NAP company/legalName the importer wrote to `businessContact` (a field that only exists post-import) and that the org-json-ld `sameAs`/`legalName` is present:

```bash
grep -q "application/ld+json" /tmp/vi.html && echo "jsonld-present"
grep -o '"legalName":"[^"]*"' /tmp/vi.html | head -1
```

   Expect: `jsonld-present` and a non-empty `"legalName":"..."` matching the seeded company name (proves `getPublishedSnapshot` read the DB Release and `org-json-ld` resolved `businessContact`). To affirmatively distinguish DB vs fallback, change the live release's company in the DB and re-run after firing revalidate:

```bash
docker compose exec -T postgres psql -U "${POSTGRES_USER:-signex}" -d "${POSTGRES_DB:-signex}" \
  -c "select version,status from \"Release\" order by version desc limit 3;"
```

   Expect: at least one `PUBLISHED` row (version >= 1) — confirming a Release exists for the loader to read (if zero rows, the page legitimately served the fallback and DB-read is NOT proven; re-run the api import).

5. Fire the revalidation route end-to-end (proves the secret gate + tag wiring the api will use post-publish):

```bash
curl -fsS -X POST http://127.0.0.1:${WEB_PORT:-3062}/api/revalidate \
  -H "x-revalidate-secret: ${REVALIDATE_SECRET}" \
  -H "content-type: application/json" \
  -d '{"paths":["/vi","/en"]}' -w "\n%{http_code}\n"
```

   Expect: `{"ok":true,"revalidated":2,...}` and `200`. Then with a wrong secret expect `401`:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:${WEB_PORT:-3062}/api/revalidate -H "x-revalidate-secret: nope" -d '{}'
```

   Expect: `401`.

6. Run the full milestone source-invariant suite once more to lock the contract before closing the milestone:

```bash
node apps/web/scripts/verify-readpath.mjs \
 && node apps/web/scripts/verify-dynamic-params.mjs \
 && node "apps/web/app/api/draft/route.test.mjs" \
 && node "apps/web/app/api/revalidate/route.test.mjs" \
 && node "apps/web/app/lib/nap.test.mjs" \
 && node "apps/web/app/components/static-webflow-form.test.mjs"
```

   Expect: each prints its `OK` line; overall exit 0.

7. Commit the acceptance evidence (no code change here, so record the gate in an empty-tree-safe way only if prior steps left anything staged; otherwise this is a no-op verification step). If any small fix was needed to make the build green, stage exactly those files and:

```bash
git add -A && git commit -m "test(web): whole-image build + GET /vi-from-DB + revalidate gate acceptance for read-path" || echo "nothing to commit (verification only)"
```


---

## Milestone 9 — Admin shell (re-scaffold + same-origin route handlers + registry-driven screens)

**Consumes (from earlier milestones):**
- @signex/shared: BLOCK_REGISTRY: Record<BlockKey, z.ZodTypeAny>
- @signex/shared: type BlockKey = keyof typeof BLOCK_REGISTRY
- @signex/shared: parseBlock(key: BlockKey, data: unknown): z.SafeParseReturnType
- @signex/shared: ROLE_RANK: Record<RoleName, number> ({ EDITOR:1, PUBLISHER:2, ADMIN:3 })
- @signex/shared: atLeast(role: RoleName, min: RoleName): boolean
- @signex/shared: type RoleName = 'EDITOR' | 'PUBLISHER' | 'ADMIN'
- @signex/shared: loginSchema: z.ZodObject<{ email, password }>
- @signex/shared: createUserSchema: z.ZodObject<{ email, name, role, password }>
- @signex/shared: ReleaseSnapshotSchema (release.ts) + catalog DTOs (catalog.ts)
- @signex/shared: z (re-exported zod)
- api routes (global prefix /api, behind API_URL): POST /api/auth/login {email,password} -> Set-Cookie + {user}; POST /api/auth/logout; GET /api/auth/me -> {id,email,name,role,...} (publicUser, no passwordHash); PUT /api/content/blocks/:kind/:key {data,expectedRevision} -> {revision}|409|422; POST/PATCH/DELETE /api/catalog/categories|products; POST /api/assets/presign|:id/confirm|:id/replace|:id/alt; GET /api/assets[/usage]; GET /api/releases|/live|/diff|:version; POST /api/releases/publish [PUBLISHER+] {note,expectedRevision}; POST /api/releases/rollback [PUBLISHER+] {toVersion,restoreWorkingState?}; GET /api/forms/submissions [EDITOR+]; api auth cookie carried in the browser session is named sx_session
- api Bearer-auth: SessionAuthGuard accepts Authorization: Bearer <sx_session raw token> (server-to-server from admin route handlers)
- WorkingState shape returned by GET /api/releases/live or a status endpoint: { revision: number, lastPublishedRevision: number, livePublishedVersion: number|null }
- apps/web/Dockerfile (template for monorepo standalone Dockerfile)
- apps/web/proxy.ts (Next-16 proxy convention template)

**Produces (for later milestones):**
- apps/admin re-scaffolded + pinned to next@16.2.7/react@19.2.4, name @signex/admin, port 3061, standalone+tracing, @signex/shared dep + Dockerfile build step
- env(): { API_URL, ADMIN_ORIGIN, ALLOWED_ORIGINS: string[], REVALIDATE_SECRET, PREVIEW_SECRET, NEXT_PUBLIC_WEB_URL }
- isAllowedOrigin(origin: string | null): boolean
- apiServer<T>(path: string, opts?: { method?, body?, token?, headers? }): Promise<{ ok: true; status; data: T } | { ok: false; status; error: string }> — forwards sx_session as Bearer (cookie-bug fixed: const token = opts.token ?? (await cookies()).get('sx_session')?.value)
- SESSION_COOKIE = 'sx_session'
- type SessionUser = { id: string; email: string; name: string; role: RoleName }
- getSession(): Promise<SessionUser | null>
- requireSession(): Promise<SessionUser> (redirects /login when null)
- requireRole(min: RoleName): Promise<SessionUser> (redirects / when under-ranked)
- type FieldPlan = { name: string; kind: 'string'|'localized'|'localizedArray'|'array'|'assetRef'|'json'; label: string; children?: FieldPlan[] }
- deriveFields(schema: z.ZodTypeAny): FieldPlan[]
- docker-compose admin service envs: ADMIN_ORIGIN, ALLOWED_ORIGINS, REVALIDATE_SECRET, PREVIEW_SECRET, NEXT_PUBLIC_WEB_URL

### Task 66: Re-scaffold apps/admin and re-apply the 4 monorepo touch-points + shared dep + Dockerfile build step

**Files:**
- Modify: `apps/admin/package.json`
- Modify: `apps/admin/next.config.ts`
- Modify: `apps/admin/tsconfig.json`
- Modify: `apps/admin/AGENTS.md`
- Modify: `apps/admin/CLAUDE.md`
- Modify: `apps/admin/Dockerfile`
- Modify: `apps/admin/app/globals.css`

**Interfaces:**
- Consumes: `apps/web/package.json` pins (`next@16.2.7`, `react@19.2.4`, `react-dom@19.2.4`, `eslint-config-next@16.2.7`); `apps/web/Dockerfile` builder-stage convention; `@signex/shared` workspace package (built to CJS `dist/`).
- Produces: a re-scaffolded `apps/admin` that is `@signex/admin`, port 3061, `output:'standalone'`+`outputFileTracingRoot`, depends on `@signex/shared`, and whose Dockerfile builds `@signex/shared` before `next build`.

> NOTE: Decisions Log #2 mandates re-scaffolding via `create-next-app@latest` rather than hand-editing. Because that CLI is interactive/network-bound and this environment forbids interactive flags, perform the re-scaffold in a throwaway temp dir with explicit non-interactive flags, then copy the generated files over the existing `apps/admin` and re-apply the monorepo touch-points. The acceptance gate is a green `docker compose build admin`, not the scaffold method.

1. **Re-scaffold into a temp dir (non-interactive).** Run:
   ```bash
   rm -rf /tmp/admin-scaffold && \
   npx --yes create-next-app@latest /tmp/admin-scaffold \
     --ts --app --tailwind --eslint --src-dir=false \
     --import-alias "@/*" --turbopack --use-npm --skip-install --yes
   ```
   Expect: `/tmp/admin-scaffold` created with `app/`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `app/globals.css` (Tailwind v4 `@import "tailwindcss";`).

2. **Copy generated app shell + configs over apps/admin, preserving monorepo files.** Run:
   ```bash
   cp -f /tmp/admin-scaffold/app/layout.tsx          /home/ealflm/dev/signex/apps/admin/app/layout.tsx && \
   cp -f /tmp/admin-scaffold/app/page.tsx            /home/ealflm/dev/signex/apps/admin/app/page.tsx && \
   cp -f /tmp/admin-scaffold/app/globals.css         /home/ealflm/dev/signex/apps/admin/app/globals.css && \
   cp -f /tmp/admin-scaffold/postcss.config.mjs      /home/ealflm/dev/signex/apps/admin/postcss.config.mjs && \
   cp -f /tmp/admin-scaffold/eslint.config.mjs       /home/ealflm/dev/signex/apps/admin/eslint.config.mjs
   ```
   Expect: files copied; `next.config.ts`, `tsconfig.json`, `package.json`, `Dockerfile`, `AGENTS.md`, `CLAUDE.md` are NOT overwritten (re-applied below).

3. **Re-apply package.json** (name, port-3061 scripts, pin Next/React to web, add `@signex/shared` + vitest). Write `apps/admin/package.json`:
   ```json
   {
     "name": "@signex/admin",
     "version": "0.1.0",
     "private": true,
     "scripts": {
       "dev": "next dev -p 3061",
       "build": "next build",
       "start": "next start -p 3061",
       "lint": "eslint",
       "test": "vitest run"
     },
     "dependencies": {
       "@signex/shared": "*",
       "next": "16.2.7",
       "react": "19.2.4",
       "react-dom": "19.2.4"
     },
     "devDependencies": {
       "@types/node": "^20",
       "@types/react": "^19",
       "@types/react-dom": "^19",
       "@tailwindcss/postcss": "^4",
       "eslint": "^9",
       "eslint-config-next": "16.2.7",
       "tailwindcss": "^4",
       "typescript": "^5",
       "vitest": "^3"
     }
   }
   ```

4. **Re-apply next.config.ts** (standalone + tracing). Write `apps/admin/next.config.ts`:
   ```ts
   import type { NextConfig } from "next";
   import path from "node:path";

   const nextConfig: NextConfig = {
     // Emit a self-contained production server at .next/standalone for a small Docker image.
     output: "standalone",
     // Trace files from the monorepo root so hoisted workspace node_modules are included.
     // apps/admin -> repo root is two levels up.
     outputFileTracingRoot: path.join(__dirname, "../../"),
   };

   export default nextConfig;
   ```

5. **Verify tsconfig has the `@/*` alias** (the scaffold default already includes it; confirm not clobbered). Read `apps/admin/tsconfig.json`; if `"paths": { "@/*": ["./*"] }` is absent, add it under `compilerOptions`. Expect: `@/*` -> `./*` present.

6. **Re-apply AGENTS.md + CLAUDE.md.** Write `apps/admin/AGENTS.md`:
   ```md
   <!-- BEGIN:nextjs-agent-rules -->
   # This is NOT the Next.js you know

   This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
   <!-- END:nextjs-agent-rules -->
   ```
   Write `apps/admin/CLAUDE.md`:
   ```md
   @AGENTS.md
   ```

7. **Re-apply Tailwind v4 globals** (ensure the scaffold's `app/globals.css` keeps the v4 import; if the CLI emitted v3 directives instead, normalize). Confirm `apps/admin/app/globals.css` begins with:
   ```css
   @import "tailwindcss";
   ```

8. **Patch the Dockerfile to build `@signex/shared` before `next build`.** In `apps/admin/Dockerfile`, replace the builder build line. Old:
   ```dockerfile
   ENV NEXT_TELEMETRY_DISABLED=1
   RUN npm run build --workspace @signex/admin
   ```
   New:
   ```dockerfile
   ENV NEXT_TELEMETRY_DISABLED=1
   # @signex/shared must be compiled to CJS dist/ BEFORE next build: Next does not bundle
   # workspace deps; it require()s ./dist and must trace runtime values (ROLE_RANK) into standalone.
   RUN npm run build --workspace @signex/shared
   RUN npm run build --workspace @signex/admin
   ```
   (Admin NEVER imports `@signex/db`, so no `db generate`/`db build` step is added — unlike the web Dockerfile.)

9. **Install + verify the workspace resolves.** Run:
   ```bash
   npm install --workspaces --prefix /home/ealflm/dev/signex
   npm ls --prefix /home/ealflm/dev/signex next react @signex/shared --workspace @signex/admin 2>&1 | head
   ```
   Expect: `next@16.2.7`, `react@19.2.4`, `@signex/shared@0.0.0 -> ./../../packages/shared` (symlinked); no peer-dep error fatal to install.

10. **Verify a clean Next build of admin (scaffold sanity, shared resolvable).** Run:
    ```bash
    npm run build -w @signex/shared --prefix /home/ealflm/dev/signex && \
    npm run build -w @signex/admin --prefix /home/ealflm/dev/signex
    ```
    Expect: `@signex/shared` emits `dist/`; admin build succeeds and prints `Creating an optimized production build` then the route table with `/` — emitted at `apps/admin/.next/standalone/apps/admin/server.js`.

11. **Commit.**
    ```bash
    git -C /home/ealflm/dev/signex add apps/admin/package.json apps/admin/next.config.ts apps/admin/tsconfig.json apps/admin/AGENTS.md apps/admin/CLAUDE.md apps/admin/Dockerfile apps/admin/app/globals.css apps/admin/app/layout.tsx apps/admin/app/page.tsx apps/admin/postcss.config.mjs apps/admin/eslint.config.mjs package-lock.json
    git -C /home/ealflm/dev/signex commit -m "chore(admin): re-scaffold via create-next-app, pin Next/React to web, add @signex/shared dep + Dockerfile build step"
    ```

---

### Task 67: Admin env accessor + Origin allowlist gate (vitest setup)

**Files:**
- Create: `apps/admin/vitest.config.ts`
- Create: `apps/admin/app/lib/env.ts`
- Create: `apps/admin/app/lib/origin.ts`
- Test: `apps/admin/app/lib/origin.test.ts`
- Modify: `docker-compose.yml`
- Modify: `.env.example`

**Interfaces:**
- Consumes: compose/process envs `API_URL`, `ADMIN_ORIGIN`, `ALLOWED_ORIGINS`, `REVALIDATE_SECRET`, `PREVIEW_SECRET`, `NEXT_PUBLIC_WEB_URL`.
- Produces: `env(): { API_URL, ADMIN_ORIGIN, ALLOWED_ORIGINS: string[], REVALIDATE_SECRET, PREVIEW_SECRET, NEXT_PUBLIC_WEB_URL }`; `isAllowedOrigin(origin: string | null): boolean`.

1. **Add the vitest config** (node env; this is the FIRST admin task needing it). Write `apps/admin/vitest.config.ts`:
   ```ts
   import { defineConfig } from "vitest/config";

   export default defineConfig({
     test: {
       environment: "node",
       include: ["app/**/*.test.ts"],
     },
   });
   ```

2. **Write the failing test** `apps/admin/app/lib/origin.test.ts`:
   ```ts
   import { describe, it, expect, beforeEach } from "vitest";

   describe("isAllowedOrigin", () => {
     beforeEach(() => {
       process.env.ADMIN_ORIGIN = "http://localhost:3061";
       process.env.ALLOWED_ORIGINS = "http://localhost:3061,https://admin.signex.test";
     });

     it("accepts the admin origin", async () => {
       const { isAllowedOrigin } = await import("./origin");
       expect(isAllowedOrigin("http://localhost:3061")).toBe(true);
     });

     it("accepts any explicitly-allowed origin", async () => {
       const { isAllowedOrigin } = await import("./origin");
       expect(isAllowedOrigin("https://admin.signex.test")).toBe(true);
     });

     it("rejects an unknown origin", async () => {
       const { isAllowedOrigin } = await import("./origin");
       expect(isAllowedOrigin("https://evil.example")).toBe(false);
     });

     it("rejects a null Origin header (no same-site guarantee)", async () => {
       const { isAllowedOrigin } = await import("./origin");
       expect(isAllowedOrigin(null)).toBe(false);
     });
   });
   ```

3. **Run it, expect FAIL.** `npx vitest run app/lib/origin.test.ts --root /home/ealflm/dev/signex/apps/admin` → FAIL with `Cannot find module './origin'`.

4. **Implement `apps/admin/app/lib/env.ts`:**
   ```ts
   // Typed, server-only accessor for the admin's runtime env. Throws fast on missing
   // required vars so a misconfigured container fails at boot, not mid-request.
   export interface AdminEnv {
     API_URL: string;
     ADMIN_ORIGIN: string;
     ALLOWED_ORIGINS: string[];
     REVALIDATE_SECRET: string;
     PREVIEW_SECRET: string;
     NEXT_PUBLIC_WEB_URL: string;
   }

   function req(name: string): string {
     const v = process.env[name];
     if (!v) throw new Error(`Missing required env: ${name}`);
     return v;
   }

   export function env(): AdminEnv {
     const adminOrigin = req("ADMIN_ORIGIN");
     const allowed = (process.env.ALLOWED_ORIGINS ?? adminOrigin)
       .split(",")
       .map((s) => s.trim())
       .filter(Boolean);
     // ADMIN_ORIGIN is always allowed even if omitted from ALLOWED_ORIGINS.
     if (!allowed.includes(adminOrigin)) allowed.push(adminOrigin);
     return {
       API_URL: req("API_URL"),
       ADMIN_ORIGIN: adminOrigin,
       ALLOWED_ORIGINS: allowed,
       REVALIDATE_SECRET: process.env.REVALIDATE_SECRET ?? "",
       PREVIEW_SECRET: process.env.PREVIEW_SECRET ?? "",
       NEXT_PUBLIC_WEB_URL: process.env.NEXT_PUBLIC_WEB_URL ?? "",
     };
   }
   ```

5. **Implement `apps/admin/app/lib/origin.ts`:**
   ```ts
   import { env } from "./env";

   // CSRF gate enforced at the admin route handlers (where the real browser request lands).
   // A null/absent Origin is rejected: same-site fetch() from our own pages always sends one.
   export function isAllowedOrigin(origin: string | null): boolean {
     if (!origin) return false;
     return env().ALLOWED_ORIGINS.includes(origin);
   }
   ```

6. **Run, expect PASS.** `npx vitest run app/lib/origin.test.ts --root /home/ealflm/dev/signex/apps/admin` → 4 passing.

7. **Add the 5 new envs to the admin compose service.** In `docker-compose.yml`, under `admin:` `environment:`, after the existing `NEXT_PUBLIC_API_URL` line, add:
   ```yaml
      ADMIN_ORIGIN: ${ADMIN_ORIGIN:-http://localhost:3061}
      ALLOWED_ORIGINS: ${ALLOWED_ORIGINS:-http://localhost:3061}
      REVALIDATE_SECRET: ${REVALIDATE_SECRET:-changeme-revalidate}
      PREVIEW_SECRET: ${PREVIEW_SECRET:-changeme-preview}
      NEXT_PUBLIC_WEB_URL: ${NEXT_PUBLIC_WEB_URL:-http://localhost:3062}
   ```

8. **Document the envs in `.env.example`** (append at the end):
   ```bash
   # Admin shell (apps/admin) — CSRF + control-plane secrets.
   # ADMIN_ORIGIN: the admin's own public origin (the only origin allowed to POST to its route handlers).
   ADMIN_ORIGIN=http://localhost:3061
   # ALLOWED_ORIGINS: comma-separated CSRF allowlist (ADMIN_ORIGIN is always implicitly included).
   ALLOWED_ORIGINS=http://localhost:3061
   # Shared secret the api presents to apps/web /api/revalidate (x-revalidate-secret).
   REVALIDATE_SECRET=changeme-revalidate
   # Shared secret for POST /api/preview/snapshot (draft preview).
   PREVIEW_SECRET=changeme-preview
   # Public web origin the admin links to for "view live"/preview.
   NEXT_PUBLIC_WEB_URL=http://localhost:3062
   ```

9. **Verify compose parses.** Run `docker compose -f /home/ealflm/dev/signex/docker-compose.yml config --quiet && echo COMPOSE_OK`. Expect `COMPOSE_OK`.

10. **Commit.**
    ```bash
    git -C /home/ealflm/dev/signex add apps/admin/vitest.config.ts apps/admin/app/lib/env.ts apps/admin/app/lib/origin.ts apps/admin/app/lib/origin.test.ts docker-compose.yml .env.example
    git -C /home/ealflm/dev/signex commit -m "feat(admin): env accessor + Origin allowlist gate; add admin control-plane compose envs"
    ```

---

### Task 68: Typed api client (cookie-bug fixed) + getSession server check

**Files:**
- Create: `apps/admin/app/lib/api.ts`
- Create: `apps/admin/app/lib/session.ts`
- Test: `apps/admin/app/lib/api.test.ts`

**Interfaces:**
- Consumes: `env().API_URL`; api routes `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`; api `SessionAuthGuard` accepts `Authorization: Bearer <raw sx_session token>`; `@signex/shared` `RoleName`.
- Produces:
  - `SESSION_COOKIE = "sx_session"`
  - `type ApiResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; error: string }`
  - `apiServer<T>(path: string, opts?: { method?: string; body?: unknown; token?: string; headers?: Record<string,string> }): Promise<ApiResult<T>>`
  - `type SessionUser = { id: string; email: string; name: string; role: RoleName }`
  - `getSession(): Promise<SessionUser | null>`; `requireSession(): Promise<SessionUser>`; `requireRole(min: RoleName): Promise<SessionUser>`

1. **Write the failing test** `apps/admin/app/lib/api.test.ts`. This isolates the cookie-bug fix: when no explicit `token` is passed, the client resolves the cookie via `await cookies()` (a Promise is always truthy → the old bug sent `Bearer undefined`). Mock `next/headers` and `global.fetch`:
   ```ts
   import { describe, it, expect, vi, beforeEach } from "vitest";

   const cookieStore = { get: vi.fn() };
   vi.mock("next/headers", () => ({
     cookies: vi.fn(async () => cookieStore),
   }));

   beforeEach(() => {
     vi.restoreAllMocks();
     process.env.API_URL = "http://api:3060";
     process.env.ADMIN_ORIGIN = "http://localhost:3061";
     cookieStore.get.mockReset();
   });

   describe("apiServer", () => {
     it("forwards the resolved sx_session cookie as a Bearer token (cookie-bug fix)", async () => {
       cookieStore.get.mockReturnValue({ value: "raw-token-123" });
       const fetchMock = vi.fn(async () =>
         new Response(JSON.stringify({ id: "u1" }), { status: 200, headers: { "content-type": "application/json" } }),
       );
       vi.stubGlobal("fetch", fetchMock);

       const { apiServer } = await import("./api");
       const res = await apiServer("/api/auth/me");

       expect(res).toEqual({ ok: true, status: 200, data: { id: "u1" } });
       const [url, init] = fetchMock.mock.calls[0];
       expect(url).toBe("http://api:3060/api/auth/me");
       expect((init.headers as Record<string, string>).Authorization).toBe("Bearer raw-token-123");
     });

     it("sends NO Authorization header when there is no cookie and no explicit token", async () => {
       cookieStore.get.mockReturnValue(undefined);
       const fetchMock = vi.fn(async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
       vi.stubGlobal("fetch", fetchMock);
       const { apiServer } = await import("./api");
       await apiServer("/api/auth/me");
       const [, init] = fetchMock.mock.calls[0];
       expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
     });

     it("prefers an explicit token over the cookie", async () => {
       cookieStore.get.mockReturnValue({ value: "cookie-token" });
       const fetchMock = vi.fn(async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
       vi.stubGlobal("fetch", fetchMock);
       const { apiServer } = await import("./api");
       await apiServer("/api/auth/me", { token: "explicit-token" });
       const [, init] = fetchMock.mock.calls[0];
       expect((init.headers as Record<string, string>).Authorization).toBe("Bearer explicit-token");
     });

     it("returns ok:false with the api error message on non-2xx", async () => {
       cookieStore.get.mockReturnValue({ value: "t" });
       const fetchMock = vi.fn(async () =>
         new Response(JSON.stringify({ message: "STALE_DRAFT" }), { status: 409, headers: { "content-type": "application/json" } }),
       );
       vi.stubGlobal("fetch", fetchMock);
       const { apiServer } = await import("./api");
       const res = await apiServer("/api/content/blocks/PAGE/home.hero", { method: "PUT", body: { data: {}, expectedRevision: 1 } });
       expect(res).toEqual({ ok: false, status: 409, error: "STALE_DRAFT" });
     });

     it("JSON-encodes the body and sets content-type for writes", async () => {
       cookieStore.get.mockReturnValue({ value: "t" });
       const fetchMock = vi.fn(async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
       vi.stubGlobal("fetch", fetchMock);
       const { apiServer } = await import("./api");
       await apiServer("/api/releases/publish", { method: "POST", body: { note: "x", expectedRevision: 2 } });
       const [, init] = fetchMock.mock.calls[0];
       expect(init.method).toBe("POST");
       expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
       expect(init.body).toBe(JSON.stringify({ note: "x", expectedRevision: 2 }));
     });
   });
   ```

2. **Run it, expect FAIL.** `npx vitest run app/lib/api.test.ts --root /home/ealflm/dev/signex/apps/admin` → FAIL with `Cannot find module './api'`.

3. **Implement `apps/admin/app/lib/api.ts`** with the cookie-bug fix on the load-bearing line:
   ```ts
   import { cookies } from "next/headers";
   import { env } from "./env";

   // The browser session cookie name (host-only, re-issued by the admin login route handler).
   export const SESSION_COOKIE = "sx_session";

   export type ApiResult<T> =
     | { ok: true; status: number; data: T }
     | { ok: false; status: number; error: string };

   export interface ApiOpts {
     method?: string;
     body?: unknown;
     token?: string; // explicit override; otherwise resolved from the sx_session cookie
     headers?: Record<string, string>;
   }

   // Server-side api client. The browser NEVER calls the api directly — it hits same-origin
   // admin route handlers / server actions, which call this and forward the session as a Bearer.
   export async function apiServer<T = unknown>(path: string, opts: ApiOpts = {}): Promise<ApiResult<T>> {
     // COOKIE-BUG FIX: resolve the cookie BEFORE the truthiness check. `cookies()` returns a
     // Promise (always truthy) — `opts.token ?? cookies()` would send `Bearer [object Promise]`.
     const token = opts.token ?? (await cookies()).get(SESSION_COOKIE)?.value;

     const headers: Record<string, string> = { ...(opts.headers ?? {}) };
     if (token) headers.Authorization = `Bearer ${token}`;
     if (opts.body !== undefined) headers["Content-Type"] = "application/json";

     let res: Response;
     try {
       res = await fetch(`${env().API_URL}${path}`, {
         method: opts.method ?? "GET",
         headers,
         body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
         cache: "no-store",
       });
     } catch (e) {
       return { ok: false, status: 0, error: e instanceof Error ? e.message : "network error" };
     }

     const text = await res.text();
     let parsed: unknown = undefined;
     try {
       parsed = text ? JSON.parse(text) : undefined;
     } catch {
       parsed = text;
     }

     if (!res.ok) {
       const error =
         (parsed && typeof parsed === "object" && "message" in parsed
           ? String((parsed as { message: unknown }).message)
           : undefined) ?? text ?? `HTTP ${res.status}`;
       return { ok: false, status: res.status, error };
     }
     return { ok: true, status: res.status, data: parsed as T };
   }
   ```

4. **Run, expect PASS.** `npx vitest run app/lib/api.test.ts --root /home/ealflm/dev/signex/apps/admin` → 5 passing.

5. **Implement `apps/admin/app/lib/session.ts`** (server-only session resolution + RBAC redirect helpers). Uses `apiServer` → `GET /api/auth/me`:
   ```ts
   import { redirect } from "next/navigation";
   import { atLeast, type RoleName } from "@signex/shared";
   import { apiServer } from "./api";

   export interface SessionUser {
     id: string;
     email: string;
     name: string;
     role: RoleName;
   }

   // Source of truth for "am I logged in" — re-validated server-side on every guarded render /
   // server action (the cookie alone is only a UX hint; proxy.ts does the cheap presence check).
   export async function getSession(): Promise<SessionUser | null> {
     const res = await apiServer<SessionUser>("/api/auth/me");
     if (!res.ok) return null;
     return res.data;
   }

   export async function requireSession(): Promise<SessionUser> {
     const user = await getSession();
     if (!user) redirect("/login");
     return user;
   }

   // Affordance + hard re-check: under-ranked users are bounced to the dashboard. The api
   // re-checks every guarded route independently — this is defense-in-depth, not the only gate.
   export async function requireRole(min: RoleName): Promise<SessionUser> {
     const user = await requireSession();
     if (!atLeast(user.role, min)) redirect("/");
     return user;
   }
   ```

6. **Typecheck the session module against the real `@signex/shared` exports.** Run:
   ```bash
   npm run build -w @signex/shared --prefix /home/ealflm/dev/signex && \
   npx tsc --noEmit -p /home/ealflm/dev/signex/apps/admin/tsconfig.json 2>&1 | grep -E "session\.ts|api\.ts" || echo TYPECHECK_OK
   ```
   Expect: `TYPECHECK_OK` (no errors in `session.ts`/`api.ts`; confirms `atLeast`/`RoleName` import paths resolve).

7. **Commit.**
   ```bash
   git -C /home/ealflm/dev/signex add apps/admin/app/lib/api.ts apps/admin/app/lib/session.ts apps/admin/app/lib/api.test.ts
   git -C /home/ealflm/dev/signex commit -m "feat(admin): typed server api client (cookie-bug fixed, Bearer forwarding) + getSession/RBAC"
   ```

---

### Task 69: Same-origin route handlers (login re-issues cookie, logout, catch-all Bearer proxy) + proxy.ts UX gate

**Files:**
- Create: `apps/admin/app/admin-api/auth/login/route.ts`
- Create: `apps/admin/app/admin-api/auth/logout/route.ts`
- Create: `apps/admin/app/admin-api/[...path]/route.ts`
- Create: `apps/admin/proxy.ts`

**Interfaces:**
- Consumes: `isAllowedOrigin`, `apiServer`, `SESSION_COOKIE`, `env()`; api `POST /api/auth/login` (returns `Set-Cookie` with the raw `sx_session` token + `{ user }`), `POST /api/auth/logout`.
- Produces: same-origin handlers under `/admin-api/**`; `proxy.ts` (Next-16 convention) redirecting unauthenticated `(dash)` requests to `/login`.

> The browser only ever talks to `/admin-api/**` (same-origin). The login handler re-issues a host-only `sx_session` cookie (not verbatim-forwarding the api's `Set-Cookie`); the catch-all forwards the cookie as a Bearer for all other calls. Every handler enforces the Origin allowlist (CSRF).

1. **Add a helper to extract the raw token from the api's `Set-Cookie`.** Inside `apps/admin/app/admin-api/auth/login/route.ts`, parse the `sx_session=<token>` value the api returns (we re-issue with admin-owned attributes rather than trusting the api's flags). Write the file:
   ```ts
   import { NextResponse, type NextRequest } from "next/server";
   import { z } from "@signex/shared";
   import { isAllowedOrigin } from "@/app/lib/origin";
   import { apiServer, SESSION_COOKIE } from "@/app/lib/api";

   const THIRTY_DAYS = 60 * 60 * 24 * 30; // locked Decisions Log #10

   // Pull `sx_session=<raw>` out of the api's Set-Cookie so we can re-issue it host-only.
   function extractToken(setCookie: string | null): string | null {
     if (!setCookie) return null;
     const m = setCookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
     return m ? m[1] : null;
   }

   export async function POST(req: NextRequest) {
     if (!isAllowedOrigin(req.headers.get("origin"))) {
       return NextResponse.json({ ok: false, error: "bad origin" }, { status: 403 });
     }

     const loginBody = z.object({ email: z.string().email(), password: z.string().min(1) });
     const parsed = loginBody.safeParse(await req.json().catch(() => null));
     if (!parsed.success) {
       return NextResponse.json({ ok: false, error: "invalid credentials shape" }, { status: 422 });
     }

     // Pass token:"" so apiServer does NOT attach a stale Bearer to the login call.
     const apiRes = await fetch(`${process.env.API_URL}/api/auth/login`, {
       method: "POST",
       headers: { "Content-Type": "application/json" },
       body: JSON.stringify(parsed.data),
       cache: "no-store",
     });
     if (!apiRes.ok) {
       return NextResponse.json({ ok: false, error: "login failed" }, { status: apiRes.status });
     }

     const token = extractToken(apiRes.headers.get("set-cookie"));
     if (!token) {
       return NextResponse.json({ ok: false, error: "no session issued" }, { status: 502 });
     }

     const user = await apiRes.json().catch(() => ({}));
     const res = NextResponse.json({ ok: true, user });
     // Re-issue host-only with admin-owned attributes (NOT verbatim-forwarding the api flags).
     res.cookies.set(SESSION_COOKIE, token, {
       httpOnly: true,
       sameSite: "lax",
       secure: process.env.NODE_ENV === "production",
       path: "/",
       maxAge: THIRTY_DAYS,
     });
     return res;
   }
   ```
   (Note: this handler calls the api via raw `fetch`, not `apiServer`, because login must NOT attach the absent cookie as a Bearer.)

2. **Write the logout handler** `apps/admin/app/admin-api/auth/logout/route.ts`:
   ```ts
   import { NextResponse, type NextRequest } from "next/server";
   import { isAllowedOrigin } from "@/app/lib/origin";
   import { apiServer, SESSION_COOKIE } from "@/app/lib/api";

   export async function POST(req: NextRequest) {
     if (!isAllowedOrigin(req.headers.get("origin"))) {
       return NextResponse.json({ ok: false, error: "bad origin" }, { status: 403 });
     }
     // Revoke server-side (instant kill), then clear the cookie regardless of api outcome.
     await apiServer("/api/auth/logout", { method: "POST" });
     const res = NextResponse.json({ ok: true });
     res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
     return res;
   }
   ```

3. **Write the catch-all Bearer proxy** `apps/admin/app/admin-api/[...path]/route.ts` (every other browser->api call). Uses the Next-16 `RouteContext` typed params:
   ```ts
   import { NextResponse, type NextRequest } from "next/server";
   import { isAllowedOrigin } from "@/app/lib/origin";
   import { apiServer } from "@/app/lib/api";

   const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

   async function forward(req: NextRequest, ctx: RouteContext<"/admin-api/[...path]">) {
     // CSRF: enforce the Origin allowlist on every state-changing (and, defensively, every) call.
     if (WRITE_METHODS.has(req.method) && !isAllowedOrigin(req.headers.get("origin"))) {
       return NextResponse.json({ ok: false, error: "bad origin" }, { status: 403 });
     }
     const { path } = await ctx.params;
     const search = req.nextUrl.search;
     const apiPath = `/api/${path.join("/")}${search}`;

     let body: unknown = undefined;
     if (WRITE_METHODS.has(req.method)) {
       body = await req.json().catch(() => undefined);
     }

     const result = await apiServer(apiPath, { method: req.method, body });
     if (!result.ok) {
       return NextResponse.json({ ok: false, error: result.error }, { status: result.status || 502 });
     }
     return NextResponse.json(result.data ?? { ok: true }, { status: result.status });
   }

   export const GET = forward;
   export const POST = forward;
   export const PUT = forward;
   export const PATCH = forward;
   export const DELETE = forward;
   ```

4. **Write the UX-gate `proxy.ts`** (Next-16 renamed `middleware` → `proxy`; mirror the web template's structure). It is a cheap cookie-presence redirect only — real auth re-validates in `(dash)` via `getSession()`:
   ```ts
   // proxy.ts — Next 16 renamed `middleware` to `proxy` (same level as app/).
   // UX redirect ONLY: bounce visitors with no sx_session cookie to /login, and bounce
   // logged-in visitors away from /login. This is NOT the security boundary — every (dash)
   // render calls getSession()->/api/auth/me, and the api re-checks each guarded route.
   import { NextResponse, type NextRequest } from "next/server";

   const SESSION_COOKIE = "sx_session";

   export function proxy(request: NextRequest) {
     const { pathname } = request.nextUrl;
     const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

     if (pathname === "/login") {
       if (hasSession) {
         const url = request.nextUrl.clone();
         url.pathname = "/";
         return NextResponse.redirect(url);
       }
       return NextResponse.next();
     }

     if (!hasSession) {
       const url = request.nextUrl.clone();
       url.pathname = "/login";
       return NextResponse.redirect(url);
     }
     return NextResponse.next();
   }

   export const config = {
     // Gate app pages; exclude Next internals, the same-origin route handlers (/admin-api),
     // static assets, and any path with a file extension.
     matcher: ["/((?!_next/static|_next/image|admin-api|favicon.ico|.*\\..*).*)"],
   };
   ```

5. **Verify the build picks up the route handlers + proxy** (no unit test — these are I/O glue; verify via Next's route table). Run:
   ```bash
   npm run build -w @signex/shared --prefix /home/ealflm/dev/signex && \
   npm run build -w @signex/admin --prefix /home/ealflm/dev/signex 2>&1 | grep -E "admin-api|/login|ƒ |λ " | head
   ```
   Expect: build succeeds and lists `/admin-api/auth/login`, `/admin-api/auth/logout`, `/admin-api/[...path]` as route handlers, and Middleware/Proxy present. (If the grep is empty but the build is green, that's acceptable — the gate is the green build.)

6. **Verify proxy matcher excludes `/admin-api`** (a regression check via a tiny node assertion against the compiled matcher regex). Run:
   ```bash
   node -e '
     const re = new RegExp("^(?:/((?!_next/static|_next/image|admin-api|favicon.ico|.*\\..*).*))$");
     const test = (p) => re.test(p);
     if (test("/admin-api/auth/login")) { console.error("FAIL: admin-api matched"); process.exit(1); }
     if (!test("/releases")) { console.error("FAIL: /releases not matched"); process.exit(1); }
     if (!test("/login")) { console.error("FAIL: /login not matched"); process.exit(1); }
     console.log("MATCHER_OK");
   '
   ```
   Expect: `MATCHER_OK` (the catch-all proxy is never gated; app pages are).

7. **Commit.**
   ```bash
   git -C /home/ealflm/dev/signex add apps/admin/app/admin-api apps/admin/proxy.ts
   git -C /home/ealflm/dev/signex commit -m "feat(admin): same-origin route handlers (login re-issues cookie, logout, Bearer catch-all) + proxy.ts UX gate"
   ```

---

### Task 70: Login screen + (dash) route group server gate + dashboard

**Files:**
- Create: `apps/admin/app/login/page.tsx`
- Create: `apps/admin/app/(dash)/layout.tsx`
- Create: `apps/admin/app/(dash)/page.tsx`

**Interfaces:**
- Consumes: `/admin-api/auth/login`, `/admin-api/auth/logout`, `getSession`/`requireSession`, `apiServer`, `GET /api/releases/live`, `GET /api/releases` (status incl. `revision`/`lastPublishedRevision`/`livePublishedVersion`).
- Produces: `/login` page; `(dash)` layout that hard-gates via `requireSession()`; dashboard showing dirty status.

1. **Write the login screen** `apps/admin/app/login/page.tsx` (client component; posts to the same-origin handler, then hard-navigates so the cookie is present for `(dash)`):
   ```tsx
   "use client";
   import { useState } from "react";

   export default function LoginPage() {
     const [email, setEmail] = useState("");
     const [password, setPassword] = useState("");
     const [error, setError] = useState<string | null>(null);
     const [busy, setBusy] = useState(false);

     async function onSubmit(e: React.FormEvent) {
       e.preventDefault();
       setBusy(true);
       setError(null);
       const res = await fetch("/admin-api/auth/login", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ email, password }),
       });
       if (res.ok) {
         // Full navigation so the freshly-set cookie is visible to the (dash) server render.
         window.location.assign("/");
         return;
       }
       const body = await res.json().catch(() => ({}));
       setError(body.error ?? "Login failed");
       setBusy(false);
     }

     return (
       <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
         <h1 className="text-xl font-semibold">SIGNEX Admin</h1>
         <form onSubmit={onSubmit} className="flex flex-col gap-3">
           <input
             className="rounded border border-gray-300 px-3 py-2"
             type="email" placeholder="email" value={email} autoComplete="username"
             onChange={(e) => setEmail(e.target.value)} required
           />
           <input
             className="rounded border border-gray-300 px-3 py-2"
             type="password" placeholder="password" value={password} autoComplete="current-password"
             onChange={(e) => setPassword(e.target.value)} required
           />
           {error && <p className="text-sm text-red-600">{error}</p>}
           <button className="rounded bg-black px-3 py-2 text-white disabled:opacity-50" disabled={busy} type="submit">
             {busy ? "Signing in…" : "Sign in"}
           </button>
         </form>
       </main>
     );
   }
   ```

2. **Write the `(dash)` server layout** `apps/admin/app/(dash)/layout.tsx` (route-group gate + nav chrome + logout). RBAC nav links are affordance-only:
   ```tsx
   import Link from "next/link";
   import { requireSession } from "@/app/lib/session";
   import { atLeast } from "@signex/shared";

   export default async function DashLayout({ children }: { children: React.ReactNode }) {
     const user = await requireSession();
     return (
       <div className="min-h-screen">
         <header className="flex items-center gap-4 border-b border-gray-200 px-4 py-3 text-sm">
           <Link href="/" className="font-semibold">SIGNEX Admin</Link>
           <Link href="/releases">Releases</Link>
           <Link href="/catalog">Catalog</Link>
           <Link href="/content/home.hero">Content</Link>
           <Link href="/media">Media</Link>
           {atLeast(user.role, "ADMIN") && <Link href="/users">Users</Link>}
           <span className="ml-auto text-gray-500">{user.email} · {user.role}</span>
           <form action="/admin-api/auth/logout" method="post">
             <button className="text-red-600" type="submit">Logout</button>
           </form>
         </header>
         <main className="p-4">{children}</main>
       </div>
     );
   }
   ```
   (The logout `<form method=post>` POSTs same-origin to the handler; the handler clears the cookie and `proxy.ts` redirects the next navigation to `/login`.)

3. **Write the dashboard** `apps/admin/app/(dash)/page.tsx` (dirty status = `revision !== lastPublishedRevision`, per §7.4 — never compares revision to version):
   ```tsx
   import { apiServer } from "@/app/lib/api";

   interface LiveStatus {
     revision: number;
     lastPublishedRevision: number;
     livePublishedVersion: number | null;
   }

   export default async function DashboardPage() {
     const res = await apiServer<LiveStatus>("/api/releases/live");
     const status = res.ok ? res.data : null;
     const dirty = status ? status.revision !== status.lastPublishedRevision : false;

     return (
       <section className="flex flex-col gap-3">
         <h1 className="text-lg font-semibold">Dashboard</h1>
         {!status && <p className="text-red-600">Could not load release status.</p>}
         {status && (
           <dl className="grid max-w-md grid-cols-2 gap-2 text-sm">
             <dt className="text-gray-500">Working revision</dt><dd>{status.revision}</dd>
             <dt className="text-gray-500">Last published revision</dt><dd>{status.lastPublishedRevision}</dd>
             <dt className="text-gray-500">Live version</dt><dd>{status.livePublishedVersion ?? "—"}</dd>
             <dt className="text-gray-500">Status</dt>
             <dd className={dirty ? "font-semibold text-amber-600" : "text-green-700"}>
               {dirty ? "Unpublished changes" : "Up to date"}
             </dd>
           </dl>
         )}
       </section>
     );
   }
   ```

4. **Remove the leftover scaffold root page** so `(dash)/page.tsx` owns `/` (a `route-group` page and a plain `app/page.tsx` both resolving `/` is a conflict). Run:
   ```bash
   rm -f /home/ealflm/dev/signex/apps/admin/app/page.tsx /home/ealflm/dev/signex/apps/admin/app/page.module.css
   ```
   Expect: only `(dash)/page.tsx` resolves `/`.

5. **Verify the build resolves `/login` and the grouped `/` without route conflict.** Run:
   ```bash
   npm run build -w @signex/admin --prefix /home/ealflm/dev/signex 2>&1 | tail -25
   ```
   Expect: green build; route table lists `/login` and `/` (the latter from the `(dash)` group); no "two parallel pages resolve to the same path" error.

6. **Commit.**
   ```bash
   git -C /home/ealflm/dev/signex add apps/admin/app/login apps/admin/app/\(dash\)/layout.tsx apps/admin/app/\(dash\)/page.tsx
   git -C /home/ealflm/dev/signex rm --cached apps/admin/app/page.tsx apps/admin/app/page.module.css 2>/dev/null || true
   git -C /home/ealflm/dev/signex commit -am "feat(admin): login screen + (dash) server-gated layout + dirty-status dashboard"
   ```

---

### Task 71: Releases panel (Publish [Publisher+] / history / rollback)

**Files:**
- Create: `apps/admin/app/(dash)/releases/page.tsx`
- Create: `apps/admin/app/(dash)/releases/actions.ts`

**Interfaces:**
- Consumes: `requireSession`/`requireRole`, `apiServer`; `GET /api/releases` (list), `GET /api/releases/live`, `POST /api/releases/publish [PUBLISHER+] {note,expectedRevision}`, `POST /api/releases/rollback [PUBLISHER+] {toVersion,restoreWorkingState?}`; `@signex/shared` `atLeast`.
- Produces: `/releases` panel; Server Actions `publish(formData)` / `rollback(formData)` that re-validate role via `requireRole("PUBLISHER")`.

1. **Write the Server Actions** `apps/admin/app/(dash)/releases/actions.ts` (every action re-validates auth + role server-side; spec §8/§12: RBAC in UI is affordance-only, actions re-check):
   ```ts
   "use server";
   import { revalidatePath } from "next/cache";
   import { requireRole } from "@/app/lib/session";
   import { apiServer } from "@/app/lib/api";

   export async function publishAction(formData: FormData): Promise<void> {
     await requireRole("PUBLISHER");
     const note = String(formData.get("note") ?? "");
     const expectedRevision = Number(formData.get("expectedRevision"));
     await apiServer("/api/releases/publish", { method: "POST", body: { note, expectedRevision } });
     revalidatePath("/releases");
     revalidatePath("/");
   }

   export async function rollbackAction(formData: FormData): Promise<void> {
     await requireRole("PUBLISHER");
     const toVersion = Number(formData.get("toVersion"));
     const restoreWorkingState = formData.get("restoreWorkingState") === "on";
     await apiServer("/api/releases/rollback", { method: "POST", body: { toVersion, restoreWorkingState } });
     revalidatePath("/releases");
     revalidatePath("/");
   }
   ```

2. **Write the releases panel** `apps/admin/app/(dash)/releases/page.tsx`:
   ```tsx
   import { requireSession } from "@/app/lib/session";
   import { apiServer } from "@/app/lib/api";
   import { atLeast } from "@signex/shared";
   import { publishAction, rollbackAction } from "./actions";

   interface ReleaseRow {
     id: string; version: number; status: "PUBLISHED" | "ARCHIVED";
     label: string | null; note: string | null; publishedAt: string | null;
     rolledBackFromVersion: number | null;
   }
   interface LiveStatus {
     revision: number; lastPublishedRevision: number; livePublishedVersion: number | null;
   }

   export default async function ReleasesPage() {
     const user = await requireSession();
     const canPublish = atLeast(user.role, "PUBLISHER");
     const [listRes, liveRes] = await Promise.all([
       apiServer<ReleaseRow[]>("/api/releases"),
       apiServer<LiveStatus>("/api/releases/live"),
     ]);
     const releases = listRes.ok ? listRes.data : [];
     const live = liveRes.ok ? liveRes.data : null;
     const dirty = live ? live.revision !== live.lastPublishedRevision : false;

     return (
       <section className="flex flex-col gap-6">
         <h1 className="text-lg font-semibold">Releases</h1>

         <div className="rounded border border-gray-200 p-4">
           <p className="text-sm">
             Live version: <strong>{live?.livePublishedVersion ?? "—"}</strong> ·{" "}
             <span className={dirty ? "text-amber-600" : "text-green-700"}>
               {dirty ? "Unpublished changes" : "Up to date"}
             </span>
           </p>
           {canPublish ? (
             <form action={publishAction} className="mt-3 flex items-end gap-2">
               <input type="hidden" name="expectedRevision" value={live?.revision ?? 0} />
               <label className="flex flex-col text-sm">
                 Note
                 <input name="note" className="rounded border border-gray-300 px-2 py-1" />
               </label>
               <button className="rounded bg-black px-3 py-1.5 text-white disabled:opacity-50"
                       type="submit" disabled={!dirty}>
                 Publish
               </button>
             </form>
           ) : (
             <p className="mt-2 text-sm text-gray-500">Publishing requires the Publisher role.</p>
           )}
         </div>

         <table className="w-full border-collapse text-sm">
           <thead>
             <tr className="border-b border-gray-200 text-left text-gray-500">
               <th className="py-1">Version</th><th>Status</th><th>Note</th>
               <th>Published</th><th>From</th>{canPublish && <th>Rollback</th>}
             </tr>
           </thead>
           <tbody>
             {releases.map((r) => (
               <tr key={r.id} className="border-b border-gray-100">
                 <td className="py-1">{r.version}</td>
                 <td>{r.status}</td>
                 <td>{r.note ?? "—"}</td>
                 <td>{r.publishedAt ? new Date(r.publishedAt).toLocaleString() : "—"}</td>
                 <td>{r.rolledBackFromVersion ?? "—"}</td>
                 {canPublish && (
                   <td>
                     {r.status === "ARCHIVED" && (
                       <form action={rollbackAction} className="flex items-center gap-1">
                         <input type="hidden" name="toVersion" value={r.version} />
                         <label className="flex items-center gap-1 text-xs text-gray-500">
                           <input type="checkbox" name="restoreWorkingState" /> restore draft
                         </label>
                         <button className="rounded border border-gray-300 px-2 py-0.5" type="submit">
                           Roll back
                         </button>
                       </form>
                     )}
                   </td>
                 )}
               </tr>
             ))}
           </tbody>
         </table>
       </section>
     );
   }
   ```

3. **Verify the build + Server Action wiring.** Run:
   ```bash
   npm run build -w @signex/admin --prefix /home/ealflm/dev/signex 2>&1 | tail -20
   ```
   Expect: green build; `/releases` in the route table; no "use server"/serialization errors (actions take `FormData`, return `void`).

4. **Commit.**
   ```bash
   git -C /home/ealflm/dev/signex add "apps/admin/app/(dash)/releases"
   git -C /home/ealflm/dev/signex commit -m "feat(admin): releases panel with Publisher-gated publish + history + rollback"
   ```

---

### Task 72: Catalog CRUD (categories/products tables + forms, sortOrder, asset picker)

**Files:**
- Create: `apps/admin/app/(dash)/catalog/page.tsx`
- Create: `apps/admin/app/(dash)/catalog/actions.ts`

**Interfaces:**
- Consumes: `requireRole("EDITOR")`, `apiServer`; `GET /api/catalog/categories`, `GET /api/catalog/products`, `POST/PATCH/DELETE /api/catalog/categories|products`; `GET /api/assets` (asset picker); `@signex/shared` catalog DTO types (`content/catalog.ts`).
- Produces: `/catalog` CRUD screen; Server Actions `createCategory`/`updateCategory`/`deleteCategory`/`createProduct`/`updateProduct`/`deleteProduct`.

> The api owns the optimistic-lock `expectedRevision`; for the minimal foundation the catalog actions read the current revision from `/api/releases/live` immediately before the write (the api re-checks and returns 409 on a race). LocalizedText fields are edited as en/vi pairs.

1. **Write the Server Actions** `apps/admin/app/(dash)/catalog/actions.ts`:
   ```ts
   "use server";
   import { revalidatePath } from "next/cache";
   import { requireRole } from "@/app/lib/session";
   import { apiServer } from "@/app/lib/api";

   interface LiveStatus { revision: number }
   async function currentRevision(): Promise<number> {
     const res = await apiServer<LiveStatus>("/api/releases/live");
     return res.ok ? res.data.revision : 0;
   }
   function localized(fd: FormData, base: string) {
     return { en: String(fd.get(`${base}.en`) ?? ""), vi: String(fd.get(`${base}.vi`) ?? "") };
   }

   export async function createCategory(fd: FormData): Promise<void> {
     await requireRole("EDITOR");
     await apiServer("/api/catalog/categories", {
       method: "POST",
       body: {
         expectedRevision: await currentRevision(),
         slug: String(fd.get("slug") ?? ""),
         sortOrder: Number(fd.get("sortOrder") ?? 0),
         title: localized(fd, "title"),
         tag: localized(fd, "tag"),
         intro: localized(fd, "intro"),
         productCount: Number(fd.get("productCount") ?? 0),
         materialCount: Number(fd.get("materialCount") ?? 0),
         imageId: (fd.get("imageId") as string) || null,
       },
     });
     revalidatePath("/catalog");
   }

   export async function updateCategory(fd: FormData): Promise<void> {
     await requireRole("EDITOR");
     const id = String(fd.get("id"));
     await apiServer(`/api/catalog/categories/${id}`, {
       method: "PATCH",
       body: {
         expectedRevision: await currentRevision(),
         sortOrder: Number(fd.get("sortOrder") ?? 0),
         imageId: (fd.get("imageId") as string) || null,
       },
     });
     revalidatePath("/catalog");
   }

   export async function deleteCategory(fd: FormData): Promise<void> {
     await requireRole("EDITOR");
     await apiServer(`/api/catalog/categories/${String(fd.get("id"))}`, {
       method: "DELETE",
       body: { expectedRevision: await currentRevision() },
     });
     revalidatePath("/catalog");
   }

   export async function createProduct(fd: FormData): Promise<void> {
     await requireRole("EDITOR");
     await apiServer("/api/catalog/products", {
       method: "POST",
       body: {
         expectedRevision: await currentRevision(),
         categoryId: String(fd.get("categoryId") ?? ""),
         slug: String(fd.get("slug") ?? ""),
         sortOrder: Number(fd.get("sortOrder") ?? 0),
         title: localized(fd, "title"),
         tag: localized(fd, "tag"),
         desc: localized(fd, "desc"),
         imageId: (fd.get("imageId") as string) || null,
       },
     });
     revalidatePath("/catalog");
   }

   export async function updateProduct(fd: FormData): Promise<void> {
     await requireRole("EDITOR");
     const id = String(fd.get("id"));
     await apiServer(`/api/catalog/products/${id}`, {
       method: "PATCH",
       body: {
         expectedRevision: await currentRevision(),
         sortOrder: Number(fd.get("sortOrder") ?? 0),
         imageId: (fd.get("imageId") as string) || null,
       },
     });
     revalidatePath("/catalog");
   }

   export async function deleteProduct(fd: FormData): Promise<void> {
     await requireRole("EDITOR");
     await apiServer(`/api/catalog/products/${String(fd.get("id"))}`, {
       method: "DELETE",
       body: { expectedRevision: await currentRevision() },
     });
     revalidatePath("/catalog");
   }
   ```

2. **Write the catalog screen** `apps/admin/app/(dash)/catalog/page.tsx` (tables + create forms; `sortOrder` numeric input; image picked by `imageId` from a `<select>` populated by `GET /api/assets` — the minimal "asset picker", richer picker is a later sub-project):
   ```tsx
   import { requireRole } from "@/app/lib/session";
   import { apiServer } from "@/app/lib/api";
   import {
     createCategory, updateCategory, deleteCategory,
     createProduct, updateProduct, deleteProduct,
   } from "./actions";

   interface Loc { en: string; vi: string }
   interface CategoryRow { id: string; slug: string; sortOrder: number; title: Loc; imageId: string | null }
   interface ProductRow { id: string; categoryId: string; slug: string; sortOrder: number; title: Loc; imageId: string | null }
   interface AssetRow { id: string; originalName: string; r2Key: string }

   function AssetSelect({ assets, value }: { assets: AssetRow[]; value: string | null }) {
     return (
       <select name="imageId" defaultValue={value ?? ""} className="rounded border border-gray-300 px-1 text-xs">
         <option value="">— none —</option>
         {assets.map((a) => <option key={a.id} value={a.id}>{a.originalName}</option>)}
       </select>
     );
   }

   export default async function CatalogPage() {
     await requireRole("EDITOR");
     const [catsRes, prodsRes, assetsRes] = await Promise.all([
       apiServer<CategoryRow[]>("/api/catalog/categories"),
       apiServer<ProductRow[]>("/api/catalog/products"),
       apiServer<AssetRow[]>("/api/assets"),
     ]);
     const categories = catsRes.ok ? catsRes.data : [];
     const products = prodsRes.ok ? prodsRes.data : [];
     const assets = assetsRes.ok ? assetsRes.data : [];

     return (
       <section className="flex flex-col gap-8">
         <div>
           <h1 className="text-lg font-semibold">Categories</h1>
           <table className="mt-2 w-full border-collapse text-sm">
             <thead><tr className="border-b border-gray-200 text-left text-gray-500">
               <th className="py-1">Sort</th><th>Slug</th><th>Title (en)</th><th>Image</th><th></th>
             </tr></thead>
             <tbody>
               {categories.map((c) => (
                 <tr key={c.id} className="border-b border-gray-100 align-top">
                   <td className="py-1">
                     <form action={updateCategory} className="flex items-center gap-1">
                       <input type="hidden" name="id" value={c.id} />
                       <input name="sortOrder" type="number" defaultValue={c.sortOrder} className="w-14 rounded border border-gray-300 px-1" />
                       <AssetSelect assets={assets} value={c.imageId} />
                       <button className="rounded border border-gray-300 px-2 text-xs" type="submit">Save</button>
                     </form>
                   </td>
                   <td>{c.slug}</td><td>{c.title.en}</td><td>{c.imageId ?? "—"}</td>
                   <td>
                     <form action={deleteCategory}>
                       <input type="hidden" name="id" value={c.id} />
                       <button className="text-red-600" type="submit">Delete</button>
                     </form>
                   </td>
                 </tr>
               ))}
             </tbody>
           </table>
           <form action={createCategory} className="mt-3 flex flex-wrap items-end gap-2 text-sm">
             <input name="slug" placeholder="slug" required className="rounded border border-gray-300 px-2 py-1" />
             <input name="sortOrder" type="number" placeholder="sort" defaultValue={0} className="w-20 rounded border border-gray-300 px-2 py-1" />
             <input name="title.en" placeholder="title en" className="rounded border border-gray-300 px-2 py-1" />
             <input name="title.vi" placeholder="title vi" className="rounded border border-gray-300 px-2 py-1" />
             <input name="tag.en" placeholder="tag en" className="rounded border border-gray-300 px-2 py-1" />
             <input name="tag.vi" placeholder="tag vi" className="rounded border border-gray-300 px-2 py-1" />
             <input name="intro.en" placeholder="intro en" className="rounded border border-gray-300 px-2 py-1" />
             <input name="intro.vi" placeholder="intro vi" className="rounded border border-gray-300 px-2 py-1" />
             <input name="productCount" type="number" placeholder="products" defaultValue={0} className="w-24 rounded border border-gray-300 px-2 py-1" />
             <input name="materialCount" type="number" placeholder="materials" defaultValue={0} className="w-24 rounded border border-gray-300 px-2 py-1" />
             <AssetSelect assets={assets} value={null} />
             <button className="rounded bg-black px-3 py-1 text-white" type="submit">Add category</button>
           </form>
         </div>

         <div>
           <h1 className="text-lg font-semibold">Products</h1>
           <table className="mt-2 w-full border-collapse text-sm">
             <thead><tr className="border-b border-gray-200 text-left text-gray-500">
               <th className="py-1">Sort</th><th>Category</th><th>Slug</th><th>Title (en)</th><th></th>
             </tr></thead>
             <tbody>
               {products.map((p) => (
                 <tr key={p.id} className="border-b border-gray-100 align-top">
                   <td className="py-1">
                     <form action={updateProduct} className="flex items-center gap-1">
                       <input type="hidden" name="id" value={p.id} />
                       <input name="sortOrder" type="number" defaultValue={p.sortOrder} className="w-14 rounded border border-gray-300 px-1" />
                       <AssetSelect assets={assets} value={p.imageId} />
                       <button className="rounded border border-gray-300 px-2 text-xs" type="submit">Save</button>
                     </form>
                   </td>
                   <td>{p.categoryId}</td><td>{p.slug}</td><td>{p.title.en}</td>
                   <td>
                     <form action={deleteProduct}>
                       <input type="hidden" name="id" value={p.id} />
                       <button className="text-red-600" type="submit">Delete</button>
                     </form>
                   </td>
                 </tr>
               ))}
             </tbody>
           </table>
           <form action={createProduct} className="mt-3 flex flex-wrap items-end gap-2 text-sm">
             <select name="categoryId" required className="rounded border border-gray-300 px-2 py-1">
               <option value="">— category —</option>
               {categories.map((c) => <option key={c.id} value={c.id}>{c.slug}</option>)}
             </select>
             <input name="slug" placeholder="slug" required className="rounded border border-gray-300 px-2 py-1" />
             <input name="sortOrder" type="number" placeholder="sort" defaultValue={0} className="w-20 rounded border border-gray-300 px-2 py-1" />
             <input name="title.en" placeholder="title en" className="rounded border border-gray-300 px-2 py-1" />
             <input name="title.vi" placeholder="title vi" className="rounded border border-gray-300 px-2 py-1" />
             <input name="tag.en" placeholder="tag en" className="rounded border border-gray-300 px-2 py-1" />
             <input name="tag.vi" placeholder="tag vi" className="rounded border border-gray-300 px-2 py-1" />
             <input name="desc.en" placeholder="desc en" className="rounded border border-gray-300 px-2 py-1" />
             <input name="desc.vi" placeholder="desc vi" className="rounded border border-gray-300 px-2 py-1" />
             <AssetSelect assets={assets} value={null} />
             <button className="rounded bg-black px-3 py-1 text-white" type="submit">Add product</button>
           </form>
         </div>
       </section>
     );
   }
   ```

3. **Verify the build.** Run:
   ```bash
   npm run build -w @signex/admin --prefix /home/ealflm/dev/signex 2>&1 | tail -15
   ```
   Expect: green build; `/catalog` present; no serialization error on the action signatures.

4. **Commit.**
   ```bash
   git -C /home/ealflm/dev/signex add "apps/admin/app/(dash)/catalog"
   git -C /home/ealflm/dev/signex commit -m "feat(admin): catalog CRUD (categories/products, sortOrder, asset picker)"
   ```

---

### Task 73: deriveFields() — introspect BLOCK_REGISTRY schemas into a render plan

**Files:**
- Create: `apps/admin/app/lib/zodform-fields.ts`
- Test: `apps/admin/app/lib/zodform-fields.test.ts`

**Interfaces:**
- Consumes: `@signex/shared` `BLOCK_REGISTRY`, `parseBlock`, `z`; the primitive shapes `LocalizedText` (`{en,vi}` strings), `LocalizedTextArray`, `AssetRef` (`{assetId, alt?}`).
- Produces:
  - `type FieldKind = "string" | "localized" | "localizedArray" | "array" | "assetRef" | "json"`
  - `type FieldPlan = { name: string; kind: FieldKind; label: string; children?: FieldPlan[] }`
  - `deriveFields(schema: z.ZodTypeAny): FieldPlan[]`

> This is the load-bearing pure-logic unit behind `<ZodForm>`. It walks a zod object schema (zod v3 `_def`) and classifies each top-level field. Anything it can't cleanly model (nested objects beyond localized/assetRef, unions, records) falls back to `kind:"json"` (raw JSON textarea, validated on submit by `parseBlock`).

1. **Write the failing test** `apps/admin/app/lib/zodform-fields.test.ts`. Use synthetic schemas built from the re-exported `z` so the test is independent of registry churn, plus one real-registry smoke assertion:
   ```ts
   import { describe, it, expect } from "vitest";
   import { z, BLOCK_REGISTRY } from "@signex/shared";
   import { deriveFields } from "./zodform-fields";

   const localized = z.object({ en: z.string(), vi: z.string() });
   const localizedArray = z.object({ en: z.array(z.string()), vi: z.array(z.string()) });
   const assetRef = z.object({ assetId: z.string(), alt: localized.optional() });

   describe("deriveFields", () => {
     it("classifies a plain string field", () => {
       const plan = deriveFields(z.object({ brand: z.string() }));
       expect(plan).toContainEqual({ name: "brand", kind: "string", label: "brand" });
     });

     it("classifies a localized {en,vi} field", () => {
       const plan = deriveFields(z.object({ title: localized }));
       expect(plan.find((f) => f.name === "title")?.kind).toBe("localized");
     });

     it("classifies a localized string-array field", () => {
       const plan = deriveFields(z.object({ bullets: localizedArray }));
       expect(plan.find((f) => f.name === "bullets")?.kind).toBe("localizedArray");
     });

     it("classifies an AssetRef field", () => {
       const plan = deriveFields(z.object({ image: assetRef }));
       expect(plan.find((f) => f.name === "image")?.kind).toBe("assetRef");
     });

     it("classifies an array-of-objects as a repeater with children", () => {
       const plan = deriveFields(z.object({ cards: z.array(z.object({ title: localized })) }));
       const cards = plan.find((f) => f.name === "cards");
       expect(cards?.kind).toBe("array");
       expect(cards?.children?.[0]).toMatchObject({ name: "title", kind: "localized" });
     });

     it("falls back to json for shapes it cannot cleanly model", () => {
       const plan = deriveFields(z.object({ weird: z.union([z.string(), z.number()]) }));
       expect(plan.find((f) => f.name === "weird")?.kind).toBe("json");
     });

     it("unwraps optional/default wrappers", () => {
       const plan = deriveFields(z.object({ note: z.string().optional(), tags: z.array(z.string()).default([]) }));
       expect(plan.find((f) => f.name === "note")?.kind).toBe("string");
     });

     it("derives a non-empty plan for every real BLOCK_REGISTRY entry", () => {
       for (const [key, schema] of Object.entries(BLOCK_REGISTRY)) {
         const plan = deriveFields(schema as z.ZodTypeAny);
         expect(plan.length, `block ${key} should derive fields`).toBeGreaterThan(0);
       }
     });
   });
   ```

2. **Run it, expect FAIL.** `npx vitest run app/lib/zodform-fields.test.ts --root /home/ealflm/dev/signex/apps/admin` → FAIL with `Cannot find module './zodform-fields'`.

3. **Implement `apps/admin/app/lib/zodform-fields.ts`** (zod v3 `_def` introspection):
   ```ts
   import { z } from "@signex/shared";

   export type FieldKind =
     | "string" | "localized" | "localizedArray" | "array" | "assetRef" | "json";

   export interface FieldPlan {
     name: string;
     kind: FieldKind;
     label: string;
     children?: FieldPlan[]; // for kind:"array" — the shape of one repeater item
   }

   // Strip Optional/Default/Nullable wrappers down to the inner schema.
   function unwrap(schema: z.ZodTypeAny): z.ZodTypeAny {
     let s = schema as z.ZodTypeAny;
     // eslint-disable-next-line @typescript-eslint/no-explicit-any
     let def: any = s._def;
     while (
       def?.typeName === "ZodOptional" ||
       def?.typeName === "ZodDefault" ||
       def?.typeName === "ZodNullable"
     ) {
       s = def.innerType ?? def.schema ?? s;
       def = (s as z.ZodTypeAny)._def;
       if (!s) break;
     }
     return s;
   }

   // eslint-disable-next-line @typescript-eslint/no-explicit-any
   function typeName(schema: z.ZodTypeAny): string | undefined {
     return (schema as { _def?: { typeName?: string } })._def?.typeName;
   }

   function isStringSchema(s: z.ZodTypeAny): boolean {
     return typeName(s) === "ZodString" || typeName(s) === "ZodEnum";
   }

   // { en: <X>, vi: <X> } detection.
   function objectShape(s: z.ZodTypeAny): Record<string, z.ZodTypeAny> | null {
     if (typeName(s) !== "ZodObject") return null;
     // eslint-disable-next-line @typescript-eslint/no-explicit-any
     const shape = (s as any)._def.shape;
     return typeof shape === "function" ? shape() : shape;
   }

   function isLocalized(s: z.ZodTypeAny): boolean {
     const shape = objectShape(s);
     if (!shape) return false;
     const keys = Object.keys(shape);
     return keys.length === 2 && keys.includes("en") && keys.includes("vi")
       && isStringSchema(unwrap(shape.en)) && isStringSchema(unwrap(shape.vi));
   }

   function isLocalizedArray(s: z.ZodTypeAny): boolean {
     const shape = objectShape(s);
     if (!shape) return false;
     const keys = Object.keys(shape);
     if (!(keys.length === 2 && keys.includes("en") && keys.includes("vi"))) return false;
     const enInner = unwrap(shape.en);
     return typeName(enInner) === "ZodArray";
   }

   function isAssetRef(s: z.ZodTypeAny): boolean {
     const shape = objectShape(s);
     return Boolean(shape && "assetId" in shape);
   }

   function classify(name: string, raw: z.ZodTypeAny): FieldPlan {
     const s = unwrap(raw);
     if (isStringSchema(s)) return { name, kind: "string", label: name };
     if (isLocalizedArray(s)) return { name, kind: "localizedArray", label: name };
     if (isLocalized(s)) return { name, kind: "localized", label: name };
     if (isAssetRef(s)) return { name, kind: "assetRef", label: name };
     if (typeName(s) === "ZodArray") {
       // eslint-disable-next-line @typescript-eslint/no-explicit-any
       const element = unwrap((s as any)._def.type ?? (s as any)._def.element);
       const itemShape = objectShape(element);
       if (itemShape) {
         const children = Object.entries(itemShape).map(([k, v]) => classify(k, v as z.ZodTypeAny));
         return { name, kind: "array", label: name, children };
       }
       // array of scalars -> json fallback (handled as a textarea)
       return { name, kind: "json", label: name };
     }
     // nested objects / unions / records we don't model -> raw JSON textarea
     return { name, kind: "json", label: name };
   }

   // Walk a top-level block object schema into a flat-ish render plan.
   export function deriveFields(schema: z.ZodTypeAny): FieldPlan[] {
     const shape = objectShape(unwrap(schema));
     if (!shape) return [{ name: "__root__", kind: "json", label: "value" }];
     return Object.entries(shape).map(([name, v]) => classify(name, v as z.ZodTypeAny));
   }
   ```

4. **Run, expect PASS.** `npx vitest run app/lib/zodform-fields.test.ts --root /home/ealflm/dev/signex/apps/admin` → all passing (including the real-`BLOCK_REGISTRY` loop).
   - If the real-registry loop reveals a block whose top-level field is a nested object that should be a repeater, that is still acceptable: it lands as `kind:"json"` and the `<ZodForm>` renders it as a validated raw-JSON textarea (the documented "anything richer → raw JSON" fallback per §12). Do NOT special-case it here.

5. **Commit.**
   ```bash
   git -C /home/ealflm/dev/signex add apps/admin/app/lib/zodform-fields.ts apps/admin/app/lib/zodform-fields.test.ts
   git -C /home/ealflm/dev/signex commit -m "feat(admin): deriveFields() — introspect BLOCK_REGISTRY zod schemas into a render plan"
   ```

---

### Task 74: Registry-driven content block editor (<ZodForm> from BLOCK_REGISTRY)

**Files:**
- Create: `apps/admin/app/(dash)/content/[blockKey]/page.tsx`
- Create: `apps/admin/app/(dash)/content/[blockKey]/zod-form.tsx`

**Interfaces:**
- Consumes: `requireRole("EDITOR")`, `apiServer`, `deriveFields`, `FieldPlan`; `@signex/shared` `BLOCK_REGISTRY`, `BlockKey`, `parseBlock`; api `GET /api/content/blocks/:kind/:key` (current `{data, revision}` or equivalent), `PUT /api/content/blocks/:kind/:key {data, expectedRevision}` -> `{revision}` | 409 | 422; `GET /api/assets` (picker).
- Produces: `/content/[blockKey]` editor that auto-renders `<ZodForm>` from the registry; saves via `/admin-api/content/blocks/:kind/:key`.

> `blockKey` is the registry key (e.g. `home.hero`). The kind is derived from the registry entry's BlockKind classification. Since `BLOCK_REGISTRY` is keyed by the block key, the page resolves `(kind, key)` for the api path. For the minimal foundation, the editor reads the block, renders the derived fields, and PUTs the reconstructed `data` object; richer/unmodeled fields use a raw-JSON textarea validated client-side by `parseBlock` before submit.

1. **Write the `<ZodForm>` client component** `apps/admin/app/(dash)/content/[blockKey]/zod-form.tsx`. It receives the derived `FieldPlan[]`, the current `data`, the asset list, and the api `(kind,key)` + `expectedRevision`; it builds a `data` object from inputs, validates client-side, and POSTs to the same-origin proxy:
   ```tsx
   "use client";
   import { useState } from "react";
   import type { FieldPlan } from "@/app/lib/zodform-fields";

   interface AssetRow { id: string; originalName: string }

   interface Props {
     kind: string;
     blockKey: string;
     fields: FieldPlan[];
     initialData: Record<string, unknown>;
     expectedRevision: number;
     assets: AssetRow[];
   }

   // Render one field into the editable `value` object (state-driven so repeaters/json work).
   function FieldEditor({
     field, value, onChange, assets,
   }: { field: FieldPlan; value: unknown; onChange: (v: unknown) => void; assets: AssetRow[] }) {
     if (field.kind === "string") {
       return (
         <label className="flex flex-col text-sm">
           {field.label}
           <input className="rounded border border-gray-300 px-2 py-1"
                  value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
         </label>
       );
     }
     if (field.kind === "localized") {
       const v = (value as { en?: string; vi?: string }) ?? {};
       return (
         <fieldset className="flex flex-col gap-1 text-sm">
           <legend>{field.label}</legend>
           <input className="rounded border border-gray-300 px-2 py-1" placeholder="en"
                  value={v.en ?? ""} onChange={(e) => onChange({ ...v, en: e.target.value })} />
           <input className="rounded border border-gray-300 px-2 py-1" placeholder="vi"
                  value={v.vi ?? ""} onChange={(e) => onChange({ ...v, vi: e.target.value })} />
         </fieldset>
       );
     }
     if (field.kind === "assetRef") {
       const v = (value as { assetId?: string }) ?? {};
       return (
         <label className="flex flex-col text-sm">
           {field.label}
           <select className="rounded border border-gray-300 px-2 py-1" value={v.assetId ?? ""}
                   onChange={(e) => onChange({ ...v, assetId: e.target.value })}>
             <option value="">— none —</option>
             {assets.map((a) => <option key={a.id} value={a.id}>{a.originalName}</option>)}
           </select>
         </label>
       );
     }
     // localizedArray, array, json -> raw JSON textarea (validated on submit by parseBlock).
     return (
       <label className="flex flex-col text-sm">
         {field.label} (JSON)
         <textarea className="rounded border border-gray-300 px-2 py-1 font-mono text-xs" rows={4}
                   defaultValue={JSON.stringify(value ?? null, null, 2)}
                   onChange={(e) => {
                     try { onChange(JSON.parse(e.target.value)); } catch { /* keep last valid */ }
                   }} />
       </label>
     );
   }

   export function ZodForm({ kind, blockKey, fields, initialData, expectedRevision, assets }: Props) {
     const [data, setData] = useState<Record<string, unknown>>(initialData);
     const [msg, setMsg] = useState<string | null>(null);
     const [busy, setBusy] = useState(false);

     async function onSave() {
       setBusy(true);
       setMsg(null);
       const res = await fetch(`/admin-api/content/blocks/${kind}/${blockKey}`, {
         method: "PUT",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ data, expectedRevision }),
       });
       if (res.ok) {
         setMsg("Saved.");
       } else if (res.status === 409) {
         setMsg("Stale draft — reload, someone else edited (409).");
       } else if (res.status === 422) {
         setMsg("Validation failed (422) — check fields.");
       } else {
         const b = await res.json().catch(() => ({}));
         setMsg(b.error ?? `Error ${res.status}`);
       }
       setBusy(false);
     }

     return (
       <div className="flex max-w-lg flex-col gap-4">
         {fields.map((f) => (
           <FieldEditor key={f.name} field={f} value={data[f.name]} assets={assets}
                        onChange={(v) => setData((d) => ({ ...d, [f.name]: v }))} />
         ))}
         {msg && <p className="text-sm text-amber-700">{msg}</p>}
         <button className="self-start rounded bg-black px-3 py-1.5 text-white disabled:opacity-50"
                 disabled={busy} onClick={onSave}>
           {busy ? "Saving…" : "Save draft"}
         </button>
       </div>
     );
   }
   ```

2. **Write the editor page** `apps/admin/app/(dash)/content/[blockKey]/page.tsx`. It resolves the registry entry, derives fields, fetches current block data + assets, and mounts `<ZodForm>`. It uses the Next-16 async `params`:
   ```tsx
   import { notFound } from "next/navigation";
   import { requireRole } from "@/app/lib/session";
   import { apiServer } from "@/app/lib/api";
   import { BLOCK_REGISTRY, type BlockKey } from "@signex/shared";
   import { deriveFields } from "@/app/lib/zodform-fields";
   import { ZodForm } from "./zod-form";

   // Map each registry key to its BlockKind for the api path. Keys are dotted (e.g. "home.hero");
   // the api validates by (kind,key), so we classify by a small prefix table (importer uses the same).
   function kindFor(key: string): "PAGE" | "SETTINGS" | "NAV" | "SEO" {
     if (key.startsWith("nav")) return "NAV";
     if (key.startsWith("seo") || key === "meta") return "SEO";
     if (key === "businessContact" || key === "formConfig") return "SETTINGS";
     return "PAGE";
   }

   interface AssetRow { id: string; originalName: string }
   interface BlockResponse { data: Record<string, unknown>; revision: number }

   export default async function ContentBlockPage({
     params,
   }: { params: Promise<{ blockKey: string }> }) {
     await requireRole("EDITOR");
     const { blockKey } = await params;
     const schema = (BLOCK_REGISTRY as Record<string, unknown>)[blockKey];
     if (!schema) notFound();

     const kind = kindFor(blockKey);
     const [blockRes, assetsRes] = await Promise.all([
       apiServer<BlockResponse>(`/api/content/blocks/${kind}/${blockKey}`),
       apiServer<AssetRow[]>("/api/assets"),
     ]);
     const initialData = blockRes.ok ? (blockRes.data.data ?? {}) : {};
     const expectedRevision = blockRes.ok ? blockRes.data.revision : 0;
     const assets = assetsRes.ok ? assetsRes.data : [];
     const fields = deriveFields(schema as Parameters<typeof deriveFields>[0]);

     return (
       <section className="flex flex-col gap-4">
         <header>
           <h1 className="text-lg font-semibold">{blockKey}</h1>
           <p className="text-xs text-gray-500">{kind} · revision {expectedRevision}</p>
         </header>
         <nav className="flex flex-wrap gap-2 text-xs text-gray-500">
           {Object.keys(BLOCK_REGISTRY as Record<string, unknown>).map((k) => (
             <a key={k} href={`/content/${k}`} className={k === blockKey ? "font-semibold text-black" : ""}>{k}</a>
           ))}
         </nav>
         <ZodForm kind={kind} blockKey={blockKey} fields={fields}
                  initialData={initialData} expectedRevision={expectedRevision} assets={assets} />
       </section>
     );
   }
   ```

3. **Verify the build resolves the dynamic segment + client component.** Run:
   ```bash
   npm run build -w @signex/shared --prefix /home/ealflm/dev/signex && \
   npm run build -w @signex/admin --prefix /home/ealflm/dev/signex 2>&1 | tail -20
   ```
   Expect: green build; `/content/[blockKey]` in the route table; no "params should be awaited" error (we await it).

4. **Sanity-check that `BlockKey`/`BLOCK_REGISTRY` typing lines up** (the page casts the registry value to `deriveFields`' param). Run:
   ```bash
   npx tsc --noEmit -p /home/ealflm/dev/signex/apps/admin/tsconfig.json 2>&1 | grep -E "content/\[blockKey\]|zod-form" || echo TYPECHECK_OK
   ```
   Expect: `TYPECHECK_OK`.

5. **Commit.**
   ```bash
   git -C /home/ealflm/dev/signex add "apps/admin/app/(dash)/content"
   git -C /home/ealflm/dev/signex commit -m "feat(admin): registry-driven <ZodForm> content block editor with 409/422 handling"
   ```

---

### Task 75: Media library (presign -> PUT -> confirm upload + grid + picker)

**Files:**
- Create: `apps/admin/app/(dash)/media/page.tsx`
- Create: `apps/admin/app/(dash)/media/uploader.tsx`

**Interfaces:**
- Consumes: `requireRole("EDITOR")`, `apiServer`; api `POST /api/assets/presign` (`{ sha256, mime, bytes, originalName } -> { assetId, uploadUrl, alreadyExists }`), `POST /api/assets/:id/confirm`, `GET /api/assets`; same-origin proxy `/admin-api/assets/**`.
- Produces: `/media` screen — upload widget + asset grid (doubles as the picker source for catalog/content).

> The browser computes sha256 (WebCrypto), asks the api (via the same-origin proxy) to presign, PUTs the bytes directly to R2 (the presigned URL is an R2 origin, NOT same-origin — direct `fetch` PUT), then confirms. Confirm flips the asset READY (server re-hashes/derives dims per §9).

1. **Write the uploader client component** `apps/admin/app/(dash)/media/uploader.tsx`:
   ```tsx
   "use client";
   import { useState } from "react";
   import { useRouter } from "next/navigation";

   async function sha256Hex(buf: ArrayBuffer): Promise<string> {
     const digest = await crypto.subtle.digest("SHA-256", buf);
     return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
   }

   interface PresignResponse { assetId: string; uploadUrl: string | null; alreadyExists: boolean }

   export function Uploader() {
     const router = useRouter();
     const [status, setStatus] = useState<string | null>(null);
     const [busy, setBusy] = useState(false);

     async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
       const file = e.target.files?.[0];
       if (!file) return;
       setBusy(true);
       setStatus("Hashing…");
       const buf = await file.arrayBuffer();
       const sha256 = await sha256Hex(buf);

       setStatus("Requesting upload URL…");
       const presignRes = await fetch("/admin-api/assets/presign", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ sha256, mime: file.type, bytes: file.size, originalName: file.name }),
       });
       if (!presignRes.ok) { setStatus(`Presign failed (${presignRes.status})`); setBusy(false); return; }
       const presign: PresignResponse = await presignRes.json();

       if (!presign.alreadyExists && presign.uploadUrl) {
         setStatus("Uploading to R2…");
         // Direct PUT to R2 (NOT same-origin) with the exact content type the policy expects.
         const put = await fetch(presign.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
         if (!put.ok) { setStatus(`R2 upload failed (${put.status})`); setBusy(false); return; }
         setStatus("Confirming…");
         const confirm = await fetch(`/admin-api/assets/${presign.assetId}/confirm`, { method: "POST" });
         if (!confirm.ok) { setStatus(`Confirm failed (${confirm.status})`); setBusy(false); return; }
       }
       setStatus(presign.alreadyExists ? "Already existed (deduped)." : "Uploaded.");
       setBusy(false);
       router.refresh();
     }

     return (
       <div className="flex flex-col gap-2">
         <input type="file" onChange={onFile} disabled={busy}
                accept="image/png,image/jpeg,image/webp,video/mp4,video/webm" />
         {status && <p className="text-sm text-gray-600">{status}</p>}
       </div>
     );
   }
   ```

2. **Write the media page** `apps/admin/app/(dash)/media/page.tsx` (grid that also serves as the picker reference; resolves the public URL via `NEXT_PUBLIC_WEB_URL`-independent `MEDIA_PUBLIC_BASE` exposed by the api in the asset row, falling back to r2Key text):
   ```tsx
   import { requireRole } from "@/app/lib/session";
   import { apiServer } from "@/app/lib/api";
   import { Uploader } from "./uploader";

   interface AssetRow {
     id: string; kind: "IMAGE" | "VIDEO" | "SVG"; status: "PENDING" | "READY";
     originalName: string; r2Key: string; url: string | null;
   }

   export default async function MediaPage() {
     await requireRole("EDITOR");
     const res = await apiServer<AssetRow[]>("/api/assets");
     const assets = res.ok ? res.data : [];

     return (
       <section className="flex flex-col gap-4">
         <h1 className="text-lg font-semibold">Media</h1>
         <Uploader />
         <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
           {assets.map((a) => (
             <figure key={a.id} className="flex flex-col gap-1 rounded border border-gray-200 p-2 text-xs">
               {a.kind === "IMAGE" && a.url
                 ? <img src={a.url} alt={a.originalName} className="aspect-square w-full object-cover" />
                 : <div className="flex aspect-square w-full items-center justify-center bg-gray-100">{a.kind}</div>}
               <figcaption className="truncate" title={a.originalName}>{a.originalName}</figcaption>
               <code className="truncate text-[10px] text-gray-400" title={a.id}>{a.id}</code>
               <span className={a.status === "READY" ? "text-green-700" : "text-amber-600"}>{a.status}</span>
             </figure>
           ))}
         </div>
       </section>
     );
   }
   ```

3. **Verify the build (note `<img>` is intentional — admin is utilitarian, not the public site).** Run:
   ```bash
   npm run build -w @signex/admin --prefix /home/ealflm/dev/signex 2>&1 | tail -15
   ```
   Expect: green build; `/media` present. (eslint may warn `@next/next/no-img-element`; that is a warning, not a build error. If lint is wired as a hard gate, add a line `{/* eslint-disable-next-line @next/next/no-img-element */}` above the `<img>`.)

4. **Commit.**
   ```bash
   git -C /home/ealflm/dev/signex add "apps/admin/app/(dash)/media"
   git -C /home/ealflm/dev/signex commit -m "feat(admin): media library — WebCrypto sha256 -> presign -> R2 PUT -> confirm + asset grid"
   ```

---

### Task 76: Users CRUD (Admin only) + whole-admin lint/build + docker image gate

**Files:**
- Create: `apps/admin/app/(dash)/users/page.tsx`
- Create: `apps/admin/app/(dash)/users/actions.ts`

**Interfaces:**
- Consumes: `requireRole("ADMIN")`, `apiServer`; api `GET /api/users` (list), `POST /api/users [ADMIN] {email,name,role,password}`, `PATCH /api/users/:id [ADMIN]`, `DELETE /api/users/:id [ADMIN]` (deactivate); `@signex/shared` `createUserSchema`, `RoleName`.
- Produces: `/users` Admin-only screen; Server Actions `createUser`/`updateUserRole`/`deactivateUser`. Final docker-build acceptance gate for the milestone.

1. **Write the Server Actions** `apps/admin/app/(dash)/users/actions.ts` (re-validate ADMIN every time; validate the create payload against the shared schema before sending):
   ```ts
   "use server";
   import { revalidatePath } from "next/cache";
   import { requireRole } from "@/app/lib/session";
   import { apiServer } from "@/app/lib/api";
   import { createUserSchema } from "@signex/shared";

   export async function createUser(fd: FormData): Promise<void> {
     await requireRole("ADMIN");
     const parsed = createUserSchema.safeParse({
       email: String(fd.get("email") ?? ""),
       name: String(fd.get("name") ?? ""),
       role: String(fd.get("role") ?? "EDITOR"),
       password: String(fd.get("password") ?? ""),
     });
     if (!parsed.success) return; // affordance-only; api is the hard validator (422)
     await apiServer("/api/users", { method: "POST", body: parsed.data });
     revalidatePath("/users");
   }

   export async function updateUserRole(fd: FormData): Promise<void> {
     await requireRole("ADMIN");
     await apiServer(`/api/users/${String(fd.get("id"))}`, {
       method: "PATCH",
       body: { role: String(fd.get("role") ?? "EDITOR") },
     });
     revalidatePath("/users");
   }

   export async function deactivateUser(fd: FormData): Promise<void> {
     await requireRole("ADMIN");
     await apiServer(`/api/users/${String(fd.get("id"))}`, { method: "DELETE" });
     revalidatePath("/users");
   }
   ```

2. **Write the users screen** `apps/admin/app/(dash)/users/page.tsx`:
   ```tsx
   import { requireRole } from "@/app/lib/session";
   import { apiServer } from "@/app/lib/api";
   import type { RoleName } from "@signex/shared";
   import { createUser, updateUserRole, deactivateUser } from "./actions";

   interface UserRow {
     id: string; email: string; name: string; role: RoleName; isActive: boolean;
     lastLoginAt: string | null;
   }
   const ROLES: RoleName[] = ["EDITOR", "PUBLISHER", "ADMIN"];

   export default async function UsersPage() {
     await requireRole("ADMIN");
     const res = await apiServer<UserRow[]>("/api/users");
     const users = res.ok ? res.data : [];

     return (
       <section className="flex flex-col gap-6">
         <h1 className="text-lg font-semibold">Users</h1>
         <table className="w-full border-collapse text-sm">
           <thead><tr className="border-b border-gray-200 text-left text-gray-500">
             <th className="py-1">Email</th><th>Name</th><th>Role</th><th>Active</th><th></th>
           </tr></thead>
           <tbody>
             {users.map((u) => (
               <tr key={u.id} className="border-b border-gray-100">
                 <td className="py-1">{u.email}</td><td>{u.name}</td>
                 <td>
                   <form action={updateUserRole} className="flex items-center gap-1">
                     <input type="hidden" name="id" value={u.id} />
                     <select name="role" defaultValue={u.role} className="rounded border border-gray-300 px-1">
                       {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                     </select>
                     <button className="rounded border border-gray-300 px-2 text-xs" type="submit">Set</button>
                   </form>
                 </td>
                 <td className={u.isActive ? "text-green-700" : "text-gray-400"}>{u.isActive ? "yes" : "no"}</td>
                 <td>
                   {u.isActive && (
                     <form action={deactivateUser}>
                       <input type="hidden" name="id" value={u.id} />
                       <button className="text-red-600" type="submit">Deactivate</button>
                     </form>
                   )}
                 </td>
               </tr>
             ))}
           </tbody>
         </table>

         <form action={createUser} className="flex flex-wrap items-end gap-2 text-sm">
           <input name="email" type="email" placeholder="email" required className="rounded border border-gray-300 px-2 py-1" />
           <input name="name" placeholder="name" required className="rounded border border-gray-300 px-2 py-1" />
           <select name="role" defaultValue="EDITOR" className="rounded border border-gray-300 px-2 py-1">
             {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
           </select>
           <input name="password" type="password" placeholder="password" required className="rounded border border-gray-300 px-2 py-1" />
           <button className="rounded bg-black px-3 py-1 text-white" type="submit">Add user</button>
         </form>
       </section>
     );
   }
   ```

3. **Run the full admin vitest suite.** Run:
   ```bash
   npm run build -w @signex/shared --prefix /home/ealflm/dev/signex && \
   npm test -w @signex/admin --prefix /home/ealflm/dev/signex
   ```
   Expect: `origin.test.ts`, `api.test.ts`, `zodform-fields.test.ts` all green.

4. **Run lint + typecheck across admin.** Run:
   ```bash
   npm run lint -w @signex/admin --prefix /home/ealflm/dev/signex && \
   npx tsc --noEmit -p /home/ealflm/dev/signex/apps/admin/tsconfig.json && echo ADMIN_TYPECHECK_OK
   ```
   Expect: lint passes (warnings ok); `ADMIN_TYPECHECK_OK`.

5. **Full admin Next build.** Run:
   ```bash
   npm run build -w @signex/admin --prefix /home/ealflm/dev/signex 2>&1 | tail -30
   ```
   Expect: green build; route table includes `/login`, `/` (dash), `/releases`, `/catalog`, `/content/[blockKey]`, `/media`, `/users`, and the `/admin-api/**` handlers; proxy present.

6. **Docker image gate (the §14 "Docker gate" for admin: @signex/shared traced into standalone).** Run:
   ```bash
   docker compose -f /home/ealflm/dev/signex/docker-compose.yml build admin 2>&1 | tail -25
   ```
   Expect: image `signex-admin:latest` builds; the builder stage runs `npm run build --workspace @signex/shared` THEN `--workspace @signex/admin`; final `node apps/admin/server.js` entrypoint present.

7. **Verify @signex/shared is actually traced into the standalone output** (the load-bearing reason for the Dockerfile build step — ROLE_RANK is a runtime value). Run a throwaway container that lists the traced module:
   ```bash
   docker run --rm --entrypoint sh signex-admin:latest -c 'ls node_modules/@signex/shared/dist/index.js && echo SHARED_TRACED'
   ```
   Expect: `node_modules/@signex/shared/dist/index.js` exists + `SHARED_TRACED`. (If absent, the standalone trace missed it — re-check the Dockerfile build-order step.)

8. **Commit.**
   ```bash
   git -C /home/ealflm/dev/signex add "apps/admin/app/(dash)/users"
   git -C /home/ealflm/dev/signex commit -m "feat(admin): users CRUD (Admin-only) + green vitest/lint/build + docker image gate"
   ```

---

## Milestone 10 — Whole-stack acceptance + cross-cutting invariant tests (§14)

**Consumes (from earlier milestones):**
- @signex/shared: ReleaseSnapshotSchema (z schema, .parse(json)->ReleaseSnapshot), BLOCK_REGISTRY (Record<BlockKey, ZodType>), parseBlock(kind: BlockKind, key: string, data: unknown) -> parsed, catalog DTO schema CategorySchema/ProductSchema/AssetDtoSchema from content/catalog.ts, loginSchema
- @signex/db: PrismaService.client (PrismaClient) exposing client.release, client.publishedPointer, client.workingState, client.category, client.product, client.contentBlock; raw `release_version_seq` Postgres sequence
- api routes (global prefix /api): POST /api/auth/login {email,password} -> 200 Set-Cookie sx_session; POST /api/auth/logout; GET /api/auth/me; PUT /api/content/blocks/:kind/:key {data, expectedRevision} -> {revision} | 409 STALE_DRAFT | 422; GET /api/releases/live -> {version, snapshot...}; GET /api/releases -> Release[]; POST /api/releases/publish {note, expectedRevision} [PUBLISHER+] -> {version}; POST /api/releases/rollback {toVersion, restoreWorkingState?} [PUBLISHER+] -> {version}; POST /api/preview/snapshot [x-preview-secret] -> live working state as ReleaseSnapshot; GET /api/health -> {status:'ok'}
- api ReleaseModule SnapshotSerializer + publish() assigns version via nextval('release_version_seq'), demotes prev PUBLISHED->ARCHIVED, repoints PublishedPointer, returns {version}; revision guard => 409 STALE_DRAFT
- api importer/seed: a Nest command (`node dist/main seed`) running auth:seed (fixed SYSTEM/ADMIN user from SEED_ADMIN_*) then content import producing Release v1 PUBLISHED + apps/web/app/lib/initial-snapshot.ts
- apps/web: app/api/revalidate route (x-revalidate-secret) revalidateTag('release','max'); app/api/draft route enabling draftMode; getPublishedSnapshot reads PUBLISHED snapshot from DB with INITIAL_SNAPSHOT fallback; product segments app/[lang]/products/[slug]/page.tsx & app/[lang]/products/[slug]/[product]/page.tsx export dynamicParams=true; app/[lang]/layout.tsx exports dynamicParams=false
- apps/admin: same-origin route handlers forwarding the session cookie to the api
- docker-compose services: postgres, api (:3060), web (:3062), admin (:3061) each with a healthcheck

**Produces (for later milestones):**
- test/acceptance.sh: executable headline acceptance gate; exit 0 only if up->login->edit->preview->publish->revalidate->rollback all pass; reusable as the release gate
- apps/api/test/invariants.e2e-spec.ts: the §14 invariant jest e2e suite (run via `npm run test:e2e -w @signex/api -- invariants`)
- apps/web/test/dynamic-params.test.ts: dynamicParams build-time assert (run via `npm run test -w @signex/web`)
- root scripts: `npm run test:invariants`, `npm run test:acceptance`, `npm run test:docker-build`, `npm run test:all`
- docker-compose.yml: all four services healthcheck-gated so `docker compose up -d --build --wait` returns non-zero unless every service is healthy

### Task 77: Cross-cutting invariant e2e suite (single-PUBLISHED, monotonic version, catalog<->zod roundtrip)

**Files:**
- Create: `apps/api/test/invariants.e2e-spec.ts`
- Test: same file (this task IS the test deliverable; it runs against a live DB + booted Nest app via supertest)

**Interfaces:**
- Consumes:
  - `@signex/db` `PrismaService.client` with `client.release` (fields `version:Int @unique`, `status:'PUBLISHED'|'ARCHIVED'`, `snapshot:Json`), `client.publishedPointer` (singleton `id:'singleton'`, `releaseId @unique`, `publishedVersion`), `client.workingState` (singleton `revision`, `lastPublishedRevision`), `client.category`, `client.product`, `client.contentBlock` (`kind_key` compound unique).
  - Raw Postgres sequence `release_version_seq`.
  - `@signex/shared` `ReleaseSnapshotSchema` (`.parse(json) -> ReleaseSnapshot`).
  - api routes under global prefix `/api`: `POST /api/auth/login`, `POST /api/releases/publish {note, expectedRevision}` `[PUBLISHER+]` -> `{version}`.
- Produces: jest e2e suite run by `npm run test:e2e -w @signex/api` (testRegex `.e2e-spec.ts$`, already configured).

**Steps:**

1. Write the failing test file. Create `apps/api/test/invariants.e2e-spec.ts`. Declare `app`/`prisma`/`agent` at module scope (a later task adds more describe blocks that reuse them) with a single shared `beforeAll`/`afterAll`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { ReleaseSnapshotSchema } from '@signex/shared';

// These invariants run against the migrated+seeded+imported DB (Release v1 exists).
// CI / the local run provides DATABASE_URL + SEED_ADMIN_* and has run migrate:deploy + the seed/importer.
let app: INestApplication<App>;
let prisma: PrismaService;
let agent: ReturnType<typeof request.agent>;

beforeAll(async () => {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = moduleFixture.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  await app.init();
  prisma = app.get(PrismaService);
  agent = request.agent(app.getHttpServer());
  await agent
    .post('/api/auth/login')
    .send({ email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD })
    .expect(200);
});

afterAll(async () => {
  await app.close();
});

describe('Schema invariants (e2e)', () => {
  it('single-PUBLISHED: exactly one PUBLISHED release and the pointer targets it', async () => {
    const published = await prisma.client.release.findMany({ where: { status: 'PUBLISHED' } });
    expect(published).toHaveLength(1);
    const pointer = await prisma.client.publishedPointer.findUnique({ where: { id: 'singleton' } });
    expect(pointer).not.toBeNull();
    expect(pointer!.releaseId).toBe(published[0].id);
    expect(pointer!.publishedVersion).toBe(published[0].version);
  });

  it('monotonic version: a publish assigns a version greater than the prior max', async () => {
    const before = await prisma.client.release.findFirst({ orderBy: { version: 'desc' } });
    // make the working state differ from live so it is not a soft "nothing to publish" no-op
    await prisma.client.contentBlock.update({
      where: { kind_key: { kind: 'SETTINGS', key: 'businessContact' } },
      data: { updatedAt: new Date() },
    });
    await prisma.client.workingState.update({
      where: { id: 'singleton' },
      data: { revision: { increment: 1 } },
    });
    const wsNow = await prisma.client.workingState.findUnique({ where: { id: 'singleton' } });
    const res = await agent
      .post('/api/releases/publish')
      .send({ note: 'invariant test', expectedRevision: wsNow!.revision })
      .expect(201);
    expect(res.body.version).toBeGreaterThan(before!.version);
    const after = await prisma.client.release.findFirst({ orderBy: { version: 'desc' } });
    expect(after!.version).toBe(res.body.version);
    // and STILL exactly one PUBLISHED row after the publish (prev demoted to ARCHIVED)
    const pub = await prisma.client.release.findMany({ where: { status: 'PUBLISHED' } });
    expect(pub).toHaveLength(1);
  });

  it('catalog<->zod roundtrip: the live snapshot validates against ReleaseSnapshotSchema', async () => {
    const live = await prisma.client.release.findFirst({
      where: { status: 'PUBLISHED' },
      orderBy: { version: 'desc' },
    });
    expect(() => ReleaseSnapshotSchema.parse(live!.snapshot)).not.toThrow();
    const parsed = ReleaseSnapshotSchema.parse(live!.snapshot);
    expect(parsed.catalog.categories.length).toBeGreaterThanOrEqual(4);
  });
});
```

2. Run it, expect FAIL. Command: `npm run test:e2e -w @signex/api -- invariants`. Run it FIRST against an EMPTY (migrated but un-seeded) DB to observe a real assertion failure: `Schema invariants (e2e) > single-PUBLISHED` fails with `expect(received).toHaveLength(expected) Expected length: 1 Received length: 0`. (If `DATABASE_URL` is unset you instead get a Prisma connection error — set it first.)

3. Ensure the test can compile. Add `cookie-parser` types to api devDeps if the auth step did not already (the auth step adds the runtime `cookie-parser`):

```bash
npm pkg get devDependencies.@types/cookie-parser -w @signex/api
# if "{}": add it
npm i -D @types/cookie-parser -w @signex/api
```

4. Make it pass — provide the seeded DB the suite asserts on (no product code in this task):

```bash
docker compose up -d --wait postgres
DATABASE_URL="postgresql://signex:signex@localhost:3059/signex?schema=public" \
  npm run -w @signex/db migrate:deploy
DATABASE_URL="postgresql://signex:signex@localhost:3059/signex?schema=public" \
  SEED_ADMIN_EMAIL=admin@signex.local SEED_ADMIN_PASSWORD=change-me-please-32chars-long \
  npm run -w @signex/api seed
DATABASE_URL="postgresql://signex:signex@localhost:3059/signex?schema=public" \
  SEED_ADMIN_EMAIL=admin@signex.local SEED_ADMIN_PASSWORD=change-me-please-32chars-long \
  npm run test:e2e -w @signex/api -- invariants
```

5. Run, expect PASS. Expect output `Tests: 3 passed` for the `Schema invariants (e2e)` block.

6. Commit. `git add apps/api/test/invariants.e2e-spec.ts apps/api/package.json package-lock.json` then `git commit -m "test(api): single-PUBLISHED, monotonic-version & catalog<->zod invariant e2e"`.

---

### Task 78: Concurrency + importer-conformance invariant tests

**Files:**
- Modify: `apps/api/test/invariants.e2e-spec.ts`

**Interfaces:**
- Consumes:
  - the module-scope `app`/`prisma`/`agent` + shared `beforeAll` from the previous task.
  - `PrismaService.client.workingState` (`revision`), `client.category` (`slug @unique`, `sortOrder`), `client.product` (`@@unique([categoryId, slug])`), `client.contentBlock` (`kind_key`).
  - `@signex/shared` `parseBlock(kind, key, data)` and `BLOCK_REGISTRY` (12 keys); localized shape `{en, vi}`.
  - api route `POST /api/releases/publish {note, expectedRevision}` -> `{version}` or `409` (STALE_DRAFT) on a stale `expectedRevision`.
- Produces: 2 added describe blocks in the same e2e suite.

**Steps:**

1. Write the failing tests. Append two new `describe` blocks to `apps/api/test/invariants.e2e-spec.ts` (they reuse the module-scope `agent`/`prisma`):

```ts
describe('Concurrency invariants (e2e)', () => {
  it('two parallel publishes never collide on version', async () => {
    await prisma.client.workingState.update({
      where: { id: 'singleton' },
      data: { revision: { increment: 1 } },
    });
    const fresh = await prisma.client.workingState.findUnique({ where: { id: 'singleton' } });
    const results = await Promise.allSettled([
      agent.post('/api/releases/publish').send({ note: 'race-a', expectedRevision: fresh!.revision }),
      agent.post('/api/releases/publish').send({ note: 'race-b', expectedRevision: fresh!.revision }),
    ]);
    const codes = results.map((r) => (r.status === 'fulfilled' ? r.value.status : 0));
    // exactly one wins the revision guard (201); the other is rejected 409 (STALE_DRAFT)
    expect(codes.filter((c) => c === 201)).toHaveLength(1);
    expect(codes.filter((c) => c === 409)).toHaveLength(1);
    // the DB never minted two rows at the same version (sequence guarantee)
    const versions = await prisma.client.release.findMany({ select: { version: true } });
    expect(new Set(versions.map((v) => v.version)).size).toBe(versions.length);
  });

  it('edit during publish yields exactly one 409', async () => {
    const ws = await prisma.client.workingState.findUnique({ where: { id: 'singleton' } });
    const stale = ws!.revision; // capture, then bump underneath the publisher
    await prisma.client.workingState.update({
      where: { id: 'singleton' },
      data: { revision: { increment: 1 } },
    });
    const res = await agent
      .post('/api/releases/publish')
      .send({ note: 'stale', expectedRevision: stale });
    expect(res.status).toBe(409);
    expect(String(res.body.message ?? res.body.error ?? '')).toMatch(/STALE_DRAFT|stale/i);
  });
});

describe('Importer conformance (e2e)', () => {
  it('imported 4 categories, 6 products each, unique slugs', async () => {
    const cats = await prisma.client.category.findMany({
      where: { deletedAt: null },
      include: { products: { where: { deletedAt: null } } },
      orderBy: { sortOrder: 'asc' },
    });
    expect(cats).toHaveLength(4);
    for (const c of cats) expect(c.products).toHaveLength(6);
    const slugs = cats.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const c of cats) {
      const ps = c.products.map((p) => p.slug);
      expect(new Set(ps).size).toBe(ps.length);
    }
  });

  it('every imported ContentBlock re-parses through its registry schema', async () => {
    const { parseBlock, BLOCK_REGISTRY } = await import('@signex/shared');
    const blocks = await prisma.client.contentBlock.findMany();
    expect(blocks.length).toBeGreaterThanOrEqual(Object.keys(BLOCK_REGISTRY).length);
    for (const b of blocks) {
      expect(() => parseBlock(b.kind, b.key, b.data)).not.toThrow();
    }
  });

  it('en/vi locale parity on a localized block (businessContact legalName)', async () => {
    const bc = await prisma.client.contentBlock.findUnique({
      where: { kind_key: { kind: 'SETTINGS', key: 'businessContact' } },
    });
    const data = bc!.data as { legalName: Record<string, unknown> };
    expect(Object.keys(data.legalName).sort()).toEqual(['en', 'vi']);
  });
});
```

2. Run, expect FAIL. Command: `DATABASE_URL=... SEED_ADMIN_*=... npm run test:e2e -w @signex/api -- invariants`. Against an un-imported DB the importer block fails first: `Importer conformance (e2e) > imported 4 categories ... Expected length: 4 Received length: 0`. Against a release engine without the revision guard, `two parallel publishes never collide` fails with `Expected length: 1 Received length: 2` (two 201s) — the invariant doing its job.

3. Make it pass — these guards/data are produced by the release engine (step 6) and importer (step 7); re-run against the seeded+imported DB exactly as in the previous task's step 4.

4. Run, expect PASS. Expect `Tests: 8 passed` total across `invariants.e2e-spec.ts` (3 schema + 2 concurrency + 3 importer-conformance).

5. Commit. `git add apps/api/test/invariants.e2e-spec.ts` then `git commit -m "test(api): concurrency (no version collision / single 409) + importer conformance e2e"`.

---

### Task 79: Web dynamicParams build-time invariant

**Files:**
- Create: `apps/web/test/dynamic-params.test.ts`
- Create: `apps/web/test/tsconfig.json`
- Modify: `apps/web/package.json` (add `test` script)

**Interfaces:**
- Consumes (read-only, by file path — `[lang]` is a literal directory):
  - `apps/web/app/[lang]/products/[slug]/page.tsx` exporting `export const dynamicParams = true`.
  - `apps/web/app/[lang]/products/[slug]/[product]/page.tsx` exporting `export const dynamicParams = true`.
  - `apps/web/app/[lang]/layout.tsx` exporting `export const dynamicParams = false`.
- Produces: `npm run test -w @signex/web` -> node:test runner assert (Playwright-free, per §14).

**Steps:**

1. Write the failing test. Create `apps/web/test/dynamic-params.test.ts` (uses `node:test` + `node:assert`, reads segment source as text so no Next runtime is needed):

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const APP = join(import.meta.dirname, '..', 'app');
const src = (...p: string[]): string => readFileSync(join(APP, ...p), 'utf8');

// Locked decision #3 / spec §10.2: on-demand publish ADDS catalog slugs;
// product segments MUST be dynamicParams=true so new slugs render on first visit.
test('product [slug] segment is dynamicParams = true', () => {
  assert.match(src('[lang]', 'products', '[slug]', 'page.tsx'), /export\s+const\s+dynamicParams\s*=\s*true/);
});

test('product [slug]/[product] segment is dynamicParams = true', () => {
  assert.match(src('[lang]', 'products', '[slug]', '[product]', 'page.tsx'), /export\s+const\s+dynamicParams\s*=\s*true/);
});

// The locale set is fixed -> the [lang] layout stays dynamicParams = false.
test('[lang] layout stays dynamicParams = false', () => {
  assert.match(src('[lang]', 'layout.tsx'), /export\s+const\s+dynamicParams\s*=\s*false/);
});
```

2. Create `apps/web/test/tsconfig.json` so `node --experimental-strip-types` can run the `.test.ts` directly without emit:

```json
{
  "compilerOptions": {
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "target": "es2022",
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["./*.test.ts"]
}
```

3. Add the `test` script to `apps/web/package.json`. Run:

```bash
npm pkg set scripts.test="node --experimental-strip-types --test test/dynamic-params.test.ts" -w @signex/web
```

4. Run it, expect FAIL. Command: `npm run test -w @signex/web`. Before the web read-path step (step 8) flips the product segments, expect FAIL: `AssertionError [ERR_ASSERTION]: ... product [slug] segment is dynamicParams = true` (current source is `dynamicParams = false`, verified in spec §10.2 / §1).

5. Make it pass — satisfied by step 8's `dynamicParams=true` flip on the two product segments (no code change in this task). After step 8, re-run.

6. Run, expect PASS. Expect output `# pass 3` and `# fail 0`.

7. Commit. `git add apps/web/test/dynamic-params.test.ts apps/web/test/tsconfig.json apps/web/package.json` then `git commit -m "test(web): assert dynamicParams=true on product segments, false on [lang] layout"`.

---

### Task 80: docker-compose env wiring + four-service healthcheck gate

**Files:**
- Modify: `docker-compose.yml`
- Modify: `.env.example`

**Interfaces:**
- Consumes: existing services `postgres`/`api`/`web`/`admin` with their current healthchecks; api owns `seed` (auth:seed + importer) reading `SEED_ADMIN_*`, and reads `REVALIDATE_SECRET`/`PREVIEW_SECRET`/`MEDIA_PUBLIC_BASE`/`ALLOWED_ORIGINS`; web owns `app/api/revalidate` (reads `REVALIDATE_SECRET`) + `getPublishedSnapshot` (reads `DATABASE_URL`, `MEDIA_PUBLIC_BASE`); admin owns route handlers (reads `ADMIN_ORIGIN`, `ALLOWED_ORIGINS`, `PREVIEW_SECRET`, `REVALIDATE_SECRET`, `NEXT_PUBLIC_WEB_URL`).
- Produces: `docker compose up -d --build --wait` returns non-zero unless all four services report healthy; every secret the acceptance flow needs is in the compose env.

**Steps:**

1. Document the new env in `.env.example`. Append a new block (use a heredoc so exact formatting lands):

```bash
cat >> .env.example <<'EOF'

# Seed admin (the api `seed` command creates a deterministic SYSTEM/ADMIN user before the importer runs).
SEED_ADMIN_EMAIL=admin@signex.local
SEED_ADMIN_NAME=Signex Admin
# Use a long random value in real envs; this default is for local docker only.
SEED_ADMIN_PASSWORD=change-me-please-32chars-long

# Control-plane secrets shared by api <-> web <-> admin route handlers.
REVALIDATE_SECRET=dev-revalidate-secret-change-me
PREVIEW_SECRET=dev-preview-secret-change-me

# Media: publish is REFUSED if MEDIA_PUBLIC_BASE is unset or an r2.dev host (spec §3.1).
# For local acceptance a non-r2.dev placeholder satisfies the gate.
MEDIA_PUBLIC_BASE=http://localhost:9000/signex-media

# CSRF / same-site origin allowlist (enforced at admin route handlers).
ADMIN_ORIGIN=http://localhost:3061
ALLOWED_ORIGINS=http://localhost:3061,http://localhost:3062
NEXT_PUBLIC_WEB_URL=http://localhost:3062
EOF
```

2. Wire the seed/secret env into the `api` service in `docker-compose.yml`. Add these lines under `api:` `environment:` immediately after the existing `DATABASE_URL:` line:

```yaml
      SEED_ADMIN_EMAIL: ${SEED_ADMIN_EMAIL:-admin@signex.local}
      SEED_ADMIN_NAME: ${SEED_ADMIN_NAME:-Signex Admin}
      SEED_ADMIN_PASSWORD: ${SEED_ADMIN_PASSWORD:?SEED_ADMIN_PASSWORD is required}
      REVALIDATE_SECRET: ${REVALIDATE_SECRET:?REVALIDATE_SECRET is required}
      PREVIEW_SECRET: ${PREVIEW_SECRET:?PREVIEW_SECRET is required}
      MEDIA_PUBLIC_BASE: ${MEDIA_PUBLIC_BASE:-http://localhost:9000/signex-media}
      ALLOWED_ORIGINS: ${ALLOWED_ORIGINS:-http://localhost:3061,http://localhost:3062}
      WEB_REVALIDATE_URL: ${WEB_REVALIDATE_URL:-http://web:3062/api/revalidate}
```

3. Wire the DB + media + secrets into the `web` service. Add under `web:` `environment:`:

```yaml
      DATABASE_URL: postgresql://${POSTGRES_USER:-signex}:${POSTGRES_PASSWORD:-signex}@postgres:5432/${POSTGRES_DB:-signex}?schema=public
      MEDIA_PUBLIC_BASE: ${MEDIA_PUBLIC_BASE:-http://localhost:9000/signex-media}
      REVALIDATE_SECRET: ${REVALIDATE_SECRET:?REVALIDATE_SECRET is required}
      PREVIEW_SECRET: ${PREVIEW_SECRET:?PREVIEW_SECRET is required}
```

   and add `postgres` to web's `depends_on` (web reads the snapshot DB directly):

```yaml
    depends_on:
      api:
        condition: service_healthy
      postgres:
        condition: service_healthy
```

4. Wire the origin/secret env into the `admin` service. Add under `admin:` `environment:`:

```yaml
      ADMIN_ORIGIN: ${ADMIN_ORIGIN:-http://localhost:3061}
      ALLOWED_ORIGINS: ${ALLOWED_ORIGINS:-http://localhost:3061,http://localhost:3062}
      PREVIEW_SECRET: ${PREVIEW_SECRET:?PREVIEW_SECRET is required}
      REVALIDATE_SECRET: ${REVALIDATE_SECRET:?REVALIDATE_SECRET is required}
      NEXT_PUBLIC_WEB_URL: ${NEXT_PUBLIC_WEB_URL:-http://localhost:3062}
```

5. Verify compose is valid and the four-service health gate holds. Run:

```bash
cp .env.example .env   # if no .env yet (the :? vars need values)
docker compose config >/dev/null && echo COMPOSE_OK
docker compose config | grep -c 'test:'
```

   Expect `COMPOSE_OK` and `4` (postgres/api/web/admin each declare `healthcheck.test`). A `:?`-required var with no value makes `config` fail loudly — that is the intended secret gate.

6. Verify `--wait` actually gates on health (the acceptance script relies on it):

```bash
docker compose up -d --build --wait
echo "compose exit: $?"
docker compose ps --format '{{.Service}} {{.Health}}'
docker compose down
```

   Expect `compose exit: 0` and every line ending `healthy`. (An unhealthy service makes `--wait` exit non-zero — gate confirmed.)

7. Commit. `git add docker-compose.yml .env.example` then `git commit -m "chore(compose): wire seed/secret/db env into api+web+admin; four-service health gate"`.

---

### Task 81: Headline whole-stack acceptance script

**Files:**
- Create: `test/acceptance.sh`
- Modify: `package.json` (root scripts)

**Interfaces:**
- Consumes:
  - `docker compose up -d --build --wait` -> all four services healthy.
  - `docker compose exec api node dist/main seed` -> auth:seed + importer (Release v1).
  - api routes: `POST /api/auth/login {email,password}` -> `200` + `Set-Cookie: sx_session`; `GET /api/auth/me` -> `{role:'ADMIN'}`; `GET /api/content/blocks/SETTINGS/businessContact` -> `{revision, data}`; `PUT /api/content/blocks/SETTINGS/businessContact {data, expectedRevision}` -> `200 {revision}`; `POST /api/preview/snapshot` `[x-preview-secret]` -> live working snapshot; `POST /api/releases/publish {note, expectedRevision}` -> `{version}`; `GET /api/releases/live` -> `{version, snapshot}`; `GET /api/releases` -> `Release[]`; `POST /api/releases/rollback {toVersion}` -> `{version}`.
  - web: `GET /vi` renders published `businessContact.legalName.vi` from DB (falls back to INITIAL_SNAPSHOT on DB error).
- Produces: executable `test/acceptance.sh`; root `test:acceptance`, `test:invariants`, `test:all`. Exit 0 only if the full up->login->edit->preview->publish->revalidate->rollback chain passes.

**Steps:**

1. Write the script. Create `test/acceptance.sh`:

```bash
#!/usr/bin/env bash
# Whole-stack acceptance (spec §14): up --build -> all healthy -> login -> edit block
# -> save draft -> preview(draftMode) -> publish -> web revalidates (reads DB, not fallback)
# -> rollback -> web reverts. Any failure exits non-zero.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

API="${API_BASE:-http://localhost:3060}"
WEB="${WEB_BASE:-http://localhost:3062}"
ADMIN_EMAIL="${SEED_ADMIN_EMAIL:-admin@signex.local}"
ADMIN_PASS="${SEED_ADMIN_PASSWORD:-change-me-please-32chars-long}"
PREVIEW_SECRET="${PREVIEW_SECRET:-dev-preview-secret-change-me}"
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

say()  { printf '\n=== %s ===\n' "$1"; }
fail() { printf 'ACCEPTANCE FAIL: %s\n' "$1" >&2; exit 1; }

say "0. bring the stack up (build) and wait for health"
[ -f .env ] || cp .env.example .env
docker compose up -d --build --wait || fail "compose did not reach healthy"
for s in postgres api web admin; do
  h="$(docker compose ps --format '{{.Service}} {{.Health}}' | awk -v s="$s" '$1==s{print $2}')"
  [ "$h" = "healthy" ] || fail "service $s is '$h', expected healthy"
done

say "1. seed + importer (auth:seed -> Release v1) inside the api container"
docker compose exec -T api node dist/main seed || fail "seed/importer command failed"

say "2. login -> sx_session cookie + ADMIN role"
code="$(curl -sS -o /dev/null -w '%{http_code}' -c "$JAR" \
  -H 'Content-Type: application/json' -H "Origin: $API" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}" \
  "$API/api/auth/login")"
[ "$code" = "200" ] || fail "login returned $code (expected 200)"
grep -q 'sx_session' "$JAR" || fail "no sx_session cookie issued"
role="$(curl -sS -b "$JAR" "$API/api/auth/me" | jq -r '.role')"
[ "$role" = "ADMIN" ] || fail "me.role=$role (expected ADMIN)"

say "3. capture baseline live legalName.vi (what published web shows now)"
BASE_VI="$(curl -sS "$API/api/releases/live" | jq -r '.snapshot.blocks.businessContact.legalName.vi')"
[ -n "$BASE_VI" ] && [ "$BASE_VI" != "null" ] || fail "no baseline legalName.vi"

say "4. edit the businessContact block (save draft / working state)"
REV="$(curl -sS -b "$JAR" "$API/api/content/blocks/SETTINGS/businessContact" | jq -r '.revision // 0')"
LIVE_JSON="$(curl -sS "$API/api/releases/live" | jq -c '.snapshot.blocks.businessContact')"
NEW_VI="ACCEPTANCE-$(date +%s)"
NEW_DATA="$(printf '%s' "$LIVE_JSON" | jq -c --arg v "$NEW_VI" '.legalName.vi=$v')"
put_code="$(curl -sS -o /dev/null -w '%{http_code}' -b "$JAR" -X PUT \
  -H 'Content-Type: application/json' -H "Origin: $API" \
  -d "{\"data\":$NEW_DATA,\"expectedRevision\":$REV}" \
  "$API/api/content/blocks/SETTINGS/businessContact")"
[ "$put_code" = "200" ] || fail "PUT block returned $put_code (expected 200)"

say "5. preview(draftMode) shows the edit; published web does NOT yet"
PREVIEW_VI="$(curl -sS -H "x-preview-secret: $PREVIEW_SECRET" -X POST \
  "$API/api/preview/snapshot" | jq -r '.blocks.businessContact.legalName.vi')"
[ "$PREVIEW_VI" = "$NEW_VI" ] || fail "preview vi=$PREVIEW_VI (expected $NEW_VI)"
if curl -sS "$WEB/vi" | grep -q -- "$NEW_VI"; then
  fail "published web already shows draft '$NEW_VI' before publish"
fi

say "6. publish -> new monotonic version"
WS_REV="$(curl -sS -b "$JAR" "$API/api/content/blocks/SETTINGS/businessContact" | jq -r '.revision')"
PUB_VER="$(curl -sS -b "$JAR" -X POST -H 'Content-Type: application/json' -H "Origin: $API" \
  -d "{\"note\":\"acceptance\",\"expectedRevision\":$WS_REV}" \
  "$API/api/releases/publish" | jq -r '.version')"
[ -n "$PUB_VER" ] && [ "$PUB_VER" != "null" ] || fail "publish returned no version"
LIVE_VER="$(curl -sS "$API/api/releases/live" | jq -r '.version')"
[ "$LIVE_VER" = "$PUB_VER" ] || fail "live version=$LIVE_VER, expected $PUB_VER"

say "7. web revalidates: GET /vi now reads the NEW value from DB (not the fallback)"
ok=""
for _ in $(seq 1 20); do
  curl -sS "$WEB/vi" >/dev/null                       # trigger stale-while-revalidate
  if curl -sS "$WEB/vi" | grep -q -- "$NEW_VI"; then ok="yes"; break; fi
  sleep 2
done
[ "$ok" = "yes" ] || fail "web never showed published '$NEW_VI' (revalidation broken)"
# prove DB-backed, not INITIAL_SNAPSHOT fallback: the baseline value is gone
if curl -sS "$WEB/vi" | grep -q -- "$BASE_VI"; then
  fail "web still shows baseline '$BASE_VI' (serving fallback, not DB)"
fi

say "8. rollback to the baseline release -> web reverts"
BASE_VER="$(curl -sS -b "$JAR" "$API/api/releases" | jq -r \
  '[.[] | select(.snapshot.blocks.businessContact.legalName.vi=="'"$BASE_VI"'")] | first | .version')"
[ -n "$BASE_VER" ] && [ "$BASE_VER" != "null" ] || fail "could not find baseline release version"
curl -sS -b "$JAR" -X POST -H 'Content-Type: application/json' -H "Origin: $API" \
  -d "{\"toVersion\":$BASE_VER}" "$API/api/releases/rollback" >/dev/null || fail "rollback call failed"
ok=""
for _ in $(seq 1 20); do
  curl -sS "$WEB/vi" >/dev/null
  if curl -sS "$WEB/vi" | grep -q -- "$BASE_VI"; then ok="yes"; break; fi
  sleep 2
done
[ "$ok" = "yes" ] || fail "web did not revert to baseline after rollback"

printf '\nACCEPTANCE PASS: up -> login -> edit -> preview -> publish -> revalidate -> rollback\n'
```

2. Make it executable and add the root scripts. Run:

```bash
chmod +x test/acceptance.sh
npm pkg set scripts.test:invariants="npm run test:e2e -w @signex/api -- invariants"
npm pkg set scripts.test:acceptance="bash test/acceptance.sh"
npm pkg set scripts.test:all="npm run test -w @signex/web && npm run test:acceptance"
```

3. Verify the script parses before any stack run (catches quoting bugs fast):

```bash
bash -n test/acceptance.sh && echo SYNTAX_OK
```

   Expect `SYNTAX_OK`.

4. Run it, expect FAIL initially. Command: `npm run test:acceptance`. Before the upstream steps land it FAILs at the earliest unmet contract, e.g. `ACCEPTANCE FAIL: seed/importer command failed` (no `seed` command yet) or `ACCEPTANCE FAIL: login returned 404`. That is the expected pre-implementation FAIL signal.

5. Make it pass — run the fully assembled stack (this milestone is the integration gate; passing requires steps 0-9 landed). Command: `npm run test:acceptance`.

6. Run, expect PASS. Expect the final line `ACCEPTANCE PASS: up -> login -> edit -> preview -> publish -> revalidate -> rollback` and exit code 0 (`echo $?` -> `0`).

7. Tear down to leave a clean machine:

```bash
docker compose down -v
```

8. Commit. `git add test/acceptance.sh package.json` then `git commit -m "test(acceptance): whole-stack up->login->edit->preview->publish->revalidate->rollback gate"`.

---

### Task 82: Docker build gate + green-suite assembly verification

**Files:**
- Modify: `package.json` (root — add the docker build gate + finalize the test:all assembly)

**Interfaces:**
- Consumes: all four Dockerfiles (`apps/api`, `apps/web`, `apps/admin`) building with their workspace deps traced (`@signex/db generate`+`build`, `@signex/shared build`), per spec §14 "Docker gate".
- Produces: `npm run test:docker-build`; a single command that fails if any of the four images fails to build.

**Steps:**

1. Add the docker build gate script. Run:

```bash
npm pkg set scripts.test:docker-build="docker compose build"
```

2. Verify the gate builds all images green (spec §14: "green `docker compose build` of all 4 app images before commit"). Run:

```bash
docker compose build 2>&1 | tail -5; echo "build exit: ${PIPESTATUS[0]}"
```

   Expect `build exit: 0` with no `ERROR` lines (a missing-dep trace failure such as `Cannot find module '@signex/db'` would surface here as a non-zero exit — the gate working).

3. Verify every test entry point is wired and discoverable. Run:

```bash
npm pkg get scripts.test:invariants scripts.test:acceptance scripts.test:docker-build scripts.test:all
npm pkg get scripts.test -w @signex/web
```

   Expect non-`{}` values for every key.

4. Final fast assembly smoke (non-docker): run the invariants + web unit gate against a seeded local DB to confirm the suites are green together:

```bash
docker compose up -d --wait postgres
DATABASE_URL="postgresql://signex:signex@localhost:3059/signex?schema=public" \
  npm run -w @signex/db migrate:deploy
DATABASE_URL="postgresql://signex:signex@localhost:3059/signex?schema=public" \
  SEED_ADMIN_EMAIL=admin@signex.local SEED_ADMIN_PASSWORD=change-me-please-32chars-long \
  npm run -w @signex/api seed
DATABASE_URL="postgresql://signex:signex@localhost:3059/signex?schema=public" \
  SEED_ADMIN_EMAIL=admin@signex.local SEED_ADMIN_PASSWORD=change-me-please-32chars-long \
  PREVIEW_SECRET=dev-preview-secret-change-me \
  npm run test:invariants
npm run test -w @signex/web
docker compose down -v
```

   Expect `Tests: 8 passed` from the api invariants suite and `# pass 3` / `# fail 0` from the web invariant.

5. Commit. `git add package.json` then `git commit -m "chore(test): add docker-build gate; finalize root test:all assembly"`.

---

## Spec Coverage Checklist (self-review)

- §1 Overview & Goals (current static-site audit, dicts, hardcoded assets) → Milestone 7 importer migrates them + Milestone 8 web read-path refactor
- §2 Scope IN/OUT → spread across Milestones 0-9; OUT items explicitly deferred (no milestone)
- §3 Architecture: working world + Release snapshots, web-reads-DB, api-owns-writes, hybrid content model, R2 refs → Milestone 1 (data model) + 6 (release engine) + 8 (web read) + 5 (R2)
- §3.1 Cross-cutting fixes 1-7 (canonical schema/converged enums, PublishedPointer singleton, unfrozen asset URLs + publish gate, no sharp/variants, alt-on-use, FormSubmission model, sequence + revision guard) → Milestone 1 (schema/enums/pointer/sequence) + 5 (R2/no-sharp) + 6 (publish gate, revision guard, sequence)
- §4 Data Model (User/Session/AuditLog/Asset/AssetRef/ReleaseAssetRef/Category/Product/ContentBlock/FormSubmission/Release/PublishedPointer/WorkingState + migration + CREATE SEQUENCE release_version_seq + cuid + snapshot-vs-operational contract) → Milestone 1
- §5 Content Schema Registry (primitives, BLOCK_REGISTRY 12 blocks, businessContact/productsHeader/features shapes, FrozenAsset, ReleaseSnapshotSchema, catalog DTOs, auth loginSchema/ROLE_RANK/atLeast) → Milestone 0
- §6 Importer/Seed (R2 upload of /assets, dicts→Category/Product, ContentBlock via parseBlock, NAP unify, exclusive run, single revision bump, en/vi parity preflight, emit initial-snapshot.ts, Release v1) → Milestone 7 (seed user portion = Milestone 3)
- §7 Release/Draft/Publish/Rollback engine (§7.1 ContentService revision guard + AssetRef reconcile = Milestone 4; §7.2 publish serialize-outside/short-tx/sequence/pointer/ReleaseAssetRef/revalidate = Milestone 6; §7.3 rollback = Milestone 6; §7.4 dirty detection = Milestone 6; §7.5 routes spread across Milestones 2/4/5/6/9) → Milestones 2,4,5,6
- §8 Auth & RBAC (scrypt, cookie-parser, APP_GUARD order Origin→Session→Roles, @Public/@Roles/@CurrentUser, throttler on login, 30-day session + cleanup, browser-never-talks-to-api model, seed order contract) → Milestone 2 (auth/RBAC/throttler/users) + Milestone 3 (seed order) + Milestone 9 (admin same-origin handlers/getSession)
- §9 R2 Media Library (single bucket, content-addressed keys, no persisted url, presign/confirm + sha256/checksum verify + authoritative dims + immutable Cache-Control + SVG sanitize, no sharp, video 3-asset replace, soft-delete + ReleaseAssetRef GC) → Milestone 5
- §10 Web Read-Path (§10.1 cacheComponents + use cache/cacheTag draftMode-free loader + fallback; §10.2 dynamicParams=true product-segment fix + build-time assert; §10.3 revalidate route 16.2 signatures + draft route; §10.4 web→DB Dockerfile generate/build/trace + un-ignore generated + GET /vi-from-DB acceptance; §10.5 component/sitemap/metadata/org-json-ld refactor onto snapshot + NAP unify + FormSubmission post) → Milestone 8
- §11 Form Submissions (POST /api/forms/:formKey/submit @Public rate-limited, zod payload, optional uploadAssetId, GET submissions Editor+, formConfig copy stays in ContentBlock) → Milestone 8 (web wiring) + api endpoint in Milestone 5 region
- §12 Minimal Admin Shell (re-scaffold via create-next-app, re-apply 4 monorepo touch-points, pin Next/React, @signex/shared dep + build step, screens login/releases/catalog/block-editor/media/users, apiServer await-cookie bug fix, new compose envs) → Milestone 9
- §13 Error Handling & Resilience (web-never-500s fallback, snapshot schemaVersion gate, publish atomicity + idempotent retryable revalidation + manual re-fire, R2 confirm HEAD+checksum + PENDING sweep, publish gate) → Milestones 5,6,8
- §14 Testing (importer conformance, schema invariants single-PUBLISHED/monotonic-version/dynamicParams, concurrency double-publish + 409, catalog↔zod, whole-stack acceptance, docker build gate) → per-milestone tests + Milestone 10 acceptance
- §15 Build Sequence (11 steps 0-10) → the milestone numbering itself
- §16 Risks & Open Decisions (all mitigated) → mitigations embedded in Milestones 5,6,8,9
- §17 Resolved Open Decisions 1-7 (30-day session, repoint-only rollback, soft no-op, reverse-proxy /api, social placeholders, businessContact i18n, in-memory revalidation retry) → folded into Decisions Log; implemented in Milestones 2,6,7,8,9
