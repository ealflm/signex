# Per-element button colours — background + hover, all buttons (design)

**Goal:** Let an editor set the **background** and **hover** colour of **each button individually** (not just site-wide), for every button on the site — the CTA pills, the two floating contact buttons (Zalo / call), and generically any clickable element — plus make the floating buttons' **radar-ring colour** configurable.

**Branch:** `feat/site-adjustments-r3` (extends that round). **Base for planning:** current HEAD (`f29efc0` at design time).

## Confirmed with the user
- **Per-element**, not site-wide: each button can have its own bg + hover.
- Covers **all buttons**, including the **float buttons** (Zalo/call) and their **radar-ring colour**.
- EN/VI toggle + hamburger menu: covered by the **generic** per-element mechanism (no dedicated anchors) — approved default.
- Approach **A + C** approved (see below).

## Current state (audited)
- One themed CTA style on the site: `.cta_primary` + child `.btn-bg` (bg) + `.text-button` span (text), used ~5 places (nav "Nhận báo giá", hero "Gửi Thông Tin", features CTA, contact submit, product-detail "Yêu cầu báo giá"). Reads the **primary** palette tokens.
- **Background:** site-wide via token — yes; per-element via override — reliable only on the **nav** CTA (it has `data-sx-c="nav.cta.color"`); other CTAs have no stable anchor.
- **Hover:** site-wide via `btnPrimaryHoverBg`/`btnPrimaryHoverText` tokens (r3) — yes; **per-element hover — none.** The selector grammar (`packages/shared/src/content/selector.ts`) deliberately **rejects state pseudo-classes** (`:hover`) because the stored selector is emitted verbatim into a `<style>` (stored-XSS defense, commit 7061210).
- Float buttons `.sx-float-btn` are custom (not palette-driven): Zalo bg hardcoded `#0068ff`, call bg = primary token; hover = `filter: brightness`; ring colour = a per-button `--sx-ring` rgb triple consumed as `rgba(var(--sx-ring), α)` in the `sx-float-ping` keyframe.

## Approach (chosen)
- **A — per-element hover via the existing override system, NOT a grammar change.** Store hover colours as **extra fields on the override object**; the **trusted emitter** appends `:hover` when it writes the CSS. The *stored* selector stays pseudo-class-free, so the security property is fully intact (the `:hover` literal comes from our code, never from user input). This reuses the whole override pipeline (stale-audit, alpha slider, clear buttons, defense-in-depth re-validation) and works for **any** clickable element the colour engine can target.
- **C — dedicated block fields only for the float ring colour** (a bespoke `--sx-ring` value, not a bg/text/border role, so it cannot ride the override system).

Rejected: **B** (per-button hover *tokens*) — cannot express true per-individual-button hover.

## Global constraints (binding)
- `@signex/shared` compiles to CommonJS `dist/`; rebuild after schema/emitter edits (`npm run build -w @signex/shared`) before web/admin consume.
- **NEVER `npm run test` at repo root.** Per-workspace only. Web tsc via `node …/node_modules/typescript/bin/tsc --noEmit`.
- **Selector grammar is NOT changed.** `:hover` is appended by the emitter, never stored in `selector`. The stored selector remains validated by `CssSelectorSchema` (rejects pseudo-classes / `}` / `<`), so `${selector}:hover{…}` cannot inject anything.
- All new schema fields are `.optional()` → published snapshot / Themes / draft / `initial-snapshot.ts` stay valid with **no migration, no re-publish, no importer edit** (none is a `.default()` that becomes required in the output type).
- Public render keeps leaking only `data-sx-c` (override targets, by design) — no new preview-only hooks on public.
- NEVER rename existing classes / `data-sx-c` ids / `data-sx-block` keys.

## Part 1 — Per-element hover (the core capability)

**Shared schema** — `packages/shared/src/content/palette.ts`, `PaletteOverrideSchema` (currently `{ selector, bg?, text?, border? }.strict()`): add two optional fields.
```ts
export const PaletteOverrideSchema = z.object({
  selector: CssSelectorSchema,
  bg: HexA.optional(),
  text: HexA.optional(),
  border: HexA.optional(),
  hoverBg: HexA.optional(),    // NEW — per-element hover background
  hoverText: HexA.optional(),  // NEW — per-element hover text
}).strict();
```
(`hoverBorder` intentionally omitted — YAGNI; matches the r3 site-wide hover pair `btnPrimaryHoverBg`/`btnPrimaryHoverText`. Can be added later if needed.)

**Emitter** — `packages/shared/src/content/palette-style.ts` `paletteStyle()`: after emitting the default `selector{…}` rule from `bg/text/border`, emit a **second** rule for hover.
```ts
const ROLE_PROP = { bg: "background-color", text: "color", border: "border-color" } as const;
const HOVER_PROP = { hoverBg: "background-color", hoverText: "color" } as const;
// … existing default-rule loop …
const hoverDecls: string[] = [];
for (const [role, prop] of Object.entries(HOVER_PROP)) {
  const val = ov[role]; if (isHexA(val)) hoverDecls.push(`${prop}:${val}`);
}
if (hoverDecls.length) rules.push(`${ov.selector}:hover{${hoverDecls.join(";")}}`);
```
Each hover value is re-validated with `isHexA` (same defense-in-depth as today). `:hover` is a fixed literal appended to the already-validated `selector`.

**Admin override helpers** — `apps/admin/app/(dash)/editor/_lib/palette-working-set.ts` (`setOverride`, `clearOverrideRole`): widen the role parameter from `ColorRole` (`"bg"|"text"|"border"`) to `OverrideRole = ColorRole | "hoverBg" | "hoverText"`, so they read/write the two new fields on the same selector-keyed override entry. `color-target.ts` `ColorRole` (the colour-engine's *resolved* roles) stays `bg|text|border` — hover is panel-driven, not engine-resolved.

**Admin panel** — `apps/admin/app/(dash)/editor/_panels/color-panel.tsx`: when a target is clicked, below the existing per-element "Nền / Chữ / Viền" rows add a **"Khi rê chuột (hover)"** subsection with two `ColorRow`s — **Nền (hover)** → `hoverBg`, **Chữ (hover)** → `hoverText` — with the alpha slider + clear. Each hover row binds to **its role's own resolved selector** (Nền-hover → the bg role's selector, i.e. the one on `.btn-bg`; Chữ-hover → the text role's selector, i.e. the one on `.text-button`), exactly the per-element selectors the default Nền/Chữ rows already use (`onCommit → setOverride(palette, <that role's selector>, "hoverBg"|"hoverText", hex)`, `onClear → clearOverrideRole(...)`). A hover row shows only for a role whose click resolved a per-element selector. This per-element hover coexists with the r3 site-wide hover tokens (`btnPrimaryHoverBg/Text`): a per-element hover override wins for that one button; unoverridden buttons still follow the site-wide token.

**Result:** click ANY button → set its own background (per-element, existing) + its own hover (new), independent of every other button. Works for CTAs, float buttons (once anchored, Part 2), and generically any element with a resolvable selector (EN/VI, menu).

## Part 2 — Stable anchors on all buttons

Add a colour anchor `data-sx-c="…"` (rendered on public + preview, inert until overridden — exactly like `nav.cta.color`) to the `.cta_primary` `<a>` of each CTA so per-element bg + hover is **reliable** (the colour engine anchors its generated `[data-sx-c="…"] .btn-bg` / `… .text-button` selectors on it):
- `hero-quote-form.tsx` submit CTA → `heroForm.cta`
- `features-full.tsx` CTA → `features.cta.color`
- `contact.tsx` submit CTA → `contactForm.cta`
- `[lang]/products/[slug]/[product]/page.tsx` CTA → `product.cta.color`
- (nav already has `nav.cta.color`.)

Add anchors to the two float buttons in `floating-contact.tsx` (bg is on `.sx-float-btn` itself): `floatBtn.zalo`, `floatBtn.call`. This makes their bg + hover per-element-configurable via Part 1.

Anchors use the `editable(..., { color: "<id>" })` string-anchor form added in r3 (emits `data-sx-c` on both renders). EN/VI + menu get **no** explicit anchor (generic engine-generated selectors cover them when clicked — approved default).

## Part 3 — Float ring colour config

**Shared** — `packages/shared/src/content/blocks/floatingButtons.ts`: add two optional colour fields (using r3's `.describe("color")` → admin colour-picker FieldKind).
```ts
export const floatingButtonsBlock = z.object({
  callHref: z.string().default(""),
  zaloHref: z.string().default(""),
  zaloRingColor: HexA.describe("color").optional(), // NEW — radar-ring colour, Zalo button
  callRingColor: HexA.describe("color").optional(), // NEW — radar-ring colour, call button
}).default({ callHref: "", zaloHref: "" });
```
(Import `HexA` from `../palette`.)

**Web** — `apps/web/app/lib/content.ts` exposes `dict.floatingButtons.{zaloRingColor, callRingColor}`. `floating-contact.tsx` (server component) converts a set hex → `"r, g, b"` triple and sets it inline as `--sx-ring` on that button (the ring keyframe already consumes `rgba(var(--sx-ring), α)`); when unset, no inline style → today's CSS default (Zalo blue / call navy) applies. A tiny `hexToRgbTriple(hex)` helper (in `floating-contact.links.ts`, unit-tested) does the conversion; invalid/absent → null → no inline var.

**Admin/importer:** the fields auto-render as colour pickers (r3 `color` FieldKind, already in `field-editor.tsx`). Optional → no importer / `initial-snapshot.ts` edit.

## Data flow & back-compat
Published `Release.snapshot` → `ReleaseSnapshotSchema.parse` (backfills nothing new; all additions optional) → `resolveForLang`. Old overrides (no hover fields) emit exactly as today. Old snapshots (no ring-colour fields) → float rings keep the CSS default. `.strict()` on the override object still holds (hover fields are new *known* keys). Zero migration.

## Error handling & edge cases
- Override with only hover fields (no default bg/text) → emitter still emits the `:hover` rule (and no default rule) — valid.
- Non-hex hover value in a stored snapshot → dropped by `isHexA` (defense in depth), never reaches the stylesheet.
- The stale-selector audit (r3 page-aware) is unchanged: it audits the `selector` (hover shares it), so a broken button selector surfaces once and clearing it removes bg + hover together (they're one entry).
- Float ring hex malformed → `hexToRgbTriple` returns null → no inline `--sx-ring` → CSS default.
- Setting a per-element hover on the `.text-button` vs `.btn-bg`: the engine resolves each role's own selector (text on the span, bg on `.btn-bg`), so hover-bg and hover-text land on the correct child — same resolution the default rows already use.

## Testing
- **shared:** `palette.test.ts` — override accepts hoverBg/hoverText, rejects non-hex, `.strict()` still rejects unknown keys; `palette-style.test.ts` — an override with hover fields emits a `selector:hover{…}` rule with the right props, and none when hover unset; `floatingButtons` test — ring-colour fields optional + `.describe("color")` marker.
- **admin:** `setOverride`/`clearOverrideRole` handle the two hover roles; colour panel renders the hover subsection for a clicked element (existing test style).
- **web:** `hexToRgbTriple` unit tests; float component sets `--sx-ring` from config, falls back when unset.
- tsc + per-workspace chains; `npm run build -w @signex/shared` after schema/emitter; final turbo build.
- **Manual (editor):** click hero/features/contact/product CTAs → set distinct bg + hover each; click Zalo/call → set bg + hover + ring colour; verify on public after publish that each button's hover differs and rings recolour; confirm old overrides unaffected.

## Out of scope
`hoverBorder` per element; explicit anchors for EN/VI + menu (generic mechanism covers them); secondary/tertiary button *types* (unused on the site); changing the float hover from brightness to a colour by default (only applies if the user sets a per-element hover-bg); animating the ring via `color-mix` (the hex→rgb-triple conversion keeps the keyframe unchanged).
