# Plan 4 — Task 2 + Tasks 3a–3e Report

**Date:** 2026-06-27  
**Branch:** `feat/themes-model`  
**Prerequisite:** Task 1 done (commit `333c1e2`)

---

## Status: DONE

---

## tsc

`cd apps/web && npx tsc --noEmit` → **exit 0** (no errors)  
`cd apps/admin && npx tsc --noEmit` → **exit 0** (no errors)

---

## Layer-A CSS grep results (per surface, all CLEAN)

Grep ran against both stylesheets:
- `apps/web/app/globals.css`
- `apps/web/public/assets/css/caladan-template.shared.28e174924.css`

**Hits and disposition:**

| Hit | Disposition |
|---|---|
| `app/globals.css:.hero-quote_bar > .input_wrap` | Form bar — not a text leaf ✓ |
| `caladan-template…css:pre.w-code-block code > span` | Code blocks — not a text leaf ✓ |
| `caladan-template…css:.w-background-video > video` | Background-video internals — not a text leaf ✓ |
| `caladan-template…css:.w-slider-nav > div`, `.w-slider-nav-invert > div` | Slider nav dots — not a text leaf ✓ |
| `caladan-template…css:.w-richtext figure > div:*` | Rich-text figure internals — not used in our components ✓ |
| `app/globals.css:.timeline_row:nth-child(even)` | Timeline row circle position — not a wrapped text leaf ✓ |
| `app/globals.css:.section_hero-contact-c .card_contact-c:last-child` | Contact info-cards (excluded per plan) — not a wrapped leaf ✓ |
| `app/globals.css:white-space:nowrap` (line 139, 230, 256, 449, 741) | `.visually-hidden`, `html[lang="vi"] .section_hero-home-a .heading-style-h0` (span inherits same value as bare text — no change), `.lang-toggle`, `.visually-hidden`, `.footer-signex_badge` — none target a wrapped leaf ✓ |
| `caladan-template…css:white-space:nowrap` (lines 352, 1202, 1353, 1507, 1557, 3073) | Webflow form/nav/slider internals — none target our containers ✓ |

**Conclusion: Layer A CLEAN for all surfaces.**

---

## Leaves wrapped (snapshot paths)

### Task 2 — `edit-attrs.ts`
- Added `EditKind`, `EditTextOpts`, expanded `EditAttrs` with optional `data-edit-maxlength/multiline/required`
- Expanded `editText()` to accept `EditTextOpts` opts
- Kept `EditMediaKind` alias unchanged; no callers broken

### Task 3a — Home (`/vi`)
- `hero.subtitle` — new span in `<p class="margin-0 text-size-large">`
- `features.eyebrow` — new span in `<div class="label-small">`
- `features.title.lead` — new span wrapping `titleTop` in `<h2>`
- `features.title.accent` — stamped existing `<span class="tone-medium">` for `titleBottom`
- `features.cta.label` — new span in `<div class="text-button">`
- `about.eyebrow` — new span in `<div class="label-small">`
- `about.title.lead` — new span wrapping bare `title` in `<h2>`
- `about.title.accent` — stamped existing `<span class="tone-medium">` for `titleAccent`
- `about.body` — new span in `<p class="tone-medium">`
- `productsHeader.eyebrow` — new span in `<div class="label-small">`
- `productsHeader.title.lead` — new span wrapping bare `title` in `<h2>`
- `productsHeader.title.accent` — stamped existing `<span class="tone-medium">` for `titleAccent`
- `productsHeader.body` — new span in `<p class="tone-medium">`

Also: added `editable` prop to `HomeAbout` and `ProductCategories`; updated `preview/[lang]/page.tsx` to pass `editable` to both.

### Task 3b — Contact (`/vi/contact`)
- `contactPage.hero.title.lead` — new span in `<h1>` (both public and preview copies)
- `contactPage.hero.title.accent` — stamped existing `.tone-medium` span (both copies)
- `contactPage.hero.subtitle` — new span in `<p class="tone-medium margin-0">` (both copies)

### Task 3c — About sections (`/vi/about`)
- `aboutPage.hero.title.lead` — new span in `<h1 class="heading-style-h0">`
- `aboutPage.hero.title.accent` — stamped existing `.tone-medium` span
- `aboutPage.hero.subtitle` — new span in `<p class="margin-0">`
- `aboutPage.testimonial.eyebrow` — new span
- `aboutPage.testimonial.title.lead` — new span in `<h2>`
- `aboutPage.testimonial.title.accent` — stamped existing `.tone-medium`
- `aboutPage.intro.eyebrow` — new span
- `aboutPage.intro.title.lead` — new span in `<h2>`
- `aboutPage.intro.title.accent` — stamped `.tone-medium`
- `aboutPage.intro.body` — new span in `<p class="tone-medium">`
- `aboutPage.capability.eyebrow` — new span
- `aboutPage.capability.title.lead` — new span in `<h2>`
- `aboutPage.capability.title.accent` — stamped `.tone-medium`
- `aboutPage.capability.body` — new span in `<p class="tone-medium">`
- `aboutPage.process.eyebrow` — new span
- `aboutPage.process.title.lead` — new span in `<h2>`
- `aboutPage.process.title.accent` — stamped `.tone-medium`
- `aboutPage.process.body` — new span in `<p class="tone-medium">`
- `aboutPage.timeline.eyebrow` — new span
- `aboutPage.timeline.title.lead` — new span in `<h2>`
- `aboutPage.timeline.title.accent` — stamped `.tone-medium`
- `aboutPage.timeline.body` — new span in `<p class="tone-medium">`

### Task 3d — Nav + Footer (every page)
- `nav.links.0.label` … `nav.links.N.label` — new span in `<div>` inside `<a class="link_nav">`
- `nav.cta.label` — new span in `<div class="text-button">`
- `footer.contactHeading` — new span in `<div class="label-large tone-medium">`
- `footer.quickHeading` — new span in `<div class="label-large tone-medium">`
- `footer.links.0.label` … `footer.links.N.label` — new span in `<a class="link_footer">`

### Task 3e — 404 preview surface
- `notFound.title.lead` — new span in `<h1>`
- `notFound.title.accent` — stamped `.tone-medium` span
- `notFound.body` — new span in `<p class="tone-medium margin-0">`
- `notFound.cta.label` — new span in `<div class="text-button">`
- `notFound.image` — media stamp via `editAttrs(editable, "notFound.image", "image")`
- NEW: `apps/web/app/components/not-found-preview.tsx` (server component)
- NEW: `apps/web/app/preview/[lang]/404/page.tsx` (token-gated preview surface)
- `admin/_lib/blocks.ts`: `notFound: "/404"` (was `null`)

---

## EXCLUDED (beyond plan's list)

No additional leaves excluded beyond the plan's pre-defined exclude list. All in-scope leaves passed Layer A.

**Pre-defined exclusions honored (not stamped):**
- Array/tile text: `features.featured.*`, `features.cards[].*`, `features.videoTitle/videoText`, `productsHeader` card tiles, `about.mission/vision/values.*`, `aboutPage.testimonial.body[]`, `aboutPage.approach[]`, `capability.groups[]`, `capability.closing[]`, `process.steps[]`, `timeline.milestones[]`, `timeline.intro[]`
- Inside parallax/sliders: product-category cards, testimonial slider body
- Derived/template-string leaves: `footer.brand`, footer contact tuples, contact-card lines
- Public 404 not-found-view.tsx: stays hard-coded (`use client` cannot consume SiteContent — Task 61b)

---

## Concerns

- **Public 404 divergence** (pre-existing, flagged): The public 404 (`not-found-view.tsx`) uses hard-coded copy. Edits to `notFound.*` in the editor persist to the theme and are visible in preview, but the public 404 won't reflect them until Task 61b wires it up. This is the plan's declared open question #1.
- **White-space:nowrap on VI hero h1**: `html[lang="vi"] .section_hero-home-a .heading-style-h0 { white-space: nowrap }` targets the h1 — spans inside inherit the same value as the original bare text, so no render change. Confirmed safe (Task 1 already ran Layer C on this).
