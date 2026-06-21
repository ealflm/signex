# Task 81 Report: Whole-stack Acceptance Script

## Seed-command Reconciliation

Chose **option (a)**: added a `seed` subcommand to `apps/api/src/main.ts`.

- When `process.argv.includes('seed')`, `runSeed()` is called instead of `bootstrap()`.
- `runSeed()` creates an `AppModule` standalone context → gets `SeedService` → calls `seedAdmin(readSeedAdminConfig())` (upserts SYSTEM/ADMIN user — fully idempotent via upsert).
- Then creates an `ImporterModule` standalone context → calls `ImporterService.run()`.
- The importer's own idempotency guard throws `"content already imported — a Release row exists"` when re-run. This is caught in `runSeed()` and treated as a no-op (exits 0). The acceptance script is therefore re-runnable on an already-seeded DB.
- Static imports used (not dynamic) to satisfy `node16` module resolution.
- Invocation: `docker compose exec -T api node dist/main seed`

## Preview Endpoint Decision

Added `POST /api/preview/snapshot` to the API:

- New files: `apps/api/src/preview/preview.controller.ts`, `apps/api/src/preview/preview.module.ts`
- Registered in `AppModule`.
- `@Public()` to bypass session/role/origin guards; gated solely by `x-preview-secret` header matching `process.env.PREVIEW_SECRET`.
- Returns live working snapshot via `SnapshotSerializer.serialize()` (same serializer the publish path uses).
- The acceptance script's step 5 checks the preview snapshot shows the sentinel before publish.
- The web's `getPreviewSnapshot()` (in `apps/web/app/lib/content.ts`) already calls `POST /api/preview/snapshot` — this endpoint now satisfies that call.

## getLive() Snapshot Inclusion

Extended `ReleaseService.getLive()` and `ReleaseController.live()` to include the `snapshot` field. The acceptance script's step 3 reads `legalName.vi` from `GET /api/releases/live` to capture the baseline before editing. The brief's script template required `.snapshot.blocks.businessContact.legalName.vi` from `/api/releases/live` — now available.

## Acceptance Chain Steps

0. `docker compose up -d --build --wait` → health-check all 4 services
1. `docker compose exec -T api node dist/main seed` → auth:seed + importer (idempotent)
2. `POST /api/auth/login` → `sx_session` cookie; `GET /api/auth/me` → role=ADMIN
3. `GET /api/releases/live` → capture `BASE_VI` (legalName.vi) and `BASE_VER`
4. `GET /api/content/blocks/SETTINGS/businessContact` → REV; `PUT` with `ACCEPTANCE-<timestamp>` sentinel
5. `POST /api/preview/snapshot` with `x-preview-secret` → verify sentinel visible; also verify published web does NOT yet show sentinel
6. `POST /api/releases/publish {note, expectedRevision}` → PUB_VER; verify live version updated
7. Poll `GET /web/vi` (20×, 2s sleep) until sentinel appears; verify BASE_VI is gone
8. Find baseline release via `GET /api/releases` → rollback to it; poll `GET /web/vi` until BASE_VI returns

## Re-runnability

- seed step: idempotent (upsert + importer no-op)
- edit/publish/rollback: leaves DB with a new release (the rollback release) pointing to baseline content — valid state, identical to pre-run
- The sentinel ACCEPTANCE-<timestamp> is unique per run (uses `date +%s`)

## Verification

- `bash -n test/acceptance.sh` → SYNTAX_OK
- `npm run build -w @signex/api` → BUILD_OK (0 errors)
- `npm run lint -w @signex/api` → 0 errors
- `npm run test -w @signex/api` → 262/262 passed

## Concerns for Controller's Acceptance Run

- **MEDIA_PUBLIC_BASE**: must NOT be an `r2.dev` host for publish to succeed (the `assertMediaBaseConfigured` gate). The compose default `http://localhost:9000/signex-media` satisfies this.
- **Web revalidation**: `WEB_REVALIDATE_URL=http://web:3062/api/revalidate` (internal compose network). The api calls this post-publish. If the web is slow to process the revalidation tag, the 20-iteration / 2s poll loop (40s total) should be sufficient.
- **Port exposure**: acceptance script uses `API_BASE=http://localhost:3060` and `WEB_BASE=http://localhost:3062` (compose host ports). These must be reachable from the controller's host.
- **Cookie jar + Origin header**: curl uses `-H "Origin: $API"` which is `http://localhost:3060` — this matches `AUTH_ALLOWED_ORIGINS` in compose defaults, so OriginGuard passes.
- **Preview step is soft-warn not hard-fail** if the secret mismatches, but since both the compose env and script default are `dev-preview-secret-change-me`, this should match cleanly.

## Files Changed

- `apps/api/src/main.ts` — added `runSeed()` + `seed` argv branch
- `apps/api/src/preview/preview.controller.ts` — new: `POST /api/preview/snapshot`
- `apps/api/src/preview/preview.module.ts` — new: PreviewModule
- `apps/api/src/app.module.ts` — registered PreviewModule
- `apps/api/src/release/release.service.ts` — getLive() now includes snapshot
- `apps/api/src/release/release.controller.ts` — live() return type updated
- `test/acceptance.sh` — new: executable acceptance script
- `package.json` — added `test:acceptance`, `test:invariants`, `test:all`
