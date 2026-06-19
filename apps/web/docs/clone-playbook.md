# signex-web — Clone Playbook & Gotchas

Lessons captured while building the **Hero** section, plus a step-by-step playbook for
cloning the remaining pages. Read this before touching a new section/page.

`signex-web` is a **faithful port** of the Caladan Webflow template (in `signex-web-ref/`),
adapted to the signex (garment/fashion brand-identity manufacturing) brand. It is NOT a
native React app: all styling comes from one ~351 KB Webflow CSS, and all
animation/interactivity comes from a vendored Webflow JS runtime (jQuery + IX2 + GSAP +
Lenis) loaded by `app/components/webflow-runtime.tsx`.

---

## 0. Golden rules (firm)

1. **Keep Caladan's visual design unchanged.** Only swap text/content and add new
   interactions. Reuse Caladan's own classes (`.master_label`/`.label-small`,
   `.cta_primary`, `.text-field`, `.input_wrap`, `.heading-style-h0` + `.tone-medium`,
   `.form`, …). Never rebuild a section natively.
2. **Never edit the vendored Webflow CSS** (`public/assets/css/…`). All custom CSS goes
   in **scoped** rules appended to `app/globals.css` (Tailwind preflight is intentionally
   NOT imported — it would break Webflow's resets).
3. **This is Next.js 16.2.7 — NOT the Next.js you may know.** Per `AGENTS.md`, read the
   relevant guide in `node_modules/next/dist/docs/` before writing code (APIs/conventions
   changed; see §4).
4. **Verify, don't assume.** `npm run build` after every change; screenshot + measure the
   DOM with headless Chrome (see §7). Confirm the *intended behavior per state* before coding.

---

## 1. Webflow IX2 runtime gotchas (the big ones)

IX2 binds hover/scroll/reveal animations **once on page load** to the elements present then.
React must not fight it:

- **NEVER conditionally render (mount/unmount) a Webflow-animated element** based on React
  state. The remounted element loses its IX2 binding → animation dies. Instead keep it
  **mounted** and toggle visibility with CSS (`display:none`).
  *(Bug we hit: the collapsed-bar submit button — fixed via `.hero-quote_submit--bar.is-hidden`.)*
- **Don't let React re-apply IX2-managed inline styles.** IX2 animates the reveal via inline
  `style={{opacity:0, filter:'blur(5px)'}}`. In a **client** component that re-renders, a
  fresh style object literal makes React re-apply `opacity:0` and undo the reveal. Use a
  **stable module-level constant** (`const REVEAL_STYLE = {...}`) so React skips it.
  *(Less of an issue now that translated components are Server Components, but the rule holds
  for any client component carrying a `data-w-id` reveal element.)*
- **Navigation is plain `<a href>` (full reload), never `<Link>`.** The runtime's comment is
  explicit: "every page load is a fresh first boot" keeps reveals pristine; the SPA
  teardown/re-init path is fragile (above-the-fold reveals can get stuck hidden). The locale
  toggle also uses plain `<a>` for this reason.
- **`app/types/webflow-attrs.d.ts` is REQUIRED** — it declares the custom JSX attributes
  (`data-w-id`, `marquee-up`, `button=""`, `data-wf--cta-primary--variant`, …). Without it
  the TS build fails.
- **⚠️ IX2 interactions are PAGE-SCOPED by a compound key `<data-wf-page>|<data-w-id>`.** When
  you port a section from a *different* page (e.g. the `/resorts` grid onto the home page), its
  `data-w-id` reveal triggers are registered ONLY for the source page's `data-wf-page` id, NOT
  the host page's. The data is in the global JS bundle (it greps as "present"), but IX2 won't
  activate it on the host page → the wrapper stays `opacity:0; blur(5px)` forever (invisible
  section, no JS error). **Fix:** re-point the ported reveal wrapper's `data-w-id` to a *host-page*
  trigger that runs the standard reveal actionList **`a-124`** (`STYLE_OPACITY`+`STYLE_FILTER` on
  `self`). On the home page those are: `0f29df12-…` (`headline_features`), `04f2c9d6-…`
  (`headline_service-v1`), `b3ac1ddc-…` (`heading_resorts-slider`), hero headline. Sharing an
  a-124 id is safe — it targets only the trigger element itself, so each element reveals
  independently (same as the 4 resort cards sharing `53807880`). Diagnose by dumping the IX2
  registry: `window.Webflow.require('ix2').store.getState().ixData.{events,actionLists}` — find
  events whose `target.id` starts with the host page's `data-wf-page` id. (`a-107` =
  `TRANSFORM_MOVE`, a slide — NOT the fade reveal.) Keep non-reveal source ids (card hover, image
  parallax) as-is; they're page-gated and harmlessly inert until wired to host equivalents.

---

## 2. CSS / styling gotchas

- **Specificity: Caladan's stylesheet loads AFTER `globals.css`.** To override a Caladan rule
  you need **higher** specificity — equal specificity loses. Pattern that works:
  `.wrap_home-a .content_hero-home-a { … }` (0,2,0) beats Caladan's `.content_hero-home-a` (0,1,0).
- **Scope everything.** New classes are prefixed (`.hero-quote_*`, `.lang-toggle*`) so they
  don't leak into other Caladan components (e.g. the footer newsletter also uses `.form`).
- **`text-transform: uppercase` handles Vietnamese diacritics** correctly (ĐĐ, Ầ, …) — so
  provide title-case strings and let the existing Caladan label CSS uppercase them.
- **Locale-conditional styling** keys off `html[lang="vi"]` (the `lang` is server-set under
  `[lang]` routing), e.g. the VI headline tweak.

### Hero layout specifics (reusable understanding)
- The hero height chain: `.wrap_home-a` is **`height:100dvh; max-height:75rem`** on desktop
  (`height:auto` on mobile); `.master_hero-home-a` has **`overflow:hidden`**; `.image_hero-home-a`
  is `position:absolute; inset:0`. A tall element inside gets **clipped**.
- The **navbar overlays the hero's top ~92px** — content must reserve top padding to clear it.
- **Percentage `min-height` needs a definite-height ancestor.** When the hero is made to grow
  (`height:auto`), `min-height:100%` collapses → use a viewport value:
  `min-height: calc(min(100dvh, 75rem) - <hero paddings>)`.
- **Smooth expand/collapse without JS measuring:** animate `grid-template-rows: 0fr → 1fr`
  (+ opacity + a small translateY) with `cubic-bezier(.16,1,.3,1)` (~520ms). Drive any
  *related* motion (e.g. the headline rising) off the **same animated height** so it moves in
  lockstep — no separate transition, no jump.
- **Decide the per-state intent up front.** We churned on the headline (pin-at-top vs
  rest-near-form-and-rise-on-expand; shrink-font vs equal-size-and-widen). Settle "what does
  collapsed look like / what does expanded look like / what moves" before coding.

---

## 3. Form / interaction gotchas

- **Chrome ignores `autocomplete="off"` for address/contact fields** (name/email/phone) — it
  shows the saved-profile dropdown anyway. Workaround: `autocomplete="new-password"` on those
  fields (Chrome won't suggest profile data; harmless on non-`password` inputs). Keep
  `autocomplete="off"` on the `<form>` for the rest.
- **Native file input text ("Choose File / No file chosen") is browser-controlled** — cannot
  be translated.
- The quote form is **static** (no backend) — it just shows a success message, like Caladan's
  original. Field `name`s are cosmetic for now.

---

## 4. Next.js 16 specifics (differ from older Next / training data)

- **Middleware was renamed to `proxy`.** Use **`proxy.ts`** at the project root:
  `export function proxy(request: NextRequest)` + `export const config = { matcher }`.
- **i18n = `[lang]` sub-path routing + server dictionaries** (the documented App Router pattern,
  `node_modules/next/dist/docs/01-app/02-guides/internationalization.md`):
  - All routes under `app/[lang]/`; root layout there with `<html lang={(await params).lang}>`,
    `export const dynamicParams = false`, `generateStaticParams()` → `[{lang:'en'},{lang:'vi'}]`.
  - `app/[lang]/dictionaries.ts` (`import "server-only"`, `getDictionary`, `Dictionary` type)
    + `app/[lang]/dictionaries/{en,vi}.json`. Plain shared config in `app/lib/i18n-config.ts`
    (LOCALES/Locale/DEFAULT_LOCALE/hasLocale) — no `server-only`, so proxy + client toggle can use it.
  - **`proxy.ts` matcher MUST exclude `/assets/` and dotted files**, or it redirects the Webflow
    CSS/JS/images: `"/((?!_next/static|_next/image|assets/|favicon.ico|.*\\..*).*)"`.
  - Proxy detects locale (cookie `NEXT_LOCALE` → `Accept-Language` → default `en`), redirects bare
    paths to `/{locale}`, and sets the cookie on locale paths so the choice sticks.
- **`params` is a `Promise`** — `const { lang } = await params`.
- **Translatable components are Server Components** that receive `dict` via props (no client
  i18n, no flash). The form stays a client component but gets `dict: Dictionary["form"]` by prop.
- **Webflow route-matching under `[lang]`:** `profileForRoute()` in `app/lib/webflow-bundles.ts`
  strips the `/en|/vi` prefix (`routeFromPathname`) so `/vi` still maps to the HOME bundle.
  `WF_PAGE_IDS` already contains the `data-wf-page` ids for ALL Caladan routes.

---

## 5. Translation content gotchas

- **VI copy is longer than EN.** At a fixed display size it may wrap/overflow. Decide per case:
  either shrink the font, or (what the user preferred for the hero) keep EN's size and let it
  extend — `html[lang="vi"] … { white-space: nowrap; max-width: none }`. Verify no page overflow.
- New strings go into `dictionaries/{en,vi}.json` under a section key (e.g. `hero`, `form`).
  Keep the two files the same shape. Option **values** stay stable in code; only **labels** are
  translated (see `STANDARD_VALUES` in `hero-quote-form.tsx`).
- Other Caladan sections are still English placeholder — translate each as it's adapted.

---

## 6. Page-cloning playbook (for the remaining pages)

Remaining: `about`, `resorts` (+ `resorts/<slug>`), `gallery`, `faq`, `contact/*`, `blog/*`,
`blogs/*`, `homepage/home-b|home-c`, `legal`, `book-inquiry`, `template/*`, `401`, `not-found`.

For each page:
1. **Copy the route from `signex-web-ref/app/<route>/`** into **`signex-web/app/[lang]/<route>/`**
   (`page.tsx` + any page-specific components under `app/components/`). Assets are already fully
   copied (`public/assets/**`).
2. **Wire the Webflow bundle/ids:** `WF_PAGE_IDS` + `profileForRoute()` already map every route
   (home → HOME bundle; `resorts/*` and `blogs/*` have their own; everything else →
   STANDARD/DCDAA). Usually no change needed — just confirm the route resolves.
3. **Build + run-verify:** `npm run build`; then load `/en/<route>` and `/vi/<route>` in headless
   Chrome — confirm Webflow boots (`data-wf-page` set, reveal opacity → 1), zero asset 404s,
   sliders/accordions/marquees work.
4. **Adapt content → signex** and **translate**: add the page's strings to
   `dictionaries/{en,vi}.json`, make the page a Server Component that reads `getDictionary(lang)`,
   pass `dict` down; keep all Caladan classes/markup. Apply the §1–§3 gotchas.
5. **Internal links** keep working via the proxy (bare `/about` → `/{locale}/about`); for
   locale-sticky links prefer prefixing with the current `lang` when you touch them.

Order suggestion: start with simpler static pages (`about`, `gallery`, `legal`, `faq`) before
collection-driven ones (`resorts/*`, `blogs/*`).

---

## 7. Verification method (what worked)

- **Build:** `npm run build` (type-checks + compiles). Fix all errors before screenshots.
- **Headless Chrome via `puppeteer-core`** installed to **`/tmp/pwtest`** (keeps the project
  clean), executablePath `/usr/bin/google-chrome-stable`. Pattern:
  - `goto` the URL, then **wait for `.headline_home-a` opacity > 0.9** (IX2 reveal done) before
    screenshotting — otherwise you capture the hidden pre-reveal state.
  - **Below-the-fold sections reveal on SCROLL, not load.** Their headline sits at
    `opacity:0; blur(5px)` until scrolled into view (e.g. `.headline_features`). To verify them,
    `el.scrollIntoView({block:'center'})` THEN wait for opacity > 0.9. opacity 0 at top-of-page is
    correct Caladan behavior, not a regression.
  - **Measure the DOM** (heights, `getBoundingClientRect`, attribute values, console warnings) —
    don't just eyeball. This caught the headline-under-navbar, the hover-animation regression,
    and confirmed locale/`<html lang>`/asset behavior.
  - Test at multiple viewport heights (e.g. 1300/1080/900/768) for layout that depends on `100dvh`.
- **Caveat:** headless Chrome has no saved profile, so it can't reproduce Chrome's **address
  autofill** dropdown — that one needs manual testing in the user's real Chrome.
- The dev server runs on **:3000** (`/` → `/en`); reference runs on **:3001**.
