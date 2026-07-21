# Site Adjustments r3 — client change-request round (design)

**Source:** client doc *"Nội dung cần điều chỉnh cho website"* (PDF, received 2026-07-20). Nine items: six admin/config capabilities, three UI changes. One branch, one commit per item, pattern shared → web → api → admin (as in floating-buttons r1).

## Confirmed with the user

- **Item 6 (stale-colour warning):** user asked for self-investigation. Root cause found: the audit checks every stored override selector against **whichever page the editor preview is on**, so about-page selectors are reported "no longer applying" while viewing home (the client's screenshot shows exactly this). Fix = page-aware audit (design approved).
- **Item 7 (float buttons):** 3× size on desktop, moderate (~1.5×) on mobile.
- **Item 4 (overlay):** three **independent per-area** configs (home cards / category page / product detail), not one global setting, not per-image.
- **Item 3 (form title colours):** one uniform colour + per-label per-element fine-tune (per-element override wins over the uniform colour).
- Design sections A/B/C approved in conversation.
- **⚠ Post-approval amendment (flagged for spec review):** the uniform label colour + hide-form toggle live on the **hero block** (`hero.formLabelColor`, `hero.showQuoteForm`), NOT on `formConfig` as said during section A. Reasons: (a) `formConfig` drives BOTH the hero form and the contact-page form — one shared colour would repaint the contact form (light card) with a colour chosen for the hero form (dark glass); (b) the PDF scopes every request to "form báo giá trên **hero banner**"; (c) `formConfig`'s charter is copy-only ("Quote/contact form copy"). The contact form still gets per-label fine-tuning via its own anchors.

## Global constraints (binding)

- **`@signex/shared` compiles to CommonJS `dist/`** before web/admin/api consume it. Rebuild after every schema change: `npm run build -w @signex/shared`.
- **NEVER `npm run test` (turbo-all). Per-workspace only.** web tsc: `cd apps/web && node /home/ealflm/dev/signex/node_modules/typescript/bin/tsc --noEmit` (`npx tsc` is a decoy); admin likewise from `apps/admin`.
- **Every new schema field is `.optional()` or `.default(...)`** — the published snapshot and existing themes stay valid with no migration and no re-publish.
- **NEVER rename existing CSS classes, `data-sx-c` anchor ids, or `data-sx-block` keys** — stored palette-override selectors reference them (renames are exactly what mints "Màu không còn áp dụng" entries). New wrappers/classes are fine; renames are not.
- `data-sx-block` / `data-sx-c` are rendered on the **public** site (override CSS must match there); `data-sx-overlay` follows the hero's actual pattern — the overlay `<div>` renders always, the *attribute* is stamped only in preview/editable mode; all `data-edit-*` hooks stay preview-only via `editable()` (`apps/web/app/lib/edit-attrs.ts`).
- Next 16.2.x has breaking changes vs training data — read `node_modules/next/dist/docs/` before touching Next-side code. Load the UI skills (frontend-design, web-design-guidelines) before implementing the UI items.
- Branch `feat/site-adjustments-r3` off `main`.

## Item 1 — Configurable button hover colours (site-wide tokens)

**Current:** hover colours already flow through theme tokens — the template reads `--_🎨-color--tokens---button--primary--hover--{background,text,border}` (`.cta_primary:hover` / `.btn-bg:hover`, template CSS ~L2977/L3047). `TOKEN_VARS` (`packages/shared/src/content/palette.ts:141-172`) registers only `btnPrimaryHoverBg` ("Nút chính — nền (hover)"); there is no hover-text token and the colour panel never offers hover rows.

**Design:**
- `packages/shared/src/content/palette.ts`: add `btnPrimaryHoverText: { cssVar: "--_🎨-color--tokens---button--primary--hover--text", label: "Nút chính — chữ (hover)" }` to `TOKEN_VARS`. (Hover **border** stays template-derived — not asked for.)
- Admin colour panel: when a primary CTA is the clicked target, its site-wide section offers two extra rows — **"Nền (hover)"** → `btnPrimaryHoverBg`, **"Chữ (hover)"** → `btnPrimaryHoverText` — wired wherever the CTA target's token roles are declared (`apps/admin/app/(dash)/editor/_lib/color-target.ts` + `_panels/color-panel.tsx` RoleRow list). Editing them site-wide re-themes every primary button's hover, including the float call button? — no: the float call button uses the *default* bg token, hover on it is scale-only; unaffected.
- Web: **zero changes** (template already consumes both vars; `paletteStyle()` emits any token present in `TOKEN_VARS`).
- **Not doing:** per-element hover (the selector grammar rejects state pseudo-classes by design — stored-XSS defence; unchanged), secondary/tertiary hover tokens (template defines no such vars).
- Tests: `palette-template.test.mjs` (holds every `TOKEN_VARS.cssVar` to the template stylesheet) picks up the new token; adjust any token-count assertions.

## Item 2 — Required checkbox drives the (\*) asterisk

**Current:** `formConfig.fields.<key>.required` exists in the schema (`packages/shared/src/content/blocks/formConfig.ts:7`, checkbox auto-rendered in admin) but the web never reads it. `<sup>*</sup>` + the `required` attribute are hardcoded on exactly name/email/phone (`apps/web/app/components/home/hero-quote-form.tsx:147,164,181`).

**Design:**
- `apps/web/app/lib/content.ts`: `dict.form` gains per-field `required: boolean` from the block.
- `hero-quote-form.tsx` **and** the contact form (`apps/web/app/components/home/contact.tsx`): remove hardcoded asterisks and hardcoded `required` attrs. For each field: when `required` — add class `sx-required` to the label span and the `required` attribute to its input/select/textarea/file input (native browser validation; file input `required` is native too).
- **Asterisk = CSS pseudo-content**, not a DOM node: `globals.css` — `.text_input-label .sx-required::after { content: "*"; margin-left: 0.15em; font-size: 0.8em; vertical-align: super; }`. Because it renders as part of the **label span**, it inherits the span's colour in every case — uniform `formLabelColor`, per-label override, or default — which is exactly item 3's "dấu (\*) đổi màu theo title" with no extra wiring. (The editable span's textContent is untouched, so inline text editing is unaffected; a11y comes from the `required` attribute, not the glyph.)
- Back-compat: the importer already seeds `required: true` only for name/email/phone (`apps/api/src/importer/block-builder.ts:347-349`) → default visuals identical to today.

## Item 3 — Hero quote form: label colours, background, hide toggle

**Current:** labels are text-editable spans (`formConfig.fields.<key>.label`) with **no colour anchors**; only name/email/phone are clickable in the editor because the other seven sit in the collapsed `.hero-form_collapsible` (`aria-hidden`, `grid-template-rows:0fr`, `opacity:0`) — that is the entire reason the client "can only configure 3 fields". Panel background is fixed glass (`globals.css:19-26`, `rgba(8,10,12,0.58)` + blur). No hide toggle exists.

**Design:**

*Schema (`packages/shared/src/content/blocks/hero.ts`):*
```ts
export const heroBlock = z.object({
  …existing…,
  showQuoteForm: z.boolean().default(true),   // false → hero renders without the form (full banner)
  formLabelColor: HexA.optional(),            // uniform colour for ALL 10 field labels (hero form only)
});
```

*Web:*
- `hero.tsx`: `showQuoteForm === false` → don't mount `<HeroQuoteForm>`; everything else about the hero unchanged. When rendered, the panel gets `style={{ "--sx-form-label": t.formLabelColor }}` when set.
- `globals.css`: `.hero-quote_panel .text_input-label { color: var(--sx-form-label, var(--_🎨-color--tokens---input--label)) }` — the uniform colour, with the template's own base label token as the fallback so today's look is bit-for-bit unchanged when unset (`inherit` was verified NOT to be a no-op — our selector out-specifies the base rule and `inherit` pulls a brighter ancestor colour). Per-label per-element overrides still win: the palette `<style>` (injected after the app stylesheet) targets the anchored span directly.
- **Per-label anchors:** extend `EditOpts.color` (`apps/web/app/lib/edit-attrs.ts:82,104`) from `true` to `true | string` — a string is an explicit `data-sx-c` anchor id (default stays the field path). Hero label spans get `color: "heroForm.<key>"` (10 anchors); contact-form label spans get `color: "contactForm.<key>"`. Distinct ids per form so an override never paints both forms. Anchored selectors are structural-drift-proof (no `:nth-of-type`), so none of this feeds item 6's warning list.
- **Panel background:** the `<form class="… hero-quote_panel">` (`hero-quote-form.tsx:100`) gets a colour-only anchor `data-sx-c="heroForm.panel"` → in the editor, clicking the panel offers the existing "Chỉ phần tử này" **Nền** row *with the alpha slider* (the glass effect stays available via alpha). No schema field needed; stored in `palette.overrides` like every other per-element colour.
- **Editor expansion:** in editable/preview mode the collapsible renders permanently expanded (`is-open`, `aria-hidden={false}`) so all 10 labels are clickable and text-editable. Public behaviour (collapsed until focus) unchanged.

*Admin:* `showQuoteForm` auto-renders as a checkbox (existing `boolean` kind). `formLabelColor` needs a new **`color` FieldKind** in `apps/admin/app/lib/zodform-fields.ts` + `field-editor.tsx`: detected via a `.describe("color")` marker on the schema; renders a colour picker + clear ("bỏ trống = mặc định"). Generic — reusable for future colour fields.

*API:* no importer changes — `showQuoteForm` has a zod `.default(true)` and `formLabelColor` is optional, so `parseBlock` backfills existing and future imports. `apps/web/app/lib/initial-snapshot.ts` is AUTO-GENERATED ("DO NOT EDIT BY HAND") and stays untouched for the same reason.

## Item 4 — Per-area colour-wash on product imagery

**Current:** the `Overlay` primitive (solid colour+opacity 0-100 or 2-4-stop gradient, `packages/shared/src/content/primitives.ts:62-80`) + `overlayCss()` (`packages/shared/src/content/overlay-style.ts`) already power the hero/features/about/contact media washes, edited on-canvas via `data-sx-overlay`. Catalog imagery has none — only the template's fixed dark scrims (`.overlay_resort-card-v1`, `.overlay_tag-home`).

**Design:**
- `packages/shared/src/content/blocks/productsHeader.ts` (the block already backing the products UI copy) gains three optional fields: `homeCardOverlay`, `categoryImageOverlay`, `productImageOverlay` — each `Overlay.optional()`.
- Web renders an overlay layer `<div className="overlay_media-config" style={overlayCss(x)} data-sx-overlay="productsHeader.<field>" />` (exact hero pattern, `hero.tsx:83`) inside the image wrap of:
  - `home/product-categories.tsx` — every homepage category card → `homeCardOverlay`;
  - `[lang]/products/[slug]/page.tsx` — the category hero image **and** every "Khám phá bộ sản phẩm" grid card → `categoryImageOverlay`;
  - `[lang]/products/[slug]/[product]/page.tsx` — the main product image → `productImageOverlay`. **Not** inside the zoom lightbox (customers inspect the clean product there).
- Layering: config overlay sits above the image, below the tag chip/text (z-index between — the template scrims stay as-is for tag legibility).
- Editor: identical UX to the banner — click any image in the area, the overlay editor edits that area's single config; every image in the area updates (uniform wash, per-area intensity — as the user chose). Verify the preview bridge's overlay branch (`preview-bridge.ts:44-47` / `edit-overlay.tsx`) applies live edits to **all** nodes sharing one `data-sx-overlay` path (extend to `querySelectorAll` if it assumes one).
- The overlay node renders **unconditionally** (transparent when the field is unset — `overlayCss(undefined)` → no background), exactly like the hero's (`hero.tsx:83`): the editor needs the stamped node to exist *before* the first overlay is configured, and a transparent `pointer-events:none` layer costs nothing on the public site.
- `content.ts` exposes the three fields; importer/initial-snapshot seed nothing (absent).

## Item 5 — Product description: detail page only

**Current:** the product detail page **already renders** `item.desc` (`[product]/page.tsx:89-91` — also in the deployed build; the client's "missing" example simply has an empty desc). The category-page grid cards *also* print `p.desc` under each card image (`products/[slug]/page.tsx:139-141`) — that's the "trên card image ở ngoài" the client wants gone.

**Design:** remove the `p.desc` from the category-grid cards (cards keep image/tag/name/stats). On the detail page, wrap the paragraph in `{item.desc && …}` so an empty description leaves no gap. No admin/api/schema change.

## Item 6 — "Màu không còn áp dụng": page-aware audit

**Current:** `edit-overlay.tsx:801-813` — a stored selector is "broken" when `document.querySelectorAll(sel).length !== 1` **on the currently-previewed page**. Selectors scoped to another page's block (e.g. `[data-sx-block="aboutPage"] …` while previewing home) match 0 there and are falsely listed. Multi-match (legitimate under aboutPage's six same-key roots) is also flagged even though the colour still paints.

**Design:**
- Extract a pure classifier (new module beside `edit-overlay.tsx`, unit-testable):
  - Parse the selector's first segment `^\[data-sx-(block|c)="…"\]` (minted selectors always start with one — `buildSelector` anchors on `data-sx-c` or walks to the `data-sx-block` root).
  - First segment matches **0** elements on this page → **`off-page`** — the element's whole scope isn't here; unauditable, **not** reported.
  - First segment present, full selector matches **0** → **`broken`** (reported).
  - Matches ≥ 1 → **`ok`** — it still paints; multi-match is no longer treated as broken (multi-root blocks make it legitimate; per approved design).
  - Unparseable selector → `broken` (as today).
- `auditSelectors` handler replies with only the `broken` list (protocol unchanged — admin needs no bridge changes).
- Admin copy (`color-panel.tsx:568-570`): clarify to "Phần tử gắn màu này không còn trên **trang này**…". "Xoá" behaviour unchanged (report, never auto-remove — existing policy). Genuinely orphaned selectors from past redesigns now surface only when previewing *their* page, where the user can delete them.
- Tests: classifier unit tests — {absent root + 0 matches → off-page}, {present root + 0 → broken}, {1 → ok}, {3 → ok}, {garbage → broken}.

## Item 7 — Floating buttons: 3× + pulse + hover labels

**Current:** `.sx-float-btn` = 3.25rem circle (`globals.css:1494-1519`), hover = scale(1.05), no animation. Hrefs resolved from `floatingButtons.callHref/zaloHref` with `businessContact` fallback (`floating-contact.links.ts`).

**Design:**
- **Size:** desktop `5.625rem` (≈90px — **×3 AREA**, i.e. diameter × √3, per the user's clarification that "gấp 3" meant area not diameter); `@media (max-width: 767px)` → `4rem` (64px, ~1.5× area). Icon/text scale proportionally (call SVG sized in %; Zalo wordmark font-size 1.4rem desktop / 1rem mobile). Container offsets/gap adjusted so the stack clears the viewport edge. (Original build used `9.75rem`/`4.875rem` = ×3 diameter = ×9 area — corrected in 54b4ffa.)
- **Pulse ("nhấp nháy"):** CSS `@keyframes` — an expanding, fading box-shadow ring + gentle scale breathing, infinite, slightly de-synced between the two buttons; **disabled** inside the existing `prefers-reduced-motion` block.
- **Hover labels:** each button wraps in `.sx-float-item` (relative); pill `.sx-float-label` sits at `right: calc(100% + 0.75rem)`, vertically centred — hidden (`opacity:0`, small translateX, `pointer-events:none`), revealed on `:hover`/`:focus-within`. Hidden entirely on mobile (`display:none` ≤767px — tap acts immediately, no hover concept). Pure CSS; `floating-contact.tsx` stays a server component.
- **Label text derives from the configured links** (never hardcoded numbers): new helper in `floating-contact.links.ts` — `displayNumber(href)`: `tel:+84982633377` → `0982633377`; `https://zalo.me/0979700072` → `0979700072` (`84…`→`0…` normalisation consistent with `zaloHref()`); returns `null` for non-numeric targets (Zalo OA/group links). Labels: `Chat zalo <số>` / `Hotline <số>`; when `null` → static fallbacks "Chat Zalo" / "Gọi ngay" (vi) · "Zalo chat" / "Call now" (en) — component constants, no schema copy (derived-by-design, YAGNI on more config).
- Tests: extend `floating-contact.links.test.mjs` with `displayNumber` cases (tel local, tel +84, zalo.me digits, zalo.me/84…, OA link, garbage).

## Item 8 — About "Vì sao các thương hiệu chọn chúng tôi": video half + 2×2

**Current:** the video+4-USP block lives on **/about** (`features-full.tsx`; the homepage features block is the video-less USP bar — untouched by this item). Layout = `.sx-features-row5`, a flat 5-equal-column grid; video box fixed `aspect-ratio: 4/5` (`globals.css:1524-1548`).

**Design:**
- `.sx-features-row5` (name kept — no class renames) becomes a **2-equal-column** grid at desktop: video cell left; the 4 criteria cells wrap in a new `.sx-features-quad` container right — itself `grid-template-columns: repeat(2, 1fr)`, row/column gap ≈ `2rem 1.5rem`, criteria vertically distributed.
- Video box: drop the fixed 4/5 aspect at desktop — `height: 100%` with a `min-height` (~24rem) so it fills the half and matches the quad's height (`align-items: stretch` on the row); caption (`content_image-features`) stays beneath the media box inside the cell.
- Breakpoints: ≤991px — one column: video full-width (return to a determinate aspect, ~16/10), quad 2×2 below; ≤479px — quad collapses to 1 column.
- JSX change is additive (one wrapper div). **Disclosed risk:** wrapping the criteria cells changes their structural DOM paths, so any *positional* per-element overrides previously minted on them will surface in the (now page-aware) audit on /about — visible and deletable, consistent with existing drift policy.

## Item 9 — Navigation logo ×2

`globals.css`: `.signex-logo-nav` and `.signex-logo-nav-img` `height: 1.85rem → 3.7rem` (both the CSS-masked default and the uploaded-image variant keep `width:auto`/aspect). Verify the navbar bar height/padding and the mobile menu at the new size; adjust `.brand_navbar` spacing minimally if needed (no template-class renames). Applies site-wide (one navbar component).

## Data flow & back-compat

Published `Release.snapshot` (Postgres) → shared zod validation → `resolveForLang` (`content.ts`) → CSS vars / inline styles / dict. All schema additions are optional/defaulted ⇒ the live published snapshot, existing Themes (named snapshots), and the admin draft stay valid with zero migration (zod backfills at `ReleaseSnapshotSchema.parse` time); new capabilities activate only when configured. The DB-empty fallback `initial-snapshot.ts` is the one exception: it is consumed *unparsed* under `satisfies ReleaseSnapshot`, so the single new **defaulted** field (`hero.showQuoteForm`) gets a one-line addition there; the optional fields (`formLabelColor`, the three overlays) need none. No importer edits (the importer output is re-validated through zod, which applies the default). Catalog (`Catalog.snapshot` singleton) is untouched by schema changes (items 4/5 touch only its *rendering*).

## Error handling & edge cases

- Empty/absent values are always the current look: transparent overlay when unset, default label colour when `formLabelColor` unset, glass panel when no panel override, asterisks exactly on name/email/phone by default.
- `showQuoteForm: false` — hero media/typography layout must hold without the form column (check both breakpoints).
- Required `upload`/`standard`/`message`: native `required` on file/select/textarea; the API already accepts submissions without them, so this is client-side-only enforcement — server unchanged.
- `displayNumber` garbage-in → `null` → generic label (never renders a broken number).
- Overlay opacity 0 or colour with alpha 00 → valid config, renders fully transparent (user's explicit choice, not stripped).
- Reduced-motion users: no pulse, no hover-scale (existing media block extended).
- Audit: selectors not starting with a `data-sx-` segment (shouldn't exist, defensive) fall back to today's `!== 1` rule.

## Testing

- **shared:** schema tests for the new hero/productsHeader fields + `HexA` acceptance; block-count assertions unchanged (13 — no new block); palette-template test binds `btnPrimaryHoverText` to the real template var.
- **web:** unit tests — `displayNumber`, audit classifier; existing `floating-contact.links.test.mjs` still green. `cd apps/web && node …/tsc --noEmit`.
- **admin:** zodform `color` kind derivation test; blocks tests unchanged. tsc likewise.
- **builds:** `npm run build -w @signex/shared` after schema edits; `npm run build` (turbo) at the end.
- **Manual (editor):** hover rows re-theme CTAs site-wide; all 10 labels clickable + colourable; uniform colour + per-label override precedence; panel bg + alpha; hide-form toggle; per-area overlays edit like the banner; audit on home no longer lists aboutPage selectors, audit on /about lists real orphans only.
- **Manual (public):** asterisks follow `required` config; hidden form shows full banner; float buttons 3×/pulse/labels (desktop) and 1.5×/no-labels (mobile); category cards desc-free; detail desc shows/hides; /about split layout at 3 breakpoints; logo ×2 without navbar breakage.

## Out of scope

Per-element hover colours; secondary/tertiary hover tokens; per-category/per-image overlays; overlay in the zoom lightbox; uniform label colour for the contact form; auto-cleanup or migration of orphaned override selectors; homepage USP-bar layout changes; server-side validation of newly-required fields.
