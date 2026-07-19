# Site Adjustments Round 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Ship the 5 remaining PDF asks — contact banner accepts video (+overlay), full-colour logo uploads, floating call/Zalo buttons, favicon wiring, and the "Vì Sao Các Thương Hiệu Chọn Chúng Tôi" restructure (compact on home, full-with-video on About).

**Architecture:** Schema widenings in `@signex/shared` (all optional/backward-compatible, no migration); web renders in `apps/web` reusing the established flexible-media + overlay pipeline; zero admin code expected (the editor is field/caps-driven) except a possible favicon-panel verification. Spec: `docs/superpowers/specs/2026-07-19-site-adjustments-r2-design.md`.

**Tech Stack:** zod, Next 16, the existing editor bridge/caps/overlay machinery.

## Global Constraints

- American "color" in identifiers, British "colour" in prose; **UI copy Vietnamese**.
- `@signex/shared` → CommonJS `dist/`: `npm run build -w @signex/shared` after editing; **do NOT commit `dist/`** (gitignored).
- **No migration**: every schema change is `.optional()` or a widening union; every stored draft + published release keeps parsing.
- Public render leaks zero `data-edit-*`/`data-sx-*` (gate on `editable`; public contact route passes literal `false`).
- **NEVER `npm run test` (turbo-all)** — per-workspace only: `npm test -w @signex/shared` / `-w @signex/web`.
- web tsc: `cd apps/web && node /home/ealflm/dev/signex/node_modules/typescript/bin/tsc --noEmit` (npx tsc is a decoy). Web tests are the `package.json` `&&` chain (static `node --test`/jiti, run via `npm test -w @signex/web`).
- Branch `feat/site-adjustments-r2` off `main`. Commit trailer (verbatim):
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
  Stage explicit paths; no `git add -A`; no merge/push.
- Every new pure-logic test **mutation-checked**: mutate, confirm the test FAILS, restore, confirm PASS.

---

## Task 1: Contact hero schema — `MediaRef` + `Overlay`

**Files:**
- Modify: `packages/shared/src/content/blocks/contactPage.ts`
- Test: `packages/shared/src/content/blocks/blocks.test.ts` (append inside `describe("contactPageBlock", …)`, ~line 609)

**Interfaces produced:** `contactPageBlock.hero.image: MediaRef.optional()` (was `AssetRef.optional()`); `contactPageBlock.hero.overlay: Overlay.optional()` (new). Field PATHS stay `contactPage.hero.image` / `contactPage.hero.overlay`.

- [ ] **Step 1: Branch** — `git checkout -b feat/site-adjustments-r2` (from `main`).
- [ ] **Step 2: Failing tests** — append inside the existing `describe("contactPageBlock", …)` block in `blocks.test.ts`:

```ts
  it("hero.image accepts a stored AssetRef (backward compat)", () => {
    const d = structuredClone(valid);
    d.hero.image = { assetId: "a1" };
    expect(contactPageBlock.safeParse(d).success).toBe(true);
  });
  it("hero.image accepts a VideoRef (flexible slot)", () => {
    const d = structuredClone(valid);
    d.hero.image = { posterAssetId: "p1", mp4AssetId: "m1" };
    expect(contactPageBlock.safeParse(d).success).toBe(true);
  });
  it("hero accepts an overlay and parses with it absent", () => {
    const d = structuredClone(valid);
    d.hero.overlay = { kind: "solid", fill: { color: "#0b1f33", opacity: 40 } };
    expect(contactPageBlock.safeParse(d).success).toBe(true);
    expect(contactPageBlock.safeParse(valid).success).toBe(true);
  });
  it("rejects a malformed overlay", () => {
    const d = structuredClone(valid);
    d.hero.overlay = { kind: "solid", fill: { color: "navy", opacity: 40 } };
    expect(contactPageBlock.safeParse(d).success).toBe(false);
  });
```

(`valid` is the fixture already defined in that describe. If `valid.hero.image` is typed narrowly, cast the assignment `as never`/via `Record<string, unknown>` the way neighbouring block tests do — inspect nearby patterns first.)
- [ ] **Step 3:** `npm test -w @signex/shared -- blocks.test` → the VideoRef test FAILS (AssetRef requires `assetId`).
- [ ] **Step 4: Implement** — in `contactPage.ts`: change the import line to `import { LocalizedText, TwoToneTitle, MediaRef, Overlay } from "../primitives";` (drop `AssetRef` if now unused) and the hero line to:

```ts
  // hero.image OPTIONAL + FLEXIBLE (image OR video, like the home/about heroes): the web falls back
  // to the literal sara-dubler still when absent. A previously stored AssetRef parses unchanged
  // (MediaRef discriminates structurally on mp4AssetId). hero.overlay: the configurable scrim over
  // the hero media (absent = transparent). Edited as `contactPage.hero.image` / `.overlay`.
  hero: z.object({
    eyebrow: LocalizedText.optional(),
    title: TwoToneTitle,
    subtitle: LocalizedText,
    image: MediaRef.optional(),
    overlay: Overlay.optional(),
  }),
```

Keep the existing eyebrow doc comment content above (merge the comments — don't lose the v1-compat notes).
- [ ] **Step 5:** `npm test -w @signex/shared -- blocks.test` → PASS. **Mutation:** change `overlay: Overlay.optional()` to `overlay: Overlay` (required) → the "parses with it absent" assertion FAILS → restore → PASS.
- [ ] **Step 6:** `npm run build -w @signex/shared`; `npm test -w @signex/shared` (whole suite green). Commit `contactPage.ts` + `blocks.test.ts`:
  `git commit -m "feat(shared): contact hero becomes a flexible media slot with overlay"` (+ trailer).

---

## Task 2: Contact hero render — shared component + both routes

**Files:**
- Modify: `apps/web/app/lib/content.ts` (contactPage.hero view-model, ~lines 401–414)
- Create: `apps/web/app/components/contact-hero-media.tsx`
- Modify: `apps/web/app/[lang]/contact/page.tsx` (~line 118) and `apps/web/app/preview/[lang]/contact/page.tsx` (~line 128)
- Modify: `apps/web/app/globals.css` (position the overlay's parent)

**Interfaces:**
- Consumes: Task 1 schema; `resolveMedia(ref, lang, assetUrl, t)` → `{ kind:"image", url, alt } | { kind:"video", posterUrl, mp4Url, webmUrl? } | null`; `overlayCss` from `@signex/shared`.
- Produces: view-model `contactPage.hero.media` (resolved media or null) + `contactPage.hero.overlay` (raw `Overlay | undefined`); component `ContactHeroMedia({ hero, editable? })`. The old `imageUrl`/`imageAlt` keys are REMOVED (their only two consumers are the two lines replaced here).

- [ ] **Step 1: content.ts** — in the `contactPage.hero` object replace the `imageUrl` + `imageAlt` lines with:

```ts
        // hero.image is MediaRef? (image OR video, mirrors the home/about heroes) — resolved
        // discriminated view-model; null when absent so the page falls back to the literal
        // sara-dubler still. hero.overlay rides raw; the component resolves it via overlayCss.
        media: resolveMedia(b.contactPage.hero.image, lang, assetUrl, (l) => t(l, lang)),
        overlay: b.contactPage.hero.overlay,
```

- [ ] **Step 2: the shared component** — create `apps/web/app/components/contact-hero-media.tsx`:

```tsx
// app/components/contact-hero-media.tsx
// The /contact hero's media (parallax still OR background video) + its configurable overlay —
// ONE source shared by the public route and the /preview editor route (the AboutSections
// precedent), so the two renders cannot drift. Flexible slot: contactPage.hero.image
// (image OR video); overlay: contactPage.hero.overlay (absent = transparent).
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { editable as editableAttrs } from "@/app/lib/edit-attrs";
import { overlayCss } from "@signex/shared";

const FALLBACK_STILL = "/assets/images/69aeefb3f6044f0563d94f4b_sara-dubler-Koei_7yYtIo-unsplash.avif";
const FALLBACK_ALT = "Sara dubler koei 7y yt io unsplash";

export function ContactHeroMedia({
  hero,
  editable = false,
}: {
  hero: Dictionary["contactPage"]["hero"];
  editable?: boolean;
}) {
  const media = hero.media;
  const video = media?.kind === "video" ? media : null;
  return (
    <>
      {video ? (
        <video
          autoPlay
          className="image_cover is-parallax"
          loop
          muted
          playsInline
          poster={video.posterUrl}
          {...editableAttrs(editable, "contactPage.hero.image", { image: true, video: true })}
        >
          <source src={video.mp4Url} type="video/mp4" />
          {video.webmUrl && <source src={video.webmUrl} type="video/webm" />}
        </video>
      ) : (
        <img
          alt={(media?.kind === "image" && media.alt) || FALLBACK_ALT}
          className="image_cover is-parallax"
          loading="lazy"
          src={(media?.kind === "image" && media.url) || FALLBACK_STILL}
          {...editableAttrs(editable, "contactPage.hero.image", { image: true, video: true })}
        />
      )}
      <div
        className="overlay_media-config"
        style={overlayCss(hero.overlay)}
        {...(editable ? { "data-sx-overlay": "contactPage.hero.overlay" } : {})}
      />
    </>
  );
}
```

- [ ] **Step 3: both routes** — in `apps/web/app/[lang]/contact/page.tsx` replace the single `<img alt={dict.contactPage.hero.imageAlt …} />` line (inside `<div className="image_contact-c" …>`) with `<ContactHeroMedia hero={dict.contactPage.hero} />`, adding `import { ContactHeroMedia } from "@/app/components/contact-hero-media";`. In `apps/web/app/preview/[lang]/contact/page.tsx` replace its `<img … {...editableAttrs(true, "contactPage.hero.image", { image: true })} />` line with `<ContactHeroMedia hero={dict.contactPage.hero} editable />` + the same import. The `image_contact-c` wrapper divs (with their `data-w-id` reveals) stay untouched.
- [ ] **Step 4: CSS** — `.image_contact-c` (vendor) has no `position`, so the overlay's `absolute inset:0` would anchor to an ancestor. Append to `apps/web/app/globals.css` (near the `.overlay_media-config` rule):

```css
/* The contact hero's media box: give the overlay_media-config child (absolute, inset 0) its
   positioning context. Vendor .image_contact-c has width/height/overflow but no position. */
.image_contact-c {
  position: relative;
}
```

- [ ] **Step 5:** web tsc → 0 (proves no other `imageUrl`/`imageAlt` consumer). `npm test -w @signex/web` → chain green (the `SECTION_ROOT_FILES` rows for the contact routes count `<section>` opens — unchanged by this swap).
- [ ] **Step 6:** Commit the 5 files: `git commit -m "feat(web): contact hero renders image OR video with configurable overlay"` (+ trailer).

---

## Task 3: Full-colour logo uploads (nav + footer)

**Files:**
- Modify: `apps/web/app/components/navbar.tsx` (~lines 94–104), `apps/web/app/components/footer.tsx` (~line 101), `apps/web/app/globals.css`

**Interfaces:** consumes `dict.logoUrl` (nav slice) and `t.logoUrl` (footer slice) — both already resolved in content.ts. No schema change.

- [ ] **Step 1: navbar** — replace the single masked `<span className="signex-logo-nav" …/>` element with a conditional (custom upload → true-colour `<img>`; default → today's masked span, now without the mask-image override):

```tsx
              {dict.logoUrl ? (
                /* Custom uploaded logo: render as a true-colour image — no mask, no recolour.
                   (The mask flattened any uploaded art to the nav ink; a colour logo must show
                   its own colours. Trade-off accepted: a custom logo no longer auto-tracks the
                   nav ink token.) */
                <img
                  alt="Signex"
                  className="signex-logo-nav-img"
                  src={dict.logoUrl}
                  {...editableAttrs(editable, "nav.logo", { image: true })}
                />
              ) : (
                /* Default bundled SVG keeps the CSS-mask treatment so it tracks the nav links'
                   ink token exactly (see .signex-logo-nav). */
                <span
                  className="signex-logo-nav"
                  role="img"
                  aria-label="Signex"
                  {...editableAttrs(editable, "nav.logo", { image: true })}
                />
              )}
```

- [ ] **Step 2: navbar CSS** — append to `globals.css` next to `.signex-logo-nav`:

```css
/* Custom uploaded nav logo — true-colour <img> variant of .signex-logo-nav (same box, no mask). */
.signex-logo-nav-img {
  height: 1.85rem;
  width: auto;
  display: block;
  object-fit: contain;
}
```

- [ ] **Step 3: footer** — the logo `<img className="footer-signex_logo" …>` keeps `filter: brightness(0) invert(1)` only for the DEFAULT art. Change its className to `` className={`footer-signex_logo${t.logoUrl ? " is-custom" : ""}`} `` and append CSS:

```css
/* Custom uploaded footer logo: show its true colours — the brightness(0) invert(1) recolour is
   for the default monochrome SVG only. */
.footer-signex_logo.is-custom {
  filter: none;
}
```

- [ ] **Step 4:** `grep -rn "signex-logo-nav" apps/web --include="*.test.*" --include="*.mjs" | grep -v node_modules | grep -v ".next"` → confirm no static test pins the old markup (if one does, update it to accept both branches). web tsc → 0; `npm test -w @signex/web` → green.
- [ ] **Step 5:** Commit navbar.tsx + footer.tsx + globals.css: `git commit -m "feat(web): uploaded logos render in full colour (nav + footer)"` (+ trailer).

---

## Task 4: Floating call + Zalo buttons

**Files:**
- Create: `apps/web/app/components/floating-contact.tsx`
- Modify: `apps/web/app/globals.css`; `apps/web/app/[lang]/layout.tsx` (after `<Footer …/>`, ~line 101); the 5 preview pages (after each `<Footer dict={dict.footer} editable />`): `apps/web/app/preview/[lang]/page.tsx:57`, `preview/[lang]/about/page.tsx:38`, `preview/[lang]/404/page.tsx:38`, `preview/[lang]/contact/page.tsx:170`, `preview/[lang]/products/[slug]/page.tsx:147`

**Interfaces:** consumes `dict.businessContact.phones: Array<{ kind: "tel"|"zalo", label, value }>` (values like `"(+84) 979 700 072"`). Produces `FloatingContact({ dict: Dictionary })` — renders null when both entries are absent/empty.

- [ ] **Step 1: component** — create `apps/web/app/components/floating-contact.tsx`:

```tsx
// app/components/floating-contact.tsx
// Floating call + Zalo quick-contact buttons, fixed bottom-right on every page. The numbers come
// from businessContact.phones (kind "tel" / "zalo") — already editable in the admin — so there is
// no config flag: an emptied/removed entry simply hides its button. Server component, no JS.
import type { Dictionary } from "@/app/[lang]/dictionaries";

/** "(+84) 979 700 072" → "tel:+84979700072" — keep digits and one leading +. */
function telHref(value: string): string {
  const s = value.replace(/[^\d+]/g, "");
  return `tel:${s.startsWith("+") ? "+" + s.slice(1).replace(/\+/g, "") : s.replace(/\+/g, "")}`;
}

/** "(+84) 94 9999 326" → "https://zalo.me/0949999326" — digits, +84/84 prefix normalised to 0. */
function zaloHref(value: string): string {
  let d = value.replace(/\D/g, "");
  if (d.startsWith("84")) d = "0" + d.slice(2);
  return `https://zalo.me/${d}`;
}

export function FloatingContact({ dict }: { dict: Dictionary }) {
  const tel = dict.businessContact.phones.find((p) => p.kind === "tel")?.value?.trim();
  const zalo = dict.businessContact.phones.find((p) => p.kind === "zalo")?.value?.trim();
  if (!tel && !zalo) return null;
  return (
    <div className="sx-float-contact">
      {zalo ? (
        <a
          className="sx-float-btn is-zalo"
          href={zaloHref(zalo)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Chat Zalo"
        >
          Zalo
        </a>
      ) : null}
      {tel ? (
        <a className="sx-float-btn is-call" href={telHref(tel)} aria-label="Gọi điện">
          <svg aria-hidden="true" fill="none" height="22" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="22" xmlns="http://www.w3.org/2000/svg">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
        </a>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: CSS** — append to `globals.css`:

```css
/* Floating quick-contact stack (call + Zalo), bottom-right on every page. z-index 900: above
   page content, below the editor hotspot layer. Call button follows the primary-button palette
   token (themes with the site); Zalo keeps its brand blue (hardcoded, same convention as the
   Facebook/YouTube chips). */
.sx-float-contact {
  position: fixed;
  right: 1.25rem;
  bottom: calc(1.25rem + env(safe-area-inset-bottom, 0px));
  z-index: 900;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.sx-float-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3.25rem;
  height: 3.25rem;
  border-radius: 50%;
  color: #fff;
  box-shadow: 0 6px 20px rgba(7, 21, 34, 0.28);
  transition: transform 0.15s ease;
}
.sx-float-btn:hover { transform: scale(1.05); }
.sx-float-btn:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.sx-float-btn.is-call {
  background-color: var(--_🎨-color--tokens---button--primary--default--background, #0b1f33);
}
.sx-float-btn.is-zalo {
  background-color: #0068ff;
  font-weight: 800;
  font-size: 0.82rem;
  letter-spacing: 0.01em;
}
@media (prefers-reduced-motion: reduce) {
  .sx-float-btn { transition: none; }
  .sx-float-btn:hover { transform: none; }
}
```

(Verify the token name `--_🎨-color--tokens---button--primary--default--background` exists in the vendor CSS — `grep -c "button--primary--default--background" apps/web/public/assets/css/caladan-template.shared.*.css`; if the exact name differs, use the actual one; the `#0b1f33` fallback keeps it safe either way.)
- [ ] **Step 3: render sites** — public `apps/web/app/[lang]/layout.tsx`: add `import { FloatingContact } from "@/app/components/floating-contact";` and render `<FloatingContact dict={dict} />` immediately after `<Footer dict={dict.footer} />`. Each of the 5 preview pages: same import + `<FloatingContact dict={dict} />` after its `<Footer dict={dict.footer} editable />` line.
- [ ] **Step 4:** web tsc → 0; `npm test -w @signex/web` → green (component has no `<section>`, `SECTION_ROOT_FILES` unaffected).
- [ ] **Step 5:** Commit the 8 files: `git commit -m "feat(web): floating call + Zalo buttons from businessContact"` (+ trailer).

---

## Task 5: Wire the configurable favicon

**Files:**
- Modify: `apps/web/app/lib/content.ts` (meta view-model, ~line 449) and `apps/web/app/lib/seo.ts`
- Create: `apps/web/app/lib/seo-icons.ts` (pure module — ICONS + iconsFrom; no `@/`-aliased runtime imports, so the jiti test can't hit alias-resolution issues)
- Test: create `apps/web/app/lib/seo-icons.test.mjs` + register it in the `apps/web/package.json` `test` chain

**Interfaces:** consumes `b.meta.favicons: Array<{ rel: string, asset: { assetId } }>` (already in the schema + seeded snapshots). Produces view-model `meta.favicons: Array<{ rel: string, url: string }>`; `seo-icons.ts` exports `ICONS` (moved from seo.ts) + `iconsFrom(favicons)`; seo.ts imports both from it.

- [ ] **Step 1: content.ts** — add to the `meta` view-model object (beside `ogImageUrl`):

```ts
      // meta.favicons — the configurable favicon set (schema existed, importer-seeded, but the web
      // never read it: seo.ts served a static ICONS list, which is why editing it in the admin's
      // SEO panel changed nothing). Resolved to CDN URLs here; empty entries dropped.
      favicons: b.meta.favicons
        .map((f) => ({ rel: f.rel, url: assetUrl(f.asset.assetId) }))
        .filter((f) => f.url !== ""),
```

- [ ] **Step 2: failing test** — create `apps/web/app/lib/seo-icons.test.mjs` (jiti-run, static; imports the pure module directly):

```js
// Run from apps/web: `jiti app/lib/seo-icons.test.mjs`
import assert from "node:assert/strict";
import { iconsFrom, ICONS } from "./seo-icons";

// Empty/absent favicons → the static bundled set (unchanged behaviour).
assert.deepEqual(iconsFrom([]), ICONS);
assert.deepEqual(iconsFrom(undefined), ICONS);

// Configured favicons → icon list from the snapshot; apple-touch-icon maps to icons.apple.
const out = iconsFrom([
  { rel: "icon", url: "https://cdn/x-32.png" },
  { rel: "icon", url: "https://cdn/x-16.png" },
  { rel: "apple-touch-icon", url: "https://cdn/apple.png" },
]);
assert.deepEqual(out.icon, [{ url: "https://cdn/x-32.png" }, { url: "https://cdn/x-16.png" }]);
assert.equal(out.apple, "https://cdn/apple.png");

// No apple entry → no apple key (Next would emit an empty tag otherwise).
assert.equal(Object.hasOwn(iconsFrom([{ rel: "icon", url: "https://cdn/only.png" }]), "apple"), false);

console.log("seo-icons: all assertions passed");
```

Register in `apps/web/package.json` `test` chain: append `&& jiti app/lib/seo-icons.test.mjs`.
- [ ] **Step 3:** `cd apps/web && npx jiti app/lib/seo-icons.test.mjs` → FAIL (module doesn't exist).
- [ ] **Step 4: implement** — create `apps/web/app/lib/seo-icons.ts` (MOVE the `ICONS` const out of seo.ts into it, verbatim, and add `iconsFrom`):

```ts
// app/lib/seo-icons.ts
// Favicon resolution for <head> — a PURE module (no app imports) so it stays trivially testable.
// The bundled static set is the fallback; when the snapshot carries configured favicons
// (meta.favicons — resolved to CDN URLs in content.ts), they win.
// Favicons (favicon.io set: SIGNEX lotus mark). The .ico is auto-served from app/favicon.ico;
// these PNGs add the type/size hints modern browsers + Apple devices prefer.
export const ICONS = {
  icon: [
    { url: "/assets/images/favicon-32x32.png", type: "image/png", sizes: "32x32" },
    { url: "/assets/images/favicon-16x16.png", type: "image/png", sizes: "16x16" },
  ],
  apple: "/assets/images/apple-touch-icon.png",
};

/** Build the Metadata.icons value from the snapshot's resolved favicons; fall back to the
 *  bundled static set when none are configured. rel "apple-touch-icon" → icons.apple. */
export function iconsFrom(
  favicons: Array<{ rel: string; url: string }> | undefined,
): typeof ICONS | { icon: Array<{ url: string }>; apple?: string } {
  const list = favicons ?? [];
  if (list.length === 0) return ICONS;
  const icon = list.filter((f) => f.rel !== "apple-touch-icon").map((f) => ({ url: f.url }));
  const apple = list.find((f) => f.rel === "apple-touch-icon")?.url;
  return { icon: icon.length ? icon : ICONS.icon, ...(apple ? { apple } : {}) };
}
```

In `seo.ts`: delete the local `ICONS` const, add `import { iconsFrom } from "@/app/lib/seo-icons";`, and change `icons: ICONS,` inside `buildMetadata` to `icons: iconsFrom(meta.favicons),` (the `meta` param's type picks up `favicons` automatically — `Dictionary` is derived).
- [ ] **Step 5:** test → PASS. **Mutation:** flip the apple filter to `f.rel === "icon"` → the apple assertion FAILS → restore → PASS.
- [ ] **Step 6: admin editability check (read-only)** — read `apps/admin/app/lib/zodform-fields.ts` around `MAX_OBJECT_DEPTH`/array handling and confirm how the meta panel presents `favicons` (repeater with per-item AssetRef picker, or JSON editor — both acceptable; the array stays JSON-editable per that file's own comment). Record the finding in your report. ONLY if the field is entirely absent from the panel, add a rendering path for it (follow the file's existing array patterns) — do not redesign the form otherwise.
- [ ] **Step 7:** web tsc → 0; `npm test -w @signex/web` → whole chain green (now includes seo-icons). Commit `content.ts` + `seo.ts` + `seo-icons.ts` + `seo-icons.test.mjs` + `package.json`: `git commit -m "feat(web): serve the configurable favicon set from the snapshot"` (+ trailer).

---

## Task 6: Criteria grid + compact homepage block

**Files:**
- Create: `apps/web/app/components/home/features-criteria.tsx`, `apps/web/app/components/home/features-compact.tsx`
- Modify: `apps/web/app/globals.css`; `apps/web/app/[lang]/page.tsx` (import line 5 + render line 19); `apps/web/app/preview/[lang]/page.tsx` (import line 22 + its `<Features …/>` render); `apps/web/test/dynamic-params.test.mjs` (the `SECTION_ROOT_FILES` row `[["components", "home", "features.tsx"], "features", 1]`, ~line 130)

**Interfaces:**
- Consumes: `dict.features` = `{ eyebrow, titleTop, titleBottom, cta, videoTitle, videoText, videoMedia, videoOverlay, featured: { title, desc, media, overlay }, cards: [{title, desc}×3] }`.
- Produces: `FeaturesCriteria({ dict, editable? })` — the 4-cell criteria grid (shared with Task 7); `FeaturesCompact({ dict, editable? })` — the homepage section. Old `<Features>` stays in place until Task 7 deletes it.

- [ ] **Step 1: the shared criteria grid** — create `features-criteria.tsx`. The four criteria are `featured.{title,desc}` (leads, field paths `features.featured.*` — the old featured image tile demoted to a plain card) + `cards[0..2]` (paths `features.cards.N.*`). Icons hardcoded index-aligned (Caladan `.icon_service-card` atom): **gauge** (new, for quality) then the existing **eye / handshake / shield-check** copied VERBATIM from the current `features.tsx` (lines ~122, ~145, ~172 — keep every path/attr identical):

```tsx
// app/components/home/features-criteria.tsx
// The four "Vì Sao Các Thương Hiệu Chọn Chúng Tôi" criteria as one compact icon grid — the ONE
// source rendered by BOTH the homepage compact block and the About page's full block, so the two
// cannot drift. Criterion 1 is the old featured tile's text (features.featured.*, image dropped);
// 2–4 are features.cards[0..2]. Icons hardcoded index-aligned (same convention as the About
// page's APPROACH_ICONS): gauge · eye · handshake · shield-check.
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { editable as editableAttrs } from "@/app/lib/edit-attrs";

const ICON_PROPS = {
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

const CRITERIA_ICONS = [
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

export function FeaturesCriteria({
  dict,
  editable = false,
}: {
  dict: Dictionary["features"];
  editable?: boolean;
}) {
  const t = dict;
  const criteria = [
    { icon: CRITERIA_ICONS[0], titleField: "features.featured.title", descField: "features.featured.desc", title: t.featured.title, desc: t.featured.desc },
    { icon: CRITERIA_ICONS[1], titleField: "features.cards.0.title", descField: "features.cards.0.desc", title: t.cards[0].title, desc: t.cards[0].desc },
    { icon: CRITERIA_ICONS[2], titleField: "features.cards.1.title", descField: "features.cards.1.desc", title: t.cards[1].title, desc: t.cards[1].desc },
    { icon: CRITERIA_ICONS[3], titleField: "features.cards.2.title", descField: "features.cards.2.desc", title: t.cards[2].title, desc: t.cards[2].desc },
  ];
  return (
    <div className="sx-features-criteria">
      {criteria.map((c, i) => (
        <div className="card_service-v2" key={i}>
          <div className="wrap_icon-service-card">
            <div className="icon_service-card w-embed">{c.icon}</div>
          </div>
          <div className="wrap_text-service-card">
            <div className="text-size-large text_body-bold">
              <span {...editableAttrs(editable, c.titleField, { text: { maxLength: 80 } })}>{c.title}</span>
            </div>
            <p className="tone-medium margin-0">
              <span {...editableAttrs(editable, c.descField, { text: { maxLength: 200 } })}>{c.desc}</span>
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: the compact homepage block** — create `features-compact.tsx` (centred head, NO CTA — user's choice; the headline keeps the home-registered reveal id `0f29df12-8c38-da6f-794d-3989ac10d663` so it fades in like today):

```tsx
// app/components/home/features-compact.tsx
// Homepage "Vì Sao Các Thương Hiệu Chọn Chúng Tôi" — the COMPACT rendering: eyebrow + title
// centred, then the shared 4-criteria icon grid. No images, no workshop video, no CTA (the full
// block with the featured video lives on the About page — features-full.tsx). Same features
// block data on both pages; the section keeps data-sx-block="features" for the editor.
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { editable as editableAttrs } from "@/app/lib/edit-attrs";
import { FeaturesCriteria } from "@/app/components/home/features-criteria";

export function FeaturesCompact({
  dict,
  editable = false,
}: {
  dict: Dictionary["features"];
  editable?: boolean;
}) {
  const t = dict;
  return (
    <section className="section_features" data-sx-block="features">
      <div className="padding-global">
        <div className="w-layout-blockcontainer container-large w-container">
          <div className="sx-features-head" data-w-id="0f29df12-8c38-da6f-794d-3989ac10d663" style={{ opacity: 0, filter: "blur(5px)" }}>
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
          <FeaturesCriteria dict={dict} editable={editable} />
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: CSS** — append to `globals.css`:

```css
/* "Vì Sao Các Thương Hiệu Chọn Chúng Tôi" — compact criteria rendering (home + About).
   Centred head, 4-up icon grid (2-up tablet, 1-up phone), size-capped and centred per the
   client's "thu nhỏ, căn giữa, làm gọn" ask. Cards reuse the Caladan card_service-v2 atom. */
.sx-features-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 1rem;
  margin-bottom: 2.5rem;
}
.sx-features-criteria {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
  max-width: 68rem;
  margin: 0 auto;
}
.sx-features-criteria .card_service-v2 {
  height: 100%;
}
@media (max-width: 991px) {
  .sx-features-criteria { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 479px) {
  .sx-features-criteria { grid-template-columns: 1fr; }
}
```

- [ ] **Step 4: home swaps** — `apps/web/app/[lang]/page.tsx`: `import { FeaturesCompact } from "@/app/components/home/features-compact";` (replacing the `Features` import) and `<FeaturesCompact dict={dict.features} />`. `apps/web/app/preview/[lang]/page.tsx`: same swap with `editable` (`<FeaturesCompact dict={dict.features} editable />`).
- [ ] **Step 5: test row** — in `apps/web/test/dynamic-params.test.mjs` `SECTION_ROOT_FILES`, replace `[["components", "home", "features.tsx"], "features", 1],` with `[["components", "home", "features-compact.tsx"], "features", 1],` (features.tsx itself still exists until Task 7 — the table only lists files that must carry stamps, so dropping its row now is correct: it is no longer rendered).
- [ ] **Step 6:** web tsc → 0; `npm test -w @signex/web` → green. Commit the 6 files: `git commit -m "feat(web): compact 4-criteria features block on the homepage"` (+ trailer).

---

## Task 7: Full features block on About + delete the old one

**Files:**
- Create: `apps/web/app/components/home/features-full.tsx`
- Modify: `apps/web/app/components/about/about-sections.tsx` (insert after the testimonial `</section>`, before the `{/* "About SIGNEX" intro … */}` comment, ~line 221); `apps/web/app/globals.css`; `apps/web/test/dynamic-params.test.mjs` (add a row)
- Delete: `apps/web/app/components/home/features.tsx` (`git rm`)

**Interfaces:** consumes `FeaturesCriteria` (Task 6) + `dict.features` (available on the About page — `AboutSections` receives the full `Dictionary`). Produces `FeaturesFull({ dict, editable? })`.

- [ ] **Step 1: the full block** — create `features-full.tsx`. Structure: head row (heading left + the `features.cta` quote button right — kept on About), the featured workshop video (markup ported from the old `features.tsx` video tile), then the shared criteria grid. **Reveal/w-id rules:** carry NO `data-w-id` and no `opacity:0` inline styles — the old ids are registered under the HOME page's `data-wf-page`, so on /about they would never fire and the block would stay invisible. The `w-background-video` runtime init is page-agnostic (the About hero already uses it). Port the video markup EXACTLY from the current `features.tsx` lines 191–257 (the `image-inner_features` div through the overlay div) with these deltas: drop the `data-w-id` attribute and the `id="w-node-…"` attribute; keep everything else byte-identical (the `t.videoMedia?.kind === "image"` branch, the `video_cover w-background-video w-background-video-atom` branch with `featPoster`/`featMp4`/`featWebm`, the `noscript` fallback, the play/pause button, and the `overlay_media-config` div with `data-sx-overlay="features.video.overlay"`):

```tsx
// app/components/home/features-full.tsx
// The FULL "Vì Sao Các Thương Hiệu Chọn Chúng Tôi" block — rendered on the ABOUT page: header
// (with the quote CTA), the workshop video promoted to the featured position (the client ask:
// "mục video Bên trong xưởng sản xuất đẩy lên đầu làm featured"), then the shared 4-criteria
// grid. Same features block data as the homepage compact block. NO data-w-id reveals here —
// those ids are registered under the HOME data-wf-page and would leave this invisible on /about.
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { editable as editableAttrs } from "@/app/lib/edit-attrs";
import { overlayCss } from "@signex/shared";
import { FeaturesCriteria } from "@/app/components/home/features-criteria";

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
          <div className="sx-features-featured">
            {/* ⬇ PORT the video tile from the deleted features.tsx (its lines ~191–257) here,
                 EXACTLY as it was, minus the data-w-id and the id="w-node-…" attributes:
                 <div className="image-inner_features"> … image branch / w-background-video branch
                 … <div className="overlay_media-config" style={overlayCss(t.videoOverlay)}
                 {...(editable ? { "data-sx-overlay": "features.video.overlay" } : {})} /> </div>
                 followed by the caption block:
                 <div className="content_image-features"> … features.video.title / features.video.text
                 spans … </div> */}
          </div>
          <FeaturesCriteria dict={dict} editable={editable} />
        </div>
      </div>
    </section>
  );
}
```

(The implementer copies the tile verbatim from git — `git show HEAD:apps/web/app/components/home/features.tsx` — so nothing is retyped from memory. `overlayCss` and the `editableAttrs` media caps `{ image: true, video: true }` on the media element come along verbatim.)
- [ ] **Step 2: featured sizing CSS** — the video tile was a grid cell on home; standalone it needs its own box. Append to `globals.css`:

```css
/* About page featured workshop video — the old grid cell rendered standalone: give it a
   determinate box (the vendor video_cover fills absolutely) and centre it above the grid. */
.sx-features-featured {
  max-width: 68rem;
  margin: 0 auto 1.5rem;
}
.sx-features-featured .image-inner_features {
  position: relative;
  height: auto;
  aspect-ratio: 16 / 9;
}
```

- [ ] **Step 3: About insertion** — in `about-sections.tsx`, add `import { FeaturesFull } from "@/app/components/home/features-full";` and insert `<FeaturesFull dict={dict.features} editable={editable} />` between the testimonial section's closing `</section>` and the `{/* "About SIGNEX" intro … */}` comment block.
- [ ] **Step 4: delete** — `git rm apps/web/app/components/home/features.tsx` (Task 6 already removed both renders + its test row; tsc will prove nothing else imports it).
- [ ] **Step 5: test row** — add to `SECTION_ROOT_FILES`: `[["components", "home", "features-full.tsx"], "features", 1],` (the about-sections row stays `7` — the FeaturesFull section lives in its own file).
- [ ] **Step 6:** web tsc → 0; `npm test -w @signex/web` → green. Commit: `git commit -m "feat(web): full features block with featured workshop video on the About page"` (+ trailer, including the deletion).

---

## Final: browser E2E + review + merge

Build `signex-web` (+ `signex-admin` only if Task 5 Step 6 changed admin code) and swap into the stack. E2E per the spec's checklist: contact banner image↔video swap + overlay live-edit + save/reload round-trip; custom colour logo in nav + footer (default stays monochrome); float buttons (hrefs `tel:+84979700072`-style + `zalo.me/09…`, hidden when the entry is emptied); favicon uploaded → published → served in `<head>`; homepage compact block (4 criteria, no media/CTA, reveal still fires); About full block (video featured, visible without home reveals, criteria grid, CTA present); public render leaks no `data-sx-*`. Then the whole-branch review (superpowers:requesting-code-review, most capable model), fix loop, and finishing-a-development-branch (fast-forward merge to `main`; operator deploys; content-level items — favicon assets, contact video, overlays — need an admin **publish** to reach the public site).
