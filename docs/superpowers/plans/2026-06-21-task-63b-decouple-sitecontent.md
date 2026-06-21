# Task 63b: Decouple SiteContent from en.json Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the importer parity regression by reverting `en.json` to the 12-key importer-source shape and decoupling `SiteContent` from `en.json` so the web's resolved type no longer couples to the dict file.

**Architecture:** `resolveForLang` in `content.ts` returns an inferred object literal; `SiteContent` becomes `ReturnType<typeof resolveForLang>`, removing the `as unknown as SiteContent` cast and the `import type enJson` coupling entirely. `en.json` is restored to exactly the same structure as `vi.json` (12 top keys, no per-node `*Url`/`image` fields, no `businessContact`).

**Tech Stack:** TypeScript, Next.js 16, NestJS 11, Prisma 6, Jest, npm workspaces + Turborepo

## Global Constraints

- Work from `/home/ealflm/dev/signex`
- Only two files change: `apps/web/app/lib/content.ts` and `apps/web/app/[lang]/dictionaries/en.json`
- `apps/web/app/lib/initial-snapshot.ts` MUST NOT change (deterministic — git diff must be empty)
- `en.json` MUST end up structurally identical to `vi.json` (same 12 top keys, same shape at every node)
- The `as unknown as SiteContent` cast on line 371 of `content.ts` MUST be removed
- The `import type enJson` + `export type SiteContent = typeof enJson` lines MUST be replaced
- All ~30 web components that access `dict.hero.imageUrl`, `dict.nav.logoUrl`, `dict.businessContact`, etc. must still type-check (SiteContent must still carry all resolved fields)
- Commit on `main` with exact subject: `fix(web): decouple SiteContent from en.json (restore importer dict parity; remove cast)`

---

## File Map

| File | Change |
|---|---|
| `apps/web/app/lib/content.ts` | Replace `import type enJson` + `typeof enJson` → `ReturnType<typeof resolveForLang>`; remove `as unknown as SiteContent` cast from return statement; move `resolveForLang` before `SiteContent` type export |
| `apps/web/app/[lang]/dictionaries/en.json` | Remove 8 web-only resolved fields: top-level `businessContact`; `hero.imageUrl`; `nav.logoUrl`; `notFound.imageUrl`; `meta.ogImageUrl`; `features.videoMedia`; `categories[*].image`; `categories[*].items[*].image` |

---

### Task 1: Strip web-only resolved fields from en.json

**Files:**
- Modify: `apps/web/app/[lang]/dictionaries/en.json`

**Context:**
The importer never reads these fields — `catalog-builder.ts` derives image IDs from the asset manifest by index, not from the dict JSON. `block-builder.ts` builds `businessContact` from `footer.*` and `meta.siteName` literals (not from a `businessContact` key). Removing these fields from `en.json` does NOT break the importer; it fixes the parity assertion.

Exact fields to remove (confirmed from comparison with vi.json):
- Top level: `businessContact` (entire object)
- `hero.imageUrl` (string)
- `nav.logoUrl` (string)
- `notFound.imageUrl` (string)
- `meta.ogImageUrl` (string)
- `features.videoMedia` (object with posterUrl/mp4Url/webmUrl)
- Each `products.categories[i].image` (object `{ "url": "..." }`) — 4 categories
- Each `products.categories[i].items[j].image` (object `{ "url": "..." }`) — 24 items (4×6)

- [ ] **Step 1: Remove `hero.imageUrl` from en.json**

  Open `apps/web/app/[lang]/dictionaries/en.json`. In the `"hero"` section, delete the line:
  ```json
  "imageUrl": "/assets/images/69b04fc10fe79a2becaf38a8_Contemporary_Cliffside_House_at_Twilight.avif"
  ```
  After the edit, `hero` should have exactly 4 keys: `titleTop`, `titleBottom`, `subtitle`, `imageAlt`.

- [ ] **Step 2: Remove `features.videoMedia` from en.json**

  In the `"features"` section, delete the entire `"videoMedia"` block:
  ```json
  "videoMedia": {
    "posterUrl": "...",
    "mp4Url": "...",
    "webmUrl": "..."
  },
  ```
  After the edit, `features` should have exactly 8 keys: `eyebrow`, `titleTop`, `titleBottom`, `cta`, `videoTitle`, `videoText`, `featured`, `cards`.

- [ ] **Step 3: Remove `products.categories[*].image` from en.json**

  In the `"products"` → `"categories"` array, each of the 4 category objects has an `"image": { "url": "..." }` field. Delete all 4 of them. The keys remaining per category object must be: `tag`, `title`, `slug`, `products`, `materials`, `intro`, `items`.

  Category 0 (plastic-logos-emblems) — delete:
  ```json
  "image": { "url": "/assets/images/69b049a16076b1b2188d012d_rumman-amin-s3o2rkTkF7I-unsplash.avif" },
  ```
  Category 1 (labels-badges-nameplates) — delete:
  ```json
  "image": { "url": "/assets/images/69b037b7b9f0bc0f27d8889d_dinuka-lankaloka-HKr5cn6S0q0-unsplash.avif" },
  ```
  Category 2 (custom-identity-components) — delete:
  ```json
  "image": { "url": "/assets/images/69b03783cb355b95794c522e_pexels-roman-odintsov-5667901.avif" },
  ```
  Category 3 (oem-brand-parts) — delete:
  ```json
  "image": { "url": "/assets/images/69aff4da51c27aa9c99aba98_pexels-keeganjchecks-14524361.avif" },
  ```

- [ ] **Step 4: Remove `products.categories[*].items[*].image` from en.json**

  Inside each category's `"items"` array, each of the 6 items has an `"image": { "url": "..." }` field. Delete all 24 of them (4 categories × 6 items). After deletion, each item object must have exactly 4 keys: `slug`, `title`, `tag`, `desc`.

  The 6 image URLs that appear in items (repeated across categories, cycling):
  - `/assets/images/69a9a5725487307243a72031_pexels-adriendrj-33980501.avif`
  - `/assets/images/69a9a51013e52d8aa1532730_pexels-alohaphotostudio-6961666.avif`
  - `/assets/images/69a9a43eeca7b6045e93b8cd_pexels-freestockpro-1007657.avif`
  - `/assets/images/69a9a3f79f4956225122393e_pexels-shameel-mukkath-3421394-15059057__1_.avif`
  - `/assets/images/69a9a296fd1002040c1e9240_pexels-brett-sayles-2126124.avif`
  - `/assets/images/69a9a01bdb6ad07ce787019a_pexels-slimmars-13-197677686-13801311.avif`

  Delete `"image": { "url": "..." },` from each item.

- [ ] **Step 5: Remove `nav.logoUrl` from en.json**

  In the `"nav"` section, delete the line:
  ```json
  "logoUrl": "/assets/images/signex-logo.svg",
  ```
  After the edit, `nav` should have exactly 3 keys: `skip`, `cta`, `links`.

- [ ] **Step 6: Remove `notFound.imageUrl` from en.json**

  In the `"notFound"` section, delete the line:
  ```json
  "imageUrl": "/assets/images/69ac691927961ac98c560fe2_pexels-stephanlouis-19119918.avif"
  ```
  After the edit, `notFound` should have exactly 6 keys: `eyebrow`, `title`, `titleAccent`, `body`, `cta`, `imageAlt`.

- [ ] **Step 7: Remove `meta.ogImageUrl` from en.json**

  In the `"meta"` section, delete the line:
  ```json
  "ogImageUrl": "/assets/images/signex-og.png",
  ```
  After the edit, `meta` should have exactly 6 keys: `siteName`, `title`, `description`, `ogImageAlt`, `about`, `contact`.

- [ ] **Step 8: Remove top-level `businessContact` from en.json**

  Delete the entire `"businessContact": { ... }` block at the top level (lines 144–163 in the original file). After deletion, `en.json` MUST have exactly 12 top-level keys (matching vi.json): `about`, `aboutPage`, `contact`, `contactPage`, `features`, `footer`, `form`, `hero`, `meta`, `nav`, `notFound`, `products`.

- [ ] **Step 9: Verify parity with node**

  Run:
  ```bash
  node -e "
  const en = require('./apps/web/app/[lang]/dictionaries/en.json');
  const vi = require('./apps/web/app/[lang]/dictionaries/vi.json');
  console.log('en keys:', Object.keys(en).sort());
  console.log('vi keys:', Object.keys(vi).sort());
  console.log('Match:', JSON.stringify(Object.keys(en).sort()) === JSON.stringify(Object.keys(vi).sort()));
  console.log('en.hero keys:', Object.keys(en.hero).sort());
  console.log('en.nav keys:', Object.keys(en.nav).sort());
  console.log('en.notFound keys:', Object.keys(en.notFound).sort());
  console.log('en.meta keys:', Object.keys(en.meta).sort());
  console.log('en.features keys:', Object.keys(en.features).sort());
  console.log('cat[0] keys:', Object.keys(en.products.categories[0]).sort());
  console.log('item[0] keys:', Object.keys(en.products.categories[0].items[0]).sort());
  "
  ```

  Expected output (all must match vi.json structure):
  ```
  en keys: ['about','aboutPage','contact','contactPage','features','footer','form','hero','meta','nav','notFound','products'] (sorted)
  vi keys: (same)
  Match: true
  en.hero keys: ['imageAlt','subtitle','titleBottom','titleTop']
  en.nav keys: ['cta','links','skip']
  en.notFound keys: ['body','cta','eyebrow','imageAlt','title','titleAccent']
  en.meta keys: ['about','contact','description','ogImageAlt','siteName','title']
  en.features keys: ['cards','cta','eyebrow','featured','titleBottom','titleTop','videoText','videoTitle']
  cat[0] keys: ['intro','items','materials','products','slug','tag','title']
  item[0] keys: ['desc','slug','tag','title']
  ```

---

### Task 2: Decouple SiteContent type in content.ts

**Files:**
- Modify: `apps/web/app/lib/content.ts`

**Context:**
`resolveForLang` currently has return type annotation `SiteContent` (line 39), which creates a circular dependency since `SiteContent = typeof enJson`. We need to:
1. Remove the `import type enJson` line
2. Remove `export type SiteContent = typeof enJson`
3. Remove the `: SiteContent` return type annotation from `resolveForLang` (let it infer)
4. Remove the `as unknown as SiteContent` cast from the return statement (line 371)
5. Add `export type SiteContent = ReturnType<typeof resolveForLang>` AFTER the function

This makes `resolveForLang`'s inferred return type the source of truth for `SiteContent`. TypeScript will widen literal types in the inferred return to their base types (string, number, boolean), which is correct behavior for a content type.

- [ ] **Step 1: Edit content.ts — remove en.json import and old SiteContent declaration**

  In `apps/web/app/lib/content.ts`, replace the block at lines 17-20:
  ```typescript
  // SiteContent is the resolved per-locale view — a structural superset of the old Dictionary.
  // Components keep importing `Dictionary` (aliased to SiteContent in dictionaries.ts shim).
  // The shape is derived from en.json to stay in sync with the ~30 ({ dict }) => JSX components.
  import type enJson from "@/app/[lang]/dictionaries/en.json";
  export type SiteContent = typeof enJson;
  ```

  With:
  ```typescript
  // SiteContent is declared AFTER resolveForLang (below) via ReturnType<typeof resolveForLang>.
  // This decouples the web type from en.json — the transform's output IS the type.
  ```

- [ ] **Step 2: Edit content.ts — remove return type annotation from resolveForLang**

  Change line 39 from:
  ```typescript
  function resolveForLang(snap: ReleaseSnapshot, lang: Locale): SiteContent {
  ```
  To:
  ```typescript
  function resolveForLang(snap: ReleaseSnapshot, lang: Locale) {
  ```
  (Remove the `: SiteContent` annotation so TypeScript infers the return type.)

- [ ] **Step 3: Edit content.ts — remove the `as unknown as SiteContent` cast**

  Change the closing of the return statement (line 371):
  ```typescript
  } as unknown as SiteContent;
  ```
  To:
  ```typescript
  };
  ```
  (The plain closing brace of the returned object literal — no cast.)

- [ ] **Step 4: Edit content.ts — add ReturnType SiteContent after resolveForLang**

  After the closing `}` of `resolveForLang` (around line 372, before the published path comment), add:
  ```typescript
  // SiteContent is the resolved per-locale view — inferred from resolveForLang's return type.
  // Components keep importing `Dictionary` (aliased to SiteContent in dictionaries.ts shim).
  // Decoupled from en.json: no cast needed; the transform's output IS the type.
  export type SiteContent = ReturnType<typeof resolveForLang>;
  ```

- [ ] **Step 5: Run TypeScript type check**

  ```bash
  npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | head -60
  ```

  Expected: **0 errors**. If there are errors, they will be about the `SiteContent` type being wrong shape — check what `resolveForLang` returns vs what components access. The most likely issues:
  - `dict.businessContact` — `resolveForLang` returns `businessContact: { ... }` so SiteContent has it ✓
  - `dict.hero.imageUrl` — `resolveForLang` returns `imageUrl: assetUrl(...)` so SiteContent has it ✓
  - `dict.nav.logoUrl` — `resolveForLang` returns `logoUrl: assetUrl(...)` so SiteContent has it ✓
  - All resolved URL fields exist in the return literal, so type inference captures them ✓

---

### Task 3: Run dual verification

**Files:** None (read-only verification)

- [ ] **Step 1: Run web TSC**

  ```bash
  npx tsc --noEmit -p apps/web/tsconfig.json
  ```
  Expected: 0 errors

- [ ] **Step 2: Run web verify-readpath**

  ```bash
  node apps/web/scripts/verify-readpath.mjs
  ```
  Expected: OK / no errors

- [ ] **Step 3: Run web nap test**

  ```bash
  npx tsx apps/web/app/lib/nap.test.mjs
  ```
  Expected: all assertions pass

- [ ] **Step 4: Build shared and db packages (importer deps)**

  ```bash
  npm run build -w @signex/shared -w @signex/db
  ```
  Expected: exits 0

- [ ] **Step 5: Run importer parity spec**

  ```bash
  npm run test -w @signex/api -- parity.spec
  ```
  Expected: all tests GREEN, including:
  - `passes for structurally identical objects`
  - `throws on a missing key` 
  - `en/vi parity holds for the committed dicts` ← this was FAILING before
  - `has the 12 expected top keys` ← this was FAILING before

- [ ] **Step 6: Build api and run importer e2e**

  ```bash
  npm run build -w @signex/api && npm run test:e2e -w @signex/api -- importer.e2e-spec
  ```
  Expected: GREEN. Release v1, 4×6 catalog, byte-equal snapshot.

- [ ] **Step 7: Confirm initial-snapshot.ts unchanged**

  ```bash
  git diff --stat apps/web/app/lib/initial-snapshot.ts
  ```
  Expected: **empty output** (no diff). The reverted en.json must not change the importer's output since it never read those fields.

- [ ] **Step 8: Run web lint**

  ```bash
  npm run lint -w @signex/web
  ```
  Expected: 0 errors

- [ ] **Step 9: Build web**

  ```bash
  npm run build -w @signex/web
  ```
  Expected: succeeds

---

### Task 4: Commit and write report

**Files:**
- Create: `/home/ealflm/dev/signex/.superpowers/sdd/task-63b-report.md`

- [ ] **Step 1: Stage exactly the two changed files**

  ```bash
  git add apps/web/app/lib/content.ts apps/web/app/[lang]/dictionaries/en.json
  ```

- [ ] **Step 2: Verify only those two files are staged**

  ```bash
  git diff --cached --stat
  ```
  Expected: exactly 2 files changed.

- [ ] **Step 3: Create the commit**

  ```bash
  git commit -m "$(cat <<'EOF'
  fix(web): decouple SiteContent from en.json (restore importer dict parity; remove cast)

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

- [ ] **Step 4: Confirm commit**

  ```bash
  git log --oneline -3
  ```
  Expected: the new commit appears at top.

- [ ] **Step 5: Write task-63b-report.md**

  Create `.superpowers/sdd/task-63b-report.md` with the following sections (fill in actual results):

  ```markdown
  # Task 63b Report: Decouple SiteContent from en.json

  ## What was reverted from en.json
  Removed 8 sets of web-only resolved fields that the importer never reads:
  - Top-level `businessContact` key (entire object)
  - `hero.imageUrl` (resolved asset URL)
  - `nav.logoUrl` (resolved asset URL)
  - `notFound.imageUrl` (resolved asset URL)
  - `meta.ogImageUrl` (resolved asset URL)
  - `features.videoMedia` (object with posterUrl/mp4Url/webmUrl)
  - `products.categories[*].image` (4 category image objects)
  - `products.categories[*].items[*].image` (24 item image objects)

  en.json now has exactly 12 top-level keys matching vi.json: about, aboutPage, contact, contactPage, features, footer, form, hero, meta, nav, notFound, products.

  ## New SiteContent mechanism
  - `resolveForLang` return type annotation removed (TypeScript infers)
  - `as unknown as SiteContent` cast removed from return statement
  - `import type enJson` and `export type SiteContent = typeof enJson` replaced with:
    `export type SiteContent = ReturnType<typeof resolveForLang>`
  - SiteContent is now derived from the transform's inferred output — fully type-checked, no cast

  ## Cast removed?
  Yes — `as unknown as SiteContent` is gone from content.ts.

  ## Web dual verification
  - tsc --noEmit: 0 errors
  - verify-readpath.mjs: OK
  - nap.test.mjs: PASS
  - npm run build -w @signex/web: SUCCESS
  - npm run lint -w @signex/web: 0 errors

  ## Importer dual verification
  - parity.spec GREEN: en/vi parity holds; has the 12 expected top keys
  - importer e2e GREEN: Release v1, 4×6 catalog, byte-equal snapshot
  - git diff --stat apps/web/app/lib/initial-snapshot.ts: EMPTY (unchanged)

  ## Commit
  [sha] fix(web): decouple SiteContent from en.json (restore importer dict parity; remove cast)
  ```
