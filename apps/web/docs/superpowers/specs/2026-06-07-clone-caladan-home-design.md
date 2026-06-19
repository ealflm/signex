# Clone Caladan home page into signex-web — Design

**Date:** 2026-06-07
**Status:** Approved
**Scope:** Step 1 of building `signex-web` from `signex-web-ref` — clone 100% of the home page only.

## Context

`signex-web-ref` is the **Caladan** Webflow template (tropical-resort site) ported to Next.js.
It is **not** a native React app:

- React components are static SSR "shells".
- All styling comes from one ~351 KB Webflow-exported CSS file
  (`public/assets/css/caladan-template.shared.28e174924.css`).
- All animation/interactivity is driven by a **vendored Webflow JS runtime**
  (jQuery + Webflow IX2 + GSAP + Lenis) in `public/assets/js`, loaded via `<Script>`.

`signex-web` is a pristine `create-next-app` scaffold with **identical tooling**
(Next 16.2.7, React 19.2.4, Tailwind v4, TS 5, `@/*` alias, same default `package.json`).

## Decision (confirmed with user)

- **Approach:** Faithful port copy — replicate the reference's React shells + Webflow
  CSS/JS runtime + assets verbatim for a pixel-perfect, 100% match. Native-React refactor
  is deferred to later steps.
- **Content:** Keep everything as-is — Caladan branding, the "Buy Template" sticky CTA,
  and Webflow OG/domain metadata all preserved. Rebranding is a later step.

## Plan

Because tooling and dependencies are already identical, this is a pure copy-and-verify.
**No** `package.json`, `next.config.ts`, `tsconfig.json`, `postcss.config.mjs` changes
(the Webflow runtime is vendored static JS, not npm; all media is local under `/assets`).

### Files (16 source + assets)

Overwrite scaffold:
- `app/layout.tsx`, `app/globals.css`, `app/page.tsx`, `app/favicon.ico`

Add — home sections (7): `app/components/home/{hero,features,services,resorts-slider,testimonial,faq,cta}.tsx`

Add — shared layout (6): `app/components/{navbar,footer,sales-cta,static-webflow-form,webflow-page-attrs,webflow-runtime}.tsx`

Add — supporting (2):
- `app/lib/webflow-bundles.ts` (route→bundle map)
- `app/types/webflow-attrs.d.ts` (**required** — declares custom JSX attrs; build fails without it)

Add — assets (`public/assets/**`, ~58 MB): `css/` (2), `fonts/` (44), `images/` (83), `js/` (12), `videos/` (10).
Copy everything (not just home's subset) to guarantee no missing asset and seed future pages.

### NOT copied (later steps)

All other route folders (`about`, `resorts`, `blog`, `blogs`, `contact`, `gallery`, `faq`,
`homepage`, `legal`, `book-inquiry`, `template`, `401`) and `app/not-found.tsx`.
Nav/footer links to these will 404 until built.

## Verification

1. `npx tsc --noEmit` passes.
2. `npm run build` succeeds.
3. `npm run dev` (port 3000) vs reference (port 3001): load `/`, confirm zero 404s/console
   errors, Webflow runtime boots (hero blur-in, resorts auto-slider, FAQ accordion, marquee
   galleries, Lenis smooth scroll), and a side-by-side visual match.
