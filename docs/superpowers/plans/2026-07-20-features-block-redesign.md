# Features Block Redesign (Round 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** HOME "Vì Sao…" block → a horizontal 4-item coloured USP bar (icon-left + coloured uppercase title-right, no desc, no box); ABOUT block → a full-width 5-cell row (workshop video + 4 boxless criteria cells). Pure render + CSS; no schema/content/editor change.

**Architecture:** Extract the criteria icons + `dict→criteria` mapping into a shared `features-criteria-data.tsx`; HOME renders it as `FeaturesUspBar`, ABOUT maps it into a 5-cell row alongside the reused video tile; the old shared gray-card grid `features-criteria.tsx` is deleted. Spec: `docs/superpowers/specs/2026-07-20-features-block-redesign.md`.

**Tech Stack:** Next 16 (`apps/web`), the existing editor field-path/caps machinery.

## Global Constraints

- American "color" in identifiers, British "colour" in prose; UI copy Vietnamese (all text is dict-driven — no new copy).
- **No schema, no migration, no content change.** Every text keeps its snapshot field path (`features.eyebrow`, `features.title.lead/accent`, `features.cta.label`, `features.featured.title/desc`, `features.cards.0/1/2.title/desc`, `features.video.title/text/media`). The editor is unchanged.
- Public render leaks zero `data-edit-*`/`data-sx-*` (gate on `editable`; `features-full.tsx` carries NO `data-w-id`/`opacity:0` — home-registered reveal ids leave the /about block invisible).
- **NEVER `npm run test` (turbo-all)** — per-workspace only: `npm test -w @signex/web`.
- web tsc: `cd apps/web && node /home/ealflm/dev/signex/node_modules/typescript/bin/tsc --noEmit` (npx tsc is a decoy). `dynamic-params.test.mjs` `SECTION_ROOT_FILES` lists each RENDERED features file (the one carrying `<section data-sx-block="features">`) with count 1.
- Branch `feat/features-redesign-r3` off `main`. Commit trailer (verbatim):
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
  Stage explicit paths; no `git add -A`; no merge/push.

---

## Task 1: Shared criteria-data module + HOME coloured USP bar

**Files:**
- Create: `apps/web/app/components/home/features-criteria-data.tsx`
- Create: `apps/web/app/components/home/features-usp-bar.tsx`
- Modify: `apps/web/app/components/home/features-compact.tsx`, `apps/web/app/globals.css`
- (features-criteria.tsx is NOT deleted here — `features-full.tsx` still imports it until Task 2.)

**Interfaces produced:** `ICON_PROPS`, `CRITERIA_ICONS: ReactNode[]` (gauge/eye/handshake/shield), `buildCriteria(dict): Array<{ icon: ReactNode; titleField: string; descField: string; title: string; desc: string }>` (order: featured, cards.0, cards.1, cards.2) from `features-criteria-data.tsx`; `FeaturesUspBar({ dict, editable })` from `features-usp-bar.tsx`.

- [ ] **Step 1: Branch** — `git checkout -b feat/features-redesign-r3` from `main`.

- [ ] **Step 2: the data module** — create `apps/web/app/components/home/features-criteria-data.tsx` (icons copied VERBATIM from today's `features-criteria.tsx`):

```tsx
// app/components/home/features-criteria-data.tsx
// The four "Vì Sao Các Thương Hiệu Chọn Chúng Tôi" criteria as shared data (icons + snapshot field
// paths + resolved text) — the ONE source consumed by BOTH the homepage USP bar and the About page's
// 5-cell row, so the two cannot drift. Criterion 1 is the featured tile's text (features.featured.*,
// image dropped in round 2); 2–4 are features.cards[0..2]. Icons: gauge · eye · handshake · shield-check.
import type { ReactNode } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";

export const ICON_PROPS = {
  fill: "none",
  height: "100%",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  strokeWidth: "var(--_❇️-icon---icon-stroke)",
  viewBox: "0 0 24 24",
  width: "100%",
  xmlns: "http://www.w3.org/2000/svg",
} as const;

export const CRITERIA_ICONS: ReactNode[] = [
  <svg key="gauge" className="lucide lucide-gauge-icon lucide-gauge" {...ICON_PROPS}>
    <path d="m12 14 4-4" />
    <path d="M3.34 19a10 10 0 1 1 17.32 0" />
  </svg>,
  <svg key="eye" className="lucide lucide-eye-icon lucide-eye" {...ICON_PROPS}>
    <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
    <circle cx="12" cy="12" r="3" />
  </svg>,
  <svg key="handshake" className="lucide lucide-handshake-icon lucide-handshake" {...ICON_PROPS}>
    <path d="m11 17 2 2a1 1 0 1 0 3-3" />
    <path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" />
    <path d="m21 3 1 11h-2" />
    <path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3" />
    <path d="M3 4h8" />
  </svg>,
  <svg key="shield-check" className="lucide lucide-shield-check-icon lucide-shield-check" {...ICON_PROPS}>
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    <path d="m9 12 2 2 4-4" />
  </svg>,
];

export function buildCriteria(dict: Dictionary["features"]) {
  const t = dict;
  return [
    { icon: CRITERIA_ICONS[0], titleField: "features.featured.title", descField: "features.featured.desc", title: t.featured.title, desc: t.featured.desc },
    { icon: CRITERIA_ICONS[1], titleField: "features.cards.0.title", descField: "features.cards.0.desc", title: t.cards[0].title, desc: t.cards[0].desc },
    { icon: CRITERIA_ICONS[2], titleField: "features.cards.1.title", descField: "features.cards.1.desc", title: t.cards[1].title, desc: t.cards[1].desc },
    { icon: CRITERIA_ICONS[3], titleField: "features.cards.2.title", descField: "features.cards.2.desc", title: t.cards[2].title, desc: t.cards[2].desc },
  ];
}
```

- [ ] **Step 3: sample the reference colours** — `Read` the image `/home/ealflm/.claude/image-cache/58ff3cec-5668-4071-af10-5950239a7afb/23.png` and note the four item colours (green · orange-red · blue · orange). Use them in Step 4; if you can't read a precise hex, use the fallbacks there.

- [ ] **Step 4: the USP bar** — create `apps/web/app/components/home/features-usp-bar.tsx`:

```tsx
// app/components/home/features-usp-bar.tsx
// Homepage "Vì Sao Các Thương Hiệu Chọn Chúng Tôi" — the coloured USP-bar rendering: 4 items, each a
// coloured icon (left) + coloured uppercase title (right), no description, no card box (client ref
// image #23). Keeps data-sx-block="features" for the editor; the section eyebrow/title are dropped.
// Per-item colours are hardcoded like the footer brand badges (NOT palette tokens) — the four are
// sampled from ref image #23, index-aligned to criteria 1→4.
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { editable as editableAttrs } from "@/app/lib/edit-attrs";
import { buildCriteria } from "@/app/components/home/features-criteria-data";

// green · orange-red · blue · orange (from ref image #23). Fallbacks if sampling was impractical.
const USP_COLORS = ["#16a34a", "#e0552b", "#1c6ea4", "#f7941e"];

export function FeaturesUspBar({
  dict,
  editable = false,
}: {
  dict: Dictionary["features"];
  editable?: boolean;
}) {
  const criteria = buildCriteria(dict);
  return (
    <div className="sx-usp-bar">
      {criteria.map((c, i) => (
        <div className="sx-usp-item" key={i} style={{ color: USP_COLORS[i] }}>
          <span className="sx-usp-icon">{c.icon}</span>
          <span className="sx-usp-title">
            <span {...editableAttrs(editable, c.titleField, { text: { maxLength: 80 } })}>{c.title}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
```

(The item's inline `color` cascades: `CRITERIA_ICONS` use `stroke: currentColor`, and `.sx-usp-title` inherits `color` — so one property colours both icon and text.)

- [ ] **Step 5: swap the homepage block** — rewrite `apps/web/app/components/home/features-compact.tsx` to DROP the `sx-features-head` (eyebrow + title) and render `FeaturesUspBar`:

```tsx
// app/components/home/features-compact.tsx
// Homepage "Vì Sao Các Thương Hiệu Chọn Chúng Tôi" — the coloured USP-bar rendering (features-usp-bar).
// The section eyebrow + title were removed on request; the same fields still edit via the About header.
// Keeps data-sx-block="features" for the editor.
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { FeaturesUspBar } from "@/app/components/home/features-usp-bar";

export function FeaturesCompact({
  dict,
  editable = false,
}: {
  dict: Dictionary["features"];
  editable?: boolean;
}) {
  return (
    <section className="section_features" data-sx-block="features">
      <div className="padding-global">
        <div className="w-layout-blockcontainer container-large w-container">
          <FeaturesUspBar dict={dict} editable={editable} />
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 6: CSS** — append to `apps/web/app/globals.css` (leave the existing `.sx-features-head`/`.sx-features-criteria` rules for now — Task 2 removes the dead ones):

```css
/* Homepage USP bar: 4 coloured items (icon-left + uppercase coloured title-right), no box, no desc.
   Per-item colour comes from the item's inline `color` (icon stroke = currentColor, title inherits). */
.sx-usp-bar {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1.5rem;
  align-items: center;
}
.sx-usp-item {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}
.sx-usp-icon {
  flex: 0 0 auto;
  width: 2.75rem;
  height: 2.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
}
.sx-usp-icon svg { width: 2.25rem; height: 2.25rem; }
.sx-usp-title {
  font-weight: 800;
  text-transform: uppercase;
  line-height: 1.25;
  letter-spacing: 0.01em;
  font-size: var(--_🔠-typography---size--b3, 0.95rem);
}
@media (max-width: 991px) { .sx-usp-bar { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 479px) { .sx-usp-bar { grid-template-columns: 1fr; } }
```

- [ ] **Step 7: test row** — in `apps/web/test/dynamic-params.test.mjs` `SECTION_ROOT_FILES`, the `[["components","home","features-compact.tsx"],"features",1]` row STAYS (the compact file still owns exactly one `<section data-sx-block="features">`; `FeaturesUspBar` renders inside it and is NOT its own `<section>`, so it needs no row). No change needed here — confirm by reading the table.

- [ ] **Step 8:** `cd apps/web && node /home/ealflm/dev/signex/node_modules/typescript/bin/tsc --noEmit` → 0 (features-full still imports the un-deleted FeaturesCriteria — fine). `npm test -w @signex/web` → chain green. Commit `features-criteria-data.tsx`, `features-usp-bar.tsx`, `features-compact.tsx`, `globals.css`:
  `git commit -m "feat(web): homepage features block becomes a coloured USP bar"` (+ trailer).

---

## Task 2: ABOUT full-width 5-cell row + delete the old grid

**Files:**
- Modify: `apps/web/app/components/home/features-full.tsx`, `apps/web/app/globals.css`
- Delete: `apps/web/app/components/home/features-criteria.tsx` (`git rm`)

**Interfaces consumed:** `buildCriteria(dict)`, `CRITERIA_ICONS` from `features-criteria-data.tsx` (Task 1).

- [ ] **Step 1: restructure `features-full.tsx`** — keep the header (`headline_features` with eyebrow + title + CTA) inside `container-large`; replace the `sx-features-featured` block AND the `<FeaturesCriteria/>` line with ONE full-width 5-cell row (video cell + 4 boxless criteria cells). Read the CURRENT `features-full.tsx` first and PORT the video tile markup (the `image-inner_features` div through the caption `content_image-features`, including `featPoster/featMp4/featWebm` consts and the `overlay_media-config` div) VERBATIM into the video cell — do not retype from memory. The new file:

```tsx
// app/components/home/features-full.tsx
// The ABOUT-page "Vì Sao Các Thương Hiệu Chọn Chúng Tôi" block — header (eyebrow + title + CTA) in the
// container, then ONE full-width row of 5 equal cells: the workshop video (1/5) + the 4 criteria
// (boxless, icon + title + desc). Same features data as the homepage USP bar (shared buildCriteria).
// NO data-w-id reveals here — those ids are home-registered and would leave this invisible on /about.
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { editable as editableAttrs } from "@/app/lib/edit-attrs";
import { overlayCss } from "@signex/shared";
import { buildCriteria } from "@/app/components/home/features-criteria-data";

export function FeaturesFull({
  dict,
  editable = false,
}: {
  dict: Dictionary["features"];
  editable?: boolean;
}) {
  const t = dict;
  const featVideo = t.videoMedia?.kind === "video" ? t.videoMedia : null;
  const featPoster =
    featVideo?.posterUrl ||
    "/assets/images/69ac9062c7d860e7441b1f36_6168566-hd_1920_1080_30fps_poster.0000000.jpg";
  const featMp4 =
    featVideo?.mp4Url ||
    "/assets/videos/69ac9062c7d860e7441b1f36_6168566-hd_1920_1080_30fps_mp4.mp4";
  const featWebm = featVideo
    ? featVideo.webmUrl
    : "/assets/videos/69ac9062c7d860e7441b1f36_6168566-hd_1920_1080_30fps_webm.webm";
  const criteria = buildCriteria(dict);
  return (
    <section className="section_features" data-sx-block="features">
      <div className="padding-global">
        <div className="w-layout-blockcontainer container-large w-container">
          <div className="headline_features">
            <div className="heading_features">
              <div className="master_label" data-wf--tag--variant="base">
                <div className="label-small">
                  <span {...editableAttrs(editable, "features.eyebrow", { text: { maxLength: 80 } })}>{t.eyebrow}</span>
                </div>
              </div>
              <h2 className="margin-0">
                <span {...editableAttrs(editable, "features.title.lead", { text: { maxLength: 80 } })}>{t.titleTop}</span>
                <br />
                <span className="tone-medium" {...editableAttrs(editable, "features.title.accent", { text: { maxLength: 80 } })}>
                  {t.titleBottom}
                </span>
              </h2>
            </div>
            <div className="right_features-headline">
              <a button="" className="cta_primary w-inline-block" data-wf--cta-primary--variant="primary" href="#quote-form">
                <div className="button_text-mask">
                  <div button-text="" className="text-button">
                    <span {...editableAttrs(editable, "features.cta.label", { text: { maxLength: 80 } })}>{t.cta}</span>
                  </div>
                </div>
                <div button-bg="" className="btn-bg"></div>
              </a>
            </div>
          </div>
        </div>
        {/* Full-width 5-cell row (breaks out of container-large; header above stays centred). */}
        <div className="sx-features-row5">
          <div className="sx-features-cell sx-features-cell--video">
            {/* ⬇ PORT the video tile VERBATIM from the current features-full.tsx: the
                 <div className="image-inner_features"> … image branch / w-background-video branch …
                 <div className="overlay_media-config" style={overlayCss(t.videoOverlay)}
                 {...(editable ? { "data-sx-overlay": "features.video.overlay" } : {})} /> </div>
                 followed by the caption <div className="content_image-features"> …
                 features.video.title / features.video.text spans … </div> */}
          </div>
          {criteria.map((c, i) => (
            <div className="sx-features-cell" key={i}>
              <div className="icon_service-card w-embed">{c.icon}</div>
              <div className="text-size-large text_body-bold">
                <span {...editableAttrs(editable, c.titleField, { text: { maxLength: 80 } })}>{c.title}</span>
              </div>
              <p className="tone-medium margin-0">
                <span {...editableAttrs(editable, c.descField, { text: { maxLength: 200 } })}>{c.desc}</span>
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

(Copy the video tile from git — `git show HEAD:apps/web/app/components/home/features-full.tsx` — so the `image-inner_features` / `w-background-video` / `noscript` / play-pause / `overlay_media-config` / `content_image-features` markup is byte-exact, only re-parented into `sx-features-cell--video`. Keep the media caps `{ image: true, video: true }` and, on the About render, NO `data-w-id`/`opacity:0`.)

- [ ] **Step 2: CSS** — in `globals.css`, REMOVE the now-dead `.sx-features-head`, `.sx-features-criteria` (+ its media-query variants), and the old `.sx-features-featured` rules (nothing renders those classes anymore), and ADD:

```css
/* About page: full-width 5-cell row (video + 4 boxless criteria). Breaks out of container-large to
   the viewport edges (the header above stays centred in the container); inner gutter keeps the cells
   off the screen edge. Criteria are boxless — icon + title + desc, neutral ink. */
.sx-features-row5 {
  width: 100vw;
  margin-left: calc(50% - 50vw);
  padding: 0 var(--layout-grid--margin, 2rem);
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 1.5rem;
  align-items: start;
}
.sx-features-cell {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.sx-features-cell .icon_service-card {
  width: 2.5rem;
  height: 2.5rem;
}
/* the video tile needs a determinate box at 1/5 width (video_cover fills absolutely) */
.sx-features-cell--video .image-inner_features {
  position: relative;
  height: auto;
  aspect-ratio: 4 / 5;
  overflow: hidden;
  border-radius: var(--_🔘-radius---general--large, 0.75rem);
}
@media (max-width: 991px) { .sx-features-row5 { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 479px) { .sx-features-row5 { grid-template-columns: 1fr; } }
```

(If `--layout-grid--margin` isn't defined, use a literal like `1.5rem`. Tune `aspect-ratio` + gaps so the video and criteria cells read balanced at 5-up.)

- [ ] **Step 3: delete the old grid** — `git rm apps/web/app/components/home/features-criteria.tsx` (Task 1's `features-compact` no longer imports it, and this task's `features-full` now uses `buildCriteria` instead; tsc will prove nothing else imports it).

- [ ] **Step 4: test row** — in `dynamic-params.test.mjs` `SECTION_ROOT_FILES`, the `[["components","home","features-full.tsx"],"features",1]` row STAYS (features-full still owns exactly one `<section data-sx-block="features">`). No `features-criteria.tsx` row exists to remove (it was never a `<section>`). Confirm by reading the table.

- [ ] **Step 5:** `cd apps/web && node /home/ealflm/dev/signex/node_modules/typescript/bin/tsc --noEmit` → 0 (proves the `features-criteria.tsx` deletion is clean — nothing imports it). `npm test -w @signex/web` → chain green. Verify `features-full.tsx` has NO `data-w-id`/`opacity:0` (grep). Commit (including the deletion):
  `git commit -m "feat(web): About features block becomes a full-width 5-cell row"` (+ trailer).

---

## Final: browser E2E + review + merge

Build `signex-web` from the branch, swap into the stack. E2E on the PUBLIC routes (layout is code; content is the published snapshot — no auth/publish needed): HOME `/vi` shows the 4-item coloured USP bar (icon-left + coloured uppercase title-right, four distinct colours, no desc, no box) and NO eyebrow/title; ABOUT `/vi/about` shows the header then a full-width 5-cell row (video 1/5 + 4 boxless criteria) with the video still playing; both leak zero `data-sx-*`; the responsive collapse (4→2→1 on home, 5→2→1 on about) works. Then the whole-branch review (superpowers:requesting-code-review, most capable model), fix loop, and finishing-a-development-branch (fast-forward merge to `main`; operator rebuilds `signex-web` only).
