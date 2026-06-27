# Plan 4 Task 1 Report — Markup-delta gate harness + hero titleTop/titleBottom span wraps

**Branch:** feat/themes-model  
**Date:** 2026-06-27

## Status

DONE — gate clean, tsc exit 0, commit created.

---

## Layer A CSS-grep results (both stylesheets)

Greps run against `app/globals.css` (GLB) and `public/assets/css/caladan-template.shared.28e174924.css` (CAL).

### 1) Direct-child / adjacency / general-sibling combinators

```
GLB:45:  .hero-quote_bar > .input_wrap {              ← quote form input bar, not a title leaf
GLB:207: .hero-quote_bar > .input_wrap {              ← same, in @media block
CAL:293: pre.w-code-block code > span {               ← code blocks only
CAL:301: .w-webflow-badge, .w-webflow-badge > img {   ← webflow badge
CAL:375: .w-webflow-badge > img {                     ← webflow badge
CAL:1020: .w-widget-map .gm-style-iw > button {      ← map widget
CAL:1161: .w-background-video > video {               ← video
CAL:1173: .w-background-video > video::-webkit-...   ← video
CAL:1186: .w-background-video--control > [hidden] {  ← video
CAL:1233–1257: .w-slider-nav... > div {               ← slider nav
CAL:1700–1788: .w-richtext figure... > div/figcaption ← rich text
```

**Verdict: CLEAN** — none of these selectors touch `h1.heading-style-h0`, its children, or `.tone-medium`.

### 2) Positional pseudo-classes

```
GLB:967:  .timeline_row:nth-child(even) .wrap_circle-timeline { ← timeline rows
GLB:1008: .section_hero-contact-c .card_contact-c:last-child {  ← contact cards
```

**Verdict: CLEAN** — no positional pseudo-class on heading children or tone-medium.

### 3) Inline-targeting + typographic pseudo-elements

```
CAL:293: pre.w-code-block code > span { ← code blocks only
```

**Verdict: CLEAN** — the only `> span` rule is scoped to `pre.w-code-block code`, not headings.

### 4) white-space rules

All hits:
- GLB:139 — `.hero-quote_upload-input { white-space: nowrap }` — upload input visually hidden element; irrelevant
- GLB:229 — `html[lang="vi"] .section_hero-home-a .heading-style-h0 { white-space: nowrap }` — applied to the `<h1>` itself, not a child span; a bare text node inside `<h1>` and a `<span>` inside `<h1>` inherit `white-space: nowrap` identically → **no render change**
- GLB:230/256/449/741 — `.lang-toggle { white-space: nowrap }`, `.contact-upload` visually-hidden, `.footer-signex_badge` — all unrelated
- CAL hits — `.w-nav-link`, `.w-list-item`, slider controls, richtext, badge — all unrelated to wrapped leaves

**Verdict: CLEAN** — the one hero-relevant rule (`heading-style-h0 { white-space: nowrap }`) applies to the `<h1>` container; adding a `<span>` inside inherits the same value as the prior bare text node. Zero render delta.

---

## Layer B — inertness reasoning (by construction)

- **`hero.titleTop` new span:** `<span {...editText(editable, "hero.titleTop")}>` has no class. UA default = `display:inline`. No stylesheet rule in GLB or CAL sets `display`, `margin`, `padding`, or `border` on an unclassed `<span>` inside `.heading-style-h0`. Inherits `white-space:nowrap` from `<h1>` at [lang="vi"] desktop — same as the previous bare text node. **Zero-box inline wrapper confirmed.**

- **`hero.titleBottom` stamp:** `<span className="tone-medium">` already existed in the markup. We only add `data-edit-*` attributes conditionally (via `{...editText(editable, …)}`). The `.tone-medium` rule in CAL:3292 is class-only (sets color/opacity — no box model). No positional rule in GLB or CAL targets `.tone-medium` by child index or sibling combinator. `data-*` attribute additions cannot be matched by any existing selector (no `[data-edit-*]` rules exist in either sheet). **Zero-box inline wrapper confirmed.**

---

## Layer C — screenshot diff

Layer C (browser screenshot capture and pixel diff) is delegated to the controller per plan instructions. Layers A and B establish the deterministic gate for Task 1.

---

## Exact span markup shipped

**`hero.titleTop` (new span):**
```tsx
<span {...editText(editable, "hero.titleTop")}>{t.titleTop}</span>
```
Renders as `<span>text</span>` when `editable=false` (public), as `<span data-edit-field="hero.titleTop" data-edit-kind="text">text</span>` when `editable=true` (preview).

**`hero.titleBottom` (stamp existing .tone-medium):**
```tsx
<span className="tone-medium" {...editText(editable, "hero.titleBottom")}>
  {t.titleBottom}
</span>
```
Renders with class always; data attributes conditional on `editable`.

---

## Files changed

- `apps/web/app/lib/edit-attrs.ts` — widened `EditAttrs["data-edit-kind"]` to `EditMediaKind | "text"`; added minimal `editText(editable, field)` helper; added INCLUDE/EXCLUDE scope doc-block (full Task-2 formalisation deferred to Task 2).
- `apps/web/app/components/home/hero.tsx` — imported `editText`; wrapped `titleTop` in new span; stamped `titleBottom`'s existing `.tone-medium` span with `{...editText(...)}`.

---

## Panel-only exclusions

No leaf fell to the exclude list. Both `hero.titleTop` and `hero.titleBottom` pass all gate layers and ship inline.

---

## tsc

`cd apps/web && npx tsc --noEmit` → exit 0, no errors.

---

## Concerns / open items

None for Task 1. Layer C (screenshot diff) should be confirmed by the controller at integration. The `white-space: nowrap` rule on `heading-style-h0` (vi desktop) is safe by inheritance reasoning but is worth a visual spot-check at that breakpoint.
