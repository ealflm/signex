# Features Block Redesign (Round 3)

**Goal:** Re-lay-out the "Vì Sao Các Thương Hiệu Chọn Chúng Tôi" block on two pages, per the client's images. HOME becomes a horizontal 4-item **coloured USP bar** (icon-left + coloured uppercase title-right, no description, no card box — matching the reference image). ABOUT becomes a **full-width 5-cell row** (the workshop video + the 4 criteria, boxless, equal 1/5 columns).

**Confirmed with the user:**
- HOME keeps the 4 criteria CONTENT (Chất Lượng / Quy Trình / Định Hướng / Tôn Trọng — editable), drops the section eyebrow + title, drops the descriptions, drops the box, and colours icon+title. Reference: `Image #23` (a coloured trust-bar: green medal, orange-red shield, blue person, orange truck).
- ABOUT: video + 4 criteria on ONE full-width row, 5 equal cells (video = 1/5). Header (eyebrow + title + CTA) stays. Criteria are **boxless** (no gray card), keep icon + title + desc, neutral colour.
- Reference image for the HOME colours is on disk: `/home/ealflm/.claude/image-cache/58ff3cec-5668-4071-af10-5950239a7afb/23.png` — the implementer should `Read` it to sample the exact 4 colours.

## Global Constraints

- American "color" in identifiers, British "colour" in prose; **UI copy Vietnamese** (all text is already dict-driven — no new copy).
- **No schema, no migration, no content change.** Pure render + CSS. Every text keeps its existing snapshot field path (`features.eyebrow`, `features.title.lead/accent`, `features.cta.label`, `features.featured.title/desc`, `features.cards.0/1/2.title/desc`, `features.video.title/text/media`) so the editor is unchanged.
- Public render leaks zero `data-edit-*`/`data-sx-*` (gate on `editable`).
- **NEVER `npm run test` (turbo-all)** — per-workspace only (`-w @signex/web`).
- web tsc: `cd apps/web && node /home/ealflm/dev/signex/node_modules/typescript/bin/tsc --noEmit` (npx tsc is a decoy). Web tests are the `package.json` `&&` chain; the `dynamic-params.test.mjs` `SECTION_ROOT_FILES` table lists each rendered features file with its `<section>` count (=1).
- Branch off `main`. Commit trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## Current state (after round 2)

- `features-compact.tsx` (HOME): eyebrow + title head (`sx-features-head`, reveal id `0f29df12-…`) then `<FeaturesCriteria/>`.
- `features-full.tsx` (ABOUT): header (eyebrow+title+CTA, no reveal id) → `sx-features-featured` (the workshop video tile `image-inner_features` + `w-background-video` + `overlay_media-config` + caption `content_image-features`) → `<FeaturesCriteria/>`.
- `features-criteria.tsx` (`FeaturesCriteria`): the shared 4-cell gray-card grid (`sx-features-criteria` → `card_service-v2` cells, icon `gauge/eye/handshake/shield` + title + desc). **Used only by the two files above** — both change here, so it is replaced.

## Architecture

Three files, one shared data source so the two renderings can't drift:

- **`apps/web/app/components/home/features-criteria-data.tsx`** (NEW, replaces `features-criteria.tsx`): exports `CRITERIA_ICONS` (the four SVG glyphs — gauge/eye/handshake/shield, copied verbatim from today's `features-criteria.tsx`) and `CRITERIA` = an array of `{ icon: ReactNode, titleField: string, descField: string }` in the 1→4 order (criterion 1 = `features.featured.*`, 2–4 = `features.cards.0/1/2.*`). No JSX rendering — data + icons only, so HOME (usp bar) and ABOUT (boxless cells) each map it their own way.
- **`apps/web/app/components/home/features-usp-bar.tsx`** (NEW): the HOME rendering — a 4-item horizontal bar, each item = a coloured icon (left) + coloured uppercase title (right), no desc, no box.
- **`features-full.tsx`** (MODIFY): the ABOUT rendering — keep the header, replace `sx-features-featured` + `<FeaturesCriteria/>` with ONE full-width 5-cell row (video cell + 4 boxless criteria cells built from `CRITERIA`).
- **`features-compact.tsx`** (MODIFY): drop the `sx-features-head` block; render `<FeaturesUspBar/>` instead of `<FeaturesCriteria/>`.
- **`features-criteria.tsx`** — DELETE (its icons/data move to `features-criteria-data.tsx`; nothing else imports it).

## HOME — coloured USP bar

`FeaturesUspBar({ dict, editable })`: `<section className="section_features" data-sx-block="features">` (KEEP the block stamp for the editor) → `padding-global` → `container-large` → a `sx-usp-bar` flex/grid of 4 items. **No section header** (eyebrow/title removed — those fields still edit via the ABOUT header). Each item:

```tsx
<div className="sx-usp-item sx-usp--<colourKey>">
  <span className="sx-usp-icon">{CRITERIA_ICONS[i]}</span>
  <span className="sx-usp-title">
    <span {...editableAttrs(editable, CRITERIA[i].titleField, { text: { maxLength: 80 } })}>{title}</span>
  </span>
</div>
```

- The `data-w-id`/`opacity:0` reveal is DROPPED (the head that carried it is gone; a bare bar with no reveal is fine and avoids the invisible-until-JS risk).
- **Colours** (per item, hardcoded like the footer brand badges — NOT palette tokens): sample the four from `Image #23` (green · orange-red · blue · orange), index-aligned to criteria 1→4. Fallback hex if sampling is impractical: `#16a34a` (green), `#e0552b` (orange-red), `#1c6ea4` (blue), `#f7941e` (orange). Both the icon (`color`/stroke) and the title text take the item's colour.
- **CSS** (`.sx-usp-*` in globals.css): the bar is a 4-up grid (`repeat(4, 1fr)`), each item a flex row `align-items: center; gap`; `.sx-usp-icon` ~2.75rem square, icon stroke = the item colour; `.sx-usp-title` uppercase (`text-transform: uppercase`), bold, letter-spacing, colour = the item colour. Per-colour modifier classes (`.sx-usp--green` etc.) set the shared `color`. Responsive: 4-up → 2-up ≤991px → 1-up ≤479px. No card background/border/shadow.
- Icons keep the criteria's own glyphs (gauge/eye/handshake/shield), tinted — semantically correct for the criteria content (NOT the reference image's medal/shield/person/truck, which belong to its USP text).

## ABOUT — full-width 5-cell row

`FeaturesFull`: keep the existing header (`headline_features` with eyebrow + title + CTA) INSIDE `container-large`. Replace everything below it (the `sx-features-featured` block AND `<FeaturesCriteria/>`) with ONE **full-width** 5-cell row:

```
[ video cell ] [ criterion 1 ] [ criterion 2 ] [ criterion 3 ] [ criterion 4 ]
```

- **Full-width:** the row breaks out of `container-large` to the viewport edges. Technique: render the row as a sibling of the container (still inside the section's `padding-global`, or outside it) with `width: 100%` spanning the section; if a true edge-to-edge break past `padding-global` is wanted, use `.sx-features-row5 { width: 100vw; margin-left: calc(50% - 50vw); }`. Decide during implementation which reads best against the page gutters; the section header stays centred in the container regardless.
- **Grid:** `.sx-features-row5 { display: grid; grid-template-columns: repeat(5, 1fr); gap; align-items: start; }`. Responsive: 5-up desktop → 2–3-up tablet → 1-up mobile (video first).
- **Video cell (1/5):** reuse the workshop-video markup VERBATIM from today's `features-full.tsx` (`image-inner_features` → the `t.videoMedia?.kind==="image"` image branch / the `video_cover w-background-video w-background-video-atom` branch with `featPoster/featMp4/featWebm` + noscript + play-pause button, the `overlay_media-config` div `data-sx-overlay="features.video.overlay"`, and the caption `content_image-features` with `features.video.title`/`features.video.text`). Media caps `{ image: true, video: true }` stay. The tile needs a determinate box at 1/5 width — `aspect-ratio` on `image-inner_features` (the `video_cover` fills absolutely). The caption sits under the video within the cell.
- **Criteria cells (1/5 each):** boxless (NO `card_service-v2` background/border) — icon (neutral, current stroke colour) + title + desc, built by mapping `CRITERIA`:

```tsx
<div className="sx-features-cell">
  <div className="icon_service-card w-embed">{CRITERIA_ICONS[i]}</div>
  <div className="text-size-large text_body-bold">
    <span {...editableAttrs(editable, CRITERIA[i].titleField, { text: { maxLength: 80 } })}>{title}</span>
  </div>
  <p className="tone-medium margin-0">
    <span {...editableAttrs(editable, CRITERIA[i].descField, { text: { maxLength: 200 } })}>{desc}</span>
  </p>
</div>
```

  Neutral colour (inherits the section ink), no box, so it differs from HOME's coloured boxless bar only by colour + the presence of the desc. NO `data-w-id`/`opacity:0` anywhere in `features-full.tsx` (home-registered reveal ids leave the block invisible on /about).

## Testing

- **web**: tsc = 0 (proves nothing still imports the deleted `features-criteria.tsx`); the existing `npm test -w @signex/web` chain green. Update `dynamic-params.test.mjs` `SECTION_ROOT_FILES`: replace the `features-compact.tsx` + `features-full.tsx` rows so they still point at the rendered files (both keep exactly one `<section data-sx-block="features">`); remove any `features-criteria.tsx` reference; the new `features-usp-bar.tsx` is rendered inside `features-compact`'s section (it is NOT its own `<section>`, so it needs no row) — confirm the compact file still owns its single `<section>`.
- **Browser E2E (public, no auth needed — the layout is code, content is the published snapshot):** HOME shows the 4-item coloured bar (icon-left + coloured uppercase title, no desc, no box, 4 distinct colours) and NO eyebrow/title; ABOUT shows a full-width 5-cell row (video 1/5 + 4 boxless criteria) under its header; both leak no edit hooks; responsive collapse works; the workshop video still plays in its 1/5 cell.

## Out of scope

- No schema/content/editor change; the video overlay + flexible-media behaviour is unchanged.
- The exact px of gaps/typography is tuned to look like the reference during implementation; not a hard spec.

## Deployment

Feature branch off `main`; after review + tsc + web chain + browser E2E, fast-forward merge to `main`; operator rebuilds `signex-web` only (no shared/admin change). Pure render — no publish needed for the layout to take effect once deployed (it renders the existing published content differently).
