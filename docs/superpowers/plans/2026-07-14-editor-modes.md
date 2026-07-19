# Editor Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the theme editor four explicit modes (Media / Text / Colour / Content) where the mode decides what the canvas exposes and what the right panel shows, and grow colour editing from 3 hand-stamped anchors to any element × every colour role.

**Architecture:** The stamp API stops declaring a single `data-edit-kind` and declares *capabilities*; the active mode picks which capability a click invokes. Colour uses `elementsFromPoint` to find the element that actually paints each role, reads the winning CSS rule to detect the driving design token, and generates a self-verified CSS selector scoped to a new `data-sx-block` root. That selector is what gets persisted, so `overrides` changes from `Record<anchorId, roles>` to `Array<{selector, roles}>`.

**Tech Stack:** Next.js 16 (web 3062, admin 3061), NestJS 11 (api 3060), zod (`@signex/shared`), Prisma/Postgres (3059), Radix + shadcn, Turborepo + npm workspaces.

**Spec:** `docs/superpowers/specs/2026-07-14-editor-modes-design.md`

## Global Constraints

- **Workspace build gate:** `@signex/shared` compiles to CommonJS `dist/` via `tsc`. Apps import from `./dist/index.js` at runtime and do **not** bundle it. After ANY change to `packages/shared`, run `npm run build -w @signex/shared` before the apps see it.
- **Next 16:** both Next apps warn "This is NOT the Next.js you know". Read `node_modules/next/dist/docs/` before writing Next-specific code.
- **Naming:** identifiers use American **"color"** (`EditColorRole`, `editColor`, `PALETTE_VARS`); prose and comments use British **"colour"**. Follow it.
- **Public render invariant:** `data-edit-*` attributes must be **0** on public pages. `data-sx-block` is the **only** deliberate new public attribute. `data-sx-c` stays.
- **Security — reject, never escape:** anything reaching `<style>` (selectors, anchor ids, hex) is validated at **two layers** (zod schema on save, emitter on render) and **rejected** when invalid. `<style>` is HTML raw-text, so the HTML parser ignores CSS escapes — escaping is not a defence. This is the class of bug fixed in `7061210`.
- **Prototype safety:** the selector/anchor charsets permit `__proto__`/`constructor`; any lookup keyed by them uses `Object.hasOwn`.
- **Test runners:** `packages/shared` + `apps/admin` = **vitest** (`npm run test -w <pkg>`); `apps/web` = `node --test` / `jiti` (**no jsdom** — DOM logic is browser-verified, not unit-tested); `apps/api` = Jest.
- **Never** run `npm run test` (turbo-all) against a live `DATABASE_URL` — it once wiped the dev DB. Run per-workspace.
- **Dev creds:** username `admin`, password `change-me-please-now`. Login is `POST /admin-api/auth/login` and requires `-H "Origin: http://localhost:3061"`. Theme id: `cmr7m5hnm001nn457rgnq3dr3`. Preview secret: `dev-preview-secret-change-me`.
- **Browser form login does not work** (React-controlled shadcn inputs reject CDP typing). Use curl login + `agent-browser cookies set sx_session <val> --url http://localhost:3061`.
- **Commits:** end every commit message with
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Branch:** work on `feat/editable-site-colors` (current). `main` is the user's backup — do **not** merge or push.

---

## File Structure

**Create**
| File | Responsibility |
|---|---|
| `packages/shared/src/content/selector.ts` | Selector grammar: `SELECTOR_RE`, `isSafeSelector`, `CssSelectorSchema` |
| `packages/shared/src/content/selector.test.ts` | Grammar accept/reject table |
| `apps/web/app/components/editor/_lib/selector-path.ts` | **Pure** segment chooser (no DOM) — the only hard logic in selector generation |
| `apps/web/app/components/editor/_lib/selector-path.test.mjs` | Unit tests for the above |
| `apps/web/app/components/editor/_lib/color-engine.ts` | DOM glue: `resolveRoles`, `detectToken`, `buildSelector` |
| `apps/admin/app/(dash)/editor/_lib/modes.ts` | `EditMode`, mode metadata, panel routing table |
| `apps/admin/app/(dash)/editor/_lib/modes.test.ts` | Mode metadata + routing |
| `apps/admin/app/(dash)/editor/_lib/preview-bridge.ts` | postMessage listener + posters, lifted out of the shell |
| `apps/admin/app/(dash)/editor/_panels/color-panel.tsx` | Role rows + brand seeds (Colour mode) |

**Modify**
| File | Change |
|---|---|
| `packages/shared/src/content/palette.ts` | `overrides` → array; delete `ANCHOR_PAINT_TARGETS` (Task 10) |
| `packages/shared/src/content/palette-style.ts` | Emit each override's `selector` |
| `packages/shared/src/content/palette-style.test.ts` | Rewrite for the array shape |
| `packages/shared/src/index.ts` | Export the selector module |
| `apps/api/src/theme/theme.service.ts` | Merge overrides by `selector` |
| `apps/web/app/lib/edit-attrs.ts` | Capability stamp API; retire `data-edit-kind` |
| `apps/web/app/lib/edit-attrs.test.mjs` | Rewrite for capabilities |
| `apps/web/app/components/editor/edit-overlay.tsx` | Mode gating + wire the colour engine |
| `apps/web/app/components/*.tsx` (section roots) | Add `data-sx-block`; migrate stamps to `editable()` |
| `apps/admin/app/(dash)/editor/toolbar.tsx` | Mode segmented control |
| `apps/admin/app/(dash)/editor/editor-shell.tsx` | Mode state; panel routing; use the bridge |
| `apps/admin/app/(dash)/editor/_lib/palette-patch.ts` | `setOverride` keyed by selector |
| `apps/admin/app/(dash)/editor/sections-nav.tsx` | Remove the GIAO DIỆN / "Bảng màu" group |
| `apps/admin/app/(dash)/editor/context-panel.tsx` | `filter` + `title` props — Media/Text modes are this panel with a lens, not copies of it |

**Delete**
| File | Why |
|---|---|
| `apps/admin/app/(dash)/editor/color-popover.tsx` | Properties live in the panel now |
| `apps/admin/app/(dash)/editor/palette-panel.tsx` | Folds into `_panels/color-panel.tsx` |

---

## Task 1: Selector grammar (shared)

**Files:**
- Create: `packages/shared/src/content/selector.ts`
- Create: `packages/shared/src/content/selector.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces: `SELECTOR_RE: RegExp`, `SELECTOR_MAX_LEN = 300`, `isSafeSelector(v: string): boolean`, `CssSelectorSchema: z.ZodString`, `type CssSelector = string`.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/content/selector.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isSafeSelector, CssSelectorSchema } from "./selector";

describe("selector grammar", () => {
  const ACCEPT = [
    '[data-sx-c="nav.cta.color"]',
    '[data-sx-block="hero"] .btn-bg',
    '[data-sx-block="nav"] > .nav_wrap .btn-bg',
    '[data-sx-block="footer"] .row:nth-of-type(2) > .cell',
    '[data-sx-c="nav.cta.color"] .btn-bg',
    '.btn-bg',
  ];
  const REJECT = [
    '</style><script>alert(1)</script>',   // the F1 stored-XSS shape
    '[data-sx-block="hero"] .a[onclick="x"]',
    '.a{color:red}',
    '*',
    '.a  .b',                               // double space
    '.a:hover',                             // state selectors are out of scope
    '.a:nth-of-type(0)',                    // n starts at 1
    '.a:nth-of-type(100)',                  // capped at 99
    '.a,.b',                                // selector lists
    '[data-sx-block="hero"] .a; }',
    '.' + 'a'.repeat(400),                  // over length
    '',
  ];

  it("accepts every selector the generator can emit", () => {
    for (const s of ACCEPT) expect(isSafeSelector(s), s).toBe(true);
  });

  it("rejects everything else", () => {
    for (const s of REJECT) expect(isSafeSelector(s), s).toBe(false);
  });

  it("CssSelectorSchema mirrors isSafeSelector", () => {
    for (const s of ACCEPT) expect(CssSelectorSchema.safeParse(s).success, s).toBe(true);
    for (const s of REJECT) expect(CssSelectorSchema.safeParse(s).success, s).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/content/selector.test.ts --root packages/shared`
Expected: FAIL — `Failed to resolve import "./selector"`.

- [ ] **Step 3: Implement the minimal code**

Create `packages/shared/src/content/selector.ts`:

```ts
import { z } from "zod";

/**
 * Grammar for a per-element colour override's target selector.
 *
 * A stored selector travels DB → ReleaseSnapshot → `<style>` via dangerouslySetInnerHTML, which is
 * exactly the stored-XSS class fixed in 7061210: `<style>` is an HTML raw-text element, so the HTML
 * parser does NOT honour CSS escapes — a selector containing `</style><script>…` would break out
 * and execute for every visitor no matter how it were escaped. Escaping is therefore not a defence.
 * The rule is REJECT, and it is enforced at two layers (schema on save, emitter on render) because
 * an already-persisted hostile value must not be trusted either.
 *
 * The grammar is deliberately the smallest thing the generator (edit-overlay's color-engine) can
 * emit — nothing more:
 *   [data-sx-block="<blockKey>"]   block root scope
 *   [data-sx-c="<anchorId>"]       stable hand-stamped anchor
 *   .<class>                       Webflow classes; [A-Za-z0-9_-] covers every class in the template
 *   :nth-of-type(<1-99>)           tie-break when a class isn't unique among siblings
 *   " " / " > "                    descendant / child, single spaces only
 */
const SEG = [
  '\\[data-sx-block="[A-Za-z0-9_-]+"\\]',
  '\\[data-sx-c="[A-Za-z0-9._:-]+"\\]',
  "\\.[A-Za-z0-9_-]+(?::nth-of-type\\([1-9][0-9]?\\))?",
].join("|");

export const SELECTOR_RE = new RegExp(`^(?:${SEG})(?:(?: > | )(?:${SEG}))*$`);

/** Bounds the `<style>` a hostile/looping client can produce. */
export const SELECTOR_MAX_LEN = 300;

export function isSafeSelector(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= SELECTOR_MAX_LEN && SELECTOR_RE.test(v);
}

export type CssSelector = string;

export const CssSelectorSchema = z
  .string()
  .max(SELECTOR_MAX_LEN)
  .refine((v) => SELECTOR_RE.test(v), "unsupported selector");
```

- [ ] **Step 4: Export it**

In `packages/shared/src/index.ts`, add alongside the other `content/*` re-exports:

```ts
export * from "./content/selector";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/content/selector.test.ts --root packages/shared`
Expected: PASS (3 tests).

Then: `npm run build -w @signex/shared` — expected: no output (clean tsc).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/content/selector.ts packages/shared/src/content/selector.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): whitelisted grammar for override target selectors

A stored selector reaches <style> via dangerouslySetInnerHTML — the same
stored-XSS class fixed in 7061210. <style> is raw text, so the HTML parser
ignores CSS escapes and escaping cannot defend it; the grammar is an allowlist
and the verdict is reject.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `overrides` Record → Array<{selector, roles}>

Changes the shape everywhere at once — a half-migrated type does not compile. `ANCHOR_PAINT_TARGETS` **stays** for now: deleting it here would regress the nav CTA's background (its pill is painted by a `.btn-bg` child) until Task 5's auto-resolve lands. Task 10 deletes it.

**Files:**
- Modify: `packages/shared/src/content/palette.ts`
- Modify: `packages/shared/src/content/palette-style.ts`
- Modify: `packages/shared/src/content/palette-style.test.ts`
- Modify: `apps/api/src/theme/theme.service.ts:305-338`
- Modify: `apps/admin/app/(dash)/editor/_lib/palette-patch.ts`
- Modify: `apps/admin/app/(dash)/editor/_lib/palette-patch.test.ts`
- Modify: `apps/admin/app/(dash)/editor/editor-shell.tsx`

**Interfaces:**
- Consumes: `CssSelectorSchema`, `isSafeSelector` (Task 1).
- Produces:
  - `PaletteOverride = { selector: string; bg?: string; text?: string; border?: string }`
  - `PaletteSchema.overrides?: PaletteOverride[]` (max 200)
  - `setOverride(p: PalettePatch, selector: string, role: "bg"|"text"|"border", hex: string): PalettePatch`
  - `anchorSelector(anchorId: string, role: "bg"|"text"|"border"): string` (temporary, in `editor-shell`; removed in Task 10)

- [ ] **Step 1: Write the failing tests**

Replace the override tests in `packages/shared/src/content/palette-style.test.ts` (keep the seed/token/`toBeNull` tests as they are) with:

```ts
  it("emits one rule per override, roles grouped", () => {
    const css = paletteStyle({
      overrides: [{ selector: '[data-sx-c="hero.cta"]', bg: "#ff0000", text: "#ffffff" }],
    })!;
    expect(css).toContain('[data-sx-c="hero.cta"]{background-color:#ff0000;color:#ffffff}');
  });

  it("emits the selector verbatim, including a descendant path", () => {
    const css = paletteStyle({
      overrides: [{ selector: '[data-sx-block="nav"] .btn-bg', bg: "#ff0000" }],
    })!;
    expect(css).toContain('[data-sx-block="nav"] .btn-bg{background-color:#ff0000}');
  });

  // Defence in depth: the schema rejects these on save, but a snapshot written before this rule
  // (or straight to the DB) must still be rejected here — never escaped. <style> is raw text.
  it("drops an override whose stored selector is not in the grammar", () => {
    const css = paletteStyle({
      overrides: [
        { selector: "</style><script>alert(1)</script>", bg: "#000000" },
        { selector: ".ok", bg: "#111111" },
      ] as never,
    })!;
    expect(css).not.toContain("<script>");
    expect(css).toContain(".ok{background-color:#111111}");
  });

  it("skips invalid hex defensively (never trusts caller)", () => {
    expect(
      paletteStyle({ overrides: [{ selector: ".a", bg: "javascript:alert(1)" }] as never }),
    ).toBeNull();
  });
```

Add to `packages/shared/src/content/palette.test.ts`:

```ts
  it("caps overrides at 200 and rejects an unsupported selector", () => {
    const one = { selector: ".a", bg: "#000000" };
    expect(PaletteSchema.safeParse({ overrides: Array(200).fill(one) }).success).toBe(true);
    expect(PaletteSchema.safeParse({ overrides: Array(201).fill(one) }).success).toBe(false);
    expect(PaletteSchema.safeParse({ overrides: [{ selector: "*", bg: "#000000" }] }).success).toBe(false);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/content/palette-style.test.ts src/content/palette.test.ts --root packages/shared`
Expected: FAIL — the emitter iterates `Object.entries(overrides)` so an array yields index keys; the cap test fails because `overrides` is still a record.

- [ ] **Step 3: Change the schema**

In `packages/shared/src/content/palette.ts`, replace `PaletteOverridesSchema` (keep `PaletteOverrideRolesSchema`'s role set) with:

```ts
import { CssSelectorSchema } from "./selector";

/**
 * One per-element override. `selector` is the full CSS target — a hand-stamped anchor is just the
 * special case `[data-sx-c="…"]`, which is why there is no separate anchorId mechanism.
 * Grammar-constrained (see selector.ts): this string is emitted into `<style>`.
 */
export const PaletteOverrideSchema = z
  .object({
    selector: CssSelectorSchema,
    bg: Hex.optional(),
    text: Hex.optional(),
    border: Hex.optional(),
  })
  .strict();

/** Capped so a runaway client cannot bloat the `<style>` on every public page. */
export const PaletteOverridesSchema = z.array(PaletteOverrideSchema).max(200);

export type PaletteOverride = z.infer<typeof PaletteOverrideSchema>;
```

Keep `PALETTE_ANCHOR_ID_RE` (still used by `[data-sx-c="…"]` inside the selector grammar) and keep `ANCHOR_PAINT_TARGETS` unchanged for now — Task 10 removes it.

- [ ] **Step 4: Change the emitter**

In `packages/shared/src/content/palette-style.ts`, replace the whole override loop with:

```ts
import { isSafeSelector } from "./selector";

  const ROLE_PROP = { bg: "background-color", text: "color", border: "border-color" } as const;

  const rules: string[] = [];
  for (const ov of palette.overrides ?? []) {
    // Reject, never escape — see selector.ts. Never trust the stored snapshot.
    if (!ov || !isSafeSelector(ov.selector)) continue;
    const decls: string[] = [];
    for (const [role, prop] of Object.entries(ROLE_PROP) as [keyof typeof ROLE_PROP, string][]) {
      const val = ov[role];
      if (isHex(val)) decls.push(`${prop}:${val}`);
    }
    if (decls.length) rules.push(`${ov.selector}{${decls.join(";")}}`);
  }
```

Delete the now-unused `ANCHOR_PAINT_TARGETS` / `PALETTE_ANCHOR_ID_RE` imports and the `isSafeAnchorId` helper from this file (the anchor id is now validated inside the selector grammar).

- [ ] **Step 5: Change the API merge**

In `apps/api/src/theme/theme.service.ts`, replace lines 305-338 (the `if (palette) { … }` merge) with:

```ts
        // Merge the palette patch, shallow-merged per slice, so a patch that only sends e.g.
        // `seeds` doesn't wipe existing `tokens`/`overrides`.
        // `overrides` is a LIST keyed by `selector`: merge role-wise per selector, because
        // pendingPalette resets to {} across a save boundary — a whole-entry replace would drop a
        // role saved in an earlier session (e.g. `text` now, `bg` later on the same element).
        if (palette) {
          const prev = (snap.palette ?? {}) as {
            seeds?: Record<string, string>;
            tokens?: Record<string, string>;
            overrides?: Array<Record<string, string>>;
          };
          const bySelector = new Map<string, Record<string, string>>();
          for (const ov of prev.overrides ?? []) {
            if (ov?.selector) bySelector.set(ov.selector, { ...ov });
          }
          for (const ov of palette.overrides ?? []) {
            bySelector.set(ov.selector, { ...(bySelector.get(ov.selector) ?? {}), ...ov });
          }
          snap.palette = {
            seeds: { ...(prev.seeds ?? {}), ...(palette.seeds ?? {}) },
            tokens: { ...(prev.tokens ?? {}), ...(palette.tokens ?? {}) },
            overrides: [...bySelector.values()],
          };
        }
```

- [ ] **Step 6: Change the admin reducers**

In `apps/admin/app/(dash)/editor/_lib/palette-patch.ts`, replace `setOverride` and fix `isEmptyPalette`:

```ts
export function setOverride(
  p: PalettePatch,
  selector: string,
  role: "bg" | "text" | "border",
  hex: string,
): PalettePatch {
  const list = p.overrides ?? [];
  const i = list.findIndex((o) => o.selector === selector);
  const next =
    i >= 0
      ? list.map((o, j) => (j === i ? { ...o, [role]: hex } : o))
      : [...list, { selector, [role]: hex }];
  return { ...p, overrides: next };
}

export function clearOverride(p: PalettePatch, selector: string): PalettePatch {
  return { ...p, overrides: (p.overrides ?? []).filter((o) => o.selector !== selector) };
}

export function isEmptyPalette(p: PalettePatch | undefined | null): boolean {
  if (!p) return true;
  const n =
    Object.keys(p.seeds ?? {}).length +
    Object.keys(p.tokens ?? {}).length +
    (p.overrides ?? []).length;
  return n === 0;
}
```

Update `apps/admin/app/(dash)/editor/_lib/palette-patch.test.ts` accordingly — replace any `setOverride(p, "nav.cta.color", …)` call with `setOverride(p, '[data-sx-c="nav.cta.color"]', …)` and assert on the array:

```ts
  it("upserts a role onto an existing selector instead of replacing the entry", () => {
    const a = setOverride({}, '[data-sx-c="nav.cta.color"]', "bg", "#ff0000");
    const b = setOverride(a, '[data-sx-c="nav.cta.color"]', "text", "#ffffff");
    expect(b.overrides).toEqual([
      { selector: '[data-sx-c="nav.cta.color"]', bg: "#ff0000", text: "#ffffff" },
    ]);
  });
```

- [ ] **Step 7: Fix the shell's call sites**

In `apps/admin/app/(dash)/editor/editor-shell.tsx`, add near the palette helpers:

```ts
import { ANCHOR_PAINT_TARGETS } from "@signex/shared";

/**
 * TEMPORARY (removed in Task 10, with ANCHOR_PAINT_TARGETS itself).
 * The colour popover still speaks anchorIds. Overrides are now selector-keyed, so translate — and
 * keep honouring the paint-target redirect, or the nav CTA's background would regress: its pill is
 * painted by a `.btn-bg` child that covers the transparent <a>, so a declaration on the anchor is
 * invisible. Task 5's auto-resolve supplies the full selector and makes this obsolete.
 */
function anchorSelector(anchorId: string, role: "bg" | "text" | "border"): string {
  const paint = Object.hasOwn(ANCHOR_PAINT_TARGETS, anchorId)
    ? ANCHOR_PAINT_TARGETS[anchorId][role]
    : undefined;
  return paint ? `[data-sx-c="${anchorId}"] ${paint}` : `[data-sx-c="${anchorId}"]`;
}
```

Then update the `ColorPopover` wiring:

```tsx
          elementValueFor={(role) =>
            pendingPalette.overrides?.find((o) => o.selector === anchorSelector(colorTarget.field, role))?.[role]
          }
          onPickElement={(anchorId, role, hex) =>
            applyPalette(setOverride(pendingPalette, anchorSelector(anchorId, role), role, hex))
          }
```

- [ ] **Step 8: Run everything**

```bash
npm run build -w @signex/shared
npx vitest run --root packages/shared
npm run test -w @signex/admin
npx tsc --noEmit -p apps/admin/tsconfig.json
npx tsc --noEmit -p apps/web/tsconfig.json
npm run test -w @signex/api
```
Expected: all green, `tsc` silent.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor(shared,api,admin): overrides keyed by selector, not anchorId

A hand-stamped anchor is just the special case [data-sx-c=\"…\"], so the two
mechanisms collapse into one list keyed by selector. Migration is free: the only
Theme's palette is {} and no Release carries one.

The API merges role-wise per selector — pendingPalette resets to {} across a save
boundary, so a whole-entry replace would drop a role saved in an earlier session.

ANCHOR_PAINT_TARGETS stays for now: dropping it here regresses the nav CTA's
background until auto-resolve lands.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `data-sx-block` on section roots

**Files:**
- Modify: every section component under `apps/web/app/components/` that renders a block root
- Modify: `apps/web/test/dynamic-params.test.mjs` (add the public-invariant assertion)

**Interfaces:**
- Consumes: `BLOCK_KEYS` from `@signex/shared`.
- Produces: `data-sx-block="<blockKey>"` on each block root, **unconditionally** (public + preview) — it is the scope every generated selector is anchored to, so it must exist on the live site.

- [ ] **Step 1: Find the block roots**

Run:
```bash
grep -rn "<section\|className=\"footer\"" apps/web/app/components/*.tsx | head -20
grep -n "BLOCK_REGISTRY = {" -A 20 packages/shared/src/content/registry.ts
```
Map each `BlockKey` to its component's outermost element. Expect ~10–15 (`hero`, `features`, `about`, `productsHeader`, `nav`, `footer`, `contactPage`, `aboutPage`, `notFound`, …).

- [ ] **Step 2: Write the failing test**

Add to `apps/web/test/dynamic-params.test.mjs` (it already has a `src(...)` helper that reads a
component's source):

```js
test("block roots are stamped with data-sx-block, unconditionally", () => {
  // STATIC, like every other test in this file: the web suite must keep running with the docker
  // stack down. The runtime HTML assertion (and the data-edit-* leak check, which needs a rendered
  // page) lives in the E2E task, where the stack is up by definition.
  for (const [file, key] of [
    ["navbar.tsx", "nav"],
    ["hero.tsx", "hero"],
    ["footer.tsx", "footer"],
  ]) {
    const s = src("components", file);
    assert.match(s, new RegExp(`data-sx-block="${key}"`), `${file}: block root not stamped`);
    // It must NOT be gated on `editable` — generated override selectors are scoped to this
    // attribute, so it has to exist on the public site, not just in preview.
    assert.doesNotMatch(
      s,
      new RegExp(`editable[^\\n]*data-sx-block="${key}"`),
      `${file}: data-sx-block must not be conditional on editable`,
    );
  }
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `node --test apps/web/test/dynamic-params.test.mjs`
Expected: FAIL — "navbar.tsx: block root not stamped". (No docker needed.)

- [ ] **Step 4: Add the attribute**

On each block root, add `data-sx-block="<blockKey>"`. Example — `apps/web/app/components/navbar.tsx`:

```tsx
<div className="nav_wrap" data-sx-block="nav">
```

and `apps/web/app/components/hero.tsx`:

```tsx
<section className="section_hero-home-a" data-sx-block="hero">
```

Add the same one-line comment above the first one you touch:

```tsx
{/* data-sx-block: the scope every generated colour-override selector is anchored to. Rendered on
    the PUBLIC site too (unlike data-edit-*), because the override CSS must match there. */}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npm run test -w @signex/web`
Expected: PASS, exit 0 — with the stack down.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(web): stamp data-sx-block on block roots

The scope every generated override selector is anchored to. Public-rendered on
purpose — the override CSS has to match on the live site — and the only new
public attribute; data-edit-* stay preview-only (asserted).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Pure selector-path module

The one piece of selector generation with real logic, kept DOM-free so it is unit-testable (`apps/web` has **no jsdom**).

**Files:**
- Create: `apps/web/app/components/editor/_lib/selector-path.ts`
- Create: `apps/web/app/components/editor/_lib/selector-path.test.mjs`
- Modify: `apps/web/package.json` (add the test to the `test` script)

**Interfaces:**
- Consumes: nothing.
- Produces: `pickSegment(target: SegmentInput, siblings: SegmentInput[]): string | null` where
  `type SegmentInput = { tag: string; classes: string[] }`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/components/editor/_lib/selector-path.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { pickSegment } from "./selector-path.ts";

const el = (tag, ...classes) => ({ tag, classes });

test("prefers a class that is unique among siblings", () => {
  const target = el("div", "btn-bg");
  const siblings = [el("div", "button_text-mask"), target];
  assert.equal(pickSegment(target, siblings), ".btn-bg");
});

test("adds nth-of-type when every class is shared", () => {
  const target = el("div", "card");
  const siblings = [el("div", "card"), target, el("div", "card")];
  assert.equal(pickSegment(target, siblings), ".card:nth-of-type(2)");
});

test("nth-of-type counts only same-tag siblings", () => {
  const target = el("div", "card");
  const siblings = [el("span", "card"), el("div", "card"), target];
  assert.equal(pickSegment(target, siblings), ".card:nth-of-type(2)");
});

test("returns null when the element has no usable class", () => {
  assert.equal(pickSegment(el("div"), [el("div")]), null);
});

test("ignores classes outside the grammar charset", () => {
  const target = el("div", "w-变体", "btn-bg");
  assert.equal(pickSegment(target, [el("div", "other"), target]), ".btn-bg");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jiti apps/web/app/components/editor/_lib/selector-path.test.mjs`
Expected: FAIL — cannot find module `./selector-path.ts`.

- [ ] **Step 3: Implement**

Create `apps/web/app/components/editor/_lib/selector-path.ts`:

```ts
// Pure segment chooser for generated override selectors. DOM-free on purpose: apps/web has no
// jsdom, and this is the only part of selector generation with real logic — the DOM walk in
// color-engine.ts is thin glue verified in the browser.

export type SegmentInput = { tag: string; classes: string[] };

/** Must match packages/shared/src/content/selector.ts — a class outside this charset is unusable. */
const CLASS_RE = /^[A-Za-z0-9_-]+$/;

/**
 * Build one selector segment for `target` among `siblings` (which INCLUDES target).
 * Prefers a class unique among siblings — Webflow's classes are semantic (.btn-bg, .cta_primary),
 * so a unique one is both stable and readable. Falls back to :nth-of-type over same-tag siblings.
 * Returns null when no class survives the charset filter; the caller then refuses to anchor.
 */
export function pickSegment(target: SegmentInput, siblings: SegmentInput[]): string | null {
  const usable = target.classes.filter((c) => CLASS_RE.test(c));
  if (usable.length === 0) return null;

  const unique = usable.find(
    (c) => siblings.filter((s) => s !== target && s.classes.includes(c)).length === 0,
  );
  if (unique) return `.${unique}`;

  // nth-of-type is 1-based and counts same-tag siblings only.
  const sameTag = siblings.filter((s) => s.tag === target.tag);
  const idx = sameTag.indexOf(target) + 1;
  if (idx < 1 || idx > 99) return null; // grammar caps n at 99
  return `.${usable[0]}:nth-of-type(${idx})`;
}
```

- [ ] **Step 4: Wire the test into the suite**

In `apps/web/package.json`, append to the `test` script chain:

```
 && jiti app/components/editor/_lib/selector-path.test.mjs
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm run test -w @signex/web`
Expected: PASS, exit 0.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(web): pure segment chooser for generated selectors

DOM-free so it is unit-testable — apps/web has no jsdom, and this is the only
part of selector generation with real logic. Prefers a class unique among
siblings (Webflow classes are semantic), falls back to nth-of-type.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Colour engine (DOM glue)

**Files:**
- Create: `apps/web/app/components/editor/_lib/color-engine.ts`

**Interfaces:**
- Consumes: `pickSegment` (Task 4); `TOKEN_VARS`, `PALETTE_VARS`, `isSafeSelector` from `@signex/shared`.
- Produces:
  ```ts
  type ColorRole = "bg" | "text" | "border";
  type RoleInfo = { role: ColorRole; hex?: string; tokenKey?: string; selector?: string };
  resolveMeaningfulBlock(x: number, y: number): HTMLElement | null
  resolveRoles(block: HTMLElement): RoleInfo[]
  buildSelector(el: HTMLElement): string | null
  ```

- [ ] **Step 1: Implement**

Create `apps/web/app/components/editor/_lib/color-engine.ts`:

```ts
// Colour engine — the DOM half of "any element, every colour role".
//
// Thin glue on purpose: the decidable logic lives in selector-path.ts (pure, unit-tested) and in
// @signex/shared's selector grammar. What's here needs a live DOM + CSSOM, and apps/web has no
// jsdom, so it is verified in the browser (see the plan's Task 12).

import { PALETTE_VARS, TOKEN_VARS, isSafeSelector } from "@signex/shared";
import { pickSegment, type SegmentInput } from "./selector-path";

export type ColorRole = "bg" | "text" | "border";

export type RoleInfo = {
  role: ColorRole;
  /** Current rendered colour; undefined when not representable as hex (alpha / gradient). */
  hex?: string;
  /** Seed/token key driving this role, when the winning rule reads a var(). */
  tokenKey?: string;
  /** Target for a per-element override; undefined when the element could not be anchored. */
  selector?: string;
};

const asSegment = (el: Element): SegmentInput => ({
  tag: el.tagName,
  classes: (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean),
});

/** rgb()/rgba() → #rrggbb. Undefined unless fully opaque: hex cannot carry the template's
 *  color-mix alpha, and a lying hex is worse than an honest blank. */
function rgbToHex(v: string): string | undefined {
  const m = v.match(/^rgba?\(([^)]+)\)$/);
  if (!m) return undefined;
  const [r, g, b, a] = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
  if (![r, g, b].every(Number.isFinite)) return undefined;
  if (a !== undefined && a !== 1) return undefined;
  return `#${[r, g, b].map((n) => Math.round(n).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * The element the user means by "this button" — not the topmost node at the click point, which in
 * this template is usually a meaningless fragment (.gsap_split_word inside a split-text heading).
 * Walks up from the top of the paint stack to the first link/button/stamped element/block root.
 */
export function resolveMeaningfulBlock(x: number, y: number): HTMLElement | null {
  const stack = (document.elementsFromPoint(x, y) as HTMLElement[]).filter(
    (n) => !n.closest(".sx-edit-layer"),
  );
  const top = stack[0];
  if (!top) return null;
  return (
    (top.closest("a,button,[data-edit-field],[data-sx-c],[data-sx-block]") as HTMLElement | null) ??
    top
  );
}

/** The element that actually PAINTS `role` for `block`. The nav CTA is a transparent <a> whose
 *  pill is painted by a .btn-bg child, so reading the block itself reports "no colour" for a
 *  visibly navy button. Searching the subtree finds the real painter by construction. */
function painterFor(block: HTMLElement, role: ColorRole): HTMLElement | null {
  const candidates = [block, ...Array.from(block.querySelectorAll<HTMLElement>("*"))];
  if (role === "bg") {
    const box = block.getBoundingClientRect();
    return (
      candidates.find((el) => {
        if (!rgbToHex(getComputedStyle(el).backgroundColor)) return false;
        const r = el.getBoundingClientRect();
        return r.width >= box.width - 1 && r.height >= box.height - 1;
      }) ?? null
    );
  }
  if (role === "text") {
    return (
      candidates.find((el) =>
        Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim()),
      ) ?? block
    );
  }
  return (
    candidates.find((el) => {
      const cs = getComputedStyle(el);
      return parseFloat(cs.borderTopWidth) > 0 && !!rgbToHex(cs.borderTopColor);
    }) ?? null
  );
}

/** The custom property the winning rule reads for `prop`, mapped back to a seed/token key. */
function detectToken(el: HTMLElement, prop: string): string | undefined {
  let varName: string | undefined;
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // cross-origin sheet
    }
    for (const rule of Array.from(rules) as CSSStyleRule[]) {
      if (!rule.selectorText || !rule.style) continue;
      const val = rule.style.getPropertyValue(prop);
      if (!val.startsWith("var(")) continue;
      try {
        if (!el.matches(rule.selectorText)) continue;
      } catch {
        continue; // selector this browser can't parse
      }
      varName = val.slice(4, val.indexOf(")")).trim(); // later rule wins — keep going
    }
  }
  if (!varName) return undefined;
  for (const [k, m] of Object.entries(PALETTE_VARS)) if (m.cssVar === varName) return k;
  for (const [k, m] of Object.entries(TOKEN_VARS)) if (m.cssVar === varName) return k;
  return undefined;
}

/**
 * A selector for `el`, scoped to its block root and PROVEN to resolve back to exactly `el`.
 * Returns null when it cannot be proven — the caller then refuses to anchor and offers token-only
 * editing. A selector that isn't provably unique is never stored.
 */
export function buildSelector(el: HTMLElement): string | null {
  const anchor = el.closest("[data-sx-c]") as HTMLElement | null;
  if (anchor === el) {
    const sel = `[data-sx-c="${anchor.getAttribute("data-sx-c")}"]`;
    return verify(sel, el);
  }
  const root = el.closest("[data-sx-block]") as HTMLElement | null;
  if (!root) return null;

  const parts: string[] = [];
  let node: HTMLElement | null = el;
  while (node && node !== root) {
    const parent: HTMLElement | null = node.parentElement;
    if (!parent) return null;
    const siblings = Array.from(parent.children).map(asSegment);
    const self = siblings[Array.from(parent.children).indexOf(node)];
    const seg = pickSegment(self, siblings);
    if (!seg) return null;
    parts.unshift(seg);
    node = parent;
  }
  const sel = [`[data-sx-block="${root.getAttribute("data-sx-block")}"]`, ...parts].join(" ");
  return verify(sel, el);
}

function verify(sel: string, el: HTMLElement): string | null {
  if (!isSafeSelector(sel)) return null; // grammar is the contract, even for what we generate
  let found: NodeListOf<Element>;
  try {
    found = document.querySelectorAll(sel);
  } catch {
    return null;
  }
  return found.length === 1 && found[0] === el ? sel : null;
}

const ROLE_PROP: Record<ColorRole, string> = {
  bg: "background-color",
  text: "color",
  border: "border-color",
};
const ROLE_COMPUTED: Record<ColorRole, "backgroundColor" | "color" | "borderTopColor"> = {
  bg: "backgroundColor",
  text: "color",
  border: "borderTopColor",
};

export function resolveRoles(block: HTMLElement): RoleInfo[] {
  return (["bg", "text", "border"] as ColorRole[]).map((role) => {
    const painter = painterFor(block, role);
    if (!painter) return { role };
    return {
      role,
      hex: rgbToHex(getComputedStyle(painter)[ROLE_COMPUTED[role]]),
      tokenKey: detectToken(painter, ROLE_PROP[role]),
      selector: buildSelector(painter) ?? undefined,
    };
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: silent.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(web): colour engine — role resolution, token detection, selector generation

Finds the element that actually paints each role, so the nav CTA's .btn-bg child
is discovered structurally rather than via a lookup table. Detects the driving
design token by reading the winning rule's var(), which is what lets picking a
colour edit the token by default instead of minting an override.

Generated selectors are proven unique or refused — never stored on a guess.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Capability stamp API

**Files:**
- Modify: `apps/web/app/lib/edit-attrs.ts`
- Modify: `apps/web/app/lib/edit-attrs.test.mjs`
- Modify: every component calling `editAttrs` / `editText` / `editColor`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  ```ts
  type EditCap = "image" | "video" | "text" | "color";
  interface EditableOpts { image?: true; video?: true; text?: EditTextOpts; color?: EditColorSpec }
  editable(flag: boolean | undefined, field: string, opts: EditableOpts): Record<string, string>
  ```
  Emits `data-edit-field`, `data-edit-caps` (comma-joined), plus the existing text/colour extras.
  `data-edit-kind` is **gone**.

- [ ] **Step 1: Write the failing test**

Replace `apps/web/app/lib/edit-attrs.test.mjs` body with:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { editable } from "./edit-attrs.ts";

test("emits nothing when not editable — the public render must stay clean", () => {
  assert.deepEqual(editable(false, "hero.titleBottom", { text: {} }), {});
});

test("keeps the colour anchor on the public render", () => {
  // data-sx-c is the override target; it must exist on the live site even when not editing.
  assert.deepEqual(editable(false, "nav.cta.color", { color: { roles: ["bg"] } }), {
    "data-sx-c": "nav.cta.color",
  });
});

test("one element can declare BOTH text and colour", () => {
  const a = editable(true, "hero.titleBottom", {
    text: { maxLength: 80 },
    color: { token: "accentAqua", roles: ["text"] },
  });
  assert.equal(a["data-edit-caps"], "text,color");
  assert.equal(a["data-edit-field"], "hero.titleBottom");
  assert.equal(a["data-edit-maxlength"], 80);
  assert.equal(a["data-edit-color-token"], "accentAqua");
  assert.equal(a["data-edit-kind"], undefined);
});

test("media caps", () => {
  assert.equal(editable(true, "hero.image", { image: true })["data-edit-caps"], "image");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jiti apps/web/app/lib/edit-attrs.test.mjs`
Expected: FAIL — `editable is not a function`.

- [ ] **Step 3: Implement**

In `apps/web/app/lib/edit-attrs.ts`, replace `editAttrs`/`editText`/`editColor` with:

```ts
export type EditCap = "image" | "video" | "text" | "color";

export interface EditableOpts {
  image?: true;
  video?: true;
  text?: EditTextOpts;
  color?: EditColorSpec;
}

/**
 * Stamp an element with the edit CAPABILITIES it supports. The active editor mode decides which
 * one a click invokes.
 *
 * This replaces the single-valued `data-edit-kind`, which could not express an element that is
 * both text- and colour-editable — that limitation is why hero.titleBottom needed two nested spans
 * (an inner editText span inside an outer editColor wrapper) and why only 3 elements had colour.
 *
 * `data-sx-c` is returned even when not editable: it is the per-element override's target and the
 * override CSS has to match on the public site. Every `data-edit-*` is preview-only.
 */
export function editable(
  flag: boolean | undefined,
  field: string,
  opts: EditableOpts,
): Record<string, string> {
  const anchor = opts.color ? { "data-sx-c": field } : {};
  if (!flag) return anchor;

  const caps: EditCap[] = [];
  if (opts.image) caps.push("image");
  if (opts.video) caps.push("video");
  if (opts.text) caps.push("text");
  if (opts.color) caps.push("color");

  return {
    ...anchor,
    "data-edit-field": field,
    "data-edit-caps": caps.join(","),
    ...(opts.text?.maxLength != null && { "data-edit-maxlength": String(opts.text.maxLength) }),
    ...(opts.text?.multiline && { "data-edit-multiline": "true" }),
    ...(opts.text?.required && { "data-edit-required": "true" }),
    ...(opts.color?.token && { "data-edit-color-token": opts.color.token }),
    ...(opts.color && { "data-edit-color-roles": opts.color.roles.join(",") }),
  };
}
```

Keep `EditTextOpts`, `EditColorSpec`, `EditColorRole`. Delete `EditKind` and `EditAttrs`.

- [ ] **Step 4: Migrate every call site**

Run `grep -rn "editAttrs\|editText(\|editColor(" apps/web/app` and convert each:

```tsx
// before
<img {...editAttrs(editable, "hero.image", "image")} />
<span {...editText(editable, "hero.titleTop", { maxLength: 80 })}>{t}</span>

// after
<img {...editableAttrs(editable, "hero.image", { image: true })} />
<span {...editableAttrs(editable, "hero.titleTop", { text: { maxLength: 80 } })}>{t}</span>
```

> The components already bind a local prop named `editable`; import the helper aliased —
> `import { editable as editableAttrs } from "@/app/lib/edit-attrs"` — to avoid shadowing.

**Collapse the hero wrapper span.** In `apps/web/app/components/hero.tsx`, `hero.titleBottom` currently has an outer `editColor` wrapper around an inner `editText` span. Merge into one:

```tsx
<span
  {...editableAttrs(editable, "hero.titleBottom", {
    text: { maxLength: 80 },
    color: { token: "accentAqua", roles: ["text"] },
  })}
>
  {dict.titleBottom}
</span>
```

Note the field changes from `hero.titleBottom.color` → `hero.titleBottom`; the anchor id follows.

- [ ] **Step 5: Run to verify**

```bash
npm run test -w @signex/web
npx tsc --noEmit -p apps/web/tsconfig.json
docker compose up -d --build web
curl -s http://localhost:3062/vi | grep -c "data-edit-"     # expect 0
curl -s "http://localhost:3062/preview/vi?secret=dev-preview-secret-change-me&editable=1" \
  | grep -o 'data-edit-caps="[^"]*"' | sort -u              # expect image, text, "text,color", …
```
Expected: tests pass; public count `0`; preview shows caps including a combined `text,color`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(web): capability-based stamp API replaces data-edit-kind

data-edit-kind held ONE value per element, so an element could not be both text-
and colour-editable — hence hero.titleBottom's two nested spans and colour on
only 3 elements. Capabilities + an active mode remove that ceiling; the hero
wrapper span is collapsed.

Public render still leaks zero data-edit-* (asserted).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Mode in the overlay

**Files:**
- Modify: `apps/web/app/components/editor/edit-overlay.tsx`

**Interfaces:**
- Consumes: `resolveMeaningfulBlock`, `resolveRoles` (Task 5); `data-edit-caps` (Task 6).
- Produces:
  - inbound `{ source, type: "setMode", mode: "media"|"text"|"color"|"content" }`
  - outbound `{ source, type: "colorTarget", field, blockKey, label, rect, roles: RoleInfo[] }`

- [ ] **Step 1: Add mode state + the inbound handler**

In the effect, above the click handler:

```ts
// Mode is UI state only — never persisted, never affects the public render. A ref (not React
// state) because the once-subscribed listeners must read the live value.
let mode: "media" | "text" | "color" | "content" = "content";
const hasCap = (el: HTMLElement, cap: string) =>
  (el.getAttribute("data-edit-caps") ?? "").split(",").includes(cap);
```

In `onMessage`:

```ts
      if (data.type === "setMode" && typeof data.mode === "string") {
        mode = data.mode;
        document.body.dataset.sxMode = data.mode;   // drives the hover CSS below
        if (editing) commit();                      // don't strand an in-flight text edit
        scheduleSync();
        return;
      }
```

- [ ] **Step 2: Gate the affordances**

Replace the hover CSS block with mode-gated rules:

```css
      /* Affordances are gated by mode: exactly one kind of thing is clickable at a time, so a
         click is never ambiguous. Outline/box-shadow only — never border/margin/padding, which
         would reflow the byte-faithful layout. */
      body:not([data-sx-mode="text"]) [data-edit-caps~="text"] { cursor: default; }
      body[data-sx-mode="text"] [data-edit-caps*="text"] { cursor: text; }
      body[data-sx-mode="text"] [data-edit-caps*="text"]:hover {
        outline: 2px solid #4956e3; outline-offset: 2px;
      }
      body[data-sx-mode="color"] .sx-color-hover {
        outline: 2px dashed #4956e3; outline-offset: 2px; cursor: pointer;
      }
      body:not([data-sx-mode="media"]) .sx-edit-hotspot { display: none !important; }
```

In `sync()`, skip hotspot positioning entirely unless `mode === "media"`.

- [ ] **Step 3: Route the click by mode**

In `onDocClick`, replace the text/colour branches with:

```ts
      if (mode === "content") return; // canvas is read-only; link interception below still applies

      if (mode === "text") {
        const leaf = (e.target as Element | null)?.closest?.("[data-edit-caps]") as HTMLElement | null;
        if (leaf && hasCap(leaf, "text")) {
          e.preventDefault();
          e.stopPropagation();
          if (editing?.el === leaf) return;
          beginEdit(leaf, e.clientX, e.clientY);
          return;
        }
      }

      if (mode === "color") {
        const block = resolveMeaningfulBlock(e.clientX, e.clientY);
        if (block) {
          e.preventDefault();
          e.stopPropagation();
          const r = block.getBoundingClientRect();
          const field = block.getAttribute("data-edit-field") ?? "";
          window.parent.postMessage(
            {
              source: SOURCE,
              type: "colorTarget",
              field,
              blockKey: block.closest("[data-sx-block]")?.getAttribute("data-sx-block") ?? "",
              label: field || block.tagName.toLowerCase(),
              rect: { x: r.left, y: r.top, width: r.width, height: r.height },
              roles: resolveRoles(block),
            },
            "*",
          );
          return;
        }
      }
```

Add a `mousemove` listener that, in `color` mode, toggles `.sx-color-hover` on the resolved
meaningful block so the outline tracks what a click would select.

Delete the old `colorEdit` postMessage, the `computedColors`/`rgbToHex` helpers (now in
`color-engine.ts`), and the `ANCHOR_PAINT_TARGETS` import.

- [ ] **Step 4: Verify in the browser**

```bash
docker compose up -d --build web
agent-browser navigate "http://localhost:3062/preview/vi?secret=dev-preview-secret-change-me&editable=1"
agent-browser eval '(() => {
  window.postMessage({ source: "signex-editor", type: "setMode", mode: "color" }, "*");
  return document.body.dataset.sxMode;
})()'
```
Expected: `"color"` (after a tick).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(web): mode-gated canvas affordances

Exactly one kind of thing is clickable at a time, so a click is never ambiguous
— which is what lets one element carry both text and colour capabilities.
Switching mode commits an in-flight text edit rather than stranding it.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Admin — modes module + toolbar control

**Files:**
- Create: `apps/admin/app/(dash)/editor/_lib/modes.ts`
- Create: `apps/admin/app/(dash)/editor/_lib/modes.test.ts`
- Modify: `apps/admin/app/(dash)/editor/toolbar.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `type EditMode`, `EDIT_MODES: readonly { key: EditMode; label: string; Icon }[]`, `DEFAULT_MODE: EditMode`. `ToolbarProps` gains `mode: EditMode; onModeChange: (m: EditMode) => void`.

- [ ] **Step 1: Write the failing test**

Create `apps/admin/app/(dash)/editor/_lib/modes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { EDIT_MODES, DEFAULT_MODE } from "./modes";

describe("edit modes", () => {
  it("has exactly the four modes, in canvas order", () => {
    expect(EDIT_MODES.map((m) => m.key)).toEqual(["media", "text", "color", "content"]);
  });

  it("opens in Content so the editor behaves as it did before modes", () => {
    expect(DEFAULT_MODE).toBe("content");
  });

  it("labels are Vietnamese and unique", () => {
    const labels = EDIT_MODES.map((m) => m.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toContain("Màu");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -w @signex/admin`
Expected: FAIL — cannot resolve `./modes`.

- [ ] **Step 3: Implement**

Create `apps/admin/app/(dash)/editor/_lib/modes.ts`:

```ts
import { ImageIcon, TypeIcon, PaletteIcon, ListIcon } from "lucide-react";

/** The single axis that decides what the canvas exposes and what the right panel shows. */
export type EditMode = "media" | "text" | "color" | "content";

export const EDIT_MODES = [
  { key: "media", label: "Media", Icon: ImageIcon },
  { key: "text", label: "Chữ", Icon: TypeIcon },
  { key: "color", label: "Màu", Icon: PaletteIcon },
  { key: "content", label: "Nội dung", Icon: ListIcon },
] as const satisfies readonly { key: EditMode; label: string; Icon: unknown }[];

/** Content = today's section form, so the editor opens exactly as it did before modes existed. */
export const DEFAULT_MODE: EditMode = "content";
```

- [ ] **Step 4: Add the toolbar control**

In `toolbar.tsx`, extend `ToolbarProps` with `mode` / `onModeChange`, and render **in the centre gap** (replacing the bare `{/* ── Spacer ── */}` with a flex-1 wrapper that centres the group):

```tsx
        {/* ── Mode segmented control ───────────────────────────────────────
            Centred, deliberately NOT grouped with VI/EN + the device icons: those change how you
            VIEW the page, mode changes WHAT YOU EDIT.
            Measured: 425px free at a 1600px window; four labelled buttons ≈ 340px. Below 1280px
            the labels are dropped for icon + tooltip (same treatment as the device toggle). */}
        <div className="flex flex-1 justify-center">
          <div className="flex items-center rounded-md border border-input bg-background p-0.5">
            {EDIT_MODES.map((m) => (
              <Tooltip key={m.key}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-pressed={mode === m.key}
                    onClick={() => onModeChange(m.key)}
                    className={cn(
                      "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
                      mode === m.key
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <m.Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="hidden xl:inline">{m.label}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent>{m.label}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>
```

- [ ] **Step 5: Run to verify**

```bash
npm run test -w @signex/admin
npx tsc --noEmit -p apps/admin/tsconfig.json
```
Expected: PASS, silent.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(admin): mode segmented control in the toolbar

Centred and deliberately apart from VI/EN + the device icons: those change how
you view the page, mode changes what you edit. Labels collapse to icons below
xl — 340px of buttons only fits the measured 425px gap at wide windows.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Admin — extract the preview bridge

Pure refactor. No behaviour change; the existing suite is the safety net.

**Files:**
- Create: `apps/admin/app/(dash)/editor/_lib/preview-bridge.ts`
- Modify: `apps/admin/app/(dash)/editor/editor-shell.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  ```ts
  interface PreviewBridge {
    postMode(m: EditMode): void;
    postRefresh(): void;
    postHighlight(field: string): void;
    postScrollToBlock(blockKey: string): void;
    postApplyEdits(edits: ApplyEdit[]): void;
    postApplyPalette(css: string): void;
  }
  usePreviewBridge(args: {
    iframeRef: React.RefObject<HTMLIFrameElement | null>;
    webOrigin: string;
    onMessage: (data: any) => void;
  }): PreviewBridge
  ```

- [ ] **Step 1: Move the posters**

Create `preview-bridge.ts` holding `SOURCE`, every `postMessage` wrapper, and the `window`
`message` listener (origin-verified against `webOrigin`, exactly as today). It calls back into
`onMessage` for shell-owned state.

- [ ] **Step 2: Use it from the shell**

Replace the inline listener/posters in `editor-shell.tsx` with `usePreviewBridge({...})`.

**Preserve the `ready` guard verbatim** — it is a fixed bug (`ad5549a`), not incidental:

```ts
        // Only re-apply when there IS an unsaved palette change — the preview SERVER-RENDERS the
        // saved palette, and posting unconditionally sent css:"" on every clean load, blanking it.
        // A staged reset is the one empty patch that IS a change and must still post "".
        if (!isEmptyPalette(pendingPaletteRef.current) || paletteResetRef.current) {
          bridge.postApplyPalette(paletteStyle(pendingPaletteRef.current) ?? "");
        }
```

Also post the current mode on `ready` (the iframe remounts on navigation and would otherwise fall
back to `content`).

- [ ] **Step 3: Verify nothing changed**

```bash
npm run test -w @signex/admin
npx tsc --noEmit -p apps/admin/tsconfig.json
wc -l "apps/admin/app/(dash)/editor/editor-shell.tsx"
```
Expected: PASS; silent; shell meaningfully under its previous 1121 lines.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(admin): lift the preview postMessage bridge out of editor-shell

Pure move — the shell was 1121 lines and modes would grow it further. The ready
guard from ad5549a is preserved verbatim; mode is now re-posted on ready, since
the iframe remounts on navigation.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Admin — Colour panel

**Files:**
- Create: `apps/admin/app/(dash)/editor/_panels/color-panel.tsx`
- Delete: `apps/admin/app/(dash)/editor/color-popover.tsx`
- Delete: `apps/admin/app/(dash)/editor/palette-panel.tsx`
- Modify: `apps/admin/app/(dash)/editor/editor-shell.tsx`
- Modify: `apps/admin/app/(dash)/editor/sections-nav.tsx`
- Modify: `packages/shared/src/content/palette.ts` (delete `ANCHOR_PAINT_TARGETS`)

**Interfaces:**
- Consumes: `colorTarget` (Task 7), `setSeed`/`setToken`/`setOverride`/`clearOverride` (Task 2), `PALETTE_VARS`/`TOKEN_VARS`.
- Produces: `ColorPanel({ target, palette, onChange, onReset })`.

- [ ] **Step 1: Build the panel**

Reuse `palette-panel.tsx`'s `Swatch` + `ColorRow` + the brand-seed `fieldset` verbatim (they were
tuned against real defects: `size={1}` on the hex input defeats Radix's `display:table` viewport
sizing to min-content; unset renders dashed/checkered rather than a fake `#000000`; hex commits
only a **valid** value because a per-keystroke `#12` would 422 the whole save-draft batch).

Add, above the seeds, one row per resolved role:

```tsx
{target ? (
  <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-4">
    <legend className="px-1 text-sm font-medium text-foreground">{target.label}</legend>
    {target.roles.map((r) => (
      <RoleRow
        key={r.role}
        info={r}
        // Token first: picking a colour edits the TOKEN so every element using it follows and the
        // site stays consistent. Minting an override is the deliberate escape hatch — without this
        // default, changing a brand colour later silently skips anything hard-overridden.
        onPickToken={(hex) =>
          onChange(
            r.tokenKey! in PALETTE_VARS
              ? setSeed(palette, r.tokenKey!, hex)
              : setToken(palette, r.tokenKey!, hex),
          )
        }
        onPickElement={(hex) => onChange(setOverride(palette, r.selector!, r.role, hex))}
        onClearElement={() => onChange(clearOverride(palette, r.selector!))}
      />
    ))}
  </fieldset>
) : (
  <p className="p-4 text-sm text-muted-foreground">Bấm vào một phần tử trên trang để đổi màu.</p>
)}
```

`RoleRow` renders the label, current hex, a token badge when `tokenKey` is set, and the two
actions. It must handle every honest empty state from the spec:

```tsx
// No hex → the colour has alpha (the template derives most tokens via color-mix) or is a
// gradient; hex cannot carry either, so say so rather than show a colour the element doesn't have.
if (!info.hex) return <ReadOnlyRow label={ROLE_LABEL[info.role]} reason="Không đổi được bằng mã hex" />;
// No selector → buildSelector could not PROVE a unique target, so we refuse to anchor.
const canOverride = Boolean(info.selector);
```

- [ ] **Step 2: Surface broken overrides**

Spec §7: a stored selector that matches **0 or >1** elements must be flagged, not silently ignored.
This is how selector drift becomes visible — add a nav link and an `:nth-of-type` in a saved
override can stop pointing at anything. Silently dropping it would leave the user with a colour
they set, that no longer applies, with nothing on screen saying so.

Only the preview knows — the admin has no DOM for the page. Add to the overlay's `ready` handler
(Task 7) an audit of the selectors the shell sends it:

```ts
      // Audit stored override selectors against the live DOM. Reported, never auto-removed:
      // deleting a user's colour because a selector drifted would be worse than showing it broken.
      if (data.type === "auditSelectors" && Array.isArray(data.selectors)) {
        const broken = (data.selectors as string[]).filter((sel) => {
          try {
            return document.querySelectorAll(sel).length !== 1;
          } catch {
            return true;
          }
        });
        window.parent.postMessage({ source: SOURCE, type: "selectorAudit", broken }, "*");
        return;
      }
```

The shell posts `auditSelectors` with `pendingPalette.overrides.map(o => o.selector)` on `ready`
and after each save, stores `broken: string[]`, and `ColorPanel` renders a section listing them:

```tsx
{broken.length > 0 && (
  <fieldset className="flex flex-col gap-2 rounded-lg border border-destructive/50 p-4">
    <legend className="px-1 text-sm font-medium text-destructive">Màu không còn áp dụng</legend>
    <p className="text-xs text-muted-foreground">
      Phần tử gắn màu này không còn trên trang (thường do thêm/bớt mục trong danh sách).
    </p>
    {broken.map((sel) => (
      <div key={sel} className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate font-mono text-xs" title={sel}>{sel}</code>
        <Button size="sm" variant="outline" onClick={() => onChange(clearOverride(palette, sel))}>
          Xoá
        </Button>
      </div>
    ))}
  </fieldset>
)}
```

- [ ] **Step 3: Wire it + delete the popover**

In `editor-shell.tsx`: hold `colorTarget` from the bridge's `colorTarget` message, render
`<ColorPanel>` when `mode === "color"`, and delete the `ColorPopover` import/JSX, the
`anchorSelector` helper from Task 2, and the `ANCHOR_PAINT_TARGETS` import.

```bash
git rm "apps/admin/app/(dash)/editor/color-popover.tsx" "apps/admin/app/(dash)/editor/palette-panel.tsx"
```

- [ ] **Step 4: Remove the palette nav item**

In `sections-nav.tsx`, delete the whole `GIAO DIỆN` / "Bảng màu" `<Collapsible>` and the
`paletteSelected` / `onSelectPalette` props (and their pass-through in the shell). The brand seeds
now live in Colour mode's panel, so a rail item for them is a second, contradictory route.

- [ ] **Step 5: Delete `ANCHOR_PAINT_TARGETS`**

In `packages/shared/src/content/palette.ts`, delete the `ANCHOR_PAINT_TARGETS` export and its doc
block. `resolveRoles` finds the painting element structurally, so the lookup table is dead. Remove
its tests from `palette-style.test.ts` (the "targets the painting descendant" and "keeps a
non-redirected role" cases — the array-shape tests from Task 2 cover the emitter now).

- [ ] **Step 6: Run everything**

```bash
npm run build -w @signex/shared
npx vitest run --root packages/shared
npm run test -w @signex/admin
npx tsc --noEmit -p apps/admin/tsconfig.json
grep -rn "ANCHOR_PAINT_TARGETS\|color-popover\|palette-panel" apps/ packages/ --include=*.ts --include=*.tsx
```
Expected: green; the final grep returns **nothing**.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(admin): colour panel replaces the popover; drop ANCHOR_PAINT_TARGETS

Properties live in the right panel now, so color-popover and palette-panel are
deleted and their tuned bits (size=1 hex input, honest unset swatch, valid-only
commit) move into the panel.

ANCHOR_PAINT_TARGETS is deleted rather than extended: resolveRoles finds the
painting element structurally, which is what that table was faking by hand.

The Bảng màu rail item goes too — the seeds live in Colour mode, and a second
route to them would contradict the mode model.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Admin — field filtering + mode routing

> **Deviation from spec §6, deliberate.** The spec's file table lists `_panels/media-panel.tsx` and
> `_panels/text-panel.tsx`. Both would have been `ContextPanel` with one different `filter` — same
> header, same `ScrollArea`, same `FieldEditor` loop, same empty state. That is verbatim
> duplication of a component three ways, and it would rightly be flagged in review. A `filter` prop
> on `ContextPanel` delivers the same mode-driven panel with none of the copies. If a panel ever
> genuinely diverges (thumbnail grid for media, say), split it then — not now.

**Files:**
- Modify: `apps/admin/app/(dash)/editor/_lib/modes.ts`
- Modify: `apps/admin/app/(dash)/editor/_lib/modes.test.ts`
- Modify: `apps/admin/app/(dash)/editor/context-panel.tsx`
- Modify: `apps/admin/app/(dash)/editor/editor-shell.tsx`

**Interfaces:**
- Consumes: `deriveFields`, `BLOCK_REGISTRY`, `FieldEditor`, `type EditMode` (Task 8).
- Produces:
  - `isMediaField(f: FieldPlan): boolean`, `isTextField(f: FieldPlan): boolean` in `_lib/modes.ts`
    (`FieldPlan` is `deriveFields`' element type — `apps/admin/app/lib/zodform-fields.ts:20`)
  - `ContextPanelProps` gains `filter?: (f: FieldPlan) => boolean` and `title?: string`

- [ ] **Step 1: Write the failing test for the field classifiers**

The classifiers decide what each panel lists, so they are the part worth testing. Add to
`apps/admin/app/(dash)/editor/_lib/modes.test.ts`:

```ts
import { isMediaField, isTextField } from "./modes";
// Relative, NOT "@/…": apps/admin/vitest.config.ts sets no resolve.alias, so the @/ path alias
// works in the app but not under vitest. Every existing admin test imports relatively for this
// reason. (A type-only "@/…" import inside modes.ts is fine — esbuild erases it.)
import { deriveFields } from "../../../lib/zodform-fields";
import { BLOCK_REGISTRY } from "@signex/shared";

describe("field classifiers", () => {
  // Verified against the real registry: titleTop/titleBottom/subtitle are `localized`,
  // image is `assetRef`.
  const heroFields = deriveFields(BLOCK_REGISTRY.hero);

  it("Media mode lists the hero image and no strings", () => {
    const names = heroFields.filter(isMediaField).map((f) => f.name);
    expect(names).toContain("image");
    expect(names).not.toContain("titleTop");
  });

  it("Text mode lists the hero strings and no media", () => {
    const names = heroFields.filter(isTextField).map((f) => f.name);
    expect(names).toContain("titleTop");
    expect(names).not.toContain("image");
  });

  it("every field lands in at most one visual mode", () => {
    for (const f of heroFields) expect(isMediaField(f) && isTextField(f)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -w @signex/admin`
Expected: FAIL — `isMediaField` is not exported.

- [ ] **Step 3: Implement the classifiers**

`deriveFields` returns `FieldPlan[]` with a `kind: FieldKind` discriminant
(`apps/admin/app/lib/zodform-fields.ts:3-27`). The real kinds are:

```
"string" | "localized" | "localizedArray" | "stringArray" | "boolean"
| "array" | "assetRef" | "videoRef" | "object" | "json"
```

Add to `_lib/modes.ts`:

```ts
import type { FieldPlan } from "@/app/lib/zodform-fields";

/**
 * Which visual mode owns a section field. These drive the Media/Text panels' lists, which — with
 * nothing clicked — are the ONLY route to fields the canvas deliberately cannot expose (array
 * tiles, slider-internal media; see apps/web/app/lib/edit-attrs.ts's EXCLUDE list).
 *
 * Keyed off FieldPlan.kind, the same discriminant FieldEditor already switches on — a second,
 * parallel notion of "what kind of field is this" would drift from the renderer.
 */
export function isMediaField(f: FieldPlan): boolean {
  return f.kind === "assetRef" || f.kind === "videoRef";
}

export function isTextField(f: FieldPlan): boolean {
  return f.kind === "string" || f.kind === "localized" || f.kind === "localizedArray" || f.kind === "stringArray";
}
```

`array` / `object` fields are containers: they may hold media or text leaves in `children`, so
neither predicate claims them. Recursing is out of scope — a container's leaves stay reachable in
Content mode, which is exactly what that mode is for.

- [ ] **Step 4: Add the filter to ContextPanel**

In `context-panel.tsx`, extend the props and apply the filter at the one place fields are derived
(`context-panel.tsx:72`):

```tsx
export interface ContextPanelProps {
  // …existing props unchanged…
  /** Mode's field lens. Omitted (Content mode) = every field. */
  filter?: (f: FieldPlan) => boolean;
  /** Overrides the block label in the header, so Media/Text modes can name what's listed. */
  title?: string;
}
```

```tsx
  const all = deriveFields(BLOCK_REGISTRY[blockKey]);
  const fields = filter ? all.filter(filter) : all;
  const label = title ?? BLOCK_LABELS[blockKey] ?? blockKey;
```

Make the empty state say which lens is empty, since "No editable fields for this section" is now
misleading when a filter is on:

```tsx
          {fields.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {filter ? "Mục này không có nội dung thuộc chế độ đang chọn." : "No editable fields for this section."}
            </p>
          )}
```

Clicking a zone on the canvas already posts `highlight`, which the shell turns into `flashField` —
so the click scrolls + rings the matching row. Keep that wiring; do not add a second mechanism.

- [ ] **Step 5: Route the panel by mode**

In `editor-shell.tsx`:

```tsx
{mode === "media" && <ContextPanel {...common} filter={isMediaField} title="Hình ảnh & video" />}
{mode === "text" && <ContextPanel {...common} filter={isTextField} title="Nội dung chữ" />}
{mode === "color" && <ColorPanel target={colorTarget} palette={pendingPalette} onChange={applyPalette} onReset={onResetPalette} />}
{mode === "content" && <ContextPanel {...common} />}
```

Post the mode to the preview whenever it changes:

```tsx
useEffect(() => { bridge.postMode(mode); }, [mode, bridge]);
```

- [ ] **Step 6: Make selection follow the click in Colour mode**

Spec §1 "Selection follows the click": clicking any element selects its owning block in the left
rail, **in every mode**. Media/Text already get this via the existing `highlight` path, but a
Colour-mode click on an unstamped element posts `colorTarget` (which has no `field` to highlight),
so without this the rail would keep pointing at an unrelated section while the panel shows the
element you just clicked.

`colorTarget` carries `blockKey` for exactly this. In the shell's `colorTarget` handler:

```ts
        // Selection follows the click (spec §1). Colour mode can target an element with no
        // data-edit-field, so the highlight path can't carry it — blockKey is why the message has
        // that field. Guard on change: re-selecting the current block would re-trigger the panel's
        // scroll-to-top + flash on every colour click.
        if (data.blockKey && data.blockKey !== selectedBlockKeyRef.current) {
          selectBlock(data.blockKey as BlockKey);
        }
```

- [ ] **Step 7: Verify**

```bash
npm run test -w @signex/admin
npx tsc --noEmit -p apps/admin/tsconfig.json
```
Expected: PASS, silent.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(admin): media/text panels + mode-driven panel routing

With nothing clicked each lists every field of its kind in the section — the
only route to what the canvas deliberately cannot expose (array tiles,
slider-internal media). Click still scrolls + rings via the existing highlight
path rather than a second mechanism.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Rebuild and authenticate**

```bash
npm run build -w @signex/shared
docker compose up -d --build web admin
SESS=$(curl -s -i -X POST http://localhost:3061/admin-api/auth/login \
  -H "Content-Type: application/json" -H "Origin: http://localhost:3061" \
  -d '{"username":"admin","password":"change-me-please-now"}' \
  | grep -i '^set-cookie: sx_session' | sed 's/.*sx_session=\([^;]*\).*/\1/')
agent-browser cookies set sx_session "$SESS" --url http://localhost:3061
agent-browser set viewport 1600 1000
agent-browser navigate "http://localhost:3061/editor/cmr7m5hnm001nn457rgnq3dr3"
```

- [ ] **Step 2: Verify the headline case — colour on an element that was never stamped**

Switch to Màu mode, click the hero image (no `data-sx-c`, no anchor — it only works if selector
generation does). Screenshot. Expect: the panel names the element, lists roles with real hexes,
and the token badge appears where a token drives the role.

Then click the nav CTA and confirm `Nền` reads `#0d2b44` (**not** `—`) — that is the `.btn-bg`
resolution working structurally.

- [ ] **Step 3: Verify token-first**

Pick a colour on the CTA's `Nền` with the default action. Expect **every** primary button on the
page to change, not just the CTA:

```bash
agent-browser eval '(() => JSON.stringify(
  [...document.querySelectorAll(".btn-bg")].map(n => getComputedStyle(n).backgroundColor)))()'
```

- [ ] **Step 4: Verify per-element**

Use "Chỉ phần tử này" on the CTA. Expect exactly one `.btn-bg` to change. Then:

```bash
docker compose exec -T postgres psql -U signex -d signex -t -c \
  "select jsonb_pretty(\"draftSnapshot\"->'palette') from \"Theme\" where id='cmr7m5hnm001nn457rgnq3dr3';"
```
Expect `overrides` to be an **array** whose `selector` targets the painting element.

- [ ] **Step 5: Verify mode gating**

In Media mode, click a text leaf → nothing happens. In Text mode, hotspots are hidden and the leaf
becomes editable. In Content mode, the canvas is inert.

- [ ] **Step 6: Verify the full pipeline + the public invariant**

Save draft → Publish → then:

```bash
curl -s http://localhost:3062/vi | grep -o '<style id="signex-palette">[^<]*</style>'
curl -s http://localhost:3062/vi | grep -c "data-edit-"      # expect 0
curl -s http://localhost:3062/vi | grep -c "data-sx-block"   # expect >0
```

Reload the editor and confirm the saved palette **survives** (regression guard for `ad5549a`: the
CTA must stay recoloured, not snap back).

Finally reset → Save → Publish and confirm the public baseline returns (`0` palette nodes).

- [ ] **Step 7: Full suite**

```bash
npx vitest run --root packages/shared
npm run test -w @signex/admin
npm run test -w @signex/web
npm run test -w @signex/api
npx tsc --noEmit -p apps/web/tsconfig.json
npx tsc --noEmit -p apps/admin/tsconfig.json
npm run lint
```
Expected: all green. Pre-existing `apps/web` lint warnings (`<img>`, `no-css-tags` in the faithful
Webflow port) are expected — **errors** are not.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "test: verify editor modes end-to-end

Colour on a never-stamped element via generated selectors; token-first changes
every primary button while per-element changes exactly one; mode gating; save →
publish → public; saved palette survives an editor reload; public still leaks
zero data-edit-*.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
