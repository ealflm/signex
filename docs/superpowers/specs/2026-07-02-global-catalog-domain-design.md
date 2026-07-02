# Global Independent Catalog Domain — Design Spec

**Date:** 2026-07-02
**Status:** DRAFT — awaiting approval
**Goal (one sentence):** Extract the product catalog out of the per-theme content snapshot into its own **global** domain with an independent draft → publish → rollback lifecycle, so catalog changes go live without republishing the theme (and vice-versa).

---

## 1. Why

Today the catalog (`categories` + `products`, each with an inline image) lives **inside** every theme's snapshot:

- `Theme.draftSnapshot` (editable) and `Release.snapshot` (immutable, published) both embed `ReleaseSnapshot.catalog`.
- Publish is **atomic + whole-snapshot**: `ReleaseService.publish()` freezes the entire theme draft (blocks + catalog + assets) into one `Release`, repoints the single `PublishedPointer`, and the web reads catalog from that one live snapshot.

Consequence: editing catalog forces re-publishing the whole theme; catalog and marketing content cannot ship independently. The user wants catalog to be a **fully separate, global** domain (one catalog for the whole site, not per-theme).

## 2. Target architecture

Two independent publishable domains, composed at read time:

```
CONTENT (per theme)                     CATALOG (global, singleton)
Theme.draftSnapshot(blocks,assets)      CatalogDraft.draft (categories+inline images)
  │ publish (existing)                    │ publishCatalog (new, independent)
  ▼                                        ▼
Release + PublishedPointer  ──┐      ┌── CatalogRelease + CatalogPublishedPointer
                              ▼      ▼
                    web composes both live sources → renders /products/*
```

**Key simplifier (verified in the map):** catalog images are **already inline** — `FrozenCategory.image` / `FrozenProduct.image` are full `FrozenAsset` objects carrying `r2Key`, and the web resolves them via `resolveAssetUrl(cat.image.r2Key)` (`apps/web/app/lib/content.ts:210,216`), **not** via the shared `assets` map. So the catalog snapshot is self-contained for rendering; we do **not** need to partition the shared `assets` map. We only collect the inline assetIds for GC pinning.

## 3. Layer-by-layer design

### 3.1 `packages/shared`
- Relocate `FrozenAsset` out of `content/catalog.ts` into a neutral module (`content/assets.ts`) so neither domain imports the other. Keep barrel export names stable.
- New `CatalogSnapshotSchema = { catalogSchemaVersion: literal(1), categories: FrozenCategory[] }` (+ `CATALOG_SCHEMA_VERSION`). No separate `assets` map (images are inline). Own version stamp, independent of content `SCHEMA_VERSION`.
- `ReleaseSnapshotSchema`: make `catalog` **optional** (tolerant) so old `Release.snapshot` rows still parse and the content snapshot becomes blocks+assets. (zod strips unknown keys, so historical rows carrying `catalog` won't error.)
- Tests: new `catalog-snapshot.test.ts`; adjust `release.test.ts` fixtures.

### 3.2 `packages/db`
New models mirroring the content release machinery, but catalog-scoped and global:
- `CatalogDraft` (singleton `id="singleton"`): `draft Json`, `draftRevision Int`, `lastPublishedRevision Int`, `lastPublishedChecksum String?`, `updatedById String?`, `updatedAt`.
- `CatalogRelease` (immutable): `version Int @unique` (from a **new** `catalog_release_version_seq`), `status ReleaseStatus`, `snapshot Json`, `checksum`, `schemaVersion`, `fromRevision`, `rolledBackFromVersion Int?`, `createdById`/`publishedById`, timestamps, `assetRefs`, `publishedPointer`. **No `themeId`.**
- `CatalogPublishedPointer` (singleton): `catalogReleaseId @unique`, `publishedVersion`, `publishedAt`, `publishedById`.
- `CatalogReleaseAssetRef` (`@@id([catalogReleaseId, assetId])`, `@@index([assetId])`, FK Asset `onDelete: Restrict`): GC pins for catalog images.
- `Asset.catalogReleaseRefs` back-relation; `User` back-relations.
- Migration = DDL (4 tables + sequence) **separate** from any destructive JSON strip. Reuse the `SiteConfig`/`PublishedPointer` singleton precedent.

### 3.3 Data migration / backfill (TS script, reuses api helpers)
- **Source of truth for v1 = the current LIVE `Release.snapshot.catalog`** (immutable — exactly what the public site serves now) → mint `CatalogRelease` v1 + `CatalogPublishedPointer`. Web sees no change at cutover.
- Seed `CatalogDraft.draft` from the **live theme's** `draftSnapshot.catalog` (theme = `PublishedPointer → Release.themeId`) so in-progress catalog edits survive; set revisions to reflect dirty-vs-v1.
- Create `CatalogReleaseAssetRef` for every inline catalog assetId (via `collectAssetIds`), so catalog images stay GC-protected once they leave the content snapshot.
- **Do NOT strip** `catalog` from historical `Release.snapshot` (immutable + checksummed) — leave dormant; the web reads catalog from the new pointer. (Stripping `Theme.draftSnapshot.catalog` optional, deferred.)
- **Other themes' catalogs are discarded** (archived to an `AuditLog`/backup first). ⚠️ genuine data decision — see §5.
- Idempotent (guard on existing `CatalogPublishedPointer.singleton`).

### 3.4 `apps/api`
- `CatalogDraftService`: `applyCatalogMutation` (guard+clone+mutate `snap.categories`+freeze inline images+validate `CatalogSnapshotSchema`+persist+audit) and `guardAndBumpCatalog` — the catalog analogue of `ThemeService.applyDraftMutation`, but on the `CatalogDraft` singleton with its **own** revision lock.
- `CatalogReleaseService`: `publish/rollback/getLive/list` — replicates `ReleaseService`'s transaction shape (media-base gate, advisory lock, TOCTOU revision re-check, checksum dedup, `nextval`, demote→ARCHIVED **scoped to CatalogRelease**, immutable release, repoint `CatalogPublishedPointer`, pin `CatalogReleaseAssetRef`, audit, non-fatal revalidate) with a **distinct** `CATALOG_RELEASE_LOCK_KEY` + `catalog_release_version_seq`, checksum over catalog-only canonical JSON.
- Move catalog routes `POST/PATCH/DELETE /api/themes/:themeId/catalog/*` → **global** `/api/catalog/*` (drop `:themeId`). Add `POST /api/catalog/publish` + `/rollback` + `GET /api/catalog/live|releases` (PUBLISHER for publish/rollback, EDITOR for mutations).
- `ReleaseService.publish()` **stops embedding catalog**: content checksum + `collectAssetIds` + snapshot exclude catalog.
- `assets.service.usage()`/`softDelete`: union `ReleaseAssetRef` **and** `CatalogReleaseAssetRef` + scan `CatalogDraft.draft`, so catalog-only images stay "in use" (GC-safety).
- `importer.service`: mint content v1 **and** catalog v1 independently (split the single `ReleaseSnapshotSchema.parse`); split the `initial-snapshot.ts` emitter to also emit `initial-catalog.ts`.
- `preview.controller`: compose theme draft (blocks) + global catalog draft into the preview payload.
- `RevalidatePayload` gains `tags?: string[]`; catalog publish fires a `catalog` tag.
- Bootstrap the empty `CatalogDraft` singleton (seed or importer).

### 3.5 `apps/web`
- New `lib/catalog.ts`: `getPublishedCatalog(lang)` (`'use cache'` + `cacheTag('catalog')`, reads `CatalogPublishedPointer`→`CatalogRelease`, falls back to `INITIAL_CATALOG`), `resolveCatalogForLang`, `getPreviewCatalog(lang)`.
- New auto-generated `lib/initial-catalog.ts` fallback (catalog slice of current `initial-snapshot.ts`).
- **Compose in the loader**: `getSiteContent(lang)` awaits both content + catalog and merges `products.categories` — keeping `SiteContent.products` shape **identical** → zero page/component churn (products pages, home grid, sitemap unchanged). Labels (`statLabels`/`detail`/`product`) stay content; counts (`productCount`/`materialCount`) come from catalog.
- `/api/revalidate` route accepts `{ tags, paths }`; catalog publish fires `catalog` + warms `/products/*`.
- `getPreviewSnapshot` split: draft content (theme-keyed) + draft catalog (global), per-source fallback.

### 3.6 `apps/admin`
- Catalog page + actions **decouple from the active theme**: drop `getActiveThemeId`, target global `/api/catalog/*`, use the **catalog** revision as the optimistic lock (`expectedCatalogRevision`). Remove the "No active theme selected" gate.
- Add a **"Publish catalog"** action (PageHeader, PUBLISHER-gated) + a "Catalog has unpublished changes" indicator, driven by `catalogDirty = checksum(draft) != lastPublishedChecksum`. Independent of the Themes publish flow.
- Themes page mental model: themes own **content only**; a short note that catalog is site-wide.
- Admin↔api proxy/CSRF: new `/api/catalog/publish` write route needs the Origin-header CSRF handling like other admin writes.

## 4. Cross-cutting invariants & risks (must be tested)
- **Per-domain "single PUBLISHED"**: separate tables keep the demote-to-ARCHIVED scoped; never cross-demote.
- **GC-safety**: catalog images must be pinned by `CatalogReleaseAssetRef` + counted by `assets.usage()` — else a catalog-only image becomes wrongly deletable (data loss).
- **No cross-domain atomicity** (accepted tradeoff): a content block could reference a category slug a newer catalog release renamed. Loosely coupled → cosmetic, not a crash; document it.
- **Distinct advisory lock + version sequence**: catalog publish must not serialize on / interleave versions with content.
- **Media-base gate** replicated in the catalog engine (else frozen broken CDN URLs).
- **Backfill correctness**: v1 from the immutable live `Release.snapshot.catalog`; idempotent; pins created.

## 5. Decisions (resolved 2026-07-02)
1. **Data source — DECIDED "tự tạo data":** no multi-theme catalog consolidation. Seed `CatalogRelease` v1 + `CatalogDraft` from the **current live catalog** (`PublishedPointer → Release.snapshot.catalog`) so the public `/products/*` keeps working at cutover; the user manages/creates catalog data in the new global catalog afterward. Other themes' embedded catalogs are ignored (not merged). No lossy consolidation, no per-theme decision needed. *(Confirm: v1 = current live catalog, NOT empty.)*
2. **Scope — DECIDED "đầy đủ":** full parity this effort — catalog **publish + rollback UI + release-history view**, not publish-only.
3. **Content-snapshot cutover — RECOMMENDED:** leave old `catalog` dormant in historical content snapshots (zero-risk; zod strips unknown keys). Do not touch immutable checksummed `Release` rows.
4. **Shared engine — RECOMMENDED:** separate `CatalogReleaseService` now (isolates risk from the load-bearing content publish); extract a shared parameterized core later only if it stabilizes.

## 5b. Execution strategy
- Feature branch `feat/global-catalog-domain` off `main` (NOT on `main`; data migration + core refactor).
- Implement **milestone-by-milestone** (M-A…M-I); write the detailed per-milestone task plan immediately before executing each, so plans track the evolving code. Subagent-driven per task + adversarial review + tests.
- Start with **M-A (shared)** — foundational, low-risk, no runtime/data impact.

## 6. Milestones (each independently testable)
- **M-A** shared: relocate `FrozenAsset`, add `CatalogSnapshotSchema`, make content `catalog` optional (+ tests).
- **M-B** db: 4 models + sequence migration (+ schema tests).
- **M-C** backfill script: mint catalog v1 + seed draft from live release/theme (+ idempotency test).
- **M-D** api writes: `CatalogDraftService` + move routes to `/api/catalog/*` (+ CRUD tests).
- **M-E** api publish: `CatalogReleaseService` publish/rollback + revalidate `catalog` tag + GC union (+ engine tests).
- **M-F** api edges: content publish drops catalog, importer split, preview compose.
- **M-G** web: `lib/catalog.ts` + `initial-catalog.ts` + loader compose + revalidate route.
- **M-H** admin: decouple catalog page/actions + Publish-catalog UI + dirty indicator.
- **M-I** end-to-end verification (light/dark browser + publish round-trip) + M10 invariants.

**Effort:** large, multi-session; data migration carries real risk. Implementation = subagent-driven, per-milestone, with tests + adversarial review, on a feature branch (not `main` directly).

## 7. Non-goals
- Per-theme catalog variants (explicitly dropped — catalog is global).
- Changing content publish semantics beyond removing catalog from it.
- Public-site visual redesign of `/products/*` (unchanged).
