# Themes Model — Design (replaces linear release/rollback)

**Date:** 2026-06-26
**Status:** Approved (direction + key decisions confirmed by user)
**Area:** `packages/db`, `packages/shared`, `apps/api`, `apps/admin`, (minimal) `apps/web`

## Goal

Replace the linear publish→version→rollback model with a library of named **themes**. A theme is a
named full snapshot of site **content** (the 12 content blocks + catalog + asset refs); the Webflow
visual layout is fixed. The user can keep many themes, **edit any theme** (its own draft, in
parallel — the live site is unaffected), **publish any theme** to go live in one click, **save
draft** (implicit on every edit), and **duplicate / rename / delete**.

## Confirmed decisions

1. **Approach B — JSON-per-theme.** A theme stores its content as a `ReleaseSnapshot` JSON
   (`draftSnapshot`). The editor mutates that JSON in place. No relational content tables, no
   relational→JSON serializer, no destructive "rehydrate on switch." (Chosen over Approach C —
   `themeId`-scoped relational tables — because a theme *is* literally a snapshot; B reuses the most
   proven code, deletes machinery, and confines new risk to one small, schema-guarded surface.)
2. **Parallel multi-theme editing.** Each theme has its own draft + per-theme optimistic-lock
   revision; editing theme B never touches theme A or the live site.
3. **Fresh seed, no migration.** Destructive: drop the relational content tables and re-seed ONE
   "Default" theme from the importer (the existing dev data is discarded — user confirmed). 
4. **Stable ids on catalog nodes.** Add `id` to `FrozenCategory`/`FrozenProduct` so rename/slug
   changes don't break identity/audit (additive schema change).
5. **Asset-delete safety = live scan in v1.** Defer the `AssetUsage` cache; scan themes' snapshots
   on delete (fine at this scale).
6. **Live layer kept byte-for-byte.** `Release` + `PublishedPointer` + `release_version_seq` +
   `ReleaseAssetRef` + the advisory-lock publish tx + the `apps/web` public read-path are unchanged.
   `Theme.liveSnapshot` is an admin-only mirror; the public site keeps reading the PUBLISHED
   `Release` (bounds denormalization drift).

## Data model (Prisma)

```prisma
model Theme {
  id                    String    @id @default(cuid())
  name                  String    @unique
  draftSnapshot         Json      // full ReleaseSnapshot (validated by ReleaseSnapshotSchema)
  liveSnapshot          Json?     // snapshot at THIS theme's last publish; null if never published
  draftRevision         Int       @default(0)  // per-theme optimistic lock (replaces WorkingState.revision)
  lastPublishedRevision Int       @default(0)  // draftRevision at last publish (per-theme dirty flag)
  lastPublishedChecksum String?                // sha256(liveSnapshot) — dirty check + gated no-op
  createdById           String
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt
  releases              Release[]
  @@index([updatedAt])
}
// Release gains provenance:
//   themeId String?  + relation onDelete: SetNull  + @@index([themeId])
```

**KEEP verbatim:** `Release`, `ReleaseStatus`, `release_version_seq`, `PublishedPointer`,
`ReleaseAssetRef`, `Asset`/`AssetStatus`/`AssetKind`/poster, `AuditLog`, `User`/`Session`/`Role`,
`FormSubmission`.

**DROP** (content now lives in `Theme.draftSnapshot`): `ContentBlock`, `Category`, `Product`,
`AssetRef`, `WorkingState`. One destructive migration, gated behind the importer's advisory lock +
idempotency guard.

**Shared schema:** `packages/shared/src/content/catalog.ts` — add `id: Id.optional()` to
`FrozenCategory` and `FrozenProduct`. Optional (not required) so `schemaVersion` stays **1** and no
snapshot ever fails parse for lacking it; the importer + catalog edits ALWAYS mint/preserve a cuid,
so in practice every node has one. `resolveForLang` ignores it (identity is internal/admin-only).

**Extract** `freezeAsset` + `collectAssetIds` from `snapshot.serializer.ts` into a new
`apps/api/src/release/snapshot-assets.ts` (reused by edit/publish/import). `serialize()` is deleted.

## Edit flow — instant preview, explicit Save draft

**Edits are held CLIENT-SIDE and shown in the preview instantly; nothing is persisted until the user
clicks Save draft.** This gives WYSIWYG + the ability to discard. Three states the user controls:
edit (instant preview, unsaved) → **Save draft** (persist to the theme) → **Publish** (go live).

**Per-theme optimistic lock** — `ThemeService.guardAndBump(tx, themeId, expectedDraftRevision)`:
re-read `draftRevision` INSIDE the tx (closes TOCTOU); mismatch → 409 `STALE_DRAFT`; else
`draftRevision += 1`. Independent counters per theme → true parallel authoring. The lock is checked
ONCE per Save-draft batch (not per keystroke).

**Instant preview (no persist):** picking/uploading media for a zone records a pending edit
`{field → MediaRef + resolved URL}` in the editor's client state and posts it to the preview iframe;
`EditOverlay` swaps that zone's `<img>`/`<video>` `src` live (DOM only, no server round-trip, no
reload). The asset UPLOAD still happens immediately (to mint the `assetId` + get a URL for the
swap); only APPLYING it to content is deferred to Save draft. A "Save draft" button is enabled while
pending edits exist; a count/"unsaved" indicator shows.

**Save draft** — `POST /api/themes/:themeId/save-draft` body `{edits, expectedDraftRevision}` where
`edits` = a list of block patches `{key, data}` (the visual editor batches all pending edits). In
ONE tx:
1. `guardAndBump` (bumps once for the whole batch).
2. each patch: `validated = parseBlock(key, data)` (422 `INVALID_BLOCK`/`UNKNOWN_BLOCK` → abort, no
   persist/bump); `snap.blocks[key] = validated`.
3. `reconcileAssets(snap)` — walk blocks + catalog image ids (`collectAssetIds`), `Asset.findMany`,
   `freezeAsset` each → rebuild `snap.assets` (prune orphans, add new, refresh `r2Key`/dims).
4. **Backstop:** `ReleaseSnapshotSchema.safeParse(snap)` — fail → 422, abort.
5. `theme.update({draftSnapshot, draftRevision})` + audit `theme.savedraft {keys}`. Returns the new
   `draftRevision`; the client adopts it and clears pending.

**Discard** — leaving/closing the editor with pending edits prompts a warning (`beforeunload` +
in-app guard); discarding drops the client-side pending (nothing was persisted) and reverts the
preview. No server call.

**Catalog admin** (a separate form-based surface, not the live visual editor) persists on each form
submit — its own explicit per-item "Save", via theme-scoped `POST/PATCH/DELETE
/api/themes/:themeId/catalog/categories[/:id]` and `.../products`. `CatalogService` mutates
`snap.catalog.categories[]` (+ nested `items[]`) under the same `guardAndBump` + validation +
`reconcileAssets` + whole-snapshot backstop, enforcing in code (no DB constraints): slug uniqueness
per scope → 422 `DUPLICATE_SLUG`; image existence via `Asset.findUnique` (missing/soft-deleted → 422
`INVALID_ASSET`); contiguous `sortOrder` (+ a `reorder {order:[id…]}` route); delete = splice node.
Identity is the stable `id` (slug may change). Both surfaces feed the same `Theme.draftSnapshot`;
`draftRevision` coordinates concurrency.

## Publish / preview / web-read

**Save draft is explicit** (above) — there is no auto-save; the user persists when they choose.

**Publish** publishes the **saved** draft. If the visual editor has unsaved pending edits, Publish
first persists them (calls Save draft, then publishes) so you never publish stale content; the
confirm dialog says "Save & publish" in that case.

**Publish** — `release.service.ts publish(actor, {themeId, expectedDraftRevision, note})`:
1. `theme = findUniqueOrThrow`; `snapshot = ReleaseSnapshotSchema.parse(theme.draftSnapshot)`;
   `checksum = sha256(canonicalJson(snapshot))`; `assetIds = collectAssetIds(snapshot)`.
2. `expectedDraftRevision !== theme.draftRevision` → 409 `STALE_DRAFT`.
3. **Gated no-op (correction):** no-op ONLY if `PublishedPointer.release.themeId === themeId` AND
   checksum matches. If the live theme *changes*, always mint + repoint + `revalidateTag('release')`
   even on identical bytes (provenance changed; rollback targeting must diverge).
4. **Short tx, `pg_advisory_xact_lock(91051)`** (unchanged skeleton): `nextval(release_version_seq)`
   → demote PUBLISHED→ARCHIVED → `Release.create({snapshot, checksum, themeId, fromRevision:
   draftRevision})` → upsert `PublishedPointer` → `ReleaseAssetRef.createMany` → set
   `theme.liveSnapshot/lastPublishedRevision/lastPublishedChecksum`. Re-read `draftRevision` in-tx.
5. After commit: `revalidation.revalidate({})` (non-fatal).

`dirty` per-theme = `draftRevision !== lastPublishedRevision`. `rollback()` stays Release→Release
(mints a Release from an older `Release.snapshot`) — unchanged.

**Preview** — `preview.controller.ts` `POST/GET /api/preview/snapshot?themeId=` returns
`theme.draftSnapshot` directly. Web `getPreviewSnapshot(lang, themeId)` passes the edited theme;
`safeParse` + `resolveForLang` unchanged, still a non-cached island.

**Web public read** — `apps/web/app/lib/content.ts` `getPublishedSnapshot` **UNCHANGED** (`'use
cache'` + `cacheTag('release')`, reads PUBLISHED `Release`, `INITIAL_SNAPSHOT` fallback).

## Themes CRUD (`apps/api/src/theme/`)

- **List** `GET /api/themes` — each with derived `isLive` (`PublishedPointer.release.themeId === id`)
  + `dirty`.
- **Get** `GET /api/themes/:id`; **active status** `GET /api/themes/active/status` (draftRevision,
  dirty, isLive).
- **Duplicate** `POST /api/themes/:id/duplicate {name}` — one read + one insert:
  `draftSnapshot: structuredClone(src.draftSnapshot)`, `liveSnapshot:null`, revisions 0. Deep clone
  (no aliasing); assets shared by `assetId` via the global library. Immediately parallel-editable.
- **Rename** `PATCH /api/themes/:id {name}` — single column; `name @unique` → 409 on clash.
- **Delete** `DELETE /api/themes/:id` — if `PublishedPointer.release.themeId === id` → 409
  `LIVE_THEME`. Else hard-delete; `Release.themeId → SetNull` preserves publish history + rollback.
- **Create-blank: NOT offered** (a blank snapshot can't satisfy the 12-required-blocks invariant) —
  new themes come from Duplicate.

RBAC: Editor edits a theme's draft + CRUD (create-via-duplicate/rename); **Publisher+** publishes +
deletes. (Confirm exact gates in the plan against the existing role helpers.)

## Fresh seed (importer)

`importer.service.ts` — rewrite the persist/publish glue (steps 7–9); reuse
`buildBlocks`/`buildCatalog`/`asset-importer`/`parity`/`snapshot-emit` as-is. NO migration.
- Idempotency guard: refuse if a `Theme` already exists (was: a Release exists).
- Assemble the snapshot in memory: `buildBlocks` → 12 registry keys; `buildCatalog` →
  `FrozenCategory[]` with **minted stable ids**; walk → `assets` map via `freezeAsset`;
  `ReleaseSnapshotSchema.parse({schemaVersion, blocks, catalog, assets})`.
- `Theme.create({name:'Default', draftSnapshot:snapshot, liveSnapshot:snapshot, draftRevision:1,
  lastPublishedRevision:1, lastPublishedChecksum:checksum, createdById:actor.id})`.
- `release.publish(actor, {themeId:default.id, expectedDraftRevision:1, note:'Initial content import
  (v1)'})` → Release v1 + PublishedPointer.
- Read back Release v1, `emitInitialSnapshot` → `apps/web/app/lib/initial-snapshot.ts` (byte-equal to
  today's v1).

## Admin UX

- **`/themes` page** (replaces `/releases`) — card grid: the **live theme hoisted to top** (Live
  badge, computed from `PublishedPointer`), drafts below; each card: name, dirty badge,
  last-published, actions **Edit · Publish · Duplicate · Rename · Delete** (Delete disabled +
  tooltip on the live theme). "New theme" = Duplicate-from picker. Publish behind a clear
  non-destructive `AlertDialog` ("visitors will see this theme; current live saved as a draft").
- **Active theme context** — admin holds `activeThemeId` (cookie/store); a theme switcher in the
  dash header sets it; all editing surfaces read it.
- **Visual editor** (`visual-editor.tsx`) — edits update the preview INSTANTLY but are held
  client-side as pending; the toolbar has **Save draft** (enabled while pending exist, with an
  unsaved count) → `POST /api/themes/:themeId/save-draft {edits, expectedDraftRevision}` → on
  success clears pending + adopts the new revision; and **Publish** (saves pending first if any,
  then publishes). An unsaved-changes guard (`beforeunload` + in-app nav) warns before discard.
  Preview iframe `/preview/[lang]?themeId=active`; a pinned "Editing: {name}" + signals: *unsaved*
  (pending exist), *saved · not live* (draft ≠ live), *live*.
- **Catalog admin + content forms + (old) releases actions** — retarget to the theme-scoped routes
  carrying `themeId` + `expectedDraftRevision`.

## Edge-case handling

1. **Edit the live theme** — edits hit `draftSnapshot`; public reads the frozen Release → invisible
   until publish.
2. **Publish B while A live** — advisory-lock tx demotes A, mints `Release{themeId:B}`, repoints,
   sets `B.liveSnapshot`; A's draft untouched; `revalidateTag('release')` after commit.
3. **Publish that only flips which theme is live (identical bytes)** — gated no-op suppressed when
   `pointer.release.themeId !== themeId`; mint + repoint + revalidate regardless.
4. **Delete live theme** — 409 `LIVE_THEME`; `Release.themeId → SetNull` preserves history.
5. **Two editors, same theme** — `guardAndBump` per-theme → second writer 409 `STALE_DRAFT`;
   cross-theme edits never collide.
6. **Asset referenced by a theme** — (a) `AssetService.delete` scans every theme's
   `draftSnapshot`+`liveSnapshot` (`collectAssetIds` + catalog image ids) + `ReleaseAssetRef`;
   refuse if referenced (replaces lost `onDelete:Restrict`). (b) catalog create/update resolves
   `imageId` via `Asset.findUnique`; missing/soft-deleted → 422; `reconcileAssets` on every edit
   prunes orphans + refreshes frozen copies.
7. **Duplicate large theme** — one read + insert of `structuredClone`d JSON; deep clone; assets
   shared by `assetId`.
8. **Malformed patch** — whole-snapshot `safeParse` backstop after every mutation; reject without
   persist/bump → every stored draft satisfies the 12-block invariant and is publishable.
9. **Concurrent publish of two themes** — advisory lock serializes; second demotes whatever the
   first made live; each Release carries origin `themeId`.
10. **Unsaved pending edits on close** — pending edits live only client-side; leaving without Save
    draft discards them (after a warning) and nothing was persisted. Publish auto-saves pending
    first, so you never publish a half-edited preview.

## Out of scope (v1)

Create-blank theme; sub-theme / per-block locking; per-theme asset libraries; data migration;
`AssetUsage` cache (live scan only); web reading `Theme.liveSnapshot` directly; cross-theme
diff/merge UI; rollback writing back into a theme's draft.

## File change list

**Schema:** `packages/db/prisma/schema.prisma` (+`Theme`, +`Release.themeId`, drop
ContentBlock/Category/Product/AssetRef/WorkingState — one destructive migration);
`packages/shared/src/content/catalog.ts` (+`id` on FrozenCategory/Product).

**API — rewritten:** `content/content.service.ts`+controller (theme-scoped JSON block patch);
`catalog/catalog.service.ts`+controller (mutate `draftSnapshot.catalog`, code-level validation);
`release/release.service.ts`+DTO (`publish({themeId,…})`, set `liveSnapshot`, gated no-op, per-theme
dirty); `preview/preview.controller.ts` (return `theme.draftSnapshot`, accept `themeId`);
`importer/importer.service.ts` (assemble snapshot + create Default theme).

**API — new:** `theme/theme.service.ts`+`theme.controller.ts`+`theme.module.ts`;
`release/snapshot-assets.ts` (extracted helpers).

**API — retired:** `release/snapshot.serializer.ts` (`serialize()` deleted, helpers extracted);
`working-state/*` (folded into `ThemeService`); `catalog/asset-ref.reconcile.ts` (AssetRef gone);
widen `AssetService.delete` guard to a cross-theme snapshot + `ReleaseAssetRef` scan.

**Web:** `apps/web/app/lib/content.ts` — `getPublishedSnapshot` UNCHANGED; `getPreviewSnapshot`
gains `themeId`. `initial-snapshot.ts` regenerated by importer.

**Admin:** new `apps/admin/app/(dash)/themes/*` + dash-header theme switcher + `activeThemeId` store;
`visual/visual-editor.tsx` retarget; `catalog/actions.ts`+forms, `content/[blockKey]`, `releases/*`
retarget to theme-scoped endpoints.

**Reused unchanged:** `ReleaseSnapshotSchema`/`parseBlock`/`BLOCK_REGISTRY`/`FrozenCatalog`,
`canonical-json`, advisory-lock publish skeleton, `release_version_seq`,
`PublishedPointer`/`ReleaseAssetRef`, Asset upload (presign/confirm), `revalidation`, `AuditLog`,
importer `buildBlocks`/`buildCatalog`/`asset-importer`/`parity`/`snapshot-emit`.

## Testing

- **Unit (shared/api):** `ReleaseSnapshotSchema` accepts the new catalog `id`; `parseBlock` 2-arg;
  `collectAssetIds`/`freezeAsset` extracted helpers; catalog code-level validators (dup slug,
  invalid asset, reorder); the gated no-op (same-theme byte-match → noop; theme switch → never noop).
- **Api e2e:** theme CRUD (duplicate isolation — editing the copy doesn't touch the source; rename
  clash 409; delete-live 409); per-theme optimistic lock (409 STALE_DRAFT); **save-draft batch**
  (multiple block patches in one call → one revision bump, all-or-nothing on a bad patch); publish B
  while A live (A's draft intact, Release.themeId stamped, pointer repointed, revalidate called);
  **publish with unsaved pending → saves then publishes**; asset-delete refusal when referenced.
- **Whole-stack (`test/acceptance.sh` adapted):** seed Default → edit a block (NOT yet persisted) →
  Save draft → preview shows it → publish → web serves it → duplicate → edit copy → publish copy →
  web flips → original theme unchanged.
- **Editor (agent-browser):** /themes list + live badge; switch active theme; **edit → preview
  updates instantly while "unsaved" shows → Save draft → "saved · not live" → Publish**; leaving
  with unsaved pending warns + discards; the public site reflects only the published theme.
