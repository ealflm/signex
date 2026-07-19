# Media Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** The four flexible media slots get a configurable overlay (transparent default; solid colour+opacity or linear gradient), edited in the media dialog, rendered publicly, live-previewed.

**Architecture:** optional `Overlay` union in `@signex/shared`; pure `overlayCss` resolver in `apps/web`; the four render components style their existing scrim `<div>` from it; an "Lớp phủ" section in the media dialog; a new `applyEdits` kind `"overlay"`.

**Tech Stack:** zod, Next 16 (web+admin), the editor bridge.

## Global Constraints
- American "color" in identifiers, British "colour" in prose; **UI copy Vietnamese**.
- `@signex/shared` → CommonJS `dist/`: `npm run build -w @signex/shared` after editing; **do NOT commit `dist/`** (gitignored).
- **No migration**: `overlay` is `.optional()`; absent = transparent; every stored snapshot stays valid.
- Public render leaks zero `data-edit-*`/`data-sx-overlay` (gate on `editable`).
- **NEVER `npm run test` (turbo-all)** — per-workspace only: `-w @signex/shared` / `-w @signex/web` / `-w @signex/admin`.
- `apps/web` tests: `node --test`/jiti, static, run from `apps/web` cwd, registered in the `package.json` `&&` chain. web tsc: `cd apps/web && node /home/ealflm/dev/signex/node_modules/typescript/bin/tsc --noEmit` (npx tsc is a decoy). `apps/admin` tests: vitest, node env, no jsdom, no `@/` alias.
- Every new test **mutation-checked**: mutate, assert the mutation LANDED, watch it fail, restore, watch it pass.
- Branch `feat/media-overlay`. Commit trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Stage explicit paths; no `git add -A`; no merge/push.

---

## Task 1: `Overlay` schema + block fields

**Files:** Modify `packages/shared/src/content/primitives.ts`, `blocks/hero.ts`, `blocks/features.ts`, `blocks/aboutPage.ts`; test `primitives.test.ts` + `blocks/blocks.test.ts`.

**Interfaces produced:** `OverlayFill`, `OverlayStop`, `Overlay` (+ types); `heroBlock`/`featuresBlock`/`aboutPageBlock` gain `overlay: Overlay.optional()` at the four slots.

- [ ] **Step 1: Test** — append to `primitives.test.ts`:
```ts
import { Overlay } from "./primitives";
describe("Overlay", () => {
  const solid = { kind: "solid", fill: { color: "#000000", opacity: 40 } };
  const grad = { kind: "gradient", angle: 0, stops: [{ color: "#000000", opacity: 100, pos: 0 }, { color: "#000000", opacity: 0, pos: 60 }] };
  it("parses a solid overlay", () => expect(Overlay.parse(solid)).toEqual(solid));
  it("parses a 2-stop gradient", () => expect(Overlay.parse(grad)).toEqual(grad));
  it("rejects a gradient with 1 stop", () => expect(() => Overlay.parse({ ...grad, stops: [grad.stops[0]] })).toThrow());
  it("rejects opacity > 100", () => expect(() => Overlay.parse({ kind: "solid", fill: { color: "#000000", opacity: 140 } })).toThrow());
  it("rejects a non-hex colour", () => expect(() => Overlay.parse({ kind: "solid", fill: { color: "black", opacity: 10 } })).toThrow());
  it("rejects more than 4 stops", () => expect(() => Overlay.parse({ ...grad, stops: [grad.stops[0], grad.stops[1], grad.stops[0], grad.stops[1], grad.stops[0]] })).toThrow());
});
```
- [ ] **Step 2:** `npm test -w @signex/shared -- primitives.test` → FAIL (Overlay not exported).
- [ ] **Step 3: Implement** — append to `primitives.ts` (verbatim from the spec's Data model block): `OverlayFill`, `OverlayStop`, `Overlay` (discriminatedUnion "kind" of solid|gradient).
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5: Block fields** — add `overlay: Overlay.optional()` to `heroBlock`, to `features.featured` and `features.video`, to `aboutPage.hero`. Import `Overlay` in each. Append to `blocks.test.ts` a case per block: the block parses with an overlay present AND with it absent. Run `npm test -w @signex/shared -- blocks.test`.
- [ ] **Step 6: Mutation** — change `stops: z.array(OverlayStop).min(2)` to `.min(1)`; confirm the "1 stop" test fails; restore.
- [ ] **Step 7:** `npm run build -w @signex/shared` (build, don't commit dist); `npm test -w @signex/shared` (whole suite green). Commit `primitives.ts` + `primitives.test.ts` + the 3 block files + `blocks.test.ts`.

---

## Task 2: `overlayCss` resolver (shared) + content.ts wiring (web)

**Files:** Create `packages/shared/src/content/overlay-style.ts` + `overlay-style.test.ts`; export from `packages/shared/src/index.ts`; modify `apps/web/app/lib/content.ts`.

**Interface produced:** `overlayCss(o: Overlay | undefined | null): { backgroundColor?: string; backgroundImage?: string }` in `@signex/shared` (both web render AND the admin dialog/save import it — ONE source, since admin can't import from web). content.ts exposes each slot's `overlay: Overlay | undefined` (raw) on the view-model: hero → `t.overlay`; features.featured → `t.featured.overlay`; features.video → `t.videoOverlay` (a sibling key to `t.videoMedia`); aboutPage.hero → `dict.aboutPage.hero.overlay`.

- [ ] **Step 1: Test** — `packages/shared/src/content/overlay-style.test.ts` (vitest):
```ts
import { describe, it, expect } from "vitest";
import { overlayCss } from "./overlay-style";
describe("overlayCss", () => {
  it("undefined → empty (transparent)", () => expect(overlayCss(undefined)).toEqual({}));
  it("solid → rgba backgroundColor", () =>
    expect(overlayCss({ kind: "solid", fill: { color: "#112233", opacity: 50 } })).toEqual({ backgroundColor: "rgba(17, 34, 51, 0.5)" }));
  it("gradient → linear-gradient backgroundImage", () =>
    expect(overlayCss({ kind: "gradient", angle: 0, stops: [{ color: "#000000", opacity: 100, pos: 0 }, { color: "#000000", opacity: 0, pos: 60 }] }))
      .toEqual({ backgroundImage: "linear-gradient(0deg, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0) 60%)" }));
});
```
- [ ] **Step 2:** `npm test -w @signex/shared -- overlay-style` → FAIL.
- [ ] **Step 3: Implement** `packages/shared/src/content/overlay-style.ts`:
```ts
import type { Overlay } from "./primitives";
export type OverlayStyle = { backgroundColor?: string; backgroundImage?: string };
function rgba(color: string, opacity: number): string {
  const r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
}
export function overlayCss(o: Overlay | undefined | null): OverlayStyle {
  if (!o) return {};
  if (o.kind === "solid") return { backgroundColor: rgba(o.fill.color, o.fill.opacity) };
  const stops = o.stops.map((s) => `${rgba(s.color, s.opacity)} ${s.pos}%`).join(", ");
  return { backgroundImage: `linear-gradient(${o.angle}deg, ${stops})` };
}
```
Re-export `overlayCss` (+ `OverlayStyle`) from `packages/shared/src/index.ts` next to the other content exports.
- [ ] **Step 4:** `npm run build -w @signex/shared` (build, don't commit dist); `npm test -w @signex/shared -- overlay-style` → PASS.
- [ ] **Step 5: content.ts** — add the four `overlay` keys (raw `Overlay | undefined` from `b.<block>.overlay`). Match the exact key names in the Interface above (Task 3 reads them). Do NOT resolve to CSS here — the components call `overlayCss`.
- [ ] **Step 6: Mutation** — in `overlayCss`, drop `/ 100` from the alpha; confirm the solid test fails; restore. tsc web = 0. Commit `overlay-style.ts` + its test + `index.ts` + `content.ts` (+ build dist, uncommitted).

---

## Task 3: Render the overlay on the four slots

**Files:** Modify `apps/web/app/components/home/hero.tsx`, `home/features.tsx`, `about/about-sections.tsx`; add a CSS rule.

**Consumes:** `overlayCss` (Task 2) + the view-model `overlay` keys (Task 2 Step 5).

- [ ] **Step 1: CSS** — add `.overlay_media-config { position: absolute; inset: 0; pointer-events: none; z-index: 1; }` to the web's editor stylesheet (find where `.sx-edit-layer` etc. are defined — `apps/web/app/…` global/editor CSS; if unclear, add to `apps/web/app/globals.css`).
- [ ] **Step 2: hero.tsx** — the scrim `<div className="overlay_home-b-hero">` (~line 82). Replace with:
```tsx
<div className="overlay_media-config" style={overlayCss(t.overlay)} {...(editable ? { "data-sx-overlay": "hero.overlay" } : {})} />
```
Import `overlayCss` from `@signex/shared`. `editable` is already in scope (the component receives it). Preserve the div's position in the markup (still a sibling after the media, inside `image_hero-home-a`).
- [ ] **Step 3: features.tsx** — BOTH scrim divs: `overlay_dark-16` at ~line 96 (featured, `style={overlayCss(t.featured.overlay)}`, `data-sx-overlay="features.featured.overlay"`) and ~line 256 (video, `style={overlayCss(t.videoOverlay)}`, `data-sx-overlay="features.video.overlay"`). Same `overlay_media-config` class + editable-gated hook.
- [ ] **Step 4: about-sections.tsx** — BOTH `overlay_hero-home-b` divs (~lines 88 and 114 — one per media branch). Each: `style={overlayCss(dict.aboutPage.hero.overlay)}`, `data-sx-overlay="aboutPage.hero.overlay"`, class `overlay_media-config`. (Same config on both branches; only the rendered branch is in the DOM.)
- [ ] **Step 5:** tsc web = 0. `npm test -w @signex/web` green.
- [ ] **Step 6: Browser-verify** (batched at the end is fine; at minimum confirm the render): with an overlay absent the div is transparent (no bg); inject an overlay into a draft slot and confirm the div shows the colour/gradient; public (non-preview) render has no `data-sx-overlay`. Commit the 3 components + the CSS.

---

## Task 4: Live-preview `applyEdits` kind `"overlay"`

**Files:** Modify `apps/web/app/components/editor/edit-overlay.tsx` (the `applyEdits` handler + its edit-shape comment/type).

- [ ] **Step 1: Implement** — in the `applyEdits` loop, add to the edit type `kind: "…|overlay"` and `css?: { backgroundColor?: string; backgroundImage?: string }`. Add a branch (the field for an overlay is `<block>.overlay`; the elements are `[data-sx-overlay="<field>"]`, not `[data-edit-field]`):
```ts
} else if (ed.kind === "overlay") {
  for (const node of document.querySelectorAll<HTMLElement>(`[data-sx-overlay="${CSS.escape(ed.field)}"]`)) {
    node.style.backgroundColor = ed.css?.backgroundColor ?? "";
    node.style.backgroundImage = ed.css?.backgroundImage ?? "";
  }
}
```
Place it as a sibling branch to the existing `image`/`video`/`text` branches. Note the `els` query at the top uses `[data-edit-field]`; for overlay the target is `[data-sx-overlay]`, so this branch does its OWN query (guard: run the overlay branch before/independent of the `els.length===0 continue`, or query overlay separately). Read the handler and integrate cleanly — the overlay edit's `field` is a `.overlay` path, which has no `[data-edit-field]`, so the existing `els` lookup finds nothing; handle overlay before that early-continue.
- [ ] **Step 2:** tsc web = 0. `npm test -w @signex/web` green.
- [ ] **Step 3: Browser-verify** (batched): post `{type:"applyEdits", edits:[{field:"hero.overlay", kind:"overlay", css:{backgroundColor:"rgba(255,0,0,0.5)"}}]}` → the hero overlay div turns red; post `css:{}` → transparent. Commit.

---

## Task 5: "Lớp phủ" section in the media dialog + overlay reducer

**Files:** Modify `apps/admin/app/(dash)/visual/media-picker-dialog.tsx`; create `apps/admin/app/(dash)/visual/overlay-edit.ts` (pure state helpers) + `overlay-edit.test.ts`.

**Interface produced:** pure helpers `emptyStop()`, `setKind(o, kind)`, `addStop(o)`, `removeStop(o, i)` (clamp 2–4), operating on the working `Overlay | undefined`; the dialog resolves an `Overlay | undefined` and passes it to `onApply` alongside the `MediaRef`.

- [ ] **Step 1: Test** — `overlay-edit.test.ts`: `setKind(undefined, "solid")` → a solid with a default fill; `setKind(x, "none")` → `undefined`; `setKind(undefined, "gradient")` → a 2-stop gradient; `addStop` on a 4-stop gradient is a no-op (max 4); `removeStop` on a 2-stop gradient is a no-op (min 2); `removeStop` on a 3-stop removes the given index. Write the helpers to pass; mutation-check the 2–4 clamp (change `>= 4` to `>= 5`, the max-4 test fails).
- [ ] **Step 2: Dialog UI** — add an **Lớp phủ** section under the media body. A segmented toggle **Không · Màu đặc · Gradient** (`setKind`). Solid: a colour input (reuse the admin's colour input from the colour-panel if one exists — grep `type="color"` / a hex input component; else `<input type="color">` + hex text) + an opacity range (0–100, label "Độ mờ"). Gradient: an angle range/number (0–360, "Góc"); the stops list (colour + opacity + position "Vị trí" each) with **+ Thêm điểm** / **× Xoá** (via addStop/removeStop). A preview swatch styled by `overlayCss` imported from `@signex/shared` (the single source from Task 2). Keep all copy Vietnamese.
- [ ] **Step 3: Resolve + apply** — the dialog holds `overlay: Overlay | undefined` (initialised from the field's current stored overlay, passed in as a prop `initialOverlay`). `onApply` becomes `onApply({ media, overlay })` (or add an `overlay` argument); update the type + the non-flexible callers (they pass `overlay: undefined` and hide the section, OR the section shows for all media dialogs — decide: show for the four flexible slots; a prop `showOverlay?: boolean` gates it, set true only for the flexible slots).
- [ ] **Step 4:** `npm test -w @signex/admin` green (incl. overlay-edit). tsc admin = 0. Commit.

---

## Task 6: Save the overlay + post the live edit

**Files:** Modify `apps/admin/app/(dash)/editor/editor-shell.tsx` (`applyMediaRef` + the picker-open path that computes `initialOverlay`/`showOverlay`).

- [ ] **Step 1:** When opening the picker for a flexible slot, read the field's `<block>.overlay` from the working block data and pass it as `initialOverlay`; set `showOverlay` true. (Non-flexible slots: `showOverlay` false.)
- [ ] **Step 2:** `applyMediaRef` now receives `{ media, overlay }`. Keep the media write (as today). Additionally write the overlay to `<block>.overlay`: set it when present, **delete the key when `undefined`** (cleared → absent = transparent, single-valued). Post a second live edit: `bridge.postApplyEdits([ …the media entry…, { field: "<block>.overlay", kind: "overlay", css: overlayCss(overlay) } ])` — import `overlayCss` from `@signex/shared` (the single source built in Task 2; the dialog's preview swatch in Task 5 should import it too).
- [ ] **Step 3:** tsc admin = 0, tsc web = 0. `npm test -w @signex/admin` + `-w @signex/web` green. Commit.

---

## Final: browser E2E + review + merge

Build `signex-web` + `signex-admin` from the branch, swap into the stack (as done for the media feature). For each of the four slots via the real editor dialog: set a **solid** overlay (colour + opacity) → preview shows it live → save → reload → persisted → public-shaped render shows it; set a **gradient** → same; clear ("Không") → transparent, key deleted. Confirm the public (non-preview) render leaks no `data-sx-overlay`. Confirm the media Ảnh/Video swap still works alongside the overlay. Then dispatch the whole-branch review (superpowers:requesting-code-review), then finishing-a-development-branch (merge to `main` fast-forward; operator deploys).
