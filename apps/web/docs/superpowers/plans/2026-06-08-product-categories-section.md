# Product Categories Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder Caladan resort grid (`resorts-collection.tsx` / `.section_hero-resorts`) with a signex product-categories grid: a 2×2 grid of four category cards, each linking to `/products/<slug>`.

**Architecture:** Repurpose Caladan's `.section_hero-resorts` 2×2 card grid **in place** — same section slot, classes, and IX2 reveal/hover/parallax `data-w-id` bindings kept verbatim. The component becomes a dict-driven Server Component (`ProductCategories({ dict })`, EN + VI) like `Features`, mapping over four category objects. Card images reuse the existing resort `.avif` placeholders (swap later). Detail pages at `/products/<slug>` are out of scope (links stubbed).

**Tech Stack:** Next.js 16.2.7 (App Router, `[lang]` i18n), React 19, TypeScript 5, Tailwind v4, vendored Webflow CSS/JS runtime. No unit-test framework in this repo — verification is `tsc --noEmit` + a headless-Chrome (puppeteer-core) render check + content greps, the method used for every prior section.

**Spec:** `docs/superpowers/specs/2026-06-08-product-categories-section-design.md`

**Note on commits:** repo is currently on `main`. Task 0 creates a feature branch first; each task ends with a commit on that branch.

---

### Task 0: Create a feature branch

**Files:** none (git only)

- [ ] **Step 1: Branch off main**

Run:
```bash
cd /home/ealflm/dev/signex/signex-web
git checkout -b feat/product-categories-section
```
Expected: `Switched to a new branch 'feat/product-categories-section'`

- [ ] **Step 2: Confirm clean starting tree**

Run: `git status --short`
Expected: only the new spec/plan docs under `docs/superpowers/` (untracked) — no unexpected modified source files.

---

### Task 1: Add the `products` dictionary key (EN + VI)

The `Dictionary` type is inferred from `en.json` only, so this MUST land before the component typechecks. Add `products` as the last top-level key in both files.

**Files:**
- Modify: `app/[lang]/dictionaries/en.json` (append `products` key)
- Modify: `app/[lang]/dictionaries/vi.json` (append `products` key)

- [ ] **Step 1: Add the `products` block to `en.json`**

The file currently ends with the `features.cards` array, then the `features` close, then the root close:
```json
    ]
  }
}
```
Replace that exact tail with (note the comma after the `features` close):
```json
    ]
  },
  "products": {
    "eyebrow": "Our Products",
    "title": "What We Manufacture",
    "statLabels": { "products": "Products", "materials": "Materials", "lead": "Days" },
    "categories": [
      { "tag": "PVC · Silicone", "title": "Plastic logos & emblems", "slug": "plastic-logos-emblems", "products": 18, "materials": 4, "leadDays": 7 },
      { "tag": "Woven · Printed", "title": "Labels, badges, nameplates", "slug": "labels-badges-nameplates", "products": 24, "materials": 6, "leadDays": 5 },
      { "tag": "Bespoke", "title": "Custom identity components", "slug": "custom-identity-components", "products": 15, "materials": 5, "leadDays": 10 },
      { "tag": "OEM Spec", "title": "OEM brand parts", "slug": "oem-brand-parts", "products": 12, "materials": 3, "leadDays": 14 }
    ]
  }
}
```

- [ ] **Step 2: Add the `products` block to `vi.json`**

`vi.json` ends with the identical tail (`]` → `}` → `}`). Replace that tail with (VI copy; `slug` + numbers stay identical to EN — draft VI, refine later):
```json
    ]
  },
  "products": {
    "eyebrow": "Sản Phẩm Của Chúng Tôi",
    "title": "Những Gì Chúng Tôi Sản Xuất",
    "statLabels": { "products": "Sản phẩm", "materials": "Vật liệu", "lead": "Ngày" },
    "categories": [
      { "tag": "PVC · Silicone", "title": "Logo & biểu tượng nhựa", "slug": "plastic-logos-emblems", "products": 18, "materials": 4, "leadDays": 7 },
      { "tag": "Dệt · In", "title": "Nhãn, phù hiệu & bảng tên", "slug": "labels-badges-nameplates", "products": 24, "materials": 6, "leadDays": 5 },
      { "tag": "Đặt riêng", "title": "Linh kiện nhận diện tùy chỉnh", "slug": "custom-identity-components", "products": 15, "materials": 5, "leadDays": 10 },
      { "tag": "Chuẩn OEM", "title": "Linh kiện thương hiệu OEM", "slug": "oem-brand-parts", "products": 12, "materials": 3, "leadDays": 14 }
    ]
  }
}
```

- [ ] **Step 3: Validate both JSON files parse**

Run:
```bash
node -e "JSON.parse(require('fs').readFileSync('app/[lang]/dictionaries/en.json','utf8')); JSON.parse(require('fs').readFileSync('app/[lang]/dictionaries/vi.json','utf8')); console.log('JSON OK')"
```
Expected: `JSON OK` (no SyntaxError).

- [ ] **Step 4: Confirm both files have matching `products` shape**

Run:
```bash
node -e "const en=require('./app/[lang]/dictionaries/en.json'),vi=require('./app/[lang]/dictionaries/vi.json'); const ek=Object.keys(en.products).sort().join(','), vk=Object.keys(vi.products).sort().join(','); console.log('en:',ek); console.log('vi:',vk); console.log('match:', ek===vk && en.products.categories.length===4 && vi.products.categories.length===4)"
```
Expected: same keys for en/vi and `match: true`.

- [ ] **Step 5: Typecheck (the type now includes `products`)**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "app/[lang]/dictionaries/en.json" "app/[lang]/dictionaries/vi.json"
git commit -m "feat(home): add products dictionary key (en + vi)"
```

---

### Task 2: Create the `ProductCategories` component

Mirrors `Features` (dict-driven Server Component). Maps over `dict.categories` (one card markup, not 4× repeated). All `data-w-id`s, classes, and the `.icon_summary w-embed` svg wrappers are preserved verbatim; only the three stat glyphs are swapped to lucide `package` / `layers` / `clock`.

**Files:**
- Create: `app/components/home/product-categories.tsx`

- [ ] **Step 1: Write the component**

Create `app/components/home/product-categories.tsx` with exactly:
```tsx
import type { Dictionary } from "@/app/[lang]/dictionaries";

// Card image placeholders — reuse the four resort .avif assets already wired in the old
// resorts-collection. Index-aligned with dict.categories (1→4 = grid order). Images are not
// translated, so they live here, not in the dictionary. Swap to real category art later.
const CATEGORY_IMAGES = [
  "/assets/images/69b049a16076b1b2188d012d_rumman-amin-s3o2rkTkF7I-unsplash.avif",
  "/assets/images/69b037b7b9f0bc0f27d8889d_dinuka-lankaloka-HKr5cn6S0q0-unsplash.avif",
  "/assets/images/69b03783cb355b95794c522e_pexels-roman-odintsov-5667901.avif",
  "/assets/images/69aff4da51c27aa9c99aba98_pexels-keeganjchecks-14524361.avif",
];

/**
 * ProductCategories — the home-page product-category grid. Repurposes Caladan's
 * "section_hero-resorts" 2×2 card grid (formerly the resort "Choose Your Lagoon Sanctuary"
 * collection) IN PLACE: the section slot, classes, and IX2 reveal/hover/parallax data-w-id
 * bindings are kept verbatim so the Webflow animations still fire on the home page. Only the
 * content is signex's — four product categories, each card linking to /products/<slug>
 * (detail pages are a later step). Dict-driven Server Component (EN + VI), like Features.
 *
 * data-w-id REUSE (do NOT change — these were re-pointed to home-page triggers; see git
 * history of resorts-collection.tsx for the cross-page IX2 gating fix):
 *   • section          ad1a3029-…eb18
 *   • headline wrapper  0f29df12-…d663  (home reveal a-124: opacity + unblur)
 *   • grid wrapper      b3ac1ddc-…ce8d  (home reveal a-124)
 *   • each card <a>     6d379b8b-…676f  (card hover-zoom a-112/a-113, relative CHILDREN selector)
 *   • each image wrap   6d379b8b-…6770  (image parallax a-114, relative CHILDREN selector)
 * The 6d379b8b ids are shared across all four cards on purpose: their actionLists use
 * useEventTarget:"CHILDREN", so each card animates only its own .image_cover.
 */
export function ProductCategories({ dict }: { dict: Dictionary["products"] }) {
  const t = dict;

  return (
    <section className="section_hero-resorts" data-w-id="ad1a3029-1630-4dbd-9a8f-fd5ea3c4eb18">
      <div className="padding-global">
        <div className="w-layout-blockcontainer container-large w-container">
          <div className="headline_resorts" data-w-id="0f29df12-8c38-da6f-794d-3989ac10d663" style={{ opacity: 0, filter: 'blur(5px)' }}>
            <div className="master_label" data-wf--tag--variant="base">
              <div className="label-small">
                {t.eyebrow}
              </div>
            </div>
            <h1>
              {t.title}
            </h1>
          </div>
          <div className="resorts w-dyn-list" data-w-id="b3ac1ddc-636d-f345-c58d-b372a067ce8d" style={{ opacity: 0, filter: 'blur(5px)' }}>
            <div className="grid_resorts w-dyn-items" role="list">
              {t.categories.map((cat, i) => (
                <div className="w-dyn-item" role="listitem" key={cat.slug}>
                  <a className="card_resort-v1 w-inline-block" data-w-id="6d379b8b-4b7f-2d17-709e-271c021c676f" href={`/products/${cat.slug}`}>
                    <div className="image_resort-v1" data-w-id="6d379b8b-4b7f-2d17-709e-271c021c6770">
                      <div className="overlay_resort-card-v1">
                        <div className="master_label w-variant-84e91bde-75c3-dd4c-a083-7846b4ae6170" data-wf--tag--variant="lighter">
                          <div className="label-small">
                            {cat.tag}
                          </div>
                        </div>
                      </div>
                      <img alt="" className="image_cover is-parallax" loading="lazy" src={CATEGORY_IMAGES[i]} />
                    </div>
                    <div className="wrap_content-resort-v1">
                      <div className="text-size-large text_body-bold">
                        {cat.title}
                      </div>
                      <div className="card-resort_info-tile-v1">
                        <div className="tile_room-summary">
                          <div className="icon_summary w-embed">
                            <svg className="lucide lucide-package-icon lucide-package" fill="none" height="24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg">
                              <path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z" />
                              <path d="M12 22V12" />
                              <polyline points="3.29 7 12 12 20.71 7" />
                              <path d="m7.5 4.27 9 5.15" />
                            </svg>
                          </div>
                          <div className="wrap_text-room-summary">
                            <div>
                              {cat.products}
                            </div>
                            <div>
                              {t.statLabels.products}
                            </div>
                          </div>
                        </div>
                        <div className="tile_room-summary">
                          <div className="icon_summary w-embed">
                            <svg className="lucide lucide-layers-icon lucide-layers" fill="none" height="24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg">
                              <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z" />
                              <path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12" />
                              <path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17" />
                            </svg>
                          </div>
                          <div className="wrap_text-room-summary">
                            <div>
                              {cat.materials}
                            </div>
                            <div>
                              {t.statLabels.materials}
                            </div>
                          </div>
                        </div>
                        <div className="tile_room-summary">
                          <div className="icon_summary w-embed">
                            <svg className="lucide lucide-clock-icon lucide-clock" fill="none" height="24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg">
                              <circle cx="12" cy="12" r="10" />
                              <path d="M12 6v6l4 2" />
                            </svg>
                          </div>
                          <div className="wrap_text-room-summary">
                            <div>
                              {cat.leadDays}
                            </div>
                            <div>
                              {t.statLabels.lead}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (The component compiles even before it's wired — `Dictionary["products"]` exists from Task 1. It's just not rendered yet.)

- [ ] **Step 3: Commit**

```bash
git add app/components/home/product-categories.tsx
git commit -m "feat(home): add ProductCategories component"
```

---

### Task 3: Wire it into the page and remove the old component

**Files:**
- Modify: `app/[lang]/page.tsx:6` (import), `app/[lang]/page.tsx:23` (usage)
- Delete: `app/components/home/resorts-collection.tsx`

- [ ] **Step 1: Swap the import in `page.tsx`**

Replace line 6:
```tsx
import { ResortsCollection } from "@/app/components/home/resorts-collection";
```
with:
```tsx
import { ProductCategories } from "@/app/components/home/product-categories";
```

- [ ] **Step 2: Swap the usage in `page.tsx`**

Replace the `<ResortsCollection />` line (between `<Features … />` and `<Services />`):
```tsx
        <ResortsCollection />
```
with:
```tsx
        <ProductCategories dict={dict.products} />
```

- [ ] **Step 3: Delete the old component**

Run:
```bash
git rm app/components/home/resorts-collection.tsx
```

- [ ] **Step 4: Confirm no dangling references**

Run: `grep -rn "ResortsCollection\|resorts-collection" app/`
Expected: no output (zero matches).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "app/[lang]/page.tsx"
git commit -m "feat(home): render ProductCategories in place of resort grid"
```

---

### Task 4: Headless render verification (both locales)

No unit-test framework exists; this is the integration check used for every prior section — drive `google-chrome-stable` with `puppeteer-core`, assert the rendered DOM. The `/tmp/pwtest` sandbox was cleared in a prior session, so reinstall it.

**Files:**
- Create: `/tmp/pwtest/check-categories.mjs` (throwaway, outside the repo)

- [ ] **Step 1: Ensure the dev server is running on :3000**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/en --max-time 5`
Expected: `200`. If not, start it: `npm run dev` (in a background shell) and wait for it to compile.

- [ ] **Step 2: Reinstall the puppeteer-core sandbox**

Run:
```bash
mkdir -p /tmp/pwtest && cd /tmp/pwtest && npm init -y >/dev/null 2>&1 && npm i puppeteer-core@23 >/dev/null 2>&1 && echo "puppeteer-core installed"
```
Expected: `puppeteer-core installed`.

- [ ] **Step 3: Write the verification script**

Create `/tmp/pwtest/check-categories.mjs` with exactly:
```js
import puppeteer from 'puppeteer-core';

const EXPECT = {
  en: {
    eyebrow: 'Our Products',
    title: 'What We Manufacture',
    titles: ['Plastic logos & emblems', 'Labels, badges, nameplates', 'Custom identity components', 'OEM brand parts'],
    labels: ['Products', 'Materials', 'Days'],
  },
  vi: {
    eyebrow: 'Sản Phẩm Của Chúng Tôi',
    title: 'Những Gì Chúng Tôi Sản Xuất',
    titles: ['Logo & biểu tượng nhựa', 'Nhãn, phù hiệu & bảng tên', 'Linh kiện nhận diện tùy chỉnh', 'Linh kiện thương hiệu OEM'],
    labels: ['Sản phẩm', 'Vật liệu', 'Ngày'],
  },
};
const SLUGS = ['plastic-logos-emblems', 'labels-badges-nameplates', 'custom-identity-components', 'oem-brand-parts'];
const FORBIDDEN = ['Lagoon', 'Bungalow', 'Overwater', 'Sanctuary', 'Resort', 'Guests', 'Beds'];

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: 'new', args: ['--no-sandbox'] });
let failures = 0;
const fail = (m) => { console.log('  ✗ ' + m); failures++; };
const ok = (m) => console.log('  ✓ ' + m);

for (const loc of ['en', 'vi']) {
  console.log(`\n=== /${loc} ===`);
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  await page.goto(`http://localhost:3000/${loc}`, { waitUntil: 'networkidle0', timeout: 45000 });
  // hero reveal fires on load
  await page.waitForFunction(() => { const h = document.querySelector('.headline_home-a'); return h && getComputedStyle(h).opacity > 0.9; }, { timeout: 15000 }).catch(() => {});
  // bring the section into view to trigger its scroll reveal
  await page.evaluate(() => document.querySelector('.section_hero-resorts')?.scrollIntoView());
  await page.waitForFunction(() => { const h = document.querySelector('.headline_resorts'); return h && getComputedStyle(h).opacity > 0.9; }, { timeout: 15000 }).catch(() => {});

  const data = await page.evaluate(() => {
    const sec = document.querySelector('.section_hero-resorts');
    const headline = sec?.querySelector('.headline_resorts');
    const cs = headline ? getComputedStyle(headline) : null;
    const cards = [...(sec?.querySelectorAll('.card_resort-v1') || [])].map((a) => ({
      href: a.getAttribute('href'),
      title: a.querySelector('.text-size-large')?.textContent?.trim(),
      tag: a.querySelector('.overlay_resort-card-v1 .label-small')?.textContent?.trim(),
      stats: [...a.querySelectorAll('.tile_room-summary')].map((t) => t.textContent.replace(/\s+/g, ' ').trim()),
      icons: [...a.querySelectorAll('.icon_summary svg')].map((s) => s.getAttribute('class')),
      iconBox: [...a.querySelectorAll('.icon_summary svg')].map((s) => `${s.getAttribute('width')}x${s.getAttribute('height')}`),
    }));
    return {
      eyebrow: sec?.querySelector('.headline_resorts .label-small')?.textContent?.trim(),
      title: headline?.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim(),
      revealOpacity: cs?.opacity, revealBlur: cs?.filter,
      cards,
      secText: sec?.textContent || '',
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });

  const E = EXPECT[loc];
  data.eyebrow === E.eyebrow ? ok(`eyebrow "${data.eyebrow}"`) : fail(`eyebrow: got "${data.eyebrow}" want "${E.eyebrow}"`);
  data.title === E.title ? ok(`title "${data.title}"`) : fail(`title: got "${data.title}" want "${E.title}"`);
  data.cards.length === 4 ? ok('4 category cards') : fail(`card count: ${data.cards.length}`);
  E.titles.forEach((tt, i) => data.cards[i]?.title === tt ? ok(`card ${i + 1} title "${tt}"`) : fail(`card ${i + 1} title: got "${data.cards[i]?.title}" want "${tt}"`));
  SLUGS.forEach((s, i) => data.cards[i]?.href === `/products/${s}` ? ok(`card ${i + 1} href /products/${s}`) : fail(`card ${i + 1} href: got "${data.cards[i]?.href}"`));
  data.cards.forEach((c, i) => {
    E.labels.every((lbl) => c.stats.some((s) => s.includes(lbl))) ? ok(`card ${i + 1} has all 3 stat labels`) : fail(`card ${i + 1} stats: ${JSON.stringify(c.stats)}`);
  });
  // icons swapped to package/layers/clock, rendered 24x24
  const wantIcons = ['package', 'layers', 'clock'];
  data.cards.forEach((c, i) => {
    wantIcons.every((w, j) => (c.icons[j] || '').includes(w)) ? ok(`card ${i + 1} icons package/layers/clock`) : fail(`card ${i + 1} icons: ${JSON.stringify(c.icons)}`);
    c.iconBox.every((b) => b === '24x24') ? ok(`card ${i + 1} icons 24x24`) : fail(`card ${i + 1} icon sizes: ${JSON.stringify(c.iconBox)}`);
  });
  (Number(data.revealOpacity) > 0.9 && (data.revealBlur === 'none' || data.revealBlur === 'blur(0px)')) ? ok(`reveal fired (opacity ${data.revealOpacity}, ${data.revealBlur})`) : fail(`reveal not fired: opacity ${data.revealOpacity}, filter ${data.revealBlur}`);
  const leaked = FORBIDDEN.filter((w) => data.secText.includes(w));
  leaked.length === 0 ? ok('no resort leftovers') : fail(`resort leftovers: ${leaked.join(', ')}`);
  data.overflow <= 0 ? ok('no horizontal overflow') : fail(`x-overflow: +${data.overflow}px`);
  consoleErrors.length === 0 ? ok('0 console errors') : fail(`console errors: ${consoleErrors.slice(0, 3).join(' | ')}`);
  await page.close();
}

await browser.close();
console.log(`\n${failures === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 4: Run the verification**

Run: `node /tmp/pwtest/check-categories.mjs`
Expected: every line `✓`, final line `✅ ALL CHECKS PASSED`, exit 0. If any `✗`, fix the component/dict and re-run before continuing.

- [ ] **Step 5: Capture a screenshot for visual confirmation of hover-zoom/parallax design (optional but recommended)**

Add to a scratch run or extend the script to `await page.screenshot({ path: '/tmp/pwtest/categories.png', fullPage: true })` after scrolling the section into view, then open `/tmp/pwtest/categories.png` to eyeball the 2×2 grid, tag chips, titles, and stat rows. (Hover-zoom + scroll-parallax are IX2-bound to the preserved `data-w-id`s; the render check confirms the bindings' DOM is present. A functional hover test is flaky headless — verify visually here.)

---

### Task 5: Update project memory + finish

**Files:** memory only (no repo files)

- [ ] **Step 1: Update the clone-project memory**

Append a "Done (2026-06-08)" line to `/home/ealflm/.claude/projects/-home-ealflm-dev-signex/memory/signex-web-clone-project.md` noting: the resort `.section_hero-resorts` grid was repurposed in place into `product-categories.tsx` (`ProductCategories`, dict-driven, EN+VI) — a 2×2 grid of 4 product categories (Plastic logos & emblems / Labels, badges, nameplates / Custom identity components / OEM brand parts), each card linking to `/products/<slug>` (detail pages TBD); resort stat row → Products·Materials·Lead-time with lucide package/layers/clock icons; images still resort .avif placeholders; stat numbers + tag chips are drafts. `resorts-collection.tsx` deleted.

- [ ] **Step 2: Final full typecheck + verification gate**

Run: `npx tsc --noEmit && node /tmp/pwtest/check-categories.mjs`
Expected: tsc clean + `✅ ALL CHECKS PASSED`.

- [ ] **Step 3: Use the finishing-a-development-branch skill**

Invoke `superpowers:finishing-a-development-branch` to decide merge/PR/cleanup for `feat/product-categories-section`.

---

## Notes / known follow-ups (out of scope here)

- Category **detail pages** at `app/[lang]/products/[slug]` (product list) — separate spec/plan. Until built, card links 302 to `/<locale>/products/<slug>` then 404 (expected).
- 🟡 Replace draft stat values, tag chips, and VI copy with real content (a copy-draft + VI-translate workflow like the `features-copy-vi` run can refine these).
- Swap the resort `.avif` placeholders for real category imagery (add `categories[].imageAlt` + descriptive `alt` at that point).
- Optional: add the Image 2 intro paragraph under the headline if desired.
