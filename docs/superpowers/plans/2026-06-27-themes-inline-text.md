# Plan 4 of 4 — Inline `contentEditable` text editing on the unified-editor canvas

**Date:** 2026-06-27
**Branch:** `feat/themes-model`
**Spec:** `docs/superpowers/specs/2026-06-26-themes-model-design.md` (§ "Unified Editor" → "Inline editing on canvas", "Inline scope (v1)", "Five mandatory gates", + "Markup-delta gate (MAJOR)")
**Depends on:** Plans 1–3 (themes backend, `/themes` admin, unified editor `/editor/[themeId]` with structured panel text editing + media hotspot/live-swap + theme-scoped preview) — all DONE on this branch.

---

## Goal

Add **inline text editing directly on the preview canvas**: click a visible text leaf in the
`/preview` iframe → it becomes `contentEditable` → edits commit through the existing postMessage
bridge into the same client-held `pending` Map → one batched **Save draft**. Inline editing is a
**progressive enhancement layered on top of Plan 3's panel** — every in-scope leaf is *already*
editable via the right-hand context panel; inline never becomes the only path, and any leaf that
can't pass the render gate stays panel-only.

To make individual leaves clickable/editable we wrap each in an **unconditional stamped `<span>`**
in the faithful Webflow-clone web components. That is a markup change to the byte-faithful public
site, so it is gated by a **zero-render-change audit** applied **per leaf**.

## Architecture / data flow

```
 ┌─────────────── admin /editor/[themeId] (editor-shell.tsx) ───────────────┐
 │  pending: Map<BlockKey, blockData>   selection {blockKey,fieldPath,locale} │
 │  langRef (live locale)               baseRef (last server draft)           │
 └───────────────▲───────────────────────────────────────────┬──────────────┘
                 │ postMessage {source:"signex-editor"}        │
   web→admin: textEdit{field,value}, highlight{field}, ready   │ admin→web:
              (origin-checked)                                  │ applyEdits[{…,kind:"text",text}]
                                                                │ highlight{field}, refresh
 ┌──────────────┴────────────────── web /preview iframe ───────▼──────────────┐
 │ edit-overlay.tsx  (runs INSIDE the cross-origin iframe)                      │
 │   • media: floating fixed-hotspot layer (Plan 3) — scan [kind=image|video]  │
 │   • text (NEW): in-place contentEditable on [kind=text] spans               │
 │ section components stamp each in-scope leaf: <span {...editText(...)}>…</span>│
 └─────────────────────────────────────────────────────────────────────────────┘
```

- **No new persistence path.** A committed inline edit is just a `pending.set("hero.titleTop.vi",
  value)` — identical to a panel edit — flowing through the existing `save-draft` batch (Plan 3).
- **The span is unconditional.** `editText(editable,…)` returns `{}` for `editable=false` (public),
  so public and preview both render `<span>text</span>`; only the `data-edit-*` hooks are
  conditional. Public == preview, no hydration split → the render gate compares HEAD (no span) vs
  working tree (span) directly.
- The overlay mutates **only the span's inner text**; IX2/reveal/parallax wrapper markup is never
  touched, so Webflow animation bindings (`data-w-id`) stay intact.

## Tech stack

Web = Next.js 16 (apps/web, port 3062) — **read `node_modules/next/dist/docs/` before any
unfamiliar API** (per `apps/web/AGENTS.md`; the section components are server components, the overlay
is a `"use client"` island). Admin = Next.js 16 (apps/admin). Browser APIs used by the overlay:
`document.caretRangeFromPoint`, `Selection`/`Range`, `contentEditable`, `CompositionEvent`,
`ResizeObserver`/`IntersectionObserver`, Lenis (`window.__lenis`), GSAP `ScrollTrigger`.

## Global constraints (binding)

- **Commit trailer** on every commit:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01W43GcnR1BXH9qm8TLt4DJ6
  ```
- **Per-task gate:** `cd apps/web && npx tsc --noEmit` (admin tasks also `cd apps/admin && npx tsc
  --noEmit`); `next build` for both at integration (Task 9). The **markup-delta tasks (1, 3a–3e)
  ALSO gate on the CSS-grep + computed-style invariant + screenshot diff being clean** — code does
  not ship for a leaf whose span fails.
- **postMessage protocol** — both directions `{source:"signex-editor", ...}`, **origin-checked**.
  Existing: `edit` / `ready` / `refresh` / `applyEdits` (Plan 3). **New this plan:**
  - `textEdit` *(web→admin)* — `{type:"textEdit", field, value}` — a committed inline text edit.
  - `highlight` *(BOTH directions)* — `{type:"highlight", field}` — panel-field focus flashes the
    canvas element; a canvas text-leaf focus flashes/selects the panel field. (`field` = snapshot
    path `"blockKey.path"`, locale-agnostic.)
  - `applyEdits` gains a `kind:"text"` edit shape — `{field, kind:"text", text}` — so the admin can
    re-apply unsaved pending **text** after an iframe (re)load via the existing `ready` handshake.
- **Inline scope is gated INDIVIDUALLY.** A leaf ships inline **only** if its span passes
  zero-render-change. Otherwise it is removed from inline scope (revert its span) and stays
  panel-only. The public faithful-clone appearance MUST NOT change. **This is the load-bearing
  constraint of the whole plan.**
- **Max-length is client-side UX only** — no schema `.max()` churn (spec confirms).
- Do **NOT** plan the whole-branch review or finishing-a-development-branch — the controller runs
  those after Plan 4.

---

## Inline scope (v1) — confirmed against the real components

Each leaf's `data-edit-field` is the **snapshot block path** (what the panel + `setPath` expect),
**not** the resolved `SiteContent` view name (e.g. the accent renders `dict.x.titleAccent` but its
field is `x.title.accent`; hero is flat `hero.titleTop`). Two-tone titles = **two spans**: the
lead/bare portion gets a **new** `<span>`; the accent already renders as `<span className="tone-medium">`
so we **stamp that existing span** (no extra wrapper). Single-line for all v1 leaves (no component
preserves `\n` for these); `multiline` stays unused but supported by the helper.

| Surface / component | Leaf → `data-edit-field` | Render container (verified) | Verdict |
|---|---|---|---|
| Home / `home/hero.tsx` | `hero.titleTop` | bare text in `<h1 class="heading-style-h0">` before `<br>` → **new span** | INCLUDE |
| | `hero.titleBottom` | existing `<span class="tone-medium">` → **stamp** | INCLUDE |
| | `hero.subtitle` | bare text in `<p class="margin-0 text-size-large">` → new span | INCLUDE |
| Home / `home/features.tsx` | `features.eyebrow` | `<div class="label-small">` in `.master_label` → new span | INCLUDE |
| | `features.title.lead` | bare text in `<h2>` before `<br>` → new span | INCLUDE |
| | `features.title.accent` | existing `.tone-medium` span → stamp | INCLUDE |
| | `features.cta.label` | `<div class="text-button">` in CTA `<a href="#quote-form">` → new span | INCLUDE |
| Home / `home/home-about.tsx` (`about`) | `about.eyebrow` · `about.title.lead` (new) · `about.title.accent` (stamp) · `about.body` (new span in `<p class="tone-medium">`) | `.headline_home-about` reveal wrapper | INCLUDE |
| Home / `home/product-categories.tsx` (`productsHeader`) | `productsHeader.eyebrow` · `productsHeader.title.lead` (new) · `productsHeader.title.accent` (stamp) · `productsHeader.body` (new) | `.headline_home-about` reveal wrapper | INCLUDE |
| Contact / **`app/[lang]/contact/page.tsx` AND `app/preview/[lang]/contact/page.tsx`** (inlined, duplicated — wrap **both**) | `contactPage.hero.title.lead` (new) · `contactPage.hero.title.accent` (stamp) · `contactPage.hero.subtitle` (new) | `.headline_contact-c` reveal wrapper | INCLUDE |
| About / `about/about-sections.tsx` (shared, wrap once) | per section header: eyebrow · title.lead (new) · title.accent (stamp) · body (new, single `<p>`) for `aboutPage.hero` (subtitle), `aboutPage.testimonial` (header trio only), `aboutPage.intro`, `aboutPage.capability`, `aboutPage.process`, `aboutPage.timeline` | `.headline_home-c` / `.headline_testimonials-v2` / `.headline_home-about` reveal wrappers (timeline header is **above** the `position:sticky` progress line, not inside it) | INCLUDE |
| Global / `navbar.tsx` | `nav.links.<i>.label` (new span in each `<a class="link_nav"> > <div>`) · `nav.cta.label` (new span in `.text-button`) | nav menu / CTA | INCLUDE |
| Global / `footer.tsx` | `footer.contactHeading` · `footer.quickHeading` (new spans in `.label-large`) · `footer.links.<i>.label` (new span in `<a class="link_footer">`) | footer columns | INCLUDE |
| 404 / **new preview-only** `not-found-preview.tsx` | `notFound.title.lead` (new) · `notFound.title.accent` (stamp) · `notFound.body` (new) · `notFound.cta.label` (new) · `notFound.image` (media stamp) | `.headline_404` | INCLUDE (preview surface only — see Task 3e) |

**EXCLUDED (stay panel-only) — and why:**

- **Array-item / tile text** (deferred per spec): `features.featured.{title,desc}`, `features.cards[].{title,desc}`, `features.video{Title,Text}`; `productsHeader` card `tag/title/stat numbers/statLabels`; `about.mission/vision/values.*`; `aboutPage.testimonial.body` (string[]), `aboutPage.{intro.* arrays}`, `capability.groups[]`/`closing[]`, `process.steps[]`, `timeline.intro[]`/`milestones[]`, `aboutPage.approach[]`. These render inside `.map()` arrays and/or parallax tiles.
- **Inside parallax / sliders:** product-category cards (`is-parallax` image + card hover + array), the testimonial **slider** body (`w-slider`), all `image_cover is-parallax` zones (already media-stamped, not text).
- **Derived / template-string leaves:** `footer.brand` (`"<brand> – Manufacturing Brand Identity"` template), footer contact tuples (`Email:/Tel:/Zalo:/Tax:/Office:/Factory:` — business-contact derived), contact-card lines. Not single LocalizedText leaves → panel-only.
- **`[count-up]` / `[stagger-text]`:** grep confirms **no markup element carries `count-up=` or `stagger-text`** (the `[count-up]` selector in `webflow-runtime.tsx initCountUp()` currently matches nothing; `stagger-text` appears only in type decls). So no in-scope leaf is a count-up/stagger trigger — the exclusion is satisfied vacuously, but the gate still rejects any future such leaf.

**Where the exclude-list lives (documentary):** the canonical INCLUDE/EXCLUDE list is a header
doc-block in `apps/web/app/lib/edit-attrs.ts` (next to `editText`). A leaf is "excluded" simply by
**not** stamping its span (it keeps Plan 3's panel editing via `deriveFields`). If a leaf fails the
gate mid-implementation, move it from INCLUDE→EXCLUDE in that doc-block and revert its span.

---

## The markup-delta gate (definition + harness)

### What "zero render change" means here

It does **NOT** mean identical HTML (adding a `<span>` changes the HTML string — that's the point).
It means the **rendered result is unchanged**: identical pixels and identical box geometry for the
wrapped leaf and everything around it, at every breakpoint, on every surface where the component
renders. An inline `<span>` with no CSS box (`display:inline`, zero margin/padding/border) wrapping
the same text node is layout-neutral **unless** a stylesheet rule keys off DOM structure/position
that the new element perturbs.

### The 3-layer harness (the executor runs all three per wrapped surface)

**Layer A — static CSS-grep gate (fast, deterministic).** Grep **both** stylesheets —
`apps/web/app/globals.css` (scoped signex overrides) and
`apps/web/public/assets/css/caladan-template.shared.28e174924.css` (Caladan base) — for selectors an
inserted inline span could perturb, then confirm **none of the matches apply to a wrapped leaf's
ancestor/position**:

```bash
cd apps/web
CAL=public/assets/css/caladan-template.shared.28e174924.css
GLB=app/globals.css
# 1) direct-child / adjacency / general-sibling combinators
grep -nE '>[^;{}]*\{|\+[^;{}]*\{|~[^;{}]*\{' "$GLB" "$CAL"
# 2) positional pseudo-classes (a wrapper changes child indices / first-of-type)
grep -nE ':(first|last|only|nth)-(child|of-type)' "$GLB" "$CAL"
# 3) inline-targeting + typographic pseudo-elements an inline box can break
grep -nE '(> *span|span *\+|\+ *span|> *br|br *\+|\+ *br|::first-line|::first-letter)' "$GLB" "$CAL"
# 4) white-space rules near the wrapped leaf's container classes
grep -nE 'white-space' "$GLB" "$CAL"
```

PASS = every hit is provably irrelevant to a wrapped leaf. Known-irrelevant baseline (from this
audit): `.hero-quote_bar > .input_wrap` (form bar, not a text leaf), `code > span` (code blocks),
`.timeline_row:nth-child(even)` (timeline rows, not a wrapped leaf), `.section_hero-contact-c
.card_contact-c:last-child` (contact cards, not wrapped), `white-space:nowrap` on form/heading-column
classes (none is a span-wrapped leaf). The Caladan base has **no** `h1 > *` / `:first-child` on a
heading / `+ br` rule, and `.tone-medium` is styled **by class only** — so stamping the existing
`.tone-medium` accent span and wrapping bare lead text are both safe. Any NEW hit that lands on a
wrapped leaf's container → that leaf FAILS → exclude it.

**Layer B — computed-style invariant (automated, in the preview iframe).** For every stamped span,
assert it contributes no box and exactly wraps its text (run via the claude-in-chrome
`javascript_tool` on the live `/preview` page, or paste into the iframe devtools):

```js
// PASS when this logs []  (every text span is a zero-box inline wrapper)
[...document.querySelectorAll('[data-edit-kind="text"]')].filter(el => {
  const s = getComputedStyle(el);
  const box = ['Top','Right','Bottom','Left'].some(d =>
    parseFloat(s['margin'+d]) || parseFloat(s['padding'+d]) || parseFloat(s['border'+d+'Width']));
  return s.display !== 'inline' || box;
}).map(el => el.getAttribute('data-edit-field'));
```

**Layer C — visual-regression screenshot diff (authoritative).** Because the span is unconditional,
the baseline is the current commit (no span) and the candidate is the working tree (span), rendered
at the **same** snapshot. Procedure (claude-in-chrome MCP; both apps already run on 3062/3061):
1. **Baseline (before editing the component):** for each affected surface — `/vi`, `/vi/about`,
   `/vi/contact`, and the 404 preview — load the **public** route (`editable=false`, so the span
   path is exercised) at **desktop 1440px** and **mobile 430px**; capture full-page screenshots to
   `…/scratchpad/markup-gate/baseline/<surface>-<w>.png`.
2. Apply the span wraps for that surface.
3. **Candidate:** recapture the identical set to `…/after/<surface>-<w>.png`.
4. Diff each pair (pixel-identical required; sub-AA jitter from the same build/machine should be
   zero). If a non-zero region overlaps a wrapped leaf → that leaf FAILS → exclude + revert; if it
   overlaps unrelated content, investigate before proceeding.

There is **no Playwright/snapshot infra in this repo** (only `tsc` / `next build` /
`test/acceptance.sh`); Layers A+B are the cheap deterministic guards and Layer C (browser capture +
visual compare) is the human-authoritative backstop. The capture pngs live in the scratchpad (not
committed).

---

## File structure (touched / created)

```
apps/web/app/lib/edit-attrs.ts                       (EDIT)  + "text" kind, editText(), EditTextOpts, scope doc-block
apps/web/app/components/editor/edit-overlay.tsx      (EDIT)  + text path, applyEdits kind:"text", highlight, observers
apps/web/app/components/home/hero.tsx                (EDIT)  wrap 3 leaves
apps/web/app/components/home/features.tsx            (EDIT)  wrap 4 leaves
apps/web/app/components/home/home-about.tsx          (EDIT)  wrap 4 leaves (about block)
apps/web/app/components/home/product-categories.tsx  (EDIT)  wrap 4 leaves (productsHeader block)
apps/web/app/components/about/about-sections.tsx     (EDIT)  wrap section-header leaves
apps/web/app/components/navbar.tsx                   (EDIT)  wrap nav link labels + cta
apps/web/app/components/footer.tsx                   (EDIT)  wrap headings + link labels
apps/web/app/[lang]/contact/page.tsx                 (EDIT)  wrap contactPage.hero leaves (public copy)
apps/web/app/preview/[lang]/contact/page.tsx         (EDIT)  wrap contactPage.hero leaves (preview copy)
apps/web/app/components/not-found-preview.tsx        (NEW)   server, dict-driven 404 with editable spans + notFound.image
apps/web/app/preview/[lang]/404/page.tsx             (NEW)   token-gated preview surface rendering NotFoundPreview

apps/admin/app/(dash)/editor/editor-shell.tsx        (EDIT)  inbound textEdit→pending; langRef; highlight both ways; ready re-applies text
apps/admin/app/(dash)/editor/context-panel.tsx       (EDIT)  onFieldFocus → highlight; flash target by field
apps/admin/app/(dash)/editor/_fields/field-editor.tsx(EDIT)  surface onFieldFocus + accept a flash ref/field id
apps/admin/app/(dash)/editor/_lib/blocks.ts          (EDIT)  SURFACE_PATH_BY_BLOCK.notFound = "/404"
```

---

## Tasks

> Task 1 is a **hard blocker**: it builds + proves the gate on representative leaves. Tasks 3a–3e
> (per-surface wraps) and Task 4+ depend on it. Do them in order.

---

### Task 1 — Markup-delta gate harness + prove it on hero titleTop/titleBottom (HARD BLOCKER)

**Goal:** stand up the gate procedure and prove zero-render-change on the two representative leaves
before generalizing. No overlay behavior yet — just the unconditional span + the gate.

**Files:** `apps/web/app/lib/edit-attrs.ts` (temporary minimal `editText` — finalized in Task 2),
`apps/web/app/components/home/hero.tsx`.

**Steps:**
1. Capture **baseline** screenshots first (Layer C step 1) for `/vi` at 1440 + 430 →
   `…/scratchpad/markup-gate/baseline/home-{1440,430}.png`. (Web dev server on 3062; if not running,
   `cd apps/web && npm run dev` in the background.)
2. Add a minimal helper to `edit-attrs.ts` (full version in Task 2):
   ```ts
   export function editText(editable: boolean | undefined, field: string): EditAttrs {
     return editable ? { "data-edit-field": field, "data-edit-kind": "text" } : {};
   }
   ```
   (Widen `EditMediaKind`/`EditAttrs` to allow `"text"` — Task 2 formalizes.)
3. In `hero.tsx` wrap the two title leaves **unconditionally**; stamp the existing accent span:
   ```tsx
   <h1 className="heading-style-h0">
     <span {...editText(editable, "hero.titleTop")}>{t.titleTop}</span>
     <br />
     <span className="tone-medium" {...editText(editable, "hero.titleBottom")}>
       {t.titleBottom}
     </span>
   </h1>
   ```
   (Subtitle is wrapped in Task 3a — keep Task 1 to the two representative leaves.)
4. Run the gate:
   - **Layer A** — run the four greps; confirm no hit lands on `<h1 class="heading-style-h0">`, its
     children, or `.tone-medium`. (Expected: clean — base CSS has no `h1 > *` / heading
     `:first-child` / `+ br`.)
   - **Layer B** — load `/preview/vi?...&editable=1`, run the computed-style snippet; expect `[]`.
   - **Layer C** — recapture `/vi` (public, span present) → diff vs baseline; require zero pixel
     delta over the hero headline at both widths.
5. If any layer fails for a leaf, **revert that span** and record it EXCLUDED in the `edit-attrs.ts`
   doc-block; otherwise proceed.

**Verify:** `cd apps/web && npx tsc --noEmit`; Layers A/B/C clean for `hero.titleTop` +
`hero.titleBottom`.
**Commit:** `feat(web): markup-delta gate + span-wrap hero title (zero-render-change proven)`.

---

### Task 2 — `edit-attrs.ts`: `"text"` kind + `EditTextOpts` + scope doc-block

**Files:** `apps/web/app/lib/edit-attrs.ts`.

**Interfaces:**
```ts
export type EditKind = "image" | "video" | "text";
export interface EditTextOpts { maxLength?: number; multiline?: boolean; required?: boolean; }
export interface EditAttrs {
  "data-edit-field"?: string;
  "data-edit-kind"?: EditKind;
  "data-edit-maxlength"?: number;
  "data-edit-multiline"?: "true";
  "data-edit-required"?: "true";
}
export function editText(
  editable: boolean | undefined, field: string, opts?: EditTextOpts,
): EditAttrs;
```

**Steps:**
1. Keep the existing media `editAttrs(editable, field, kind)` exactly (rename its `EditMediaKind`
   usages to the widened `EditKind`; don't break callers — keep an `EditMediaKind = "image" |
   "video"` alias).
2. Implement `editText`: return `{}` when `!editable`; else
   `{ "data-edit-field": field, "data-edit-kind": "text", ...(opts?.maxLength!=null && {"data-edit-maxlength":opts.maxLength}), ...(opts?.multiline && {"data-edit-multiline":"true"}), ...(opts?.required && {"data-edit-required":"true"}) }`.
3. Add the **scope doc-block** (the canonical INCLUDE/EXCLUDE list from this plan's "Inline scope"
   table + the "exclude = don't stamp; failed-gate leaves move here" rule).
4. Note in the header: **the `<span>` itself must be rendered unconditionally by the component; this
   helper only adds the conditional `data-edit-*` hooks** (mirrors the media-`editAttrs` contract).

**Verify:** `cd apps/web && npx tsc --noEmit`.
**Commit:** `feat(web): edit-attrs text kind + editText() helper + inline-scope doc`.

---

### Tasks 3a–3e — Wrap the in-scope inline leaves (each surface re-runs the gate)

> One commit per surface; each surface re-runs **all three gate layers** for its routes/widths.
> Use `editText(editable, "<snapshot.path>")` (add `{maxLength}` where a sensible UX cap exists, e.g.
> headings ~80, subtitles ~200 — client-side only). Bare lead → **new** span; accent → **stamp the
> existing `.tone-medium` span**.

**Task 3a — Home (hero subtitle + features + about + productsHeader).**
Files: `home/hero.tsx` (add `hero.subtitle`), `home/features.tsx` (eyebrow, title.lead/new,
title.accent/stamp, cta.label), `home/home-about.tsx` (`about.*` 4 leaves), `home/product-categories.tsx`
(`productsHeader.*` 4 leaves). Surface: `/vi`. Gate at 1440 + 430. **Do not** stamp the
product-category cards or the MVV grid (excluded).

**Task 3b — Contact hero (BOTH copies).**
Files: `app/[lang]/contact/page.tsx` **and** `app/preview/[lang]/contact/page.tsx` — wrap
`contactPage.hero.title.lead` (new), `.title.accent` (stamp), `.subtitle` (new) **identically in
both** (they are duplicated inline markup; the gate's `/vi/contact` diff catches divergence).
Surface: `/vi/contact`.

**Task 3c — About page section headers.**
File: `about/about-sections.tsx` (shared — wrap once). For `aboutPage.hero` (title.lead/new,
title.accent/stamp, subtitle/new), `aboutPage.testimonial` (eyebrow + title trio only — body is an
array, excluded), `aboutPage.intro` / `capability` / `process` / `timeline` (eyebrow + title.lead/new
+ title.accent/stamp + single `body`/new). Leave all `.map()` arrays + the slider body + timeline
milestones untouched. Surface: `/vi/about`. **Note:** the timeline header sits above the
`position:sticky` progress line — confirm Layer C shows the sticky line unaffected.

**Task 3d — Global nav + footer.**
Files: `navbar.tsx` (each `nav.links.<i>.label` — wrap the `<div>`'s text in a span; `nav.cta.label`
in `.text-button`), `footer.tsx` (`footer.contactHeading`, `footer.quickHeading` in `.label-large`;
each `footer.links.<i>.label` in `<a class="link_footer">`). **Array-index field strings**
(`nav.links.0.label`) — verify `setPath` (admin) descends a pre-existing array correctly (it does:
`structuredClone` preserves the array, numeric key indexes it; Task 6 confirms). Surface: nav+footer
appear on every page — gate on `/vi` (and spot-check `/vi/about`).

**Task 3e — `notFound.image` stamp + 404 reachable in preview.**
The public 404 (`not-found-view.tsx`) is a `"use client"` component with **hard-coded copy** (it
cannot consume server-only `SiteContent` — Task 61b) and is **not** a faithful place to inline-edit.
So expose the `notFound` block in **preview** via a new server surface:
- **NEW** `app/components/not-found-preview.tsx` — a server component taking `{ dict, editable }`
  that renders the SAME `.utility_page-wrap._404` markup as `not-found-view.tsx` but driven by
  `dict.notFound` (title.lead/new span, title.accent/stamp, body/new, cta.label/new) and stamps the
  `<img>` with `editAttrs(editable, "notFound.image", "image")` (closes the media gap; `src`
  falls back to the literal pexels still when `imageUrl` is "").
- **NEW** `app/preview/[lang]/404/page.tsx` — token-gated Suspense surface (mirror the home preview
  page: `connection()`, secret check, `getPreviewSnapshot(locale, theme)`), rendering
  `Navbar`/`Footer` editable + `<NotFoundPreview dict={dict} editable />` + `<EditOverlay/>`.
- Set `SURFACE_PATH_BY_BLOCK.notFound = "/404"` in admin `_lib/blocks.ts` so selecting the 404 block
  navigates the iframe there.
- **Known divergence to flag (controller open question):** edits to `notFound.*` persist to the
  theme but the **public** 404 stays hard-coded (pre-existing Task 61b constraint). This task makes
  the block inline-editable in preview + closes the image-stamp gap; wiring the public 404 to the
  snapshot is out of v1 scope.
Surface: `/preview/vi/404?...&editable=1` — gate Layers A/B on it (Layer C baseline is the existing
preview 404 once reachable).

**Verify (each 3x):** `cd apps/web && npx tsc --noEmit`; gate Layers A+B+C clean for that surface.
**Commit (each):** `feat(web): inline-stamp <surface> text leaves (gate clean)` /
`feat(web): preview 404 surface + notFound.image stamp`.

---

### Task 4 — Overlay text path: contentEditable + caret + commit/revert + paste

**File:** `apps/web/app/components/editor/edit-overlay.tsx`.

**Goal:** generalize the overlay (keep the Plan-3 media hotspot layer untouched) to make
`[data-edit-kind="text"]` spans inline-editable in place — no floating hotspot for text.

**Steps:**
1. **Styles (extend the injected `<style>`):** a hover affordance that does NOT reflow — use
   `outline`, never `border`:
   ```css
   [data-edit-kind="text"] { cursor: text; }
   [data-edit-kind="text"]:hover { outline: 2px solid #4956e3; outline-offset: 2px; }
   [data-edit-kind="text"][contenteditable="true"] { outline: 2px solid #4956e3; outline-offset: 2px; background: rgba(73,86,227,.06); }
   .sx-flash { animation: sx-flash .9s ease; }
   @keyframes sx-flash { 0%,100%{outline-color:transparent} 25%{outline:2px solid #4956e3; outline-offset:2px} }
   ```
2. **Scan:** `const textEls = Array.from(document.querySelectorAll<HTMLElement>('[data-edit-kind="text"]'))`.
   Keep the media scan exactly as-is (`[data-edit-kind="image"],[data-edit-kind="video"]`) — text
   gets **no** hotspot (verifies Plan-3 gate (a)).
3. **Click → enter edit:** delegate a capture-phase `click` listener on `document` that finds
   `target.closest('[data-edit-kind="text"]')`. On hit (and not already editing):
   ```ts
   e.preventDefault(); e.stopPropagation();
   beginEdit(el, e.clientX, e.clientY);
   ```
   `beginEdit` stores `{ el, field: el.dataset.editField, original: el.textContent ?? "",
   multiline: el.dataset.editMultiline === "true", max: Number(el.dataset.editMaxlength) || 0 }`,
   sets `el.contentEditable = "true"`, `el.focus({ preventScroll: true })` (gate (d) — do NOT let
   focus yank Lenis scroll), then places the caret at the click point:
   ```ts
   const r = (document as any).caretRangeFromPoint?.(x, y);
   if (r) { const sel = getSelection(); sel?.removeAllRanges(); sel?.addRange(r); }
   ```
   Also post `{source:SOURCE, type:"highlight", field}` to the parent (canvas→panel half of Task 7).
4. **Keydown (single vs multi):**
   - `Enter` && `!multiline` && `!e.isComposing` → `preventDefault()` + `commit()`.
   - `Enter` && `multiline` && (`e.metaKey||e.ctrlKey`) → `preventDefault()` + `commit()`.
   - `Escape` → `revert()` (restore `original`, blur without emitting).
5. **Max-length (client-side only):** on `input`, if `max` and `el.textContent.length > max`, trim
   to `max` and restore caret to end (cheap: `el.textContent = el.textContent.slice(0,max)` then
   collapse selection to end). No schema involvement.
6. **Plain-text paste/drop:** `paste`/`drop` listeners on the editing element →
   `e.preventDefault()`; insert `e.clipboardData?.getData("text/plain")` (or
   `e.dataTransfer?.getData("text/plain")`) at the caret via a Range insert (avoid `execCommand`
   where practical; a single `insertText` is acceptable). Guarantees the span never gains child
   markup.
7. **commit():** flatten any stray nodes (`el.textContent = el.textContent ?? ""`), set
   `el.contentEditable = "false"`, clear selection; if `value !== original` →
   `window.parent.postMessage({ source:SOURCE, type:"textEdit", field, value }, "*")`; then run the
   **post-commit reflow nudge** (Task 5c). Leave the new text in the DOM (live preview).
8. **revert():** set `el.textContent = original`, `contentEditable="false"`, blur — no message.
9. **Cleanup:** remove all listeners + the editing state in the effect's teardown.

**Verify:** `cd apps/web && npx tsc --noEmit`; manually (browser) edit hero title in
`/preview/vi?...&editable=1` → text changes in place, Enter commits, Escape reverts, paste strips
formatting.
**Commit:** `feat(web): overlay inline contentEditable text path (caret/commit/revert/paste)`.

---

### Task 5 — The five mandatory gates (wire each, citing the spec)

**File:** `apps/web/app/components/editor/edit-overlay.tsx` (+ confirm Plan-3 bits).

**(a) Hotspot-scan excludes text — VERIFY (done Plan 3).** Confirm the media scan stays
`[data-edit-kind="image"],[data-edit-kind="video"]` so text zones never get an "Edit image" badge.
Add a one-line comment pointing at this gate. (No behavior change — just assert it in code review.)

**(b) `ready` re-apply handshake — extend for text (Plan 3 does media).** The overlay already posts
`{type:"ready"}` on mount; Task 6 makes the admin, on `ready`, re-post **pending text** as
`applyEdits` entries `{field, kind:"text", text}`. Here, extend the overlay's `applyEdits` handler
with a `kind:"text"` branch:
```ts
} else if (ed.kind === "text") {
  const el = document.querySelector<HTMLElement>(`[data-edit-field="${CSS.escape(ed.field)}"]`);
  if (el && typeof ed.text === "string") el.textContent = ed.text;
}
```
This restores unsaved inline edits to the canvas after a `refresh`/locale-surface remount (the iframe
re-renders from the saved draft; pending lives only in the admin).

**(c) Post-commit `ScrollTrigger.refresh()` + resize/scroll nudge.** Text reflow changes element
heights → stale parallax/pin/reveal offsets. After every `commit()` (and after an `applyEdits` text
batch), run inside a `requestAnimationFrame`:
```ts
window.ScrollTrigger?.refresh();
window.dispatchEvent(new Event("resize"));
window.dispatchEvent(new Event("scroll"));
```
(mirrors `webflow-runtime.tsx` step 5). Also nudge the observer-based hotspot repositioner (Task 8).

**(d) `focus({preventScroll:true})` + Lenis caret.** Already in `beginEdit` (Task 4 step 3). Add: if
`window.__lenis` exists, do not call any Lenis scroll on focus; rely on `preventScroll` so entering
edit never jumps the smooth-scroll position. (No `scrollIntoView` on edit-enter.)

**(e) IME `compositionend`-before-blur deferral (Vietnamese Telex/VNI).** Track composition:
`compositionstart` → `composing = true`; `compositionend` → `composing = false` (and, if a blur was
deferred, commit now). On `blur`, if `composing` is true, **defer**:
```ts
el.addEventListener("blur", () => {
  if (composing) { setTimeout(() => { if (!composing) commit(); }, 0); return; }
  commit();
});
```
so the final composed glyph (e.g. `ờ` from `o` + `w` + `f`) is included before commit. Single-line
`Enter` commit must also check `e.isComposing` (Task 4 step 4) so Enter that confirms an IME
candidate does not prematurely commit.

**Verify:** `cd apps/web && npx tsc --noEmit`; manual: edit a hero title with Vietnamese Telex input
→ no lost diacritics; after commit a parallax image below stays glued (no offset drift).
**Commit:** `feat(web): inline-edit five gates (ready-text/ScrollTrigger/focus/Lenis/IME)`.

---

### Task 6 — Admin shell: inbound `textEdit` → pending (locale-appended) + `ready` re-applies text

**File:** `apps/admin/app/(dash)/editor/editor-shell.tsx`.

**Steps:**
1. **`langRef`** — add `const langRef = useRef(lang); langRef.current = lang;` so the once-subscribed
   message listener reads the live locale without re-subscribing (same pattern as
   `mediaPreviewRef`).
2. **Inbound `textEdit`** — in the existing `onMessage` (already origin-checked + `source`-checked),
   add:
   ```ts
   } else if (data.type === "textEdit" && typeof data.field === "string") {
     const [blockKey, ...rest] = data.field.split(".") as [BlockKey, ...string[]];
     const path = `${rest.join(".")}.${langRef.current}`;   // e.g. "titleTop.vi" / "title.accent.vi"
     applyFieldEdit(blockKey, path, String(data.value));
   }
   ```
   `applyFieldEdit` + `setPath` (Plan 3) clone the block, write only the `…<locale>` leaf, and merge
   into `pending` → the **other locale stays untouched**, and the edit rides the **same Save-draft
   batch** (`save-draft {edits:[{key,data}], expectedDraftRevision}`). Dirty dots + status pill
   update for free.
3. **Confirm array-index paths.** `setPath(block,"links.0.label.vi",v)`: `links` already exists as an
   array on the cloned block → descends; `"0"` indexes the array element; writes `.label.vi`.
   `structuredClone` preserves array type. (Add a unit-ish manual check in the verify step.)
4. **`ready` re-applies pending TEXT** — extend the existing `ready` branch (which re-posts media
   `mediaPreviewRef`) to also re-post pending text. Build text entries from `pending` by walking each
   block's leaves that differ from `baseRef`… simpler + sufficient: keep a parallel
   `textPreviewRef: Map<field, value>` updated whenever a `textEdit` arrives (key = full
   locale-less? no — key by `field+locale` is wrong for the canvas which is locale-specific). Since
   the iframe is per-locale (remounts on `lang` change via `key`), store
   `textPreview: Map<field, {value, locale}>` and on `ready` post only entries whose `locale ===
   langRef.current` as `applyEdits` `{field, kind:"text", text:value}`. Clear it on Save/Discard
   alongside `mediaPreview`.
5. Keep `postApplyEdits` reused for text (same message shape, extended `edits[]`).

**Verify:** `cd apps/admin && npx tsc --noEmit`; manual: inline-edit hero title (vi) → status pill
flips to "Unsaved · 1", panel shows the new vi value, en untouched; Save draft → 200, pending
clears; Reload → the edit re-applies if still pending.
**Commit:** `feat(admin): editor-shell inbound textEdit → pending (locale-appended) + ready re-apply text`.

---

### Task 7 — Two-way highlight (panel field ↔ canvas element)

**Files:** `apps/admin/app/(dash)/editor/context-panel.tsx`,
`apps/admin/app/(dash)/editor/_fields/field-editor.tsx`, `editor-shell.tsx`,
`apps/web/app/components/editor/edit-overlay.tsx`.

**panel → canvas:**
1. `FieldEditor`/`ContextPanel` expose `onFieldFocus(fieldName)` fired on a field's `focus`. The
   field's canvas identity is the snapshot path `${blockKey}.${fieldName}` (locale-agnostic — matches
   `data-edit-field`). For two-tone fields the panel edits `title.lead`/`title.accent` separately, so
   the path already lines up.
2. `editor-shell` passes `onFieldFocus = (name) => postHighlight(`${selection.blockKey}.${name}`)`,
   where `postHighlight(field)` posts `{source:SOURCE, type:"highlight", field}` to the iframe
   (`iframeRef.current?.contentWindow?.postMessage(..., webOrigin)`).
3. Overlay inbound: add a `highlight` branch — find `[data-edit-field="${CSS.escape(field)}"]`,
   `scrollIntoView({block:"center", behavior:"smooth"})` (guarded so it doesn't fight Lenis — use
   `behavior:"auto"` if `__lenis` present), and toggle the `.sx-flash` class for ~900ms.

**canvas → panel:**
4. Overlay already posts `{type:"highlight", field}` on text-leaf focus (Task 4 step 3).
5. `editor-shell` inbound `highlight` (web→admin): parse `field` → `blockKey` + `fieldPath`; if the
   block isn't selected, `setSelection({blockKey, fieldPath, locale:lang})` (this also navigates the
   surface via `onSelect`'s logic — refactor `onSelect` to accept an optional `fieldPath`); then
   signal the panel to scroll + flash that field (a `flashField` state the panel consumes via a prop
   → the matching field editor briefly applies a ring + `scrollIntoView`).

**Verify:** `cd apps/admin && npx tsc --noEmit`; manual: focus the hero "Title top" panel field →
the canvas hero title flashes; click the canvas hero title → the panel selects Hero + that field
scrolls into view + flashes.
**Commit:** `feat(editor): two-way highlight panel field ↔ canvas via {type:"highlight"}`.

---

### Task 8 — Observer-based media hotspot positioning (replace always-on rAF)

**File:** `apps/web/app/components/editor/edit-overlay.tsx`.

**Why:** the Plan-3 hotspot layer repositions every frame via an unconditional
`requestAnimationFrame(sync)` loop — wasteful when idle. Replace with event/observer-driven
repositioning, while still tracking Lenis transform-driven motion (Lenis moves content by transform,
emitting **no** native scroll events — the original reason a rAF was used).

**Steps:**
1. Keep the `sync()` rect-mirroring function, but call it on demand, not every frame.
2. Drive `sync()` from:
   - **`window.__lenis.on("scroll", sync)`** when Lenis exists (covers smooth-scroll transform
     motion); fallback `window.addEventListener("scroll", sync, {passive:true})` +
     `addEventListener("wheel", …)` when absent.
   - **`ResizeObserver`** on `document.body` (and on each observed media element) → `sync()` on
     layout/reflow (this also picks up the **post-commit text reflow** from Task 5c).
   - **`IntersectionObserver`** to maintain the set of on-screen media elements (toggle each
     hotspot's `display` instead of recomputing all every frame).
   - A **one-shot `sync()`** on mount/`ready` and inside the Task-5c post-commit nudge
     (call `sync()` directly there too, not only via dispatched events).
3. Coalesce bursts with a single `requestAnimationFrame` guard (`if (!scheduled) { scheduled = true;
   raf(() => { scheduled = false; sync(); }) }`) so multiple triggers in one frame do one layout
   pass. Tear down all observers + the Lenis subscription in cleanup.
4. **Do not** regress media editing: the floating-layer click hit-test + the under-element
   pass-through (Plan 3) stay exactly as-is.

**Verify:** `cd apps/web && npx tsc --noEmit`; manual: scroll the home preview → media hotspots stay
glued during Lenis smooth-scroll; resize the iframe (device toggle) → hotspots reposition; idle →
no per-frame work (spot-check with a `console.count` in `sync`, then remove).
**Commit:** `perf(web): observer-driven media hotspot positioning (drop always-on rAF)`.

---

### Task 9 — Integration build + cleanup

**Files:** repo-wide (web + admin), plus stale-comment sweeps.

**Steps:**
1. **Full builds:** `cd apps/web && npx tsc --noEmit && npx next build`; `cd apps/admin && npx tsc
   --noEmit && npx next build`. Fix any type/build fallout.
2. **End-to-end smoke** (manual, both servers): open `/editor/<themeId>` → inline-edit a leaf on
   each surface (home/about/contact/404) in `vi` → Save draft (200, pending clears) → switch to `en`
   (iframe remounts; the vi edit persisted, en untouched) → Publish → public site reflects it
   (except the known public-404 divergence). Two-way highlight + media hotspots still work.
3. **Cleanup the executor finds:**
   - Remove any dead Plan-3 always-on rAF remnants superseded by Task 8.
   - Update the `/content/[blockKey]` "advanced fallback" note (spec: kept during transition) to
     point at the unified editor as primary; do not delete the route.
   - Reconcile the overlay header comment's postMessage-protocol block with the final protocol
     (add `textEdit`, `highlight` both-ways, `applyEdits kind:"text"`).
   - Remove the temporary `console.count`/debug bits; ensure the `edit-attrs.ts` scope doc-block
     matches what actually shipped (any leaf excluded by the gate is listed EXCLUDED).
4. Re-run the markup-delta **Layer A** grep once more repo-wide to confirm no newly-introduced CSS
   selector conflicts with a shipped span.

**Verify:** both `next build`s green; lint clean (`npm run lint` if used by the branch); smoke pass.
**Commit:** `chore(themes): inline-text integration build + cleanup`.

---

## Self-review

- **Load-bearing constraint honored?** Yes — the span is unconditional (`editText` only toggles
  `data-*`), every wrapped leaf passes a 3-layer gate (CSS-grep + zero-box computed-style +
  screenshot diff), and a failing leaf is reverted to panel-only. Inline is never the sole editor
  for any leaf (Plan 3's panel always covers it).
- **Task 1 is a real blocker** (proves the gate on hero before generalizing); 3a–3e and 4+ depend on
  it; each surface re-runs the gate.
- **Scope fidelity:** the INCLUDE/EXCLUDE table is verified against the actual components — two-tone =
  lead(new span)+accent(stamp existing `.tone-medium`); arrays/tiles/sliders/parallax/derived leaves
  excluded; `count-up`/`stagger` confirmed absent from markup; field strings use **snapshot paths**
  (`features.title.accent`, `hero.titleTop`, `nav.links.<i>.label`) not resolved view names.
- **Five gates** each have a concrete step (a verify, b ready-text re-apply via `applyEdits
  kind:"text"`, c ScrollTrigger.refresh+nudge, d focus preventScroll+Lenis, e IME blur deferral).
- **Protocol** stays minimal: `textEdit` (web→admin), `highlight` (both ways), `applyEdits` extended
  with `kind:"text"` — origin-checked, `{source:"signex-editor"}`.
- **Admin flow** reuses `applyFieldEdit`/`setPath`/`save-draft` unchanged — inline edits are
  indistinguishable from panel edits downstream; locale appended via `langRef`, other locale intact.
- **404:** preview surface added (`/preview/[lang]/404` + `not-found-preview.tsx`) closes the
  `notFound.image` stamp gap and makes the block inline-editable; the public 404 staying hard-coded
  is flagged as a controller open question (pre-existing Task 61b), not silently regressed.

## Open questions (for the controller)

1. **Public 404** still renders hard-coded copy (`not-found-view.tsx` is `"use client"`, can't read
   server `SiteContent`). Inline editing of `notFound.*` works in preview + persists to the theme,
   but the public 404 won't reflect it. Wire-up is out of v1 scope — confirm that's acceptable for
   this branch or schedule a follow-up.
2. **`highlight` used bidirectionally** (one message name, both directions) — confirm that's
   preferred over a distinct `select` message for the canvas→panel half.
3. **Per-leaf `maxLength` values** are UX-only guesses (headings ~80, subtitles ~200) — confirm caps
   or leave uncapped in v1.
</content>
</invoke>
