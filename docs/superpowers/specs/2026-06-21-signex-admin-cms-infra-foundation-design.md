# SIGNEX Admin / CMS — Infrastructure Foundation — Design Spec

- **Date:** 2026-06-21
- **Status:** Approved design — ready for implementation planning (writing-plans next).
- **Sub-project:** #1 of the SIGNEX admin/CMS build — the shared **infrastructure foundation**. The polished visual image/video editor, Catalog UI, Forms builder, GA4/analytics are LATER sub-projects that sit on this.
- **How produced:** brainstormed with the user (7 keystone decisions) + a configurable-surface audit of `apps/web` (~150 surfaces) + an adversarial multi-agent design workflow (16 agents: 7 dimension designers → 7 critics → 1 cross-cutting integration critic → synthesis). All review + integration fixes are baked into the body below.

## Decisions Log (locked)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Build sequence | **Full shared infra first**, rich editor UIs later |
| 2 | Admin scaffold | **Re-scaffold `apps/admin` via `create-next-app@latest`** at the admin-build step (not hand-edited) |
| 3 | Delivery model | **Hybrid ISR on-demand** — web stays static+cached; Publish triggers Next on-demand revalidation; drafts via Next draft mode |
| 4 | Versioning unit | **Site-wide Release snapshots** — working tables ARE the draft; Publish freezes the whole site into an immutable versioned Release; rollback restores an old one |
| 5 | Auth | **Multi-user + RBAC** — Editor / Publisher / Admin |
| 6 | Hosting | **Self-hosted Docker**, single-instance, Cloudflare R2 for media |
| 7 | Content model | **Hybrid** — relational Catalog (Category/Product/Asset) + zod-validated JSON ContentBlocks for page copy/settings/nav/SEO |
| 8 | Rollback default | **Repoint-only** (live reverts, working draft untouched; `restoreWorkingState` is opt-in) |
| 9 | API topology (prod) | **Reverse-proxy `/api` behind one hostname** — do NOT publish :3060 to the internet; same-site CSRF model |
| 10 | Admin session lifetime | **30-day** (user choice over the recommended absolute+idle; mitigated by server-side instant revocation on logout/demote/deactivate) |
| 11 | Publish no-op | **Soft "nothing to publish" warning** on checksum match (no junk version) |
| 12 | Social links | **Keep `#` placeholders**; Admin fills post-launch (importer seeds placeholders) |
| 13 | businessContact i18n | **emails/phones/taxId = locale-invariant scalars; legalName/address = localized `{en,vi}`** |
| 14 | Revalidation retry | **In-memory retry + manual re-fire** for the foundation; durable outbox is a fast-follow |

---
> Design spec for the shared CMS foundation. The polished visual editor, Catalog UI, Forms builder, and GA4 are **later** sub-projects; this builds the data, control-plane, auth, media, web read-path, and a **minimal admin shell** that exercises every surface end-to-end. All 7 locked decisions are baked in; all adversarial-review and cross-cutting fixes are applied.

---

## 1. Overview & Goals

Promote SIGNEX's currently 100%-static public site (`apps/web`) into a CMS-driven site without changing what visitors see. Today: all copy lives in two parallel dicts `apps/web/app/[lang]/dictionaries/en.json` + `vi.json` (top keys `hero, form, features, about, products, contact, footer, nav, aboutPage, contactPage, notFound, meta`); the 4×6 catalog is embedded in the index-aligned `products` key; images are hardcoded `/assets/**` (and `app/lib/product-images.ts` `CATEGORY_IMAGES`/`PRODUCT_IMAGES`). Verified: product route segments `[lang]/products/[slug]/page.tsx`, `.../[slug]/[product]/page.tsx` hard-set `export const dynamicParams = false` with populated `generateStaticParams`; `apps/web/next.config.ts` is `output:'standalone'` + `outputFileTracingRoot` only (no `cacheComponents`); `apps/web/package.json` has only `next/react/react-dom`; `packages/shared/src/index.ts` exports only `contactMessageSchema`; `packages/db/prisma/schema.prisma` is datasource+generator only.

**Goals**
- One mutable **working state** that admins edit (relational Catalog + JSON ContentBlocks + Settings/Nav/SEO + Assets), plus **N immutable site-wide Release snapshots**.
- **Hybrid ISR on-demand delivery**: web stays statically rendered + cached; Publish marks affected pages stale via Next on-demand revalidation; drafts viewed via Next draft mode.
- **Multi-user RBAC** (Editor / Publisher / Admin); the NestJS api is the sole control plane for writes/preview/publish/revalidate.
- Self-hosted Docker, single instance, Cloudflare R2 for media.
- A one-time **importer** migrates the current dicts + hardcoded assets into the working state, losing nothing, and mints Release v1.

---

## 2. Scope (this infra phase)

**IN**: `@signex/shared` content/zod registry; full `packages/db` Prisma schema + migration; api auth+RBAC, content/catalog CRUD, R2 media, release/publish/rollback engine, revalidation, form-submission capture; importer; web read-path refactor (snapshot read, draft preview, revalidate/draft route handlers, `dynamicParams` fix, literal promotion, NAP unification); a minimal utilitarian admin shell (login, release panel, catalog CRUD, registry-driven block editor, media library, users).

**OUT (later sub-projects)**: visual click-on-live-site editor, inline overlay, drag-reorder, image/video crop/focal UI, rich merchandising, Forms **builder** UI (capture is in), GA4/analytics, frontend-design styling pass, eager responsive image variants, granular field-level permissions, per-block optimistic locking.

---

## 3. Architecture (the 7 decisions, integrated)

- **One mutable WORKING world + immutable RELEASE snapshots.** The "current draft" IS the live working tables (locked #4) — there is no `DRAFT` Release row. Publish serializes the whole working state into one immutable `Release.snapshot` JSON and moves a singleton `PublishedPointer`.
- **Web PUBLIC reads the latest published snapshot directly via `@signex/db`** (one indexed row, no joins, no api at request time). **Web PREVIEW** (draft mode) reads live working state via the api. The **api owns all writes/preview/publish/revalidate** (locked #7, #3).
- **Hybrid content model** (locked #7): Catalog = relational Prisma (`Category`/`Product`/`Asset`); page copy + settings + nav + SEO = JSON `ContentBlock` rows validated by zod schemas in `@signex/shared`.
- **Auth** = opaque httpOnly cookie sessions, server-side `Session` table, 3-role enum RBAC (locked #5, #6).
- **Media** = R2, content-addressed keys, referenced by `assetId`+`r2Key` (never absolute URL) — URL resolved at read time from `MEDIA_PUBLIC_BASE` (locked #6).

### 3.1 Resolved cross-cutting decisions (review fixes baked in)

1. **Single canonical schema location**: `packages/db/prisma/schema.prisma` is owned by the data-model layer; all other layers import from it. Converged enums: `Role { EDITOR PUBLISHER ADMIN }`, `ReleaseStatus { PUBLISHED ARCHIVED }` (**DRAFT removed** per locked #4).
2. **Single-PUBLISHED invariant via an explicit `PublishedPointer` singleton table** (Prisma-expressible) — **not** a raw-SQL partial unique index (which `prisma migrate dev` can silently drop).
3. **Asset URLs are NOT frozen.** Snapshots freeze `{ assetId, r2Key, mime, width, height }`; web resolves `MEDIA_PUBLIC_BASE + '/' + r2Key` at read time. Survives CDN/domain migration and makes rollback faithful. **Publish gate**: refuse to publish if `MEDIA_PUBLIC_BASE` is unset or an `r2.dev` dev host.
4. **No eager image variants / no `sharp` in the foundation** (verified: zero `srcSet`/`srcset` in `apps/web/app`; site renders single `<img src>`). Keep an empty `variants: []` in the frozen asset shape so a later responsive sub-project can backfill without a snapshot migration.
5. **Alt text lives on the USE, not the deduped Asset** (sha256 byte-dedup would otherwise force byte-identical placeholders to share one alt — wrong for 24 products cycling 6 images). Alt is on `AssetRef`/content field/`Product`; `Asset.altDefault` is only a fallback.
6. **`FormSubmission` is a real model** (audit fact: forms submit nowhere). It is **operational-only**, never snapshot-serialized.
7. **Concurrency**: a single global `WorkingState.revision` optimistic lock; publish version assigned via a Postgres **sequence** (no `max+1` race); serialize+validate **outside** the publish transaction, short tx with a revision guard inside.

---

## 4. Data Model (Prisma sketch — `packages/db/prisma/schema.prisma`)

```prisma
// Append to the existing datasource + generator.
// CONVENTIONS: LocalizedText = Json { en, vi } (LocalizedTextSchema in @signex/shared);
// every Json column is zod-validated before write AND again at publish.

// ===== IDENTITY / RBAC =====
enum Role { EDITOR PUBLISHER ADMIN }

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  name         String
  passwordHash String                              // node:crypto scrypt (no native dep)
  role         Role     @default(EDITOR)
  isActive     Boolean  @default(true)             // deactivate, never hard-delete (preserves audit FKs)
  lastLoginAt  DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  sessions          Session[]
  releasesCreated   Release[] @relation("ReleaseCreatedBy")
  releasesPublished Release[] @relation("ReleasePublishedBy")
  assetsUploaded    Asset[]
  auditLogs         AuditLog[]
}

model Session {
  id        String   @id @default(cuid())
  tokenHash String   @unique                       // sha256(raw token); raw lives only in the cookie
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  revokedAt DateTime?                               // logout / demote / deactivate => instant kill
  lastSeenAt DateTime @default(now())
  ip        String?
  userAgent String?
  createdAt DateTime @default(now())
  @@index([userId]); @@index([expiresAt])
}

model AuditLog {
  id         String   @id @default(cuid())
  userId     String?
  user       User?    @relation(fields: [userId], references: [id], onDelete: SetNull)
  action     String                                // "content.update" | "release.publish" | "release.rollback" ...
  entityType String
  entityId   String?
  meta       Json?
  createdAt  DateTime @default(now())
  @@index([entityType, entityId]); @@index([createdAt])
}

// ===== MEDIA (R2) =====
enum AssetStatus { PENDING READY }
enum AssetKind   { IMAGE VIDEO SVG }

model Asset {
  id           String      @id @default(cuid())
  status       AssetStatus @default(PENDING)
  kind         AssetKind
  sha256       String      @unique                 // content hash => dedup + immutability
  r2Key        String      @unique                 // originals/<hash32>/<slug>.<ext> ; URL is DERIVED, never stored
  mime         String
  bytes        BigInt                              // BigInt to avoid a future migration on large video
  width        Int?
  height       Int?
  duration     Float?
  originalName String
  altDefault   Json?                               // LocalizedText fallback ONLY; real alt is per-use
  posterId     String?                             // video poster (an IMAGE asset)
  poster       Asset?      @relation("AssetPoster", fields: [posterId], references: [id])
  postered     Asset[]     @relation("AssetPoster")
  uploadedById String?
  uploadedBy   User?       @relation(fields: [uploadedById], references: [id], onDelete: SetNull)
  createdAt    DateTime    @default(now())
  deletedAt    DateTime?                           // soft-delete; service-layer enforces "no delete while referenced"
  categoriesImage Category[]      @relation("CategoryImage")
  productsImage   Product[]       @relation("ProductImage")
  refs            AssetRef[]                        // working-state usage (derived cache, rebuilt at publish)
  releaseRefs     ReleaseAssetRef[]                 // indexed release<->asset (delete/GC safety)
  @@index([status, kind]); @@index([deletedAt])
}

// Working-state usage tracking; DERIVED from working state, rebuilt on every publish.
model AssetRef {
  id        String @id @default(cuid())
  assetId   String
  asset     Asset  @relation(fields: [assetId], references: [id])
  ownerType String                                 // "product"|"category"|"contentBlock"|"settings"
  ownerId   String
  field     String                                 // json path e.g. "hero.image" | "gallery[2]"
  alt       Json?                                  // per-use LocalizedText (canonical alt source)
  @@unique([ownerType, ownerId, field]); @@index([assetId])
}

// Indexed "which retained release references this asset" — makes delete/GC an O(1) set query.
model ReleaseAssetRef {
  releaseId String
  release   Release @relation(fields: [releaseId], references: [id], onDelete: Cascade)
  assetId   String
  asset     Asset   @relation(fields: [assetId], references: [id])
  @@id([releaseId, assetId]); @@index([assetId])
}

// ===== CATALOG (relational working state) =====
model Category {
  id            String   @id @default(cuid())
  slug          String   @unique                   // URL key (generateStaticParams)
  sortOrder     Int                                 // LOAD-BEARING (index->image, sitemap)
  title         Json     // LocalizedText
  tag           Json     // LocalizedText "PVC · Silicone"
  intro         Json     // LocalizedText (category page desc + meta + JSON-LD)
  productCount  Int                                 // locale-invariant stat (18/24/15/12)
  materialCount Int                                 // (4/6/5/3)
  imageId       String?
  image         Asset?   @relation("CategoryImage", fields: [imageId], references: [id], onDelete: Restrict)
  imageAlt      Json?    // per-use alt (not on Asset)
  products      Product[]
  createdAt DateTime @default(now()); updatedAt DateTime @updatedAt; deletedAt DateTime?
  @@index([sortOrder])
}

model Product {
  id         String   @id @default(cuid())
  categoryId String
  category   Category @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  slug       String                                 // unique WITHIN category
  sortOrder  Int
  title      Json; tag Json; desc Json              // LocalizedText each
  imageId    String?
  image      Asset?   @relation("ProductImage", fields: [imageId], references: [id], onDelete: Restrict)
  imageAlt   Json?
  createdAt DateTime @default(now()); updatedAt DateTime @updatedAt; deletedAt DateTime?
  @@unique([categoryId, slug]); @@index([categoryId, sortOrder])
}

// ===== JSON CONTENT BLOCKS =====
enum BlockKind { PAGE SETTINGS NAV SEO }
model ContentBlock {
  id        String    @id @default(cuid())
  kind      BlockKind
  key       String                                 // "home.hero" | "businessContact" | "nav.primary" | "seo.home"
  data      Json                                   // zod-validated by registry[(kind,key)]
  createdAt DateTime @default(now()); updatedAt DateTime @updatedAt
  @@unique([kind, key]); @@index([kind]); @@index([key])
}

// ===== FORM SUBMISSIONS (operational-only; NOT in snapshots) =====
enum SubmissionStatus { NEW READ ARCHIVED }
model FormSubmission {
  id            String           @id @default(cuid())
  formKey       String                               // "quote" | "contact"
  payload       Json                                 // zod-validated against the form's submit schema
  uploadAssetId String?                              // the form's "upload" field -> R2 Asset
  status        SubmissionStatus @default(NEW)
  ip            String?; userAgent String?
  createdAt     DateTime @default(now())
  @@index([formKey, status]); @@index([createdAt])
}

// ===== VERSIONING =====
enum ReleaseStatus { PUBLISHED ARCHIVED }           // DRAFT removed (locked #4: working tables ARE the draft)
model Release {
  id            String        @id @default(cuid())
  version       Int           @unique               // assigned from a Postgres sequence
  status        ReleaseStatus @default(PUBLISHED)
  label         String?
  note          String?
  snapshot      Json                                 // whole serialized site (ReleaseSnapshotSchema)
  checksum      String                               // sha256(canonical snapshot)
  schemaVersion Int                                  // stamped; web gates/migrates on this
  fromRevision  Int                                  // WorkingState.revision at serialize time
  rolledBackFromVersion Int?
  createdById   String
  createdBy     User    @relation("ReleaseCreatedBy", fields: [createdById], references: [id])
  publishedById String?
  publishedBy   User?   @relation("ReleasePublishedBy", fields: [publishedById], references: [id])
  createdAt     DateTime @default(now()); publishedAt DateTime?
  assetRefs     ReleaseAssetRef[]
  @@index([status]); @@index([version])
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
  revision              Int      @default(0)        // bumped on every committed working-state edit
  lastPublishedRevision Int      @default(0)        // dirty iff revision != lastPublishedRevision
  updatedAt             DateTime @updatedAt
  updatedById           String?
}
```

**Migration & sequence**: a single committed migration creates these tables plus `CREATE SEQUENCE release_version_seq;`. The publish path calls `nextval('release_version_seq')` so two concurrent publishers can never collide on `version`.

**ID strategy is locked to `cuid()`** for `User`/`Asset`/etc., so `@signex/shared`'s `assetId` schema can be `z.string().cuid()` consistently.

**Snapshot-serialized vs operational-only (the contract the serializer + importer both honor):**
- **SNAPSHOT** = `Category`, `Product`, `Asset` (as frozen refs), `ContentBlock` (PAGE/SETTINGS/NAV/SEO).
- **OPERATIONAL-ONLY** = `User`, `Session`, `AuditLog`, `Release`, `PublishedPointer`, `WorkingState`, `FormSubmission`, `AssetRef`, `ReleaseAssetRef`.

---

## 5. Content Schema Registry (`@signex/shared`) — the cross-app contract

`packages/shared` compiles to CJS `dist/` and is the single source of truth imported by api (validation + serialize), admin (form-gen + DTO typing), and web (snapshot typing). It is **net-new and must be built FIRST** (currently only `contactMessageSchema` exists).

```
packages/shared/src/
  index.ts                 // re-exports everything (keep existing contactMessageSchema)
  content/primitives.ts    // LocalizedText, localized(), TwoToneTitle, AssetRef, VideoRef, Href, Id
  content/blocks/*.ts      // hero, features, about, productsHeader, footer, nav, meta, businessContact,
                           //   formConfig, aboutPage, contactPage, notFound
  content/registry.ts      // BLOCK_REGISTRY, BlockKey, parseBlock(), ReleaseBlocks
  content/catalog.ts       // zod DTOs mirroring Category/Product/Asset (api responses)
  content/release.ts       // ReleaseSnapshotSchema (with schemaVersion)
  auth.ts                  // loginSchema, createUserSchema, ROLE_RANK, atLeast(), RoleName
```

### 5.1 Primitives

```ts
export const Id = z.string().cuid();                          // matches Prisma cuid() (locked)
export const localized = <T extends z.ZodTypeAny>(inner: T) => z.object({ en: inner, vi: inner });
export const LocalizedText = localized(z.string());
export const LocalizedTextArray = localized(z.array(z.string()));
export const TwoToneTitle = z.object({ lead: LocalizedText, accent: LocalizedText }); // "About " + "SIGNEX"
export const Href = z.string();
export const AssetRef = z.object({ assetId: Id, alt: LocalizedText.optional() });      // alt per-USE
export const VideoRef = z.object({ posterAssetId: Id, mp4AssetId: Id, webmAssetId: Id.optional() });
```

`localized()` structurally guarantees the en/vi parallelism that today is only convention. `VideoRef` (poster+mp4+webm) correctly models the Webflow `w-background-video` in `features.tsx` and the about page — a single `AssetRef` would lose formats.

### 5.2 Block registry (mirrors the 12 dict top-keys + promoted literals)

`BLOCK_REGISTRY = { hero, features, about, productsHeader, footer, nav, meta, businessContact, formConfig, aboutPage, contactPage, notFound }`. Selected shapes (review-corrected to include all real dict data):

```ts
export const businessContactBlock = z.object({       // UNIFIED NAP: one source for footer + home + contactPage + JSON-LD
  legalName: LocalizedText, brand: z.string(),
  emails: z.array(z.string().email()),               // footer renders emails[0]; contact cards render all
  phones: z.array(z.object({ kind: z.enum(["tel","zalo"]), label: LocalizedText, value: z.string() })),
  taxId: z.string(), taxLabel: LocalizedText,
  sites: z.array(z.object({ kind: z.enum(["office","factory"]), label: LocalizedText,
                            address: LocalizedText, mapEmbedUrl: z.string().optional() })),
  social: z.array(z.object({ kind: z.enum(["facebook","youtube","zalo"]), href: Href })),
});
// NOTE: display labels (Tel:/Zalo:/Office:/Factory:/Tax:) live INSIDE businessContact so it is
// SELF-CONTAINED (resolves the multi-block render-dependency the review flagged). The block ships
// with a per-presentation render-helper map (home Phone card, footer, contactPage card) as a
// deliverable artifact, so the web "structural superset of Dictionary" promise holds.

export const productsHeaderBlock = z.object({         // dict.products UI copy MINUS categories[]
  eyebrow: LocalizedText, title: TwoToneTitle, body: LocalizedText,
  statLabels: z.object({ products: LocalizedText, materials: LocalizedText }),
  detail: z.object({ listTitle: TwoToneTitle }),
  product: z.object({ categoryLabel: LocalizedText, materialLabel: LocalizedText,
                      cta: LocalizedText, ctaHref: Href, back: LocalizedText, zoomHint: LocalizedText }),
});

export const featuresBlock = z.object({
  eyebrow: LocalizedText, title: TwoToneTitle,
  cta: z.object({ label: LocalizedText, href: Href }),
  video: z.object({ title: LocalizedText, text: LocalizedText, media: VideoRef.optional() }),
  featured: z.object({ title: LocalizedText, desc: LocalizedText }),
  cards: z.array(z.object({ title: LocalizedText, desc: LocalizedText })).min(1),
});
// footer (fieldLabels, shipping carriers, payment methods+tone, links), nav (logo AssetRef, CTA href),
// meta (siteUrl, themeColor, ogImage AssetRef, favicons), formConfig (fields[]+required, standardOptions
// value+label pairs, submit/success/fail), aboutPage (timeline/process/capability/approach repeaters with
// optional milestone.items/note), contactPage, notFound (image AssetRef, cta) — all per their dict shapes.
```

### 5.3 Snapshot schema (with version + frozen asset refs)

```ts
export const FrozenAsset = z.object({
  assetId: Id, r2Key: z.string(),                    // URL resolved at read time, NOT frozen
  mime: z.string(), width: z.number().optional(), height: z.number().optional(),
  alt: LocalizedText.optional(),
  poster: z.object({ r2Key: z.string() }).optional(),
  webm: z.object({ r2Key: z.string() }).optional(),
  variants: z.array(z.object({ label: z.string(), width: z.number(), r2Key: z.string() })).default([]),
});
export const ReleaseSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  blocks: z.object(BLOCK_REGISTRY),                  // every block, both locales, validated together
  catalog: z.object({ categories: z.array(/* slug, sortOrder, title/tag/intro {en,vi},
                                             productCount, materialCount, image: FrozenAsset,
                                             items: [...] order-preserving */ z.any()) }),
});
export type ReleaseSnapshot = z.infer<typeof ReleaseSnapshotSchema>;
```

`z.object(BLOCK_REGISTRY)` reuses the registry so the web snapshot type and api per-block validation can never diverge.

---

## 6. Importer / Seed (one-time migration)

Lives in **`@signex/api`** (it already `require()`s `@signex/db` + `@signex/shared` and will own scrypt + the R2 service — one runtime with all deps; `packages/db` has neither a TS runner nor a shared dep). Runs as a Nest command compiled to `dist`. Reads web dicts via a committed relative path (web does not export its dicts).

**Three contracted outputs:**
1. Seeded working-state rows + **Release v1 (PUBLISHED)** in the DB.
2. A **committed `apps/web/app/lib/initial-snapshot.ts`** byte-equal to v1's snapshot — the web build-time fallback (single source so build and runtime agree).
3. `Asset` rows created via the **same server-side R2 upload + sha256 verify** the live upload path uses.

**Steps:**
1. For each `/assets/**` file referenced (logo, OG png, shared pexels image, `CATEGORY_IMAGES`, `PRODUCT_IMAGES`): read bytes from `apps/web/public/assets`, compute sha256, server-side PUT to R2, create `Asset` (de-dup by sha256 — logo→nav/footer/about, OG site-wide collapse to single rows). Decouple cycled `productImage(i % 6)` into a concrete per-product `imageId` (frozen choice; future edits independent).
2. `products.categories[i]` → `Category` (slug, `sortOrder=i`, title/tag/intro `{en,vi}`, `productCount`/`materialCount`, `imageId`). `category.items[j]` → `Product` (slug, `sortOrder=j`, title/tag/desc `{en,vi}`, `imageId`). `sortOrder` preserves the load-bearing index (routing/images/sitemap).
3. Build every `ContentBlock` from `en+vi`, **`parseBlock(key,data)`** each (importer doubles as the registry conformance test — crashes loudly if real content fails the schema), promote the ~30 hardcoded literals (footer field labels, ship/pay badges, social hrefs, map embed, OG/favicons, CTA hrefs, 404 copy) and unify NAP into `businessContact`.
4. Runs as an **exclusive operation** (advisory lock / maintenance flag), bumping `WorkingState.revision` **once at the end**, not per-row (avoids 409 storms).
5. Pre-flight asserts en/vi key-set parity **and per-node array-length parity** (categories/items, milestones, standardOptions) so the leaf-zip can't silently misalign.

---

## 7. Release / Draft / Publish / Rollback Engine (NestJS api)

New modules `apps/api/src/release/`, `content/`, `catalog/`, `assets/`, `audit/`, all via `PrismaService.client`.

### 7.1 Working-state edits + concurrency

All edits (Editor+) go through one `ContentService` that, in a tx: checks `WorkingState.revision === expectedRevision` (else `409 STALE_DRAFT`), zod-validates by `(kind,key)`, upserts the row, **reconciles `AssetRef`** (walks the JSON/record for `AssetRef`/`VideoRef` nodes), bumps `revision`, writes audit. Catalog CRUD bumps the same counter. Single global lock is accepted for the minimal foundation; finer per-block locking is deferred.

### 7.2 Publish (serialize OUTSIDE tx, short tx inside)

```ts
async publish(actor: User, { note, expectedRevision }) {
  // 0. GATE: MEDIA_PUBLIC_BASE must be set and NOT an r2.dev host (frozen base is unfixable post-publish).
  // 1. OUTSIDE tx: read working state, build snapshot (resolve assetId -> {assetId, r2Key, ...},
  //    freeze poster/webm r2Keys), ReleaseSnapshotSchema.parse, compute checksum. fromRevision = current.
  // 2. SHORT tx (explicit {timeout, maxWait}):
  //    - re-check WorkingState.revision === fromRevision  (else 409 — closes the TOCTOU window)
  //    - version = nextval('release_version_seq')         (sequence: no max+1 race)
  //    - demote current PUBLISHED -> ARCHIVED; create Release{PUBLISHED, snapshot, checksum, schemaVersion, version}
  //    - upsert PublishedPointer -> new release            (atomic single-row repoint)
  //    - write ReleaseAssetRef rows (indexed release<->asset for delete/GC safety)
  //    - WorkingState.lastPublishedRevision = revision     (dirty tracking)
  //    - audit "release.publish"
  // 3. AFTER commit: revalidator.revalidate(prev, next)    (non-fatal, retryable)
}
```

`PublishedPointer` + sequence + revision-guard give the single-PUBLISHED, monotonic-version, no-collision invariant without any invisible partial index. Publish dedupe (checksum == live) applies **only to publish-from-working-state**, never to rollback.

### 7.3 Rollback

Forward-only: copy an `ARCHIVED` release's `snapshot` into a **new** PUBLISHED release (version keeps incrementing; `rolledBackFromVersion` set), repoint the pointer, audit, then full revalidate. Default is **repoint-only** (`restoreWorkingState=false`). Optional restore rehydrates working tables inside the same tx; because the snapshot freezes `assetId`+`r2Key` (not URL), `Asset` FK relations can be faithfully rebuilt.

### 7.4 Dirty detection

Canonical: `dirty = WorkingState.revision !== WorkingState.lastPublishedRevision` (never compares a revision int against a version int).

### 7.5 Routes (global prefix `api`)

```
POST /api/auth/login|logout            GET /api/auth/me
POST /api/users  PATCH/DELETE :id       [ADMIN]
PUT  /api/content/blocks/:kind/:key     [EDITOR+]   { data, expectedRevision } -> {revision} | 409 | 422
POST /api/catalog/categories|products  PATCH/DELETE [EDITOR+]
POST /api/assets/presign | :id/confirm | :id/replace | :id/alt   GET /api/assets[/usage]
POST /api/forms/:formKey/submit         [PUBLIC, rate-limited]  GET /api/forms/submissions [EDITOR+]
GET  /api/releases  /live  /diff  :version
POST /api/releases/publish              [PUBLISHER+] { note, expectedRevision }
POST /api/releases/rollback             [PUBLISHER+] { toVersion, restoreWorkingState? }
POST /api/preview/snapshot              [PREVIEW_SECRET] -> live working state as ReleaseSnapshot
```

---

## 8. Auth & RBAC

Opaque httpOnly cookie sessions (`Session` table) — instant revocation on logout/demote/deactivate, no JWT refresh dance for a single-instance box. **Password hashing = `node:crypto` scrypt** (no native dep — sidesteps the argon2/alpine node-gyp build problem entirely). Three-role ordered enum (`EDITOR=1 < PUBLISHER=2 < ADMIN=3`) with `ROLE_RANK`/`atLeast()` in `@signex/shared`.

- `main.ts`: add `app.use(cookieParser())`; `AppModule` imports `AuthModule`.
- Global `APP_GUARD` order **OriginGuard → SessionAuthGuard → RolesGuard** (secure-by-default; `@Public()` on `/api/health`, `/api/auth/login`, `/api/forms/:formKey/submit`).
- `@Roles('PUBLISHER')` on publish/rollback; `@Roles('ADMIN')` on users; `@CurrentUser()` injects the audit author. `publicUser()` strips `passwordHash`.
- CSRF = SameSite=Lax + Origin allowlist enforced **at the admin route handlers** (where the real browser request lands), since the api sees a synthetic origin on server-to-server calls.
- **Login brute-force**: `@nestjs/throttler` (or equivalent) on `/api/auth/login`; constant-ish verify timing for enumeration resistance.
- Session lifetime = **30-day absolute** (locked, Decisions Log #10 / §17.1) — server-stored so logout/demote/deactivate revokes instantly; cleanup of expired/revoked rows via a guarded interval that no-ops if Prisma isn't connected (honors the tolerant-boot `PrismaService`).

**Browser auth model (collapsed to one):** the browser **never** talks to the api directly. All browser writes hit **same-origin admin Next route handlers** that forward the session cookie server-side via a `Bearer` header. The admin login handler **re-issues** the cookie via `NextResponse.cookies.set()` with admin-owned host-only attributes (not verbatim-forwarding the api's `Set-Cookie`). No CORS needed; api `enableCors` stays off. `proxy.ts` is a UX redirect only — every Server Action re-validates via `getSession()`→`/api/auth/me`.

**Seed order contract** (owned by auth, run at deploy): `prisma migrate deploy` → `auth:seed` creates a fixed **SYSTEM/ADMIN** user (deterministic cuid) from `SEED_ADMIN_*` env → content importer runs **passing that user id as the actor** for Release v1 + `Asset.uploadedById` → singletons (`WorkingState`, `PublishedPointer`) created by importer/publish. This closes the FK-violation-on-first-publish gap.

---

## 9. R2 Media Library

Single bucket `signex-media`, public-read via a bound custom domain `MEDIA_PUBLIC_BASE`. **Content-addressed keys** `originals/<sha256-first-32>/<slug>.<ext>` → same bytes = same key = dedup + immutability for free. **No persisted `Asset.url`** — derive at read time.

**Presigned direct PUT** (justified by 9MB+ webm videos): client computes sha256 → `POST /api/assets/presign` (Editor+, mime allowlist, size cap, dedup short-circuit on existing sha256) → browser PUTs bytes straight to R2 → `POST /api/assets/:id/confirm`. **Confirm hardening** (all one-time, cheap): server-side re-hash or `x-amz-checksum-sha256` in the presigned policy so R2 rejects mismatched bytes (the key is derived from the client-declared hash — must not be trusted on length alone); derive authoritative width/height (don't freeze client-asserted dims); set `Content-Type` + `Cache-Control: public, max-age=31536000, immutable`; **sanitize SVG** (or forbid SVG upload from admin, allow only via the trusted importer).

**No `sharp`/eager variants in the foundation** (verified: no srcset in the cloned site). **No synchronous heavy processing under Editor auth** — confirm only verifies + flips READY.

**Video** = 3 linked assets via `posterId` + `VideoRef`; replace repoints all three atomically. **Delete/GC** = soft-delete + service-layer "no delete while referenced"; the indexed `ReleaseAssetRef` answers "referenced by any retained release" as a set query. `AssetRef` is treated as a **derived cache** rebuilt from working state on every publish.

---

## 10. Web Read-Path (`apps/web`)

### 10.1 The make-or-break: `draftMode()` + `cacheComponents`

Enable `cacheComponents: true` and `serverExternalPackages: ['@prisma/client','@signex/db']` in `next.config.ts` (keep `output:'standalone'` + `outputFileTracingRoot`). The **published path is fully cached and draftMode-free**:

```ts
// app/lib/content.ts
async function getPublishedSnapshot(lang: Locale): Promise<SiteContent> {
  "use cache";
  cacheTag("release");                                  // single site-wide invalidation handle
  try {
    const rel = await prisma.release.findFirst({ where: { status: "PUBLISHED" },
                                                 orderBy: { version: "desc" }, select: { snapshot: true } });
    if (!rel) return INITIAL_SNAPSHOT[lang];
    return resolveForLang(ReleaseSnapshotSchema.parse(rel.snapshot), lang); // resolves r2Key->URL via MEDIA_PUBLIC_BASE
  } catch { return INITIAL_SNAPSHOT[lang]; }            // ANY Prisma error -> last-known-good (site never 500s on data)
}
```

`getPublishedSnapshot` reads **no** `draftMode()` (reading it at the caller would force the whole shell dynamic under `cacheComponents` and forfeit SSG). **Preview is gated at the route level** / a `<Suspense>`-wrapped island that reads `draftMode().isEnabled` inside, fetching `/api/preview/snapshot` from the api. `generateStaticParams`, `generateMetadata`, `sitemap.ts`, `robots.ts`, and `org-json-ld.tsx` all call `getPublishedSnapshot`/`INITIAL_SNAPSHOT` directly — **never** a draft-aware resolver.

### 10.2 The critical route-config fix (locked #3)

Verified: `[lang]/products/[slug]/page.tsx`, `.../[slug]/[product]/page.tsx`, and `[lang]/layout.tsx` all set `dynamicParams = false`. With on-demand publish ADDING a catalog slug, a `false` segment **404s the new page until a full rebuild** — breaking "regenerate in seconds." **Fix (ships with catalog CRUD): set `dynamicParams = true` on the two product segments** (keep `generateStaticParams` pre-listing known published slugs for SSG; new slugs render on first visit then cache). Keep `[lang]/layout` `dynamicParams = false` (locale set is fixed). A build-time invariant test asserts the product segments are `dynamicParams = true`.

### 10.3 Revalidation (Next 16.2 signatures)

```ts
// app/api/revalidate/route.ts  (secret-protected; restrict to internal net)
export async function POST(req: Request) {
  if (req.headers.get("x-revalidate-secret") !== process.env.REVALIDATE_SECRET)
    return Response.json({ ok: false }, { status: 401 });
  const { paths } = await req.json();
  revalidateTag("release", "max");                       // 16.2 REQUIRED 2nd arg; one tag covers every page
  for (const p of paths ?? []) revalidatePath(p);        // literal resolved /[lang]/... paths for shells
  return Response.json({ ok: true });
}
```

`revalidateTag('release','max')`/`revalidatePath` only **mark stale on next visit** (stale-while-revalidate) — documented as such, not "instant." The api may issue a warming GET to key routes post-publish; for must-be-instant changes, request `expire:0`. New-slug paths are warmed by GET (now possible because `dynamicParams=true`).

### 10.4 Build/packaging (web → DB coupling — the biggest integration cost)

Add `@signex/db` + `@signex/shared` to `apps/web` deps. In the web Dockerfile builder stage (mirroring the working api Dockerfile): `npm run -w @signex/db generate` AND `npm run build -w @signex/db -w @signex/shared` **before** `next build`; un-exclude `packages/db/generated` for the web stage in `.dockerignore`; confirm the standalone trace includes the generated client + the `linux-musl-openssl-3.0.x` engine (already a configured `binaryTarget`). Add `DATABASE_URL` to the web compose service + `depends_on postgres: service_healthy`. **Acceptance**: `docker compose up --build` and confirm `GET /vi` renders from DB, not just the fallback.

### 10.5 Component migration (low-risk, mechanical)

Components are already pure `({ dict }) => JSX`. Snapshot is a **structural superset** of `Dictionary`, so swap `getDictionary(lang)` → `getSiteContent(lang)` (published path) at the page/layout call sites and repoint the `Dictionary` type to `SiteContent` (or a shim alias) — JSX unchanged. Promote hardcoded literals to snapshot fields; unify NAP (`footer`, home `contact`, `contactPage` cards, `org-json-ld.tsx` all read `businessContact` via the shipped render-helper map). `product-images.ts` helpers become snapshot field access (index alignment guaranteed by importer `sortOrder`). **Webflow runtime untouched** (`webflow-bundles.ts` keys off pathname, not content). **`global-error.tsx`** (client, no locale) and the static **`not-found`** copy are fed by **build-time constants imported from `INITIAL_SNAPSHOT`**, not the runtime resolver (they cannot call server-only/draft-aware code without de-opting the subtree). Audit `cookies()`/`headers()` usage so no stray dynamic API flips a page off SSG.

---

## 11. Form Submissions

The 2 lead-capture forms (24 fields incl. `upload`) post to `POST /api/forms/:formKey/submit` (`@Public`, rate-limited). The api validates `payload` against the form's submit zod schema, optionally links `uploadAssetId` (R2), writes a `FormSubmission` (NEW). Admin lists submissions (`GET /api/forms/submissions`, Editor+). Form **copy** stays in the `formConfig` ContentBlock; the **runtime payload** is operational-only and never enters a snapshot.

---

## 12. Minimal Admin Shell

Re-scaffold `apps/admin` via `create-next-app@latest` (TS, App Router, Tailwind v4, `@/*`), then **re-apply the 4 monorepo touch-points** (name `@signex/admin` + port 3061 scripts; `next.config.ts` `output:'standalone'` + `outputFileTracingRoot`; the existing nested Dockerfile; `AGENTS.md`). **Pin to web's exact Next/React** (16.2.7 / 19.2.4) after `--skip-install`. Add `@signex/shared` to admin deps **and** run `npm run build -w @signex/shared` in the admin Dockerfile builder before `next build` (ROLE_RANK is a runtime value that must be traced into standalone). Admin **never** imports `@signex/db`.

Screens (utilitarian Tailwind; polished UI is a later sub-project): `/login`; `(dash)` route group gated by `proxy.ts` + a server `getSession()`; dashboard (dirty status); **releases** panel (status / Publish [Publisher+] / version history / rollback); **catalog** CRUD (categories/products tables+forms, numeric `sortOrder`, asset picker — no drag yet); **content/[blockKey]** generic `<ZodForm>` auto-rendered from `BLOCK_REGISTRY` (string→input, `localized`→en/vi pair, array→repeater, `AssetRef`→media picker; anything richer → raw JSON textarea validated on submit); **media** upload+grid+picker (presign→PUT→register); **users** (Admin only).

**Fix the `apiServer` cookie bug**: resolve the cookie before the truthiness check — `const token = opts.token ?? (await cookies()).get('sx_session')?.value;` (a Promise is always truthy → `Bearer undefined`). RBAC in the UI is **affordance only**; the api re-checks every guarded route; every Server Action re-validates. New compose envs: `ADMIN_ORIGIN`, `ALLOWED_ORIGINS`, `REVALIDATE_SECRET`, `PREVIEW_SECRET`, `NEXT_PUBLIC_WEB_URL`.

---

## 13. Error Handling & Resilience

- **Web never 500s on data**: `getPublishedSnapshot` try/catch → `INITIAL_SNAPSHOT`; empty DB → fallback (deterministic build, `generateStaticParams` always has slugs).
- **Snapshot drift**: every release carries `schemaVersion`; web `ReleaseSnapshotSchema.parse` (safeParse in non-prod) gates/migrates old releases; both web + api import the same `@signex/shared` so drift is caught at typecheck.
- **Publish atomicity**: serialize+validate outside tx; short tx (sequence version + pointer repoint + audit); revalidation post-commit, **idempotent + retryable**; a manual `POST /api/releases/:version/revalidate` re-fire + an admin "revalidation pending" surface (in-memory retry dies on api restart — a durable outbox is a fast-follow, noted in §15).
- **R2 confirm**: HEAD + checksum verify before READY; sweep `PENDING` assets with no object after 1h.
- **Publish gate**: refuse if `MEDIA_PUBLIC_BASE` unset/`r2.dev`.

---

## 14. Testing

- **Importer = conformance test**: `parseBlock` every block; assert en/vi key + array-length parity; assert 4 categories, 6 items each, unique slugs.
- **Schema invariants**: single-PUBLISHED (pointer), monotonic version (sequence), `dynamicParams=true` on product segments (build-time assert).
- **Concurrency**: two parallel publishes → no version collision; concurrent edit during publish → one `409`.
- **Catalog<->zod**: serializer column-zip output validates against `catalog.ts`.
- **Acceptance (whole-stack)**: `docker compose up -d --build` → 5 services healthy → login → edit block → save draft → preview (draftMode) → publish → web revalidates → rollback. Confirm web reads from DB (not fallback).
- **Docker gate**: green `docker compose build` of all 4 app images before commit (every new dep traced into the right stage).

---

## 15. Build Sequence

0. **`@signex/shared` content+auth registry** (everything imports it; build to CJS dist).
1. **`packages/db` schema + migration + `release_version_seq`**; generate client; declare snapshot vs operational table contract.
2. **api auth + RBAC** (scrypt, guards, cookie-parser, ZodPipe, throttler, users CRUD); `docker compose build api`.
3. **Seed/bootstrap contract**: migrate deploy → `auth:seed` (system user).
4. **api content + catalog services** (working-state CRUD through one service; revision bump; AssetRef reconcile).
5. **R2 media** (R2Service, presign/confirm with verify + cache headers + SVG sanitize; no sharp).
6. **Release engine** (serializer freezes assetId+r2Key + ReleaseAssetRef; publish sequence+pointer+revision guard; rollback; diff via lastPublishedRevision).
7. **Importer** (in api): migrate dicts+assets, NAP unify, exclusive run, system actor, Release v1, emit committed `initial-snapshot.ts`, ship NAP render-helper map.
8. **Web read-path/delivery** (add db+shared deps + Dockerfile build steps + un-ignore generated; `cacheComponents` + `use cache`/`cacheTag('release')` draftMode-free loader with fallback; `dynamicParams=true` on product segments; revalidate + draft routes; component/sitemap/metadata refactor; FormSubmission post wiring). Verify GET /vi from DB.
9. **Admin shell** (LAST; re-scaffold + wiring + shared build step; proxy; same-origin route handlers; getSession; typed client [cookie-bug fixed]; login/releases/catalog/block-editor/media/users).
10. **Whole-stack acceptance** per §14.

---

## 16. Risks & Open Decisions

**Top risks (mitigated above):** web→DB coupling (Dockerfile generate+build+trace, fallback on any error); `dynamicParams=false` vs new slugs (set `true` on product segments); `revalidateTag` 2-arg + `cacheComponents` prerequisite; frozen-URL immutability break (freeze r2Key not URL + publish gate); native/workspace deps not traced (scrypt over argon2, no sharp, build shared in admin); single global lock under multi-editor (accepted minimal; importer exclusive); durable revalidation retry (manual re-fire now, outbox fast-follow); api published to host vs same-site CSRF assumption (reverse-proxy `/api` or harden api as internet-facing).

**Genuinely-open decisions for the user** are listed separately below.

---

## 17. Resolved Open Decisions (supersedes §16's open list)

The adversarial design surfaced 7 genuinely-open decisions; all are now resolved (see also the Decisions Log above):

1. **Admin session lifetime** → **30-day absolute** (user chose convenience over the recommended absolute-max + idle-timeout). Risk is mitigated because sessions are server-stored (`Session` table), so logout / role-change / deactivation revokes instantly. Revisit if the team grows or a session leak is suspected.
2. **Rollback default** → **repoint-only**: rollback re-points the live `PublishedPointer` to an older Release; the working draft is left untouched. `restoreWorkingState` remains an opt-in flag for "pull the old snapshot back into the working tables to edit from".
3. **Publish no-op policy** → **soft warning**: if the working state is byte-identical (checksum) to the live release, Publish returns a "nothing to publish" notice and mints **no** new version.
4. **API internet exposure** → **reverse-proxy `/api` behind a single hostname** (do not publish container port 3060 to the host/internet). This keeps the same-site CSRF model (SameSite=Lax + Origin allowlist) valid and minimizes attack surface. The `docker-compose` topology must change accordingly (drop the `3060:3060` host publish; route `/api` via the proxy), and `enableCors` stays off.
5. **Social links** (Facebook/YouTube/Zalo, currently `href="#"`) → **seed placeholders**, an Admin fills real URLs post-launch via the businessContact editor (they then also feed Organization JSON-LD `sameAs`).
6. **businessContact i18n shape** → **emails / phones / taxId are locale-invariant scalars; legalName + address are localized `{en,vi}`** (supports a future Vietnamese legal name/address without a schema change).
7. **Revalidation retry durability** → **in-memory retry + a manual "re-fire revalidation" admin action** for the foundation. A committed-but-unrevalidated release would stay stale only until the next visit or a manual re-fire; a durable outbox/queue is an explicit fast-follow, not in this phase.
