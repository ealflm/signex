# Site Adjustments — Round 2

**Source:** the client PDF "Một số điều chỉnh cho website" (2026-07). Of its 9 asks, 4 are already shipped (media overlay; giant SIGNEX wordmark removed; Home/About banners flexible image-or-video; theme colours incl. per-title colour mode). This spec covers the **5 remaining items**, confirmed with the user:

- **A. Contact banner accepts video** — `contactPage.hero.image` is image-only today; make it flexible like the other three heroes (+ overlay).
- **B. Full-colour logo uploads** — nav logo is a monochrome CSS mask and the footer logo is `filter: brightness(0) invert(1)`, so an uploaded colour logo renders flattened ("hòa trộn"). A custom logo must render in its true colours.
- **C. Two floating buttons** — call + Zalo, bottom-right corner, numbers sourced from `businessContact` (already editable in the admin).
- **D. Configurable favicon** — the `meta.favicons` schema field EXISTS (importer-seeded) but the web never reads it (`seo.ts` serves static `ICONS`), which is exactly the reported "editing SEO doesn't change the icon". Wire it end-to-end.
- **E. Restructure "Vì Sao Các Thương Hiệu Chọn Chúng Tôi"** — homepage gets a compact 4-criteria block (icons only, no media, no CTA); the About page gains the full block with the workshop video as the featured element.

## Global Constraints

- American "color" in identifiers, British "colour" in prose; **UI copy Vietnamese**.
- `@signex/shared` compiles to CommonJS `dist/` — `npm run build -w @signex/shared` after editing; do **not** commit `dist/`.
- **No migration.** Every schema change is `.optional()` or a widening union; every stored draft + published release keeps parsing.
- Public render leaks zero `data-edit-*`/`data-sx-*` (gate on `editable`).
- **NEVER `npm run test` (turbo-all)** — per-workspace only.
- Branch off `main`. Commit trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## A. Contact banner: flexible image-or-video (+ overlay)

**Schema** (`packages/shared/src/content/blocks/contactPage.ts`): `hero.image: AssetRef.optional()` → `hero.image: MediaRef.optional()`, and add `hero.overlay: Overlay.optional()`. Backward-compatible: a stored `AssetRef` (`{assetId, alt}`) is already a valid `MediaRef` member (the union discriminates structurally on `mp4AssetId`).

**View-model** (`apps/web/app/lib/content.ts`, contactPage.hero): replace `imageUrl`/`imageAlt` with `media: resolveMedia(b.contactPage.hero.image, …)` + `overlay: b.contactPage.hero.overlay` (raw), mirroring `aboutPage.hero`.

**Render.** The hero `<img className="image_cover is-parallax">` is duplicated in `apps/web/app/[lang]/contact/page.tsx` (public, no edit attrs) and `apps/web/app/preview/[lang]/contact/page.tsx` (editable). Extract ONE shared component `apps/web/app/components/contact-hero-media.tsx` (`{ media, overlay, editable }`) used by both routes — the AboutSections precedent. It renders:
- image branch: the existing `<img>` (fallback to the literal sara-dubler still when media absent);
- video branch: the same all-or-nothing `<video>` pattern the home hero uses (`image_cover is-parallax`, autoplay/loop/muted/playsInline, poster+mp4+optional webm);
- the overlay div: `overlay_media-config` + `style={overlayCss(overlay)}` + editable-gated `data-sx-overlay="contactPage.hero.overlay"`;
- edit caps on the media element: `editableAttrs(editable, "contactPage.hero.image", { image: true, video: true })`.

The editor side is field-driven (caps → picker toggle → `applyMediaRef` sibling-overlay derivation `contactPage.hero.overlay`) — **no admin change**.

## B. Full-colour logo uploads (nav + footer)

Rule: **default logo keeps today's monochrome treatment; a CUSTOM (uploaded) logo renders as a true-colour `<img>`.**

- **Nav** (`apps/web/app/components/navbar.tsx` + `.signex-logo-nav` in globals.css): today one masked `<div>` (background-color = nav ink token, `mask: url(signex-logo.svg)`; inline mask-image override when `dict.logoUrl` set — which flattens any uploaded art to one colour). Change: when `dict.logoUrl` is set render `<img src={dict.logoUrl} alt={siteName} className="signex-logo-nav-img">` (new class: same `height: 1.85rem; width: auto; display: block`, no mask, no background) instead of the masked div; keep the masked div (default SVG) otherwise. Edit caps stay on whichever element renders.
- **Footer** (`apps/web/app/components/footer.tsx` + `.footer-signex_logo`): the `filter: brightness(0) invert(1)` recolour applies only to the DEFAULT logo. When `t.logoUrl` is set, render with a modifier class (`is-custom`) that sets `filter: none`.

Trade-off (accepted by the user): a custom colour logo no longer auto-tracks the nav ink / dark-footer recolour — the uploaded art is shown as-is. The default SVG keeps the adaptive behaviour.

## C. Floating call + Zalo buttons

New server component `apps/web/app/components/floating-contact.tsx`, rendered on every public page and in preview (add to `[lang]/layout.tsx` + the preview layout, after `<Footer>`): a fixed **bottom-right** vertical stack of two circular buttons.

- **Data:** `businessContact.phones` — the `kind:"tel"` entry drives the call button (`href="tel:" + value` with all non-digit/non-plus characters stripped); the `kind:"zalo"` entry drives Zalo (`href="https://zalo.me/" + digits`, with a leading `+84` normalised to `0`). Each button renders ONLY when its phone entry exists and is non-empty — no config flag needed; content already editable in the admin Business-contact panel.
- **Style** (globals.css, `.sx-float-contact*`): fixed `right: 1.25rem; bottom: 1.25rem` (+ `env(safe-area-inset-bottom)`), buttons ~3.25rem circles, stacked with a 0.75rem gap, soft shadow. Call button background = the button-primary palette token (themes with the site); Zalo = the Zalo brand blue `#0068ff` with the official Zalo glyph inlined as SVG (brand colours stay hardcoded, same convention as the Facebook/YouTube chips). `z-index: 900` — above content, below the editor hotspot layer (2147483000). Hover scale ≤1.05, `prefers-reduced-motion` respected. `aria-label`s: "Gọi điện" / "Chat Zalo".

## D. Wire the configurable favicon

- **View-model** (`content.ts` meta): resolve `favicons: b.meta.favicons.map(f => ({ rel: f.rel, url: assetUrl(f.asset.assetId) }))`.
- **`seo.ts`:** `buildMetadata` accepts the resolved list; when non-empty, build `icons` from it (`rel === "apple-touch-icon"` → `icons.apple`, everything else → `icons.icon` with its rel/type inferred from the URL extension); when empty, fall back to the static `ICONS`. Every `generateMetadata` caller passes the dict it already has.
- **Admin:** the SEO (meta) panel must actually let the user replace the favicon assets. The generic block form (deriveFields) may or may not handle `favicons: array<{rel, asset}>` — verify during implementation; if the generic form cannot edit it cleanly, render a dedicated small "Favicon" field editor in the meta panel (asset picker per entry, rel fixed). Acceptance: upload a new icon in the admin → save → publish → the site serves it in `<head>`.
- The ADMIN app's own tab icon (the "SIGNEX Admin" lotus) is a static app asset — out of scope (noted to the user).

## E. Restructure "Vì Sao Các Thương Hiệu Chọn Chúng Tôi"

**Single data source, two renderings.** The existing `features` block content is reused verbatim — no schema change, no content migration. The four criteria = `features.featured.{title,desc}` (the old clickable image tile, now a plain card) + `features.cards[0..2]`. The workshop video = `features.video.{title,text,media,overlay}`.

- **Homepage — `features-compact.tsx`** (replaces `<Features>` on `[lang]/page.tsx` + `preview/[lang]/page.tsx`): eyebrow + two-tone title centred; a 4-up criteria grid (2×2 on mobile), each cell = icon + title + desc using the Caladan `.card_service-v2` / `.icon_service-card` atoms; **no images, no video tile, no click states, no CTA button** (user chose to drop it here). Icons hardcoded index-aligned (the existing eye / handshake / shield-check glyphs + a new lucide **gauge** glyph for "Chất lượng sản xuất ổn định", which leads the order). All titles/descs keep their existing `editableAttrs` field paths (`features.featured.title|desc`, `features.cards.N.*`).
- **About page — `features-full.tsx`**, inserted in `AboutSections` **after the "Chúng Tôi Là Ai" (testimonial) section, before the manufacturing-approach section**, wrapped `data-sx-block="features"`: header row (eyebrow/title left, the existing `features.cta` quote button right — kept here); then the **featured workshop video** on top (the current `video_features` background-video markup + its `features.video.overlay` div + title/text, edit caps `features.video.media` `{image:true, video:true}`); then the same compact 4-criteria grid as the homepage — the grid lives ONCE in a shared `apps/web/app/components/home/features-criteria.tsx` (icons + 4 cells + edit spans) imported by both `features-compact.tsx` and `features-full.tsx`, so the two renderings cannot drift.
- The old `features.tsx` is deleted. `features.featured.image` + `features.featured.overlay` become dormant (optional, unrendered) — left in the schema so stored snapshots keep parsing; noted for a future cleanup.
- Editor mapping: the `features` block's page mapping stays **home** (the compact block carries every text field); the video slot is edited by clicking it on the About canvas (field paths are block-key-prefixed, page-independent).
- Layout: compact and tidy ("thu nhỏ, căn giữa, làm gọn") — the section uses the standard `padding-global`/`container-large` shell, grid max-width constrained and centred; new CSS under `.sx-features-compact*` in globals.css reusing Caladan spacing/typography tokens.

## Testing

- **shared** (vitest): contactPage parses with an old-style stored `AssetRef` image, with a `VideoRef`, with an overlay, and with all absent; meta favicons round-trip (existing shape).
- **web**: tsc = 0; the existing `npm test -w @signex/web` chain green (update any source-invariant test that referenced `features.tsx`).
- **Browser E2E (preview + public):** contact banner swaps image↔video + overlay live-edits + saves; custom colour logo uploads render true-colour in nav + footer (default still monochrome); float buttons appear bottom-right with correct `tel:`/`zalo.me` hrefs (and hide when the phone entry is emptied); favicon uploaded in admin → published → served in `<head>`; homepage shows the compact 4-criteria block (no media/CTA); About shows the full block with the workshop video featured; public render leaks no edit hooks.

## Out of scope

- The red hero overlay currently saved in the draft (user's own test edit — theirs to keep or change in the editor).
- The admin app's own favicon; palette/token changes; any other PDF item (already shipped).

## Deployment

Feature branch(es) off `main`; after review + tests + browser E2E, fast-forward merge to `main`; operator deploys (rebuild `signex-web`, `signex-admin` only if the favicon panel needs the dedicated editor; `@signex/shared` first). Favicon/contact-media/feature-block content changes reach the public site on the next **publish**.
