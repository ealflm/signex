# Themes Backend Foundation — Implementation Plan (Plan 1 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the relational content model with a JSON-per-theme model — a `Theme` row holds the
whole site content as a `ReleaseSnapshot` (`draftSnapshot`); edit/save-draft/publish/duplicate operate
on themes — while keeping the published `Release` + `PublishedPointer` + the public web read-path
byte-for-byte.

**Architecture:** Approach B (JSON-per-theme). Drop `ContentBlock`/`Category`/`Product`/`AssetRef`/
`WorkingState`; add `Theme` (+ `Release.themeId`). Content edits mutate `Theme.draftSnapshot` (validated
by the existing `ReleaseSnapshotSchema`); a batched `save-draft` persists; `publish(themeId)` mints a
`Release` from the draft and repoints the live pointer. Fresh destructive reseed (one "Default" theme
via the importer). No data migration.

**Tech Stack:** NestJS 11 (`apps/api`), Prisma 6 + Postgres 16 (`packages/db`), zod (`packages/shared`),
Next 16 read-path (`apps/web`). Jest (api unit/e2e), Vitest (shared).

**Plan series:** (1) **this** — backend foundation; (2) admin `/themes` page + `activeThemeId`;
(3) unified editor shell + panel + media-inline parity; (4) inline text editing + retargets + cleanup
+ whole-stack acceptance.

## Global Constraints (verbatim from spec)

- A theme = a named full `ReleaseSnapshot` (`{schemaVersion, blocks{12 keyed}, catalog{categories[]},
  assets{}}`); reuse `ReleaseSnapshotSchema` + `parseBlock` + `BLOCK_REGISTRY` + `FrozenCatalog` +
  `canonical-json` UNCHANGED.
- Keep `Release` + `ReleaseStatus` + `release_version_seq` + `PublishedPointer` + `ReleaseAssetRef` +
  the `pg_advisory_xact_lock(91051)` publish skeleton; `apps/web` `getPublishedSnapshot` UNCHANGED
  (reads PUBLISHED `Release`, `'use cache'` + `cacheTag('release')`, `INITIAL_SNAPSHOT` fallback).
- Per-theme optimistic lock = `Theme.draftRevision` (replaces the global `WorkingState.revision`).
- `dirty` (per theme) = `draftRevision !== lastPublishedRevision`.
- Gated no-op on publish: no-op ONLY if `PublishedPointer.release.themeId === themeId` AND
  `liveChecksum === draftChecksum`; a publish that CHANGES which theme is live always mints + repoints
  + revalidates even on identical bytes.
- Catalog `id` is `Id.optional()` — `schemaVersion` stays 1; importer + catalog edits always mint/keep
  a cuid.
- Destructive reseed only (no migration); the destructive migration + reseed is gated behind the
  importer's advisory lock + idempotency guard (now: refuse if a `Theme` exists).
- `MEDIA_PUBLIC_BASE` must be set for publish (existing `assertMediaBaseConfigured` gate).
- DB SAFETY: re-dump the dev DB (`docker exec signex-postgres pg_dump -U signex -d signex --clean
  --if-exists > /home/ealflm/signex-backups/pre-migrate-$(date +%s).sql`) immediately before Task 2's
  migration. A backup already exists at `/home/ealflm/signex-backups/2026-06-26-pre-themes/`.
- Work on branch `feat/themes-model` (already checked out). Conventional commits; end messages with
  the project Co-Authored-By + Claude-Session trailers.

---

## File Structure

- `packages/shared/src/content/catalog.ts` — add optional `id` to `FrozenCategory`/`FrozenProduct`.
- `packages/db/prisma/schema.prisma` — `Theme` model + `Release.themeId`; drop 5 content tables. New
  migration under `packages/db/prisma/migrations/`.
- `apps/api/src/release/snapshot-assets.ts` — NEW: extracted `freezeAsset` + `collectAssetIds`.
- `apps/api/src/theme/` — NEW: `theme.service.ts`, `theme.controller.ts`, `theme.module.ts`,
  `save-draft.dto.ts`, specs.
- `apps/api/src/catalog/catalog.service.ts` (+ controller, DTO) — rewrite to mutate
  `Theme.draftSnapshot.catalog`; theme-scoped routes.
- `apps/api/src/content/content.service.ts` (+ controller) — fold into the save-draft path (block
  patches go through `ThemeService`); retire `WorkingStateService`.
- `apps/api/src/release/release.service.ts` (+ `dto/release.dto.ts`) — `publish({themeId,
  expectedDraftRevision, note})`, set `liveSnapshot`, gated no-op, per-theme dirty.
- `apps/api/src/preview/preview.controller.ts` — return `theme.draftSnapshot` by `themeId`.
- `apps/api/src/importer/importer.service.ts` — assemble snapshot + create Default theme + publish v1.
- `apps/api/src/assets/assets.service.ts` — widen `delete` guard to a cross-theme snapshot scan.
- `apps/web/app/lib/content.ts` — `getPreviewSnapshot(lang, themeId)`; `getPublishedSnapshot` UNCHANGED.

---

### Task 1: Shared — optional `id` on catalog nodes

**Files:** Modify `packages/shared/src/content/catalog.ts`; Test
`packages/shared/src/content/catalog.test.ts` (create if absent, else extend the catalog spec).

**Interfaces — Produces:** `FrozenCategory` / `FrozenProduct` each gain `id?: string` (cuid). `Id` is
the existing cuid-shaped primitive in `packages/shared/src/content/primitives.ts` (verify its export
name; it validates a cuid string).

- [ ] **Step 1: Failing test** — add to the catalog spec:
```ts
import { FrozenCategory, FrozenProduct } from "./catalog";
it("accepts an optional cuid id on category/product", () => {
  const cat = FrozenCategory.safeParse({ id: "clmn0p0000000000000000000", slug: "signs", title: { en: "Signs", vi: "Bảng" }, /* …existing required fields… */ });
  expect(cat.success).toBe(true);
});
it("still parses without id (back-compat)", () => {
  // an existing fixture lacking id must still pass
});
```
- [ ] **Step 2: Run, expect FAIL** — `npm run test -w @signex/shared` (FrozenCategory has no `id`).
- [ ] **Step 3: Implement** — add `id: Id.optional(),` to both `FrozenCategory` and `FrozenProduct`
  object schemas. Do NOT bump `schemaVersion`.
- [ ] **Step 4: Run, expect PASS** — `npm run test -w @signex/shared` (all green).
- [ ] **Step 5: Build shared** — `npm run build -w @signex/shared` (consumers read `dist/`).
- [ ] **Step 6: Commit** — `git add packages/shared && git commit -m "feat(shared): optional id on FrozenCategory/FrozenProduct"`.

---

### Task 2: DB schema — add `Theme`, drop relational content tables

**Files:** Modify `packages/db/prisma/schema.prisma`; new migration dir under
`packages/db/prisma/migrations/`.

**Interfaces — Produces:** `Theme { id, name @unique, draftSnapshot Json, liveSnapshot Json?,
draftRevision Int @default(0), lastPublishedRevision Int @default(0), lastPublishedChecksum String?,
createdById, createdAt, updatedAt, releases Release[] }`; `Release.themeId String?` + relation
`onDelete: SetNull` + `@@index([themeId])`.

- [ ] **Step 1: Re-dump the DB (safety)** —
```bash
docker exec signex-postgres pg_dump -U signex -d signex --clean --if-exists > /home/ealflm/signex-backups/pre-migrate-$(date +%s).sql
```
Expected: a non-empty `.sql` (confirm `wc -l`).
- [ ] **Step 2: Edit schema** — add the `Theme` model (above) + `themeId` on `Release`; DELETE the
  `ContentBlock`, `Category`, `Product`, `AssetRef`, `WorkingState` models and any relations/back-refs
  to them (e.g. `Asset` relations to `Category`/`Product`/`AssetRef`, `User` relations to those). Leave
  `Asset`, `Release`, `ReleaseStatus`, `PublishedPointer`, `ReleaseAssetRef`, `AuditLog`, `User`,
  `Session`, `Role`, `FormSubmission` intact. Add `Theme.createdBy` relation to `User` if FK desired
  (or keep `createdById` as a plain string — match how `Release.createdById` is modeled).
- [ ] **Step 3: Generate migration** —
```bash
npm run db:migrate -- --name themes_model   # prisma migrate dev --name themes_model
```
Expected: a new migration applied; client regenerated. (This DROPS the 5 tables in the dev DB — the
backup from Step 1 covers it.)
- [ ] **Step 4: Build db** — `npm run build -w @signex/db` (regenerates client + dist).
- [ ] **Step 5: Verify** — `docker exec signex-postgres psql -U signex -d signex -c "\\dt"` shows
  `Theme` present and `ContentBlock`/`Category`/`Product`/`AssetRef`/`WorkingState` absent.
- [ ] **Step 6: Commit** — `git add packages/db && git commit -m "feat(db): Theme model; drop relational content tables (destructive)"`.

---

### Task 3: Extract `snapshot-assets.ts`; retire `serialize()`

**Files:** Create `apps/api/src/release/snapshot-assets.ts`; Modify
`apps/api/src/release/snapshot.serializer.ts` (+ its spec); update importers of the moved helpers.

**Interfaces — Produces:** `export function freezeAsset(asset, alt?): FrozenAsset`;
`export function collectAssetIds(value: unknown, out?: Set<string>): Set<string>` (walks blocks +
catalog image ids + `assetId`/`posterAssetId`/`mp4AssetId`/`webmAssetId`).

- [ ] **Step 1: Failing test** — `apps/api/src/release/snapshot-assets.spec.ts`:
```ts
import { collectAssetIds } from "./snapshot-assets";
it("collects asset ids from blocks + catalog", () => {
  const snap = { blocks: { hero: { image: { assetId: "a1" } } }, catalog: { categories: [{ image: { assetId: "c1" }, items: [{ image: { assetId: "p1" } }] }] } };
  expect([...collectAssetIds(snap)].sort()).toEqual(["a1","c1","p1"]);
});
```
- [ ] **Step 2: Run, expect FAIL** — `npx jest src/release/snapshot-assets.spec.ts` (module not found).
- [ ] **Step 3: Implement** — move `freezeAsset` (from the serializer) + `collectAssetIds` (the
  recursive collector currently at the bottom of `snapshot.serializer.ts`) into `snapshot-assets.ts`;
  re-export or delete `serialize()` from the serializer (it's now dead — Theme drafts ARE snapshots).
  Update any imports (`release.service.ts`, importer) to the new module.
- [ ] **Step 4: Run, expect PASS** — `npx jest src/release/snapshot-assets.spec.ts`.
- [ ] **Step 5: Build api** — `npm run build -w @signex/api` (tsc clean).
- [ ] **Step 6: Commit** — `git add apps/api && git commit -m "refactor(api): extract snapshot-assets; retire serialize()"`.

---

### Task 4: `ThemeService` + controller (CRUD + guardAndBump)

**Files:** Create `apps/api/src/theme/theme.service.ts`, `theme.controller.ts`, `theme.module.ts`,
`theme.service.spec.ts`; register `ThemeModule` in `app.module.ts`.

**Interfaces — Produces:**
- `guardAndBump(tx, themeId, expectedDraftRevision): Promise<number>` — re-read `draftRevision` in-tx,
  mismatch → `ConflictException('STALE_DRAFT')`, else `+1` and return.
- `list(): Promise<ThemeListItem[]>` — `{id, name, draftRevision, lastPublishedRevision, dirty, isLive,
  updatedAt}`; `isLive` from `PublishedPointer.release.themeId === id`.
- `get(id)`, `duplicate(actor, id, name)`, `rename(id, name)`, `remove(id)` (409 `LIVE_THEME` if live).

**Interfaces — Consumes:** `prisma` (PrismaService), `PublishedPointer` (live theme lookup).

- [ ] **Step 1: Failing tests** — `theme.service.spec.ts` (mock prisma): `guardAndBump` throws
  `STALE_DRAFT` on mismatch + bumps on match; `duplicate` deep-clones `draftSnapshot`, sets
  `liveSnapshot:null`, revisions 0; `remove` of the live theme throws `LIVE_THEME`; `list` derives
  `isLive` from the pointer.
- [ ] **Step 2: Run, expect FAIL** — `npx jest src/theme/theme.service.spec.ts`.
- [ ] **Step 3: Implement** `ThemeService` per the interfaces (RBAC at the controller: Editor can
  list/get/duplicate/rename; Publisher+ delete — mirror the existing role guards used by
  `release.controller.ts`). `duplicate`: `draftSnapshot: structuredClone(src.draftSnapshot)` (or
  `JSON.parse(JSON.stringify(...))`). `remove`: read `PublishedPointer.release.themeId`; hard-delete
  else.
- [ ] **Step 4: Controller** `GET /api/themes`, `GET /api/themes/:id`, `POST /api/themes/:id/duplicate`,
  `PATCH /api/themes/:id` (rename; catch P2002 → 409), `DELETE /api/themes/:id`. Wire guards + DTOs.
- [ ] **Step 5: Run, expect PASS** + `npm run build -w @signex/api`.
- [ ] **Step 6: Commit** — `git commit -m "feat(api): ThemeService + controller (CRUD, guardAndBump)"`.

---

### Task 5: `save-draft` endpoint (batched block patches)

**Files:** Create `apps/api/src/theme/save-draft.dto.ts`; Modify `theme.service.ts` (+ controller, +
spec). Reuse `parseBlock`, `ReleaseSnapshotSchema`, `collectAssetIds`, `freezeAsset`.

**Interfaces — Produces:** `saveDraft(actor, themeId, {edits: {key, data}[], expectedDraftRevision}):
Promise<{draftRevision}>`. Route `POST /api/themes/:themeId/save-draft`.

- [ ] **Step 1: Failing tests** — batch of two block patches → one `draftRevision` bump, both applied;
  an invalid block (`parseBlock` throws) → 422 `INVALID_BLOCK`, NOTHING persisted/bumped; stale
  `expectedDraftRevision` → 409 `STALE_DRAFT`; `snap.assets` rebuilt to include a newly-referenced asset
  + prune an orphan.
- [ ] **Step 2: Run, expect FAIL**.
- [ ] **Step 3: Implement** in one `$transaction`:
```ts
const rev = await this.guardAndBump(tx, themeId, expectedDraftRevision);
const snap = structuredClone(theme.draftSnapshot);
for (const { key, data } of edits) snap.blocks[key] = parseBlock(key, data); // 422 on throw
await reconcileAssets(tx, snap);            // Asset.findMany(collectAssetIds) → freezeAsset → snap.assets
const parsed = ReleaseSnapshotSchema.safeParse(snap);
if (!parsed.success) throw new UnprocessableEntityException({ code: "INVALID_SNAPSHOT", issues: parsed.error.issues });
await tx.theme.update({ where: { id: themeId }, data: { draftSnapshot: snap, draftRevision: rev } });
await this.audit.record(tx, { action: "theme.savedraft", entityId: themeId, meta: { keys: edits.map(e=>e.key) } });
return { draftRevision: rev };
```
`reconcileAssets(tx, snap)`: `ids=collectAssetIds(snap); rows=tx.asset.findMany({where:{id:{in:[...ids]}}}); snap.assets = Object.fromEntries(rows.map(r=>[r.id, freezeAsset(r)]))`. NOTE `parseBlock` here is the 2-arg form `parseBlock(key, data)` (registry resolves kind from key) — confirm the shared export supports a 2-arg overload; if it requires `(kind, key, data)`, derive `kind = BLOCK_KIND_BY_KEY[key]`.
- [ ] **Step 4: Run, expect PASS** + `npm run build -w @signex/api`.
- [ ] **Step 5: Commit** — `git commit -m "feat(api): POST /api/themes/:id/save-draft (batched block patches)"`.

---

### Task 6: Catalog service — mutate `draftSnapshot.catalog`

**Files:** Modify `apps/api/src/catalog/catalog.service.ts`, `catalog.controller.ts`, DTOs (+ spec).
Retire `apps/api/src/catalog/asset-ref.reconcile.ts`.

**Interfaces — Produces:** theme-scoped category/product CRUD operating on `Theme.draftSnapshot.catalog`,
each via `ThemeService.guardAndBump` + `reconcileAssets` + `ReleaseSnapshotSchema` backstop. Routes:
`POST/PATCH/DELETE /api/themes/:themeId/catalog/categories[/:id]`, `.../categories/:id/products[/:pid]`,
`PATCH .../reorder`.

- [ ] **Step 1: Failing tests** — create category mints a cuid `id` + appends contiguous `sortOrder`;
  duplicate slug in same scope → 422 `DUPLICATE_SLUG`; `imageId` pointing at a missing/soft-deleted
  asset → 422 `INVALID_ASSET`; reorder reassigns `sortOrder` by index; delete splices the node;
  every mutation bumps `draftRevision` once + leaves a schema-valid snapshot.
- [ ] **Step 2: Run, expect FAIL**.
- [ ] **Step 3: Implement** the array mutations + the in-code validators (slug uniqueness per scope;
  `Asset.findUnique` existence/`deletedAt` check → inline `freezeAsset` onto the node; `sortOrder`
  contiguity). Identity = `id` (slug may change). All inside the `guardAndBump` tx + backstop.
- [ ] **Step 4: Run, expect PASS** + `npm run build -w @signex/api`.
- [ ] **Step 5: Commit** — `git commit -m "feat(api): theme-scoped catalog CRUD over draftSnapshot.catalog"`.

---

### Task 7: `publish(themeId)` retarget + gated no-op

**Files:** Modify `apps/api/src/release/release.service.ts`, `dto/release.dto.ts` (+ spec).

**Interfaces — Produces:** `publish(actor, {themeId, expectedDraftRevision, note?}): PublishResult`.

- [ ] **Step 1: Failing tests** — publish reads `theme.draftSnapshot` (no serializer), mints a
  `Release{themeId}`, repoints `PublishedPointer`, sets `theme.liveSnapshot/lastPublishedRevision/
  lastPublishedChecksum`, calls revalidate; **gated no-op:** same live theme + equal checksum → `noop`;
  **theme switch with equal bytes → NOT noop** (mints + repoints + revalidate); stale
  `expectedDraftRevision` → 409 `STALE_DRAFT`.
- [ ] **Step 2: Run, expect FAIL**.
- [ ] **Step 3: Implement** — keep the `pg_advisory_xact_lock(91051)` tx skeleton; replace the
  serializer call with `snapshot = ReleaseSnapshotSchema.parse(theme.draftSnapshot)`,
  `checksum = sha256(canonicalJson(snapshot))`, `assetIds = collectAssetIds(snapshot)`. No-op guard:
  `const live = PublishedPointer.include(release.select({themeId,checksum})); if (live?.release?.themeId === themeId && live.release.checksum === checksum) return {status:'noop'}`. In-tx: nextval → demote
  PUBLISHED→ARCHIVED → `Release.create({snapshot, checksum, themeId, fromRevision: theme.draftRevision})`
  → upsert pointer → `ReleaseAssetRef.createMany` → update theme live* fields. After commit:
  `revalidation.revalidate({})`. Keep `rollback()` as-is.
- [ ] **Step 4: Run, expect PASS** + `npm run build -w @signex/api`.
- [ ] **Step 5: Commit** — `git commit -m "feat(api): publish(themeId) + gated no-op on theme switch"`.

---

### Task 8: Preview controller — serve a theme's draft

**Files:** Modify `apps/api/src/preview/preview.controller.ts` (+ spec).

**Interfaces — Produces:** `POST/GET /api/preview/snapshot?themeId=` (or body `{themeId}`) returns
`theme.draftSnapshot` (the active theme; default to the live theme's id when omitted). Stays `@Public`
+ `x-preview-secret` gated.

- [ ] **Step 1: Failing test** — returns the requested theme's `draftSnapshot`; wrong/absent secret →
  401/403 as today; missing themeId → falls back to the live theme.
- [ ] **Step 2–4: Run-fail / implement / run-pass** + `npm run build -w @signex/api`.
- [ ] **Step 5: Commit** — `git commit -m "feat(api): preview snapshot by themeId"`.

---

### Task 9: Importer — fresh-seed one "Default" theme

**Files:** Modify `apps/api/src/importer/importer.service.ts` (+ spec). Reuse `buildBlocks`,
`buildCatalog`, `asset-importer`, `parity`, `snapshot-emit`.

**Interfaces — Produces:** importer creates a `Theme{name:'Default', draftSnapshot=liveSnapshot=snapshot,
draftRevision:1, lastPublishedRevision:1, lastPublishedChecksum:checksum}` then `publish({themeId,
expectedDraftRevision:1, note:'Initial content import (v1)'})`; emits `initial-snapshot.ts`.

- [ ] **Step 1: Failing test** — `importer.service.spec.ts`: idempotency guard refuses when a `Theme`
  exists (was: a Release exists); assembled snapshot has 12 block keys + catalog with minted `id`s +
  an `assets` map; mints exactly one Default theme + Release v1 + PublishedPointer.
- [ ] **Step 2: Run, expect FAIL**.
- [ ] **Step 3: Implement** — replace persist/publish glue (old steps 7–9): assemble
  `ReleaseSnapshotSchema.parse({schemaVersion:1, blocks, catalog (with minted ids), assets})` in memory
  (no DB content tables); create the Default theme; call `release.publish`; read back Release v1;
  `emitInitialSnapshot` → `apps/web/app/lib/initial-snapshot.ts`. Idempotency guard → theme existence.
- [ ] **Step 4: Run, expect PASS** + `npm run build -w @signex/api`.
- [ ] **Step 5: Run the importer against the dev DB** (the migration in Task 2 emptied content):
```bash
DATABASE_URL=postgresql://signex:signex@localhost:3059/signex?schema=public \
R2_ENDPOINT=http://localhost:9000 R2_PUBLIC_ENDPOINT=http://localhost:9000 \
MEDIA_PUBLIC_BASE=http://localhost:9000/signex-media SEED_ADMIN_EMAIL=admin@signex.local \
node apps/api/dist/main seed
```
Expected: "content:import OK — Release v1"; `psql -c 'SELECT name FROM "Theme";'` → Default;
`SELECT version,status FROM "Release";` → v1 PUBLISHED.
- [ ] **Step 6: Commit** — `git add apps/api apps/web/app/lib/initial-snapshot.ts && git commit -m "feat(api): importer seeds one Default theme + Release v1"`.

---

### Task 10: Web read-path — `getPreviewSnapshot(themeId)`

**Files:** Modify `apps/web/app/lib/content.ts`.

**Interfaces — Produces:** `getPreviewSnapshot(lang, themeId?)` POSTs to `/api/preview/snapshot` with
`themeId`. `getPublishedSnapshot` UNCHANGED.

- [ ] **Step 1: Implement** — thread an optional `themeId` through `getPreviewSnapshot` (append to the
  fetch body/query); leave `getPublishedSnapshot`, `resolveForLang`, `cacheTag('release')`, fallback
  untouched.
- [ ] **Step 2: Build web** — `cd apps/web && DATABASE_URL=… MEDIA_PUBLIC_BASE=… API_URL=http://localhost:3060 npx next build` (compiles).
- [ ] **Step 3: Commit** — `git commit -m "feat(web): getPreviewSnapshot accepts themeId; published read-path unchanged"`.

---

### Task 11: Asset-delete cross-theme guard

**Files:** Modify `apps/api/src/assets/assets.service.ts` (`delete`/usage) (+ spec).

**Interfaces — Produces:** `delete(id)` refuses (409 `ASSET_IN_USE`) if the asset id appears in any
theme's `draftSnapshot` or `liveSnapshot` (`collectAssetIds`) or in `ReleaseAssetRef`.

- [ ] **Step 1: Failing test** — delete refused when the asset is referenced by a theme draft; allowed
  when unreferenced.
- [ ] **Step 2–4: Run-fail / implement / run-pass** (scan `theme.findMany({select:{draftSnapshot,
  liveSnapshot}})` + `collectAssetIds` + the existing `ReleaseAssetRef` check) + `npm run build -w @signex/api`.
- [ ] **Step 5: Commit** — `git commit -m "feat(api): asset-delete cross-theme reference guard"`.

---

### Task 12: Whole-stack acceptance (foundation)

**Files:** adapt `test/acceptance.sh` (or a new `test/themes-acceptance.sh`).

- [ ] **Step 1: Rebuild + restart api + web** — `docker compose build api web && docker compose up -d api web`; wait healthy.
- [ ] **Step 2: Script the flow (curl + psql), assert each:**
  login → `GET /api/themes` (Default, isLive) → `save-draft` a hero title edit (one rev bump) →
  `GET /api/preview/snapshot?themeId=Default` shows the edit → `publish` → `GET /vi` (web) serves it →
  `duplicate` "Copy" → `save-draft` a different edit on Copy → `publish` Copy → `GET /vi` flips to Copy
  → Default's draft unchanged → `DELETE` the live theme → 409 LIVE_THEME.
- [ ] **Step 3: Run** the script; all assertions pass; 0 broken images on `/vi`.
- [ ] **Step 4: Commit** — `git commit -m "test: themes backend whole-stack acceptance"`.

---

## Self-Review

- **Spec coverage:** data model (T2), shared id (T1), edit→save-draft (T5), catalog (T6), publish +
  gated no-op (T7), preview by theme (T8), seed Default (T9), web read/preview (T10), asset GC (T11),
  acceptance incl. duplicate-isolation + delete-live (T12). Theme CRUD (T4). ✓ (Admin UI + unified
  editor + inline text are Plans 2–4, by design.)
- **Placeholder scan:** the only deferred detail is the `parseBlock` arity (2-arg vs 3-arg) — Task 5
  instructs the implementer to confirm against the shared export and derive `kind` via
  `BLOCK_KIND_BY_KEY[key]` if needed. No vague error-handling steps.
- **Type consistency:** `draftRevision`/`lastPublishedRevision`/`lastPublishedChecksum`,
  `guardAndBump(tx,themeId,expected)→number`, `saveDraft(...)→{draftRevision}`, `publish({themeId,
  expectedDraftRevision,note})` used consistently across tasks.
