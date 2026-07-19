# Editable Site Colors (Theme Palette) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin recolor the entire public site from the CMS — by clicking a themed element in the live preview (new `data-edit-kind="color"`) or via a "Bảng màu" panel — with colours stored in the per-Theme snapshot and flowing through the existing Publish pipeline.

**Architecture:** The Caladan template is already a CSS-custom-property token system: every colour derives from ~8 seed variables at `:root`. We add an optional `palette` slice to `ReleaseSnapshotSchema` (seeds + `:root` token overrides + per-element overrides keyed by a stable `anchorId`). The web emits a single `<style id="signex-palette">` after the template CSS that overrides those variables (site-wide) plus `[data-sx-c="…"]` rules (per element). The admin edits the palette through the same `pending` → save-draft → Publish flow used for content.

**Tech Stack:** zod (`@signex/shared`) · Next.js 16 (`apps/web`, `apps/admin`) · NestJS 11 (`apps/api`) · Prisma 6 (snapshot is `Json`, no migration) · vitest (shared/admin/api) · `node --test`/`jiti` (web).

## Global Constraints

- **Monorepo build order:** `@signex/shared` MUST be recompiled to `dist/` (`npm run build -w @signex/shared` or root `npm run build`) before `apps/*`/`apps/api` see new exports — they import from `./dist/index.js`, not source. Rebuild shared after Task 1.
- **`schemaVersion` stays `1`.** `palette` is an ADDITIVE, OPTIONAL field. Snapshots without it must keep parsing and emit no style.
- **Public render must stay byte-identical when no palette is set.** `editColor()` returns `{}` when `editable` is falsy for the preview-only attrs; the only public attribute it ever adds is `data-sx-c` on curated anchored elements. `paletteStyle()` returns `null` (renders nothing) for an empty/absent palette.
- **Exact CSS variable names carry a literal emoji.** The seed/token variables are `--_🎨-color--…` (that is: `--_`, then the 🎨 emoji, then `-color--…`). Copy them verbatim; never re-type by hand.
- **Next 16 in `apps/web`/`apps/admin` differs from training data.** Before editing a Next file, read the relevant guide under `node_modules/next/dist/docs/` (per `apps/web/AGENTS.md`).
- **No new heavy dependency** without calling it out. Colour input = native `<input type="color">` + hex text field. The click popover may add the shadcn `popover` primitive (Task 10) — that is the only permitted new UI dep.
- **Hex format stored:** `#rrggbb` or `#rgb` (lowercase not required). Alpha is NOT stored (the token system derives transparency from the `-100` seeds).
- **Commit after every task** with the shown message.

---

## File Structure

**Create:**
- `packages/shared/src/content/palette.ts` — Palette schemas + `PALETTE_VARS` (seed) + `TOKEN_VARS` (token) constant maps (cssVar/default/label). Single source of truth for keys↔CSS-variables.
- `packages/shared/src/content/palette.test.ts` — schema + constants tests.
- `packages/shared/src/content/palette-style.ts` — `paletteStyle(palette)` pure emitter (string|null); shared by web render + admin live preview.
- `packages/shared/src/content/palette-style.test.ts` — emitter tests (vitest).
- `apps/web/app/components/editor/palette-style.tsx` — tiny server component `<PaletteStyle palette>` wrapping the emitter output in a `<style id="signex-palette">`.
- `apps/admin/app/(dash)/editor/_lib/palette-patch.ts` — pure reducers over the client palette patch (set seed/token/override, reset).
- `apps/admin/app/(dash)/editor/_lib/palette-patch.test.ts` — reducer tests.
- `apps/admin/app/(dash)/editor/palette-panel.tsx` — the "Bảng màu" panel (seeds + advanced tokens).
- `apps/admin/app/(dash)/editor/color-popover.tsx` — the click popover (token / element modes).

**Modify:**
- `packages/shared/src/content/release.ts` — add `palette: PaletteSchema.optional()`.
- `packages/shared/src/index.ts` — `export * from "./content/palette"`.
- `apps/web/app/lib/content.ts` — surface `palette` on the resolved `SiteContent`.
- `apps/web/app/[lang]/layout.tsx` — render `<PaletteStyle>` in `<head>` after the CSS links.
- `apps/web/app/preview/[lang]/page.tsx` — render `<PaletteStyle>` inside the dynamic subtree.
- `apps/web/app/lib/edit-attrs.ts` — add `editColor()` + `EditColorSpec`.
- Curated web components (Task 5) — stamp `editColor(...)` on anchored elements.
- `apps/web/app/components/editor/edit-overlay.tsx` — colour zones, `colorEdit` dispatch, `applyPalette` inbound.
- `apps/api/src/theme/save-draft.dto.ts` — optional `palette` on the schema.
- `apps/api/src/theme/theme.service.ts` — merge `palette` into `snap.palette` in the saveDraft mutator.
- `apps/api/src/theme/theme.service.spec.ts` — palette save test.
- `apps/admin/app/(dash)/editor/editor-shell.tsx` — `pendingPalette` state, save payload, `applyPalette` post, popover wiring.
- `apps/admin/app/(dash)/editor/sections-nav.tsx` — a "Bảng màu" nav entry.

---

## Task 1: Shared — Palette schema, constants, and snapshot wiring

**Files:**
- Create: `packages/shared/src/content/palette.ts`
- Create: `packages/shared/src/content/palette.test.ts`
- Modify: `packages/shared/src/content/release.ts`
- Modify: `packages/shared/src/index.ts`
- Test (existing): `packages/shared/src/content/release.test.ts`

**Interfaces:**
- Produces:
  - `PaletteSchema` (zod) and `type Palette = z.infer<typeof PaletteSchema>`
  - `type PaletteSeeds`, `type PaletteTokens`, `type PaletteOverrides`, `type PaletteOverrideRoles = { bg?: string; text?: string; border?: string }`
  - `SEED_KEYS: readonly string[]`, `TOKEN_KEYS: readonly string[]`
  - `PALETTE_VARS: Record<SeedKey, { cssVar: string; default: string; label: string }>`
  - `TOKEN_VARS: Record<TokenKey, { cssVar: string; label: string }>`
  - `ReleaseSnapshot.palette?: Palette`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/content/palette.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  PaletteSchema,
  PALETTE_VARS,
  TOKEN_VARS,
  SEED_KEYS,
} from "./palette";

describe("PaletteSchema", () => {
  it("accepts a full valid palette (seeds + tokens + overrides)", () => {
    const r = PaletteSchema.safeParse({
      seeds: { accentAqua: "#2ec4b6", baseDark: "#0b1f33" },
      tokens: { inkBase: "#ffffff" },
      overrides: { "hero.cta": { bg: "#ff0000", text: "#fff" } },
    });
    expect(r.success).toBe(true);
  });

  it("accepts an empty palette object", () => {
    expect(PaletteSchema.safeParse({}).success).toBe(true);
  });

  it("rejects a non-hex seed value", () => {
    const r = PaletteSchema.safeParse({ seeds: { accentAqua: "teal" } });
    expect(r.success).toBe(false);
  });

  it("rejects an unknown token key", () => {
    const r = PaletteSchema.safeParse({ tokens: { notAToken: "#fff" } });
    expect(r.success).toBe(false);
  });

  it("rejects an unknown override role", () => {
    const r = PaletteSchema.safeParse({
      overrides: { "hero.cta": { glow: "#fff" } },
    });
    expect(r.success).toBe(false);
  });
});

describe("PALETTE_VARS / TOKEN_VARS", () => {
  it("has a cssVar+default+label for every seed key", () => {
    for (const k of SEED_KEYS) {
      expect(PALETTE_VARS[k].cssVar.startsWith("--_")).toBe(true);
      expect(PALETTE_VARS[k].default).toMatch(/^#[0-9a-f]{3,6}$/i);
      expect(PALETTE_VARS[k].label.length).toBeGreaterThan(0);
    }
  });

  it("maps accentAqua to the exact template variable", () => {
    expect(PALETTE_VARS.accentAqua.cssVar).toBe(
      "--_🎨-color--base---accent--aqua",
    );
  });

  it("maps inkBase to the ink token variable", () => {
    expect(TOKEN_VARS.inkBase.cssVar).toBe("--_🎨-color--tokens---ink--base");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @signex/shared`
Expected: FAIL — `Cannot find module './palette'`.

- [ ] **Step 3: Create the palette module**

Create `packages/shared/src/content/palette.ts`:

```ts
import { z } from "zod";

/** #rgb or #rrggbb. Alpha is NOT stored — the token system derives transparency from the seeds. */
export const Hex = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "must be a #rgb or #rrggbb hex colour");

// ── Tier A: the 8 seed swatches. Overriding these re-themes the whole site. ──
// cssVar values are copied VERBATIM from caladan-template.shared.*.css (emoji is literal).
export const PALETTE_VARS = {
  accentAqua:      { cssVar: "--_🎨-color--base---accent--aqua",      default: "#2ec4b6", label: "Màu nhấn (aqua)" },
  accentOcean:     { cssVar: "--_🎨-color--base---accent--ocean",     default: "#0f4c81", label: "Đại dương" },
  accentDarkOcean: { cssVar: "--_🎨-color--base---accent--dark-ocean", default: "#0d2b44", label: "Đại dương đậm" },
  accentDeepNavy:  { cssVar: "--_🎨-color--base---accent--deep-navy", default: "#071522", label: "Navy sâu" },
  baseDark:        { cssVar: "--_🎨-color--base---base--dark-100",    default: "#0b1f33", label: "Nền tối" },
  baseLight:       { cssVar: "--_🎨-color--base---base--light-100",   default: "#ffffff", label: "Nền sáng" },
  liftDark:        { cssVar: "--_🎨-color--base---lift--dark",        default: "#272727", label: "Lift tối" },
  liftLight:       { cssVar: "--_🎨-color--base---lift--light",       default: "#d9d9d9", label: "Lift sáng" },
} as const;

export type SeedKey = keyof typeof PALETTE_VARS;
export const SEED_KEYS = Object.keys(PALETTE_VARS) as SeedKey[];

// ── Tier B: :root-level semantic tokens worth overriding site-wide. ──
// Allowlist only; section-scoped re-declarations still win locally (documented limitation).
export const TOKEN_VARS = {
  inkBase:            { cssVar: "--_🎨-color--tokens---ink--base",                        label: "Chữ chính" },
  inkLift:            { cssVar: "--_🎨-color--tokens---ink--lift",                        label: "Chữ nổi" },
  inkSemi:            { cssVar: "--_🎨-color--tokens---ink--semi-transparent",            label: "Chữ mờ" },
  btnPrimaryBg:       { cssVar: "--_🎨-color--tokens---button--primary--default--background", label: "Nút chính — nền" },
  btnPrimaryText:     { cssVar: "--_🎨-color--tokens---button--primary--default--text",       label: "Nút chính — chữ" },
  btnPrimaryHoverBg:  { cssVar: "--_🎨-color--tokens---button--primary--hover--background",    label: "Nút chính — nền (hover)" },
  btnSecondaryBg:     { cssVar: "--_🎨-color--tokens---button--secondary--default--background", label: "Nút phụ — nền" },
  btnSecondaryText:   { cssVar: "--_🎨-color--tokens---button--secondary--default--text",       label: "Nút phụ — chữ" },
  btnTertiaryText:    { cssVar: "--_🎨-color--tokens---button--tertiary--default--text",         label: "Nút chữ — màu chữ" },
  inputDefaultBg:     { cssVar: "--_🎨-color--tokens---input--default--background",         label: "Ô nhập — nền" },
  inputDefaultText:   { cssVar: "--_🎨-color--tokens---input--default--text",               label: "Ô nhập — chữ" },
  inputActiveBorder:  { cssVar: "--_🎨-color--tokens---input--active--border",              label: "Ô nhập — viền (active)" },
} as const;

export type TokenKey = keyof typeof TOKEN_VARS;
export const TOKEN_KEYS = Object.keys(TOKEN_VARS) as TokenKey[];

const SeedKeyEnum = z.enum(SEED_KEYS as [SeedKey, ...SeedKey[]]);
const TokenKeyEnum = z.enum(TOKEN_KEYS as [TokenKey, ...TokenKey[]]);

export const PaletteSeedsSchema = z.record(SeedKeyEnum, Hex);
export const PaletteTokensSchema = z.record(TokenKeyEnum, Hex);
export const PaletteOverrideRolesSchema = z
  .object({ bg: Hex, text: Hex, border: Hex })
  .partial()
  .strict();
/** Keyed by anchorId = the same "<blockKey>.<path>" string used by data-edit-field. */
export const PaletteOverridesSchema = z.record(z.string(), PaletteOverrideRolesSchema);

export const PaletteSchema = z
  .object({
    seeds: PaletteSeedsSchema.optional(),
    tokens: PaletteTokensSchema.optional(),
    overrides: PaletteOverridesSchema.optional(),
  })
  .strict();

export type PaletteSeeds = z.infer<typeof PaletteSeedsSchema>;
export type PaletteTokens = z.infer<typeof PaletteTokensSchema>;
export type PaletteOverrideRoles = z.infer<typeof PaletteOverrideRolesSchema>;
export type PaletteOverrides = z.infer<typeof PaletteOverridesSchema>;
export type Palette = z.infer<typeof PaletteSchema>;
```

> Note: `z.record(z.enum(...), …)` yields a partial record (all keys optional), which is exactly what we want — seeds/tokens are sparse.

- [ ] **Step 4: Wire palette into the snapshot schema**

In `packages/shared/src/content/release.ts`, add the import and the optional field:

```ts
import { PaletteSchema } from "./palette";
// …
export const ReleaseSnapshotSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  blocks: z.object(BLOCK_REGISTRY),
  catalog: FrozenCatalog.optional(),
  assets: z.record(z.string(), FrozenAsset),
  palette: PaletteSchema.optional(),
});
```

In `packages/shared/src/index.ts`, add after the other content re-exports (line ~37):

```ts
export * from "./content/palette";
```

- [ ] **Step 5: Add a backward-compat assertion to `release.test.ts`**

Append to `packages/shared/src/content/release.test.ts` (inside the existing `describe("ReleaseSnapshotSchema", …)`):

```ts
  it("parses a snapshot with NO palette (backward compat)", () => {
    const base = {
      schemaVersion: 1,
      blocks: VALID_BLOCKS,
      assets: { [CUID]: MIN_ASSET },
    };
    expect(ReleaseSnapshotSchema.safeParse(base).success).toBe(true);
  });

  it("parses a snapshot WITH a palette", () => {
    const withPalette = {
      schemaVersion: 1,
      blocks: VALID_BLOCKS,
      assets: { [CUID]: MIN_ASSET },
      palette: { seeds: { accentAqua: "#123456" } },
    };
    expect(ReleaseSnapshotSchema.safeParse(withPalette).success).toBe(true);
  });
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test -w @signex/shared`
Expected: PASS (palette.test.ts + release.test.ts).

- [ ] **Step 7: Rebuild shared so downstream apps see the new exports**

Run: `npm run build -w @signex/shared`
Expected: `dist/` rebuilt, no TS errors.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/content/palette.ts packages/shared/src/content/palette.test.ts packages/shared/src/content/release.ts packages/shared/src/content/release.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): add optional Palette slice to ReleaseSnapshot"
```

---

## Task 2: Shared — `paletteStyle()` emitter

> Authored in `@signex/shared` (not web) because BOTH `apps/web` (render) and `apps/admin` (live
> preview `applyPalette`) need the identical CSS string. It depends only on `PALETTE_VARS`/`TOKEN_VARS`.

**Files:**
- Create: `packages/shared/src/content/palette-style.ts`
- Create: `packages/shared/src/content/palette-style.test.ts`
- Modify: `packages/shared/src/index.ts` (`export * from "./content/palette-style"`)

**Interfaces:**
- Consumes: `PALETTE_VARS`, `TOKEN_VARS`, `type Palette` from `./palette` (Task 1).
- Produces: `export function paletteStyle(palette: Palette | undefined | null): string | null`.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/content/palette-style.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { paletteStyle } from "./palette-style";

describe("paletteStyle", () => {
  it("returns null for absent/empty palette", () => {
    expect(paletteStyle(undefined)).toBeNull();
    expect(paletteStyle(null)).toBeNull();
    expect(paletteStyle({})).toBeNull();
    expect(paletteStyle({ seeds: {}, tokens: {}, overrides: {} })).toBeNull();
  });

  it("emits only present seed vars at :root", () => {
    const css = paletteStyle({ seeds: { accentAqua: "#123456" } })!;
    expect(css).toMatch(/:root\{/);
    expect(css).toContain("--_🎨-color--base---accent--aqua:#123456");
    expect(css).not.toMatch(/ocean/);
  });

  it("emits token vars at :root", () => {
    const css = paletteStyle({ tokens: { inkBase: "#abcdef" } })!;
    expect(css).toContain("--_🎨-color--tokens---ink--base:#abcdef");
  });

  it("emits per-anchor override rules", () => {
    const css = paletteStyle({ overrides: { "hero.cta": { bg: "#ff0000", text: "#ffffff" } } })!;
    expect(css).toContain('[data-sx-c="hero.cta"]{background-color:#ff0000;color:#ffffff}');
  });

  it("skips invalid hex defensively (never trusts caller)", () => {
    expect(paletteStyle({ seeds: { accentAqua: "javascript:alert(1)" } as never })).toBeNull();
  });

  it("escapes anchorId to prevent selector breakout", () => {
    const css = paletteStyle({ overrides: { 'a"]{}': { bg: "#000000" } } })!;
    expect(css).not.toMatch(/\]\{\}/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @signex/shared`
Expected: FAIL — cannot resolve `./palette-style`.

- [ ] **Step 3: Write the emitter**

Create `packages/shared/src/content/palette-style.ts`:

```ts
import { PALETTE_VARS, TOKEN_VARS } from "./palette";
import type { Palette } from "./palette";

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const isHex = (v: unknown): v is string => typeof v === "string" && HEX.test(v);

/** CSS.escape is browser-only; this covers the attribute-selector metacharacters we care about. */
function escapeAttr(v: string): string {
  return v.replace(/["\\\n\r]/g, (c) => "\\" + c);
}

/**
 * Build the CSS text for a palette, or null when there is nothing to emit.
 * Every value is re-validated against HEX here (defence in depth — never trust the stored snapshot),
 * so no free-form string can reach the stylesheet.
 */
export function paletteStyle(palette: Palette | undefined | null): string | null {
  if (!palette) return null;

  const rootDecls: string[] = [];
  for (const [key, val] of Object.entries(palette.seeds ?? {})) {
    const meta = PALETTE_VARS[key as keyof typeof PALETTE_VARS];
    if (meta && isHex(val)) rootDecls.push(`${meta.cssVar}:${val}`);
  }
  for (const [key, val] of Object.entries(palette.tokens ?? {})) {
    const meta = TOKEN_VARS[key as keyof typeof TOKEN_VARS];
    if (meta && isHex(val)) rootDecls.push(`${meta.cssVar}:${val}`);
  }

  const rules: string[] = [];
  for (const [anchorId, roles] of Object.entries(palette.overrides ?? {})) {
    const parts: string[] = [];
    if (isHex(roles.bg)) parts.push(`background-color:${roles.bg}`);
    if (isHex(roles.text)) parts.push(`color:${roles.text}`);
    if (isHex(roles.border)) parts.push(`border-color:${roles.border}`);
    if (parts.length) rules.push(`[data-sx-c="${escapeAttr(anchorId)}"]{${parts.join(";")}}`);
  }

  let css = rootDecls.length ? `:root{${rootDecls.join(";")}}` : "";
  css += rules.join("");
  return css || null;
}
```

- [ ] **Step 4: Export it from shared**

In `packages/shared/src/index.ts`, add after the palette export:

```ts
export * from "./content/palette-style";
```

- [ ] **Step 5: Run tests + rebuild shared**

Run: `npm run test -w @signex/shared && npm run build -w @signex/shared`
Expected: PASS (6 tests); `dist/` rebuilt.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/content/palette-style.ts packages/shared/src/content/palette-style.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): paletteStyle() — emit :root + per-anchor override CSS"
```

---

## Task 3: Web — surface palette in content.ts and render the style tag

**Files:**
- Modify: `apps/web/app/lib/content.ts`
- Create: `apps/web/app/components/editor/palette-style.tsx`
- Modify: `apps/web/app/[lang]/layout.tsx`
- Modify: `apps/web/app/preview/[lang]/page.tsx`

**Interfaces:**
- Consumes: `paletteStyle` (Task 2), `SiteContent` gains `palette`.
- Produces: `SiteContent.palette: Palette | undefined`; `<PaletteStyle palette={…} />` server component.

- [ ] **Step 1: Surface `palette` on the resolved content**

In `apps/web/app/lib/content.ts`, inside `resolveForLang`'s returned object (the `return { … }` at line ~92), add a top-level `palette` field sourced from the raw snapshot:

```ts
  return {
    palette: snap.palette,        // ← raw Palette (locale-agnostic); undefined on INITIAL_SNAPSHOT
    // …existing resolved fields unchanged…
  };
```

Because `SiteContent = ReturnType<typeof resolveForLang>`, the type picks up `palette` automatically. No other change needed here.

- [ ] **Step 2: Create the `<PaletteStyle>` server component**

Create `apps/web/app/components/editor/palette-style.tsx`:

```tsx
import type { Palette } from "@signex/shared";
import { paletteStyle } from "@signex/shared";

/**
 * Emits the site palette override AFTER the template CSS so its :root declarations win by source
 * order. Renders nothing when there is no palette (public byte-identical to pre-feature). Safe:
 * paletteStyle() re-validates every value to a hex and allow-lists variable names, so the string
 * carries no untrusted content.
 */
export function PaletteStyle({ palette }: { palette: Palette | undefined | null }) {
  const css = paletteStyle(palette);
  if (!css) return null;
  return <style id="signex-palette" dangerouslySetInnerHTML={{ __html: css }} />;
}
```

- [ ] **Step 3: Render it in the public layout**

In `apps/web/app/[lang]/layout.tsx`:
- Add the import near the top: `import { PaletteStyle } from "@/app/components/editor/palette-style";`
- In `<head>`, immediately AFTER the `ibm-plex-mono.css` link (line ~90), add:

```tsx
        <PaletteStyle palette={dict.palette} />
```

- [ ] **Step 4: Render it in the preview page**

In `apps/web/app/preview/[lang]/page.tsx`:
- Add the import: `import { PaletteStyle } from "@/app/components/editor/palette-style";`
- Inside `PreviewHome`'s returned JSX, as the FIRST child of `<div className="page-wrapper">` (before `<Navbar>`), add:

```tsx
      <PaletteStyle palette={dict.palette} />
```

(A `<style>` in the body still applies globally via the `:root` selector and, being after the `<head>` links, wins by source order. The overlay live-swaps this same `#signex-palette` node in Task 6.)

- [ ] **Step 5: Verify the readpath still parses + build the web app**

Run: `cd apps/web && node scripts/verify-readpath.mjs && npx tsc --noEmit`
Expected: readpath OK; no type errors (confirms `dict.palette` typechecks in both layout and preview page).

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/lib/content.ts apps/web/app/components/editor/palette-style.tsx apps/web/app/[lang]/layout.tsx apps/web/app/preview/[lang]/page.tsx
git commit -m "feat(web): render #signex-palette from the resolved snapshot palette"
```

---

## Task 4: Web — `editColor()` instrumentation helper

**Files:**
- Modify: `apps/web/app/lib/edit-attrs.ts`
- Create: `apps/web/app/lib/edit-attrs.test.mjs`
- Modify: `apps/web/package.json` (append test)

**Interfaces:**
- Produces:
  - `type EditColorRole = "bg" | "text" | "border"`
  - `interface EditColorSpec { token?: string; roles: EditColorRole[] }`
  - `function editColor(editable, anchorId, spec): Record<string,string>`
  - Public render always gets `data-sx-c="<anchorId>"`; preview also gets `data-edit-field`, `data-edit-kind="color"`, `data-edit-color-token`, `data-edit-color-roles`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/lib/edit-attrs.test.mjs`:

```mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { editColor } from "./edit-attrs.ts";

test("public render stamps only the stable anchor attribute", () => {
  const a = editColor(false, "hero.cta", { token: "btnPrimaryBg", roles: ["bg", "text"] });
  assert.deepEqual(a, { "data-sx-c": "hero.cta" });
});

test("preview render adds the edit hooks", () => {
  const a = editColor(true, "hero.cta", { token: "btnPrimaryBg", roles: ["bg", "text"] });
  assert.equal(a["data-sx-c"], "hero.cta");
  assert.equal(a["data-edit-field"], "hero.cta");
  assert.equal(a["data-edit-kind"], "color");
  assert.equal(a["data-edit-color-token"], "btnPrimaryBg");
  assert.equal(a["data-edit-color-roles"], "bg,text");
});

test("token is optional (element-only override anchor)", () => {
  const a = editColor(true, "footer.bar", { roles: ["bg"] });
  assert.equal(a["data-edit-color-token"], undefined);
  assert.equal(a["data-edit-color-roles"], "bg");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx jiti app/lib/edit-attrs.test.mjs`
Expected: FAIL — `editColor` is not exported.

- [ ] **Step 3: Add `editColor` to `edit-attrs.ts`**

Append to `apps/web/app/lib/edit-attrs.ts`:

```ts
export type EditColorRole = "bg" | "text" | "border";

export interface EditColorSpec {
  /** Palette token key (from @signex/shared TOKEN_VARS/PALETTE_VARS) this element paints from.
   *  Omit for anchors that only support a per-element override (no obvious shared token). */
  token?: string;
  /** Which CSS roles on this element are overridable (drives the popover's role chooser). */
  roles: EditColorRole[];
}

/**
 * Stamp a colour-anchored element. Unlike editText/editAttrs, this ALWAYS returns the stable
 * `data-sx-c` anchor (public + preview) so per-element override CSS ([data-sx-c="…"]) applies on
 * the live site. The data-edit-* hooks (the click surface + popover metadata) are preview-only.
 */
export function editColor(
  editable: boolean | undefined,
  anchorId: string,
  spec: EditColorSpec,
): Record<string, string> {
  const anchor = { "data-sx-c": anchorId };
  if (!editable) return anchor;
  return {
    ...anchor,
    "data-edit-field": anchorId,
    "data-edit-kind": "color",
    ...(spec.token ? { "data-edit-color-token": spec.token } : {}),
    "data-edit-color-roles": spec.roles.join(","),
  };
}
```

Also extend the `EditKind` union at the top of the file:

```ts
export type EditKind = "image" | "video" | "text" | "color";
```

- [ ] **Step 4: Register + run the test**

Append to the `apps/web/package.json` `"test"` chain: ` && jiti app/lib/edit-attrs.test.mjs`

Run: `cd apps/web && npx jiti app/lib/edit-attrs.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/lib/edit-attrs.ts apps/web/app/lib/edit-attrs.test.mjs apps/web/package.json
git commit -m "feat(web): editColor() — stable colour anchors + preview edit hooks"
```

---

## Task 5: Web — stamp the curated anchor set

**Files:**
- Modify: `apps/web/app/components/home/hero.tsx` (and the other components below)

**Interfaces:**
- Consumes: `editColor` (Task 4).
- Produces: DOM elements carrying `data-sx-c` + preview colour hooks. AnchorIds used downstream: `hero.titleBottom`, and one primary button + one section background per the list below.

> This task establishes the pattern + a starter set. Each anchor is (anchorId, token, roles). The anchorId reuses the element's semantic path (matching `data-edit-field` convention). Coverage can grow later; the panel (Task 9) covers everything regardless.

**Starter anchor set** (stamp each by spreading `editColor(editable, <id>, <spec>)` onto the element):

| anchorId | element | token | roles |
|---|---|---|---|
| `hero.titleBottom` | the `.tone-medium` accent span in `hero.tsx` | `accentAqua` | `["text"]` |
| `nav.cta` | the navbar primary CTA button (`.cta_primary`) in `navbar.tsx` | `btnPrimaryBg` | `["bg","text"]` |
| `footer.bar` | the footer root surface (`.master_footer`) in `footer.tsx` | `baseDark` | `["bg"]` |

- [ ] **Step 1: Stamp the hero accent span**

In `apps/web/app/components/home/hero.tsx`, add `editColor` to the existing import, and spread it onto the `.tone-medium` span (line ~26):

```tsx
import { editAttrs, editText, editColor } from "@/app/lib/edit-attrs";
// …
                      <span
                        className="tone-medium"
                        {...editText(editable, "hero.titleBottom")}
                        {...editColor(editable, "hero.titleBottom", { token: "accentAqua", roles: ["text"] })}
                      >
```

> Two spreads on one element is fine — `editText` supplies `data-edit-kind="text"`, `editColor` supplies `data-edit-kind="color"`; the SECOND spread wins for the duplicated `data-edit-field`/`data-edit-kind`. To avoid ambiguity, **do not double-stamp the same element** in the final set. For `hero.titleBottom`, prefer a WRAPPER: keep `editText` on the inner text span and put `editColor` on its parent. Concretely, wrap:
> ```tsx
> <span className="tone-medium" {...editColor(editable, "hero.titleBottom.color", { token: "accentAqua", roles: ["text"] })}>
>   <span {...editText(editable, "hero.titleBottom")}>{t.titleBottom}</span>
> </span>
> ```
> Use the anchorId `hero.titleBottom.color` so it never collides with the text field `hero.titleBottom`.

- [ ] **Step 2: Stamp the navbar CTA and footer surface**

Open `apps/web/app/components/navbar.tsx`; find the primary CTA (class contains `cta_primary`). Add the import and spread:

```tsx
import { editColor } from "@/app/lib/edit-attrs";
// on the CTA element:
{...editColor(editable, "nav.cta.color", { token: "btnPrimaryBg", roles: ["bg", "text"] })}
```

Open `apps/web/app/components/footer.tsx`; find the root `.master_footer` element. Add:

```tsx
{...editColor(editable, "footer.bar.color", { token: "baseDark", roles: ["bg"] })}
```

(If a component doesn't already receive `editable`, thread the existing `editable?: boolean` prop the same way its siblings do — every shared section component already takes it.)

- [ ] **Step 3: Verify public render adds ONLY `data-sx-c`**

Run: `cd apps/web && npx tsc --noEmit`
Then manual check (Task 11 covers the browser pass): a public page's CTA has `data-sx-c="nav.cta.color"` and NO `data-edit-*`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/components/home/hero.tsx apps/web/app/components/navbar.tsx apps/web/app/components/footer.tsx
git commit -m "feat(web): stamp starter colour anchors (hero accent, nav CTA, footer)"
```

---

## Task 6: Web — overlay colour zones, colorEdit dispatch, applyPalette live-swap

**Files:**
- Modify: `apps/web/app/components/editor/edit-overlay.tsx`

**Interfaces:**
- Consumes: `data-edit-kind="color"` elements (Task 5), `#signex-palette` node (Task 3).
- Produces (postMessage protocol additions):
  - preview → admin: `{ source, type: "colorEdit", field, token, roles }`
  - admin → preview: `{ source, type: "applyPalette", css }` — replaces `#signex-palette`'s text content.

- [ ] **Step 1: Add colour-zone hover/click styles**

In the overlay's injected `<style>` block (near the existing `[data-edit-kind="text"]` rules ~line 94), add:

```css
      [data-edit-kind="color"] { cursor: pointer; }
      [data-edit-kind="color"]:hover { outline: 2px dashed #4956e3; outline-offset: 2px; }
```

- [ ] **Step 2: Dispatch `colorEdit` on click (capture phase, like inline text)**

In the capture-phase click handler (the block near line ~522 that intercepts inline-text clicks), add a colour branch BEFORE the navigation-interception logic:

```ts
      const colorEl = (e.target as Element | null)?.closest?.(
        '[data-edit-kind="color"]',
      ) as HTMLElement | null;
      if (colorEl) {
        e.preventDefault();
        e.stopPropagation();
        window.parent.postMessage(
          {
            source: SOURCE,
            type: "colorEdit",
            field: colorEl.getAttribute("data-edit-field") ?? "",
            token: colorEl.getAttribute("data-edit-color-token") ?? "",
            roles: (colorEl.getAttribute("data-edit-color-roles") ?? "").split(",").filter(Boolean),
          },
          "*",
        );
        return;
      }
```

- [ ] **Step 3: Handle `applyPalette` inbound (live swap, no reload)**

In the inbound `message` handler (where `applyEdits` / `refresh` / `highlight` are handled, ~line 594+), add:

```ts
      if (data.type === "applyPalette") {
        let styleEl = document.getElementById("signex-palette") as HTMLStyleElement | null;
        if (!styleEl) {
          styleEl = document.createElement("style");
          styleEl.id = "signex-palette";
          document.head.appendChild(styleEl);
        }
        styleEl.textContent = typeof data.css === "string" ? data.css : "";
        return;
      }
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/components/editor/edit-overlay.tsx
git commit -m "feat(web): overlay colour zones — colorEdit dispatch + applyPalette live swap"
```

> Behavioural verification (hover outline, click posts, live swap) happens in Task 11's browser pass — the overlay is untestable in the node harness.

---

## Task 7: API — save-draft accepts a palette patch

**Files:**
- Modify: `apps/api/src/theme/save-draft.dto.ts`
- Modify: `apps/api/src/theme/theme.service.ts`
- Modify: `apps/api/src/theme/theme.service.spec.ts`

**Interfaces:**
- Consumes: `PaletteSchema` from `@signex/shared`.
- Produces: `SaveDraftInput.palette?: Palette`; saveDraft merges it into `snap.palette` (shallow-merges seeds/tokens/overrides so partial patches accumulate).

- [ ] **Step 1: Write the failing test**

In `apps/api/src/theme/theme.service.spec.ts`, add a test that a save-draft with a palette persists it. Mirror the existing saveDraft test's setup (find the existing `describe('saveDraft'…)` block and copy its harness). The assertion:

```ts
  it("merges a palette patch into draftSnapshot.palette", async () => {
    // ...existing arrange: a theme with draftRevision 0 and a valid draftSnapshot...
    await service.saveDraft(actor, themeId, {
      edits: [],
      expectedDraftRevision: 0,
      palette: { seeds: { accentAqua: "#123456" } },
    } as any);

    const saved = /* read back draftSnapshot from the prisma mock/db */;
    expect(saved.palette.seeds.accentAqua).toBe("#123456");
  });
```

> Match the spec file's existing mocking style (it already exercises `saveDraft` — reuse that arrange/act/assert scaffolding verbatim rather than inventing a new harness).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @signex/api -- theme.service`
Expected: FAIL — `palette` is stripped by the DTO / not applied.

- [ ] **Step 3: Extend the DTO**

In `apps/api/src/theme/save-draft.dto.ts`:

```ts
import { z, PaletteSchema } from '@signex/shared';

export const saveDraftSchema = z.object({
  edits: z.array(z.object({ key: z.string(), data: z.unknown() })),
  expectedDraftRevision: z.number().int().min(0),
  palette: PaletteSchema.optional(),
});
```

- [ ] **Step 4: Apply the palette in the saveDraft mutator**

In `apps/api/src/theme/theme.service.ts`, in `saveDraft` (line ~262), destructure `palette` and merge it inside the mutator passed to `applyDraftMutation`:

```ts
  async saveDraft(actor, themeId, body) {
    const { edits, expectedDraftRevision, palette } = body;
    return this.applyDraftMutation(
      actor, themeId, expectedDraftRevision,
      async (snap) => {
        for (const { key, data } of edits) {
          // …existing per-block apply, unchanged…
        }
        if (palette) {
          const prev = (snap.palette ?? {}) as Record<string, Record<string, unknown>>;
          snap.palette = {
            seeds:     { ...(prev.seeds ?? {}),     ...(palette.seeds ?? {}) },
            tokens:    { ...(prev.tokens ?? {}),    ...(palette.tokens ?? {}) },
            overrides: { ...(prev.overrides ?? {}), ...(palette.overrides ?? {}) },
          };
        }
      },
      { action: 'theme.savedraft', meta: { keys: edits.map((e) => e.key) } },
    );
  }
```

> Shallow-merge per slice so a patch that only sends `seeds.accentAqua` doesn't wipe existing `tokens`/`overrides`. A key is cleared by sending its value as the sentinel handled in Task 8's reset (the admin sends the full desired slice on reset, so no server-side delete op is needed).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -w @signex/api -- theme.service`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/theme/save-draft.dto.ts apps/api/src/theme/theme.service.ts apps/api/src/theme/theme.service.spec.ts
git commit -m "feat(api): save-draft merges a palette patch into draftSnapshot"
```

---

## Task 8: Admin — palette patch reducers + editor-shell plumbing

**Files:**
- Create: `apps/admin/app/(dash)/editor/_lib/palette-patch.ts`
- Create: `apps/admin/app/(dash)/editor/_lib/palette-patch.test.ts`
- Modify: `apps/admin/app/(dash)/editor/editor-shell.tsx`

**Interfaces:**
- Produces (pure, tested):
  - `type PalettePatch = Palette` (client working patch)
  - `setSeed(p, key, hex): PalettePatch`
  - `setToken(p, key, hex): PalettePatch`
  - `setOverride(p, anchorId, role, hex): PalettePatch`
  - `resetAll(): PalettePatch` → `{}`
  - `isEmptyPalette(p): boolean`
- Produces (editor-shell): `pendingPalette` state; save-draft body includes `palette`; `applyPalette` posted to the iframe on every change; dirty indicator counts a non-empty palette.

- [ ] **Step 1: Write the failing reducer test**

Create `apps/admin/app/(dash)/editor/_lib/palette-patch.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { setSeed, setToken, setOverride, resetAll, isEmptyPalette } from "./palette-patch";

describe("palette-patch reducers", () => {
  it("setSeed adds/updates a seed immutably", () => {
    const a = setSeed({}, "accentAqua", "#111111");
    expect(a.seeds).toEqual({ accentAqua: "#111111" });
    const b = setSeed(a, "accentOcean", "#222222");
    expect(b.seeds).toEqual({ accentAqua: "#111111", accentOcean: "#222222" });
    expect(a.seeds).toEqual({ accentAqua: "#111111" }); // original untouched
  });

  it("setToken and setOverride nest correctly", () => {
    const a = setToken({}, "inkBase", "#333333");
    expect(a.tokens).toEqual({ inkBase: "#333333" });
    const b = setOverride(a, "hero.cta", "bg", "#444444");
    expect(b.overrides).toEqual({ "hero.cta": { bg: "#444444" } });
  });

  it("resetAll clears everything and isEmptyPalette detects it", () => {
    expect(isEmptyPalette(resetAll())).toBe(true);
    expect(isEmptyPalette({ seeds: { accentAqua: "#000000" } })).toBe(false);
    expect(isEmptyPalette({ seeds: {}, tokens: {}, overrides: {} })).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @signex/admin -- palette-patch`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the reducers**

Create `apps/admin/app/(dash)/editor/_lib/palette-patch.ts`:

```ts
import type { Palette } from "@signex/shared";

export type PalettePatch = Palette;

export function setSeed(p: PalettePatch, key: string, hex: string): PalettePatch {
  return { ...p, seeds: { ...(p.seeds ?? {}), [key]: hex } };
}

export function setToken(p: PalettePatch, key: string, hex: string): PalettePatch {
  return { ...p, tokens: { ...(p.tokens ?? {}), [key]: hex } };
}

export function setOverride(
  p: PalettePatch,
  anchorId: string,
  role: "bg" | "text" | "border",
  hex: string,
): PalettePatch {
  const prev = p.overrides?.[anchorId] ?? {};
  return { ...p, overrides: { ...(p.overrides ?? {}), [anchorId]: { ...prev, [role]: hex } } };
}

export function resetAll(): PalettePatch {
  return {};
}

export function isEmptyPalette(p: PalettePatch | undefined | null): boolean {
  if (!p) return true;
  const n =
    Object.keys(p.seeds ?? {}).length +
    Object.keys(p.tokens ?? {}).length +
    Object.keys(p.overrides ?? {}).length;
  return n === 0;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -w @signex/admin -- palette-patch`
Expected: PASS.

- [ ] **Step 5: Wire `pendingPalette` into editor-shell**

In `apps/admin/app/(dash)/editor/editor-shell.tsx`:

1. Import `paletteStyle` from `@signex/shared` (authored there in Task 2 — both apps share it):
   `import { paletteStyle } from "@signex/shared";`
   `import { setSeed, setToken, setOverride, resetAll, isEmptyPalette, type PalettePatch } from "./_lib/palette-patch";`

2. Add state near the existing `pending` state (line ~198):

```ts
   const [pendingPalette, setPendingPalette] = useState<PalettePatch>({});
```

3. Add a helper that updates the patch AND live-applies to the iframe:

```ts
   const applyPalette = useCallback((next: PalettePatch) => {
     setPendingPalette(next);
     const iframe = iframeRef.current; // the existing preview iframe ref
     iframe?.contentWindow?.postMessage(
       { source: "signex-editor", type: "applyPalette", css: paletteStyle(next) ?? "" },
       "*",
     );
   }, []);
```

4. Include palette in the save-draft body (line ~460):

```ts
   body: JSON.stringify({ edits, expectedDraftRevision: draftRevision, palette: pendingPalette }),
```

5. On successful save, clear it alongside `pending` (adopt into base): after the existing `for (const [k, d] of pending) blocks[k] = d;`, also set `baseSnapshot.palette = pendingPalette` (merge) and `setPendingPalette({})`.

6. Guard the save early-return so a palette-only change still saves: change the `if (pending.size === 0) return draftRevision;` (line ~452) to:

```ts
   if (pending.size === 0 && isEmptyPalette(pendingPalette)) return draftRevision;
```

7. On `ready` handshake from the overlay, re-post the current palette so a reloaded iframe re-applies unsaved colours:

```ts
   // inside the existing `ready` handler:
   iframe?.contentWindow?.postMessage(
     { source: "signex-editor", type: "applyPalette", css: paletteStyle(pendingPaletteRef.current) ?? "" },
     "*",
   );
```

   Add `const pendingPaletteRef = useRef(pendingPalette); pendingPaletteRef.current = pendingPalette;` next to the existing `pendingRef` (line ~254).

- [ ] **Step 6: Typecheck admin**

Run: `cd apps/admin && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add "apps/admin/app/(dash)/editor/_lib/palette-patch.ts" "apps/admin/app/(dash)/editor/_lib/palette-patch.test.ts" "apps/admin/app/(dash)/editor/editor-shell.tsx"
git commit -m "feat(admin): pendingPalette state + live applyPalette to preview"
```

---

## Task 9: Admin — "Bảng màu" panel

**Files:**
- Create: `apps/admin/app/(dash)/editor/palette-panel.tsx`
- Modify: `apps/admin/app/(dash)/editor/sections-nav.tsx`
- Modify: `apps/admin/app/(dash)/editor/editor-shell.tsx` (render the panel when the palette target is selected)

**Interfaces:**
- Consumes: `pendingPalette`, `applyPalette` (Task 8); `SEED_KEYS`, `PALETTE_VARS`, `TOKEN_KEYS`, `TOKEN_VARS` (shared).
- Produces: a panel with 8 seed swatch+picker rows, a collapsible Advanced (token) group, and a "Đặt lại toàn bộ màu" button.

- [ ] **Step 1: Build the panel component**

Create `apps/admin/app/(dash)/editor/palette-panel.tsx`:

```tsx
"use client";
import { SEED_KEYS, PALETTE_VARS, TOKEN_KEYS, TOKEN_VARS } from "@signex/shared";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import type { PalettePatch } from "./_lib/palette-patch";
import { setSeed, setToken, resetAll } from "./_lib/palette-patch";

function Swatch({ label, value, onChange }: { label: string; value: string; onChange: (hex: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm">{label}</span>
      <span className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-7 w-9 rounded border" />
        <input
          type="text" value={value} onChange={(e) => onChange(e.target.value)}
          className="w-24 rounded border px-2 py-1 font-mono text-xs" spellCheck={false}
        />
      </span>
    </label>
  );
}

export function PalettePanel({
  palette, onChange,
}: { palette: PalettePatch; onChange: (next: PalettePatch) => void }) {
  const seedVal = (k: string) => palette.seeds?.[k] ?? PALETTE_VARS[k as keyof typeof PALETTE_VARS].default;
  const tokenVal = (k: string) => palette.tokens?.[k] ?? "#000000";

  return (
    <div className="p-3">
      <h3 className="mb-2 text-sm font-semibold">Bảng màu</h3>
      {SEED_KEYS.map((k) => (
        <Swatch key={k} label={PALETTE_VARS[k].label} value={seedVal(k)} onChange={(hex) => onChange(setSeed(palette, k, hex))} />
      ))}

      <Collapsible className="mt-3">
        <CollapsibleTrigger className="text-sm font-medium">Nâng cao (token)</CollapsibleTrigger>
        <CollapsibleContent>
          {TOKEN_KEYS.map((k) => (
            <Swatch key={k} label={TOKEN_VARS[k].label} value={tokenVal(k)} onChange={(hex) => onChange(setToken(palette, k, hex))} />
          ))}
        </CollapsibleContent>
      </Collapsible>

      <Button variant="outline" size="sm" className="mt-4 w-full" onClick={() => onChange(resetAll())}>
        Đặt lại toàn bộ màu
      </Button>
    </div>
  );
}
```

> Token rows show `#000000` when unset (an explicit override the user opts into). If a cleaner "show derived default" is wanted, that's a later enhancement — YAGNI for v1.

- [ ] **Step 2: Add a "Bảng màu" entry to the sections nav**

In `apps/admin/app/(dash)/editor/sections-nav.tsx`, add a nav button (outside the block-driven `SURFACE_GROUPS.map`, e.g. below it) that calls a new `onSelectPalette()` prop:

```tsx
<button type="button" onClick={onSelectPalette} className={/* same classes as the block items */}>
  <span className="flex-1 truncate">Bảng màu</span>
</button>
```

Add `onSelectPalette: () => void;` to the component's props type.

- [ ] **Step 3: Render the panel from editor-shell**

In `editor-shell.tsx`:
- Add a selection flag: `const [paletteOpen, setPaletteOpen] = useState(false);`
- Pass `onSelectPalette={() => { setPaletteOpen(true); /* clear block selection */ }}` to `<SectionsNav>`.
- Where the `<ContextPanel>` is rendered, when `paletteOpen` is true render `<PalettePanel palette={pendingPalette} onChange={applyPalette} />` instead (a conditional in the panel zone).

- [ ] **Step 4: Typecheck + build admin**

Run: `cd apps/admin && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "apps/admin/app/(dash)/editor/palette-panel.tsx" "apps/admin/app/(dash)/editor/sections-nav.tsx" "apps/admin/app/(dash)/editor/editor-shell.tsx"
git commit -m "feat(admin): Bảng màu panel (seeds + advanced tokens + reset)"
```

---

## Task 10: Admin — click popover (token / element modes)

**Files:**
- Create: `apps/admin/app/(dash)/editor/color-popover.tsx`
- Modify: `apps/admin/app/(dash)/editor/editor-shell.tsx` (handle `colorEdit`, open popover)
- Possibly add: shadcn `popover` primitive (`apps/admin/components/ui/popover.tsx`)

**Interfaces:**
- Consumes: `colorEdit` message `{ field, token, roles }` (Task 6); `applyPalette`, `setSeed`/`setToken`/`setOverride` (Task 8).
- Produces: on colour pick, updates `pendingPalette` (token mode → `setSeed`/`setToken` on the message's `token`; element mode → `setOverride` on `field`+role) and live-applies.

- [ ] **Step 1: Add the shadcn popover primitive (if absent)**

Run: `cd apps/admin && npx shadcn@latest add popover`
Expected: creates `components/ui/popover.tsx`. (This is the one permitted new UI dep — Radix popover.)

- [ ] **Step 2: Build the popover component**

Create `apps/admin/app/(dash)/editor/color-popover.tsx`:

```tsx
"use client";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { TOKEN_VARS, PALETTE_VARS } from "@signex/shared";

export interface ColorEditTarget {
  field: string;             // anchorId
  token: string;             // seed/token key, "" if element-only
  roles: ("bg" | "text" | "border")[];
}

export function ColorPopover({
  target, anchor, onPickToken, onPickElement, onClose,
}: {
  target: ColorEditTarget;
  anchor: { x: number; y: number };
  onPickToken: (tokenKey: string, hex: string) => void;
  onPickElement: (anchorId: string, role: "bg" | "text" | "border", hex: string) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"token" | "element">(target.token ? "token" : "element");
  const [role, setRole] = useState(target.roles[0] ?? "bg");
  const tokenLabel =
    (TOKEN_VARS as any)[target.token]?.label ?? (PALETTE_VARS as any)[target.token]?.label ?? target.token;

  return (
    <Popover open onOpenChange={(o) => !o && onClose()}>
      <PopoverTrigger asChild>
        <span style={{ position: "fixed", left: anchor.x, top: anchor.y }} />
      </PopoverTrigger>
      <PopoverContent className="w-64">
        {target.token && (
          <div className="mb-2 flex gap-1">
            <Button size="sm" variant={mode === "token" ? "default" : "outline"} onClick={() => setMode("token")}>Đổi cả site</Button>
            <Button size="sm" variant={mode === "element" ? "default" : "outline"} onClick={() => setMode("element")}>Chỉ phần tử này</Button>
          </div>
        )}
        {mode === "token" ? (
          <label className="flex items-center justify-between text-sm">
            {tokenLabel}
            <input type="color" onChange={(e) => onPickToken(target.token, e.target.value)} className="h-7 w-9 rounded border" />
          </label>
        ) : (
          <div>
            {target.roles.length > 1 && (
              <select value={role} onChange={(e) => setRole(e.target.value as any)} className="mb-2 w-full rounded border p-1 text-sm">
                {target.roles.map((r) => <option key={r} value={r}>{r === "bg" ? "Nền" : r === "text" ? "Chữ" : "Viền"}</option>)}
              </select>
            )}
            <input type="color" onChange={(e) => onPickElement(target.field, role, e.target.value)} className="h-7 w-9 rounded border" />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 3: Handle `colorEdit` in editor-shell**

In `editor-shell.tsx`'s message listener (where `edit`/`textEdit` are handled), add:

```ts
      if (data.type === "colorEdit") {
        setColorTarget({ field: data.field, token: data.token, roles: data.roles ?? [] });
        return;
      }
```

Add state: `const [colorTarget, setColorTarget] = useState<ColorEditTarget | null>(null);`

Render (near the other portals/dialogs):

```tsx
      {colorTarget && (
        <ColorPopover
          target={colorTarget}
          anchor={{ x: window.innerWidth - 340, y: 120 }}
          onPickToken={(tokenKey, hex) => {
            const isSeed = tokenKey in PALETTE_VARS;
            applyPalette(isSeed ? setSeed(pendingPalette, tokenKey, hex) : setToken(pendingPalette, tokenKey, hex));
          }}
          onPickElement={(anchorId, role, hex) => applyPalette(setOverride(pendingPalette, anchorId, role, hex))}
          onClose={() => setColorTarget(null)}
        />
      )}
```

(Import `PALETTE_VARS`, `setSeed`, `setToken`, `setOverride`, `ColorPopover`, `type ColorEditTarget`.)

- [ ] **Step 4: Typecheck admin**

Run: `cd apps/admin && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "apps/admin/app/(dash)/editor/color-popover.tsx" "apps/admin/app/(dash)/editor/editor-shell.tsx" apps/admin/components/ui/popover.tsx apps/admin/package.json
git commit -m "feat(admin): click colour popover — token (site-wide) or per-element override"
```

---

## Task 11: End-to-end verification (build, lint, browser)

**Files:** none (verification only).

- [ ] **Step 1: Full monorepo build + lint + tests**

Run:
```bash
npm run build && npm run lint && npm run test
```
Expected: all workspaces green (shared vitest, api vitest, web node/jiti tests, admin vitest).

- [ ] **Step 2: Bring up the stack**

Run: `docker compose up -d --build` (or the usual `npm run dev`). Confirm the 3 apps + postgres are healthy.

- [ ] **Step 3: Browser — panel path**

In the admin editor for a theme: open **Bảng màu**, change **Đại dương** to a distinct colour. Verify the preview iframe recolours live (buttons/links/accents that derive from `ocean`). Save draft. Reload the editor — the colour persists (read back from `draftSnapshot.palette`).

- [ ] **Step 4: Browser — click token path**

Click the **navbar CTA** in the preview. In the popover choose **"Đổi cả site"**, pick a colour. Verify ALL primary buttons across the preview change (token behaviour), not just that one.

- [ ] **Step 5: Browser — click element-override path**

Click the same CTA, choose **"Chỉ phần tử này"**, pick a different colour. Verify ONLY that element changes and it carries `data-sx-c` with a `[data-sx-c="nav.cta.color"]{…}` rule in `#signex-palette`.

- [ ] **Step 6: Browser — publish → public**

Publish the theme. Open the public site (`/vi`). Confirm the published palette is reflected AND that a page element carries `data-sx-c` but NO `data-edit-*` attributes (public render clean).

- [ ] **Step 7: Regression — no-palette theme unchanged**

On a theme with no palette set, confirm `#signex-palette` is absent and the site looks byte-identical to before the feature.

- [ ] **Step 8: Commit any verification fixes, then finish the branch**

Use `superpowers:finishing-a-development-branch` to decide merge/PR. (Per project convention, `main` is the backup branch and merges are the operator's call.)

---

## Self-Review Notes (for the executor)

- **Spec coverage:** seeds/tokens/overrides (Task 1) · site-wide `:root` emit + per-anchor rules (Tasks 2–3) · `data-edit-kind="color"` fourth kind (Tasks 4–6) · popover two modes (Task 10) · Bảng màu panel (Task 9) · save-draft/publish flow (Tasks 7–8) · backward-compat (Task 1 Step 5, Task 11 Step 7) · VN labels (Task 1 `label` fields).
- **Shared rebuild:** Tasks 1 and 8 change `@signex/shared`; always `npm run build -w @signex/shared` before typechecking apps.
- **Type consistency:** `applyPalette`/`paletteStyle`/`PalettePatch`/`ColorEditTarget` names are used identically across web overlay, admin shell, popover, and the shared emitter. AnchorIds are `<blockKey>.<path>.color` (Task 5) to avoid colliding with text/media `data-edit-field`s.
