# Item 1 — stamp MORE text inline-editable: report

## Stamped leaves (22 new editText stamps across 5 files)

### `components/home/features.tsx`
- `features.featured.title` (maxLength:80) — in `.text_body-bold` div inside `.features_text-tile`
- `features.featured.desc` (maxLength:200) — in `p.text-size-small` inside `.features_text-tile`
- `features.cards.0.title` (maxLength:80) — in `.text-size-large.text_body-bold` div
- `features.cards.0.desc` (maxLength:200) — in `p.tone-medium.margin-0`
- `features.cards.1.title` (maxLength:80)
- `features.cards.1.desc` (maxLength:200)
- `features.cards.2.title` (maxLength:80)
- `features.cards.2.desc` (maxLength:200)
- `features.video.title` (maxLength:80) — in `.text_body-bold` div inside `.content_image-features`
- `features.video.text` (maxLength:200) — in `p.text-size-small` inside `.content_image-features`

### `components/home/home-about.tsx`
- `about.mission.title` (maxLength:80) — in `h3.about-mvv_title`
- `about.vision.title` (maxLength:80) — in `h3.about-mvv_card-title`
- `about.vision.body` (maxLength:200) — in `p.tone-medium.about-mvv_body`
- `about.values.title` (maxLength:80) — in `h3.about-mvv_card-title`
- `about.values.body` (maxLength:200) — in `p.tone-medium.about-mvv_body`

### `components/home/product-categories.tsx`
- `productsHeader.statLabels.products` (maxLength:80) — inner `<div>` inside `.wrap_text-room-summary` (repeated per category card; same global field)
- `productsHeader.statLabels.materials` (maxLength:80) — same pattern

### `components/footer.tsx`
- `footer.shipLabel` (maxLength:80) — inner span inside `<span.text-size-small.tone-medium>`
- `footer.payLabel` (maxLength:80) — same pattern

### `components/home/hero-quote-form.tsx` + `hero.tsx`
Added `editable?: boolean` prop to `HeroQuoteForm`; `hero.tsx` now passes `editable={editable}`.
- `formConfig.fields.name.label` (maxLength:80)
- `formConfig.fields.email.label`
- `formConfig.fields.phone.label`
- `formConfig.fields.quantity.label`
- `formConfig.fields.standard.label`
- `formConfig.fields.height.label`
- `formConfig.fields.width.label`
- `formConfig.fields.thickness.label`
- `formConfig.fields.upload.label` (on the `<div>` acting as label for the file dropzone)
- `formConfig.fields.message.label`
- `formConfig.submit` (maxLength:80) — stamped in the visible `.text-button` div; `input[value]` attribute is NOT stampable

### `components/about/about-sections.tsx`
No new stamps needed. All single-value eyebrow/title.lead/title.accent/body leaves were already stamped in a prior session (intro, capability, process, timeline sections complete).

## Excluded (panel-only) — reasons

| Leaf | Reason |
|---|---|
| `about.mission.items[i]` | `{ en: string[], vi: string[] }` snapshot shape — array indexed under locale key, not `{ en, vi }[]`; standard setPath locale-append would walk wrong path |
| `about.mission.body` | Not listed in the DO stamp list |
| `productsHeader.detail.listTitle.lead/.accent` | Not present in `product-categories.tsx` (lives in the product detail page component, out of scope for this component) |
| `productsHeader.product.categoryLabel/materialLabel/cta/back/zoomHint` | Same — product detail view only, not in this component |
| `aboutPage.testimonial.body[]` | Inside Webflow slider (`.w-slider`); wrapping contentEditable inside slide markup risks animation |
| `aboutPage.approach[].title`, `approach[].body[]` | Repeater arrays; approach body is `string[][]` (each card has multi-para body) |
| `aboutPage.capability.groups[].title/items[]` | Repeater array |
| `aboutPage.capability.closing[]` | String array, multi-line |
| `aboutPage.process.steps[].title/.body` | Repeater array |
| `aboutPage.timeline.milestones[].title/body/items/note` | Timeline milestone context; milestones are positional (layout alternates L/R) |
| `aboutPage.timeline.intro[]` | String array rendered as multi-line block |
| Form placeholders / `standardOptions` / `uploadHelp` | Attributes or option lists — not text nodes |

## Layer-A grep result
All 14 checked classes (`text_body-bold`, `text-size-small`, `content_image-features`, `features_text-tile`, `wrap_text-service-card`, `about-mvv_title`, `about-mvv_card-title`, `about-mvv_body`, `wrap_text-room-summary`, `footer-signex_badges`, `tone-medium`, `text_input-label`, `label-large`, `text-button`) — CLEAN in both `globals.css` and `caladan-template.shared.*.css`. No `>` / `+` / `~` / `:first-child` / `white-space` rules targeting any wrapped container.

## Gate outputs
1. `tsc --noEmit` → exit 0 (no output)
2. `next build` → `✓ Compiled successfully` + `✓ Generating static pages (95/95)` — all 95 routes built
3. Layer-A grep → CLEAN across all 5 surfaces

## Concerns
None. The `prisma:error` messages during build are expected (DATABASE_URL absent in CI; site falls back to INITIAL_SNAPSHOT — spec §13).
