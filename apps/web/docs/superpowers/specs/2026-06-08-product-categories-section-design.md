# Product Categories Section — Design Spec

**Date:** 2026-06-08
**Status:** Approved (pending spec review)
**Scope:** One home-page section. Repurposes the existing "Choose Your Lagoon Sanctuary" resorts grid in place.

## Goal

Replace the placeholder Caladan resort grid (`resorts-collection.tsx` /
`.section_hero-resorts`, the "Overwater Collection / Choose Your Lagoon Sanctuary"
2×2 card grid) with a signex **product-categories** section: a 2×2 grid of four
category cards. Each card is a link to a category detail page (built later) that will
list that category's products.

This supersedes the earlier per-category product-carousel idea (the "What We Manufacture"
slider mock). There is **no carousel and no "View All"** — the section is purely the
category grid, reusing Image 3's card layout verbatim.

## Decisions (locked)

- **Layout** = the existing `.section_hero-resorts` 2×2 card grid (Image 3), unchanged
  visually.
- **Card anatomy** = overlay tag chip + image + title + a **3-stat tile row** (adapted
  from the resort `ft2 · Beds · Guests` row).
- **Placement** = repurpose the existing section **in place** (same slot, same classes,
  same IX2 bindings).
- **Links** = each card → `/products/<category-slug>` now (bare path; the detail pages
  are a later step — links are live but the target pages don't exist yet).
- **3-stat trio** = **Products · Materials · Lead-time**.
- **Header** = eyebrow "Our Products" + H1 "What We Manufacture" (headline only, no intro
  paragraph — faithful to Image 3; easy to add the Image 2 intro line later).
- **i18n** = dict-driven Server Component (EN + VI), mirroring `Features`.
- **No CTA to remove** — the source resort grid is headline + grid only (the home CTA
  lives in `Features`); confirm none is added.
- **Image alt** = keep `alt=""` (decorative; placeholder resort photos). The card link's
  accessible name comes from its inner text (tag + title + stats), matching the resort
  original — acceptable. Add descriptive alt (or a `categories[].imageAlt` dict key) when
  real category art replaces the placeholders.

## Component

Rename `app/components/home/resorts-collection.tsx` →
`app/components/home/product-categories.tsx`, exporting
`ProductCategories({ dict }: { dict: Dictionary["products"] })` (same shape as
`Features({ dict }: { dict: Dictionary["features"] })`). Update the import + usage in
`app/[lang]/page.tsx` (`<ResortsCollection />` → `<ProductCategories dict={dict.products} />`,
in the same position between `<Features>` and `<Services>`).

**Edit ordering (avoids a `tsc` failure):** `Dictionary` is inferred from `en.json` only
(`dictionaries.ts`: `Dictionary = Awaited<ReturnType<dictionaries["en"]>>`), so
`Dictionary["products"]` does not exist as a type until the `products` key is present in
`en.json`. Add the `en.json` `products` key **before (or in the same change as)** the
component, or `tsc` fails with "Property 'products' does not exist". `vi.json` already
exists and must also gain a `products` block (VI copy may start as English drafts); only
`en.json` drives the type, but a missing VI key renders `undefined` on `/vi`.

**Preserved verbatim from the current component (do NOT change):**

- The `<section className="section_hero-resorts" data-w-id="ad1a3029-…eb18">` wrapper and
  the `padding-global` / `container-large w-container` nesting.
- The reveal wrappers' re-pointed home-page `data-w-id`s: headline `0f29df12-…d663`,
  grid `b3ac1ddc-…ce8d` (both start at `style={{ opacity: 0, filter: 'blur(5px)' }}`).
- Per-card hover-zoom + scroll-parallax `data-w-id`s: card `<a>` `6d379b8b-…676f`,
  image wrap `6d379b8b-…6770`. These run relative (`useEventTarget:"CHILDREN"`) actionLists
  so all four cards reuse the same ids safely.
- The card/grid classes: `.resorts.w-dyn-list` → `.grid_resorts.w-dyn-items` →
  `.w-dyn-item` → `.card_resort-v1` → `.image_resort-v1` (`.overlay_resort-card-v1` +
  `.image_cover.is-parallax`) → `.wrap_content-resort-v1` (`.text-size-large.text_body-bold`
  + `.card-resort_info-tile-v1` → three `.tile_room-summary`).

The existing scoped padding override in `app/globals.css`
(`.home-a_rest-content .section_hero-resorts { padding-top: var(--section-padding--small) }`)
keys off the unchanged class, so it continues to apply with no edit.

## Section structure

```
section.section_hero-resorts
  .padding-global
    .container-large.w-container
      .headline_resorts            (data-w-id 0f29df12-…d663, reveal)
        .master_label > .label-small         → {dict.eyebrow}      ("Our Products")
        h1                                    → {dict.title}   (single solid line, NO <br/>, no tone-medium)
      .resorts.w-dyn-list          (data-w-id b3ac1ddc-…ce8d, reveal)
        .grid_resorts.w-dyn-items
          .w-dyn-item × 4
            a.card_resort-v1[href="/products/<slug>"]   (hover-zoom id 6d379b8b-…676f)
              .image_resort-v1                           (parallax id 6d379b8b-…6770)
                .overlay_resort-card-v1 > .master_label[lighter] > .label-small  → {category.tag}
                img.image_cover.is-parallax[src=<placeholder .avif>]
              .wrap_content-resort-v1
                .text-size-large.text_body-bold          → {category.title}
                .card-resort_info-tile-v1
                  .tile_room-summary  (icon package) → {category.products}  / {dict.statLabels.products}
                  .tile_room-summary  (icon layers)  → {category.materials} / {dict.statLabels.materials}
                  .tile_room-summary  (icon clock)   → {category.leadDays}  / {dict.statLabels.lead}
```

H1: render `<h1>{dict.title}</h1>` — a single solid line, **no `<br/>`** (unlike Features'
h2, which has one) and **no `tone-medium` accent** by default. To add an accent word later,
split the string and wrap that word in `<span className="tone-medium">…</span>` (as the
resort h1 did with "Lagoon"); not done now.

Stat field naming (one field, several names — to avoid confusion): numeric field on each
category = `leadDays`; its label key = `statLabels.lead` (value "Days"); the conceptual
name in prose is "Lead-time". Products/Materials follow the same shape (`products` +
`statLabels.products`, `materials` + `statLabels.materials`). All numeric fields are **flat
on the category object** (no `stats` wrapper).

## Icon swap (3-stat row)

Follow the established icon-swap pattern (glyph is content, markup is design): keep each
`.icon_summary.w-embed` wrapper and the exact svg attributes
(`fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"
strokeLinecap="round" strokeLinejoin="round" width/height="24"`), swap only the `<path>`
glyphs to canonical lucide line icons:

| Resort stat (current) | → Category stat | lucide icon |
|---|---|---|
| `scaling` — ft2        | Products   | `package` |
| `bed` — Beds           | Materials  | `layers`  |
| `users` — Guests       | Lead-time  | `clock`   |

## Content (🟡 = draft placeholder, confirm/replace before launch)

Header:
- eyebrow: **Our Products**
- title: **What We Manufacture**

Four categories (1→4 reading order = grid order):

| # | tag 🟡 | title | slug | Products 🟡 | Materials 🟡 | Lead (days) 🟡 |
|---|---|---|---|---|---|---|
| 1 | PVC · Silicone | Plastic logos & emblems     | `plastic-logos-emblems`     | 18 | 4 | 7  |
| 2 | Woven · Printed| Labels, badges, nameplates  | `labels-badges-nameplates`  | 24 | 6 | 5  |
| 3 | Bespoke        | Custom identity components  | `custom-identity-components` | 15 | 5 | 10 |
| 4 | OEM Spec       | OEM brand parts             | `oem-brand-parts`           | 12 | 3 | 14 |

Images: reuse the four resort `.avif` placeholders already wired in the component
(`69b049a1…`, `69b037b7…`, `69b03783…`, `69aff4da…`), swap to real category art later
(text/links-only change now, matching the established placeholder-media pattern).

## Dictionary shape

Add a `products` key to `app/[lang]/dictionaries/{en,vi}.json` (after `features`). Stat
labels live in the dict (translatable); slugs and stat **numbers** are structural and may
stay in the dict too for easy editing.

```jsonc
"products": {
  "eyebrow": "Our Products",
  "title": "What We Manufacture",
  "statLabels": { "products": "Products", "materials": "Materials", "lead": "Days" },
  "categories": [
    { "tag": "PVC · Silicone", "title": "Plastic logos & emblems",
      "slug": "plastic-logos-emblems", "products": 18, "materials": 4, "leadDays": 7 },
    { "tag": "Woven · Printed", "title": "Labels, badges, nameplates",
      "slug": "labels-badges-nameplates", "products": 24, "materials": 6, "leadDays": 5 },
    { "tag": "Bespoke", "title": "Custom identity components",
      "slug": "custom-identity-components", "products": 15, "materials": 5, "leadDays": 10 },
    { "tag": "OEM Spec", "title": "OEM brand parts",
      "slug": "oem-brand-parts", "products": 12, "materials": 3, "leadDays": 14 }
  ]
}
```

VI: translate `eyebrow`, `title`, `statLabels`, and category `tag`/`title`; keep `slug`
+ numbers identical across locales. The component maps over `dict.categories` to render
the four cards (image src kept in the component as a fixed array, since images are not
translated). Drafting + VI translation of this copy can be done with a background workflow
(judge + translate), as was done for the `features` copy.

## Routing / links

- `href="/products/<slug>"` — bare path, no `/en`|`/vi` prefix (exactly like the current
  resort card links `href="/resorts/..."`). The `proxy.ts` matcher (which excludes
  `/assets/` + dotted files) **matches** these slugs and 302-redirects them to
  `/<locale>/products/<slug>` — the intended locale behavior.
- Detail pages are **out of scope**: the eventual route lives at
  `app/[lang]/products/[slug]`; until it's built, clicking a card 302s to
  `/<locale>/products/<slug>` then 404s. Acceptable and intended (stub-now, build-later).
  Verification (step 3) asserts the raw `href` value (`/products/<slug>`), not the
  post-redirect URL.

## Out of scope

- The category detail pages and the product-list layout (separate later spec).
- Real product imagery, real stat numbers, final tag copy (placeholders now).
- Any edit to the vendored Webflow CSS (`caladan-template.shared.*.css`) — forbidden by
  project rule; reuse existing classes. New rules, if any are needed, go scoped into
  `app/globals.css` only. Expectation: **no new CSS needed** (the card layout, chip, and
  3-stat tiles all reuse existing Caladan classes).

## Verification plan

Mirror the method used for prior sections (headless `google-chrome-stable` +
`puppeteer-core`, reinstalling the `/tmp/pwtest` sandbox since the previous one was cleared):

1. `npx tsc --noEmit` clean.
2. Both `/en` and `/vi` server-render: eyebrow + headline translated; all 4 category
   titles, tags, and the 3 stats per card present; 0 resort/"Lagoon"/"Bungalow" leftovers.
3. Each card `<a href>` = the correct `/products/<slug>`.
4. Reveal fires: `scrollIntoView()` the section, then assert the headline + grid wrappers
   reach `opacity > 0.9` and `blur(0)` (below-fold IX2 scroll reveal).
5. Hover-zoom + scroll-parallax still bound (child `.image_cover` scales on hover; no
   regression to the resort-slider section that shares the ids).
6. Stat icons render at 24×24 with `stroke="currentColor"`.
7. No horizontal overflow; 0 console errors.

## Open items (confirm at review or before launch)

- 🟡 Stat trio values (Products/Materials/Lead-time numbers) per category — drafts above.
- 🟡 Tag-chip copy per category — drafts above.
- Optional: add the Image 2 intro paragraph under the headline (currently omitted).
