# Floating Buttons — Configurable Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the two floating quick-contact buttons (Gọi / Zalo) their own admin-editable links, falling back to the current `businessContact` phone derivation when a link is left empty.

**Architecture:** A new `floatingButtons` SETTINGS content block (`callHref`, `zaloHref`) is registered in `@signex/shared`. Its top-level `.default()` keeps the already-published production snapshot valid with no migration. The web resolves each button's href as *explicit link → else phone-derived*; the admin auto-derives a two-field form from the schema.

**Tech Stack:** zod (schema), NestJS importer (seed), Next.js 16 web (read-path + component), Next.js 16 admin (auto-form). Monorepo: npm workspaces + Turborepo. Tests: vitest (shared), `node:test`/jiti `.test.mjs` (web).

## Global Constraints

- **No new user-facing copy.** The links are locale-invariant scalar strings (a URL is not translated), like `businessContact.phones[].value`.
- **`@signex/shared` compiles to CommonJS `dist/` (`tsc`) before web/admin/api consume it.** After any shared change, rebuild it: `npm run build -w @signex/shared`. Downstream tsc reads `@signex/shared/dist`, not the source.
- **NEVER `npm run test` (turbo-all).** Per-workspace only.
- web tsc: `cd apps/web && node /home/ealflm/dev/signex/node_modules/typescript/bin/tsc --noEmit` (npx tsc is a decoy). admin tsc: `cd apps/admin && node /home/ealflm/dev/signex/node_modules/typescript/bin/tsc --noEmit`. api tsc/build: `npm run build -w @signex/api`.
- Adding a `BlockKey` makes every exhaustive `Record<BlockKey,…>` and the `INITIAL_SNAPSHOT` `satisfies` fail to compile until filled. This is intentional. The full branch only typechecks after ALL tasks; **each task restores only its own workspace's tsc** — per task, do NOT run the tsc of a workspace whose task has not run yet (it is expected red).
- Public render leaks zero `data-edit-*`/`data-sx-*`. The floating buttons stay non-editable-on-canvas (fields-only, edited via the admin form).
- Permissive `z.string()`, NOT a strict URL/`Href` validator (bare numbers must be accepted; the web normalizes). Only `http/https/tel/mailto` hrefs are ever emitted (safe-scheme whitelist).
- Branch off `main`. Commit trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: The `floatingButtons` block + registry (shared)

**Files:**
- Create: `packages/shared/src/content/blocks/floatingButtons.ts`
- Create: `packages/shared/src/content/blocks/floatingButtons.test.ts`
- Modify: `packages/shared/src/content/blocks/index.ts`
- Modify: `packages/shared/src/content/registry.ts` (`BLOCK_REGISTRY` + `BLOCK_KIND_BY_KEY`)
- Modify: `packages/shared/src/content/registry.test.ts` (`EXPECTED_KEYS` + count)

**Interfaces:**
- Produces:
  - `floatingButtonsBlock: z.ZodDefault<z.ZodObject<{ callHref: z.ZodDefault<z.ZodString>, zaloHref: z.ZodDefault<z.ZodString> }>>`
  - `type FloatingButtonsBlock = { callHref: string; zaloHref: string }`
  - `BLOCK_REGISTRY.floatingButtons`, `BLOCK_KIND_BY_KEY.floatingButtons = 'SETTINGS'`
  - So `ReleaseSnapshot['blocks'].floatingButtons` is a required `{ callHref: string; zaloHref: string }`.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/content/blocks/floatingButtons.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { floatingButtonsBlock } from "./floatingButtons";

describe("floatingButtonsBlock", () => {
  it("defaults the whole block when the key is absent (undefined)", () => {
    expect(floatingButtonsBlock.parse(undefined)).toEqual({ callHref: "", zaloHref: "" });
  });

  it("fills both leaves from a partial object", () => {
    expect(floatingButtonsBlock.parse({})).toEqual({ callHref: "", zaloHref: "" });
    expect(floatingButtonsBlock.parse({ callHref: "tel:+84979700072" })).toEqual({
      callHref: "tel:+84979700072",
      zaloHref: "",
    });
  });

  it("keeps provided values verbatim (no URL validation)", () => {
    expect(floatingButtonsBlock.parse({ callHref: "0979700072", zaloHref: "https://zalo.me/g/abc" })).toEqual({
      callHref: "0979700072",
      zaloHref: "https://zalo.me/g/abc",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @signex/shared -- floatingButtons`
Expected: FAIL — cannot resolve `./floatingButtons` (module does not exist yet).

- [ ] **Step 3: Create the block schema**

Create `packages/shared/src/content/blocks/floatingButtons.ts`:

```ts
import { z } from "zod";

/**
 * FLOATING BUTTONS — links for the two fixed bottom-right quick-contact buttons
 * (Gọi / Zalo). Locale-invariant scalars (a link is not translated). Both leaves
 * default to "" meaning "fall back to the businessContact phone derivation" (the web
 * resolves that), so the buttons keep working with no config.
 *
 * The top-level `.default({...})` is LOAD-BEARING: ReleaseSnapshotSchema is
 * `blocks: z.object(BLOCK_REGISTRY)`, and the currently-published snapshot predates
 * this block. The default makes Zod fill the missing key on parse, so every existing
 * published + draft snapshot stays valid (no migration, no site-blanking to
 * INITIAL_SNAPSHOT). deriveFields (admin) unwraps ZodDefault, so the form still renders.
 *
 * Permissive `z.string()` (NOT a URL validator): the field accepts a full link OR a
 * bare phone number; the web normalizes and only ever emits http/https/tel/mailto.
 */
export const floatingButtonsBlock = z
  .object({
    callHref: z.string().default(""),
    zaloHref: z.string().default(""),
  })
  .default({ callHref: "", zaloHref: "" });

export type FloatingButtonsBlock = z.infer<typeof floatingButtonsBlock>;
```

- [ ] **Step 4: Export it from the blocks barrel**

In `packages/shared/src/content/blocks/index.ts`, add after the `notFound` line:

```ts
export * from "./notFound";
export * from "./floatingButtons";
```

- [ ] **Step 5: Register in the registry**

In `packages/shared/src/content/registry.ts`:

Add to the import list (after `notFoundBlock,`):
```ts
  notFoundBlock,
  floatingButtonsBlock,
} from "./blocks";
```

Add to `BLOCK_REGISTRY` (after the `notFound:` line):
```ts
  notFound: notFoundBlock,
  floatingButtons: floatingButtonsBlock,
} as const;
```

Add to `BLOCK_KIND_BY_KEY` (after the `formConfig: 'SETTINGS',` line):
```ts
  formConfig: 'SETTINGS',
  floatingButtons: 'SETTINGS',
```

- [ ] **Step 6: Update the registry conformance test**

In `packages/shared/src/content/registry.test.ts`, add `"floatingButtons"` to the `EXPECTED_KEYS` array (after `"notFound",`) and bump the count assertion from `12` to `13`:

```ts
  "notFound",
  "floatingButtons",
];
```
```ts
    expect(BLOCK_KEYS.length).toBe(13);
```

- [ ] **Step 7: Run shared tests + tsc to verify they pass**

Run: `npm run test -w @signex/shared`
Expected: PASS — the new `floatingButtons` suite passes; `registry.test.ts` (`Object.keys(BLOCK_REGISTRY)` equals `EXPECTED_KEYS`, `BLOCK_KEYS.length === 13`, `BLOCK_KIND_BY_KEY` keys equal `BLOCK_KEYS`) passes.

Run: `cd /home/ealflm/dev/signex/packages/shared && node /home/ealflm/dev/signex/node_modules/typescript/bin/tsc --noEmit`
Expected: exit 0 (shared source typechecks).

- [ ] **Step 8: Rebuild the shared dist so downstream workspaces see the new block**

Run: `npm run build -w @signex/shared`
Expected: exit 0; `packages/shared/dist/content/blocks/floatingButtons.js` and the updated `registry.js` exist.

- [ ] **Step 9: Commit**

```bash
git add packages/shared/src/content/blocks/floatingButtons.ts \
        packages/shared/src/content/blocks/floatingButtons.test.ts \
        packages/shared/src/content/blocks/index.ts \
        packages/shared/src/content/registry.ts \
        packages/shared/src/content/registry.test.ts
git commit -m "feat(shared): floatingButtons block (callHref/zaloHref, defaulted for back-compat)"
```

Note: after this task, apps/web, apps/api and apps/admin tsc are EXPECTED RED (missing `floatingButtons` in their exhaustive `Record<BlockKey>` / `INITIAL_SNAPSHOT`). Tasks 2–4 restore them.

---

### Task 2: Web resolver, component, read-path (web)

**Files:**
- Create: `apps/web/app/components/floating-contact.links.ts`
- Create: `apps/web/app/components/floating-contact.links.test.mjs`
- Modify: `apps/web/app/components/floating-contact.tsx`
- Modify: `apps/web/app/lib/content.ts` (expose `dict.floatingButtons`)
- Modify: `apps/web/app/lib/initial-snapshot.ts` (add `floatingButtons` to `blocks`)
- Modify: `apps/web/package.json` (append the new test to the `test` chain)

**Interfaces:**
- Consumes (from Task 1): `ReleaseSnapshot['blocks'].floatingButtons: { callHref: string; zaloHref: string }` (always present after `ReleaseSnapshotSchema.parse`, values may be `""`).
- Produces:
  - `resolveCallHref(explicit: string, phone: string | undefined): string`
  - `resolveZaloHref(explicit: string, phone: string | undefined): string`
  - `telHref(value: string): string`, `zaloHref(value: string): string`, `SAFE_HREF: RegExp` (moved out of the component)
  - `dict.floatingButtons: { callHref: string; zaloHref: string }` on the resolved `SiteContent`/`Dictionary`.

- [ ] **Step 1: Write the failing resolver test**

Create `apps/web/app/components/floating-contact.links.test.mjs`:

```mjs
import test from "node:test";
import assert from "node:assert/strict";
import { resolveCallHref, resolveZaloHref } from "./floating-contact.links.ts";

test("empty explicit -> derive tel: from the phone", () => {
  assert.equal(resolveCallHref("", "(+84) 979 700 072"), "tel:+84979700072");
});
test("empty explicit + no phone -> empty (button hidden)", () => {
  assert.equal(resolveCallHref("", undefined), "");
  assert.equal(resolveZaloHref("", undefined), "");
});
test("empty explicit -> derive zalo.me from the phone (84 -> 0)", () => {
  assert.equal(resolveZaloHref("", "(+84) 94 9999 326"), "https://zalo.me/0949999326");
});
test("full link is used verbatim", () => {
  assert.equal(resolveCallHref("tel:+84123", "0000"), "tel:+84123");
  assert.equal(resolveZaloHref("https://zalo.me/g/abcdef", "0000"), "https://zalo.me/g/abcdef");
});
test("bare number is formatted", () => {
  assert.equal(resolveCallHref("0979700072", undefined), "tel:0979700072");
  assert.equal(resolveZaloHref("0949999326", undefined), "https://zalo.me/0949999326");
});
test("unsafe scheme is never emitted verbatim", () => {
  const c = resolveCallHref("javascript:alert(1)", undefined);
  const z = resolveZaloHref("javascript:alert(1)", undefined);
  assert.ok(!/^javascript:/i.test(c), `call must not emit javascript: got ${c}`);
  assert.ok(!/^javascript:/i.test(z), `zalo must not emit javascript: got ${z}`);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/ealflm/dev/signex/apps/web && npx jiti app/components/floating-contact.links.test.mjs`
Expected: FAIL — cannot resolve `./floating-contact.links.ts`.

- [ ] **Step 3: Create the resolver module**

Create `apps/web/app/components/floating-contact.links.ts` (the `telHref`/`zaloHref` bodies are moved verbatim from `floating-contact.tsx`):

```ts
// Pure link resolver for the two floating buttons — extracted so it is unit-testable
// without rendering. Each button's final href is: explicit link (if set) else derived
// from the businessContact phone (today's behavior). Only http/https/tel/mailto is ever
// emitted; anything else is treated as a bare value and formatted (never passed through).

/** Schemes we emit verbatim. A stray `javascript:`/`data:` never matches → gets formatted away. */
export const SAFE_HREF = /^(https?:|tel:|mailto:)/i;

/** "(+84) 979 700 072" → "tel:+84979700072" — keep digits and one leading +. */
export function telHref(value: string): string {
  const s = value.replace(/[^\d+]/g, "");
  return `tel:${s.startsWith("+") ? "+" + s.slice(1).replace(/\+/g, "") : s.replace(/\+/g, "")}`;
}

/** "(+84) 94 9999 326" → "https://zalo.me/0949999326" — digits, +84/84 prefix normalised to 0. */
export function zaloHref(value: string): string {
  let d = value.replace(/\D/g, "");
  if (d.startsWith("84")) d = "0" + d.slice(2);
  return `https://zalo.me/${d}`;
}

export function resolveCallHref(explicit: string, phone: string | undefined): string {
  const e = (explicit ?? "").trim();
  if (e) return SAFE_HREF.test(e) ? e : telHref(e);
  const p = phone?.trim();
  return p ? telHref(p) : "";
}

export function resolveZaloHref(explicit: string, phone: string | undefined): string {
  const e = (explicit ?? "").trim();
  if (e) return SAFE_HREF.test(e) ? e : zaloHref(e);
  const p = phone?.trim();
  return p ? zaloHref(p) : "";
}
```

- [ ] **Step 4: Run the resolver test to verify it passes**

Run: `cd /home/ealflm/dev/signex/apps/web && npx jiti app/components/floating-contact.links.test.mjs`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Rewire the component to use the resolver + the new links**

Replace the whole body of `apps/web/app/components/floating-contact.tsx` with:

```tsx
// app/components/floating-contact.tsx
// Floating call + Zalo quick-contact buttons, fixed bottom-right on every page. Each button's link
// comes from the floatingButtons block (callHref / zaloHref, editable in the admin); when a link is
// empty it falls back to the businessContact phone (tel:/zalo.me), so nothing breaks with no config.
// A button whose resolved href is empty is not rendered. Server component, no JS.
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { resolveCallHref, resolveZaloHref } from "./floating-contact.links";

export function FloatingContact({ dict }: { dict: Dictionary }) {
  const phones = dict.businessContact.phones;
  const telPhone = phones.find((p) => p.kind === "tel")?.value;
  const zaloPhone = phones.find((p) => p.kind === "zalo")?.value;
  const call = resolveCallHref(dict.floatingButtons.callHref, telPhone);
  const zalo = resolveZaloHref(dict.floatingButtons.zaloHref, zaloPhone);
  if (!call && !zalo) return null;
  return (
    <div className="sx-float-contact">
      {zalo ? (
        <a
          className="sx-float-btn is-zalo"
          href={zalo}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Chat Zalo"
        >
          Zalo
        </a>
      ) : null}
      {call ? (
        <a className="sx-float-btn is-call" href={call} aria-label="Gọi điện">
          <svg aria-hidden="true" fill="none" height="22" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="22" xmlns="http://www.w3.org/2000/svg">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
        </a>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 6: Expose `floatingButtons` in the resolved view-model**

In `apps/web/app/lib/content.ts`, inside the object returned by `resolveForLang` (the `return {` at line ~105), add a `floatingButtons` entry immediately after the `businessContact: { … },` block (it closes at the `},` on the line with `social: …`):

```ts
    floatingButtons: {
      callHref: b.floatingButtons.callHref,
      zaloHref: b.floatingButtons.zaloHref,
    },
```

(`b` is `snap.blocks`; `b.floatingButtons` is guaranteed present by the schema default. This flows into `SiteContent`/`Dictionary` automatically because the type is `ReturnType<typeof resolveForLang>`.)

- [ ] **Step 7: Add `floatingButtons` to `INITIAL_SNAPSHOT`**

In `apps/web/app/lib/initial-snapshot.ts`, inside the `blocks` object, add a `floatingButtons` sibling next to `businessContact` (object key order is irrelevant; place it right before `"businessContact": {`):

```json
    "floatingButtons": {
      "callHref": "",
      "zaloHref": ""
    },
    "businessContact": {
```

(The file ends with `} as const satisfies ReleaseSnapshot;` — this key is now required by that `satisfies`.)

- [ ] **Step 8: Register the new test in the web test chain**

In `apps/web/package.json`, append to the end of the `"test"` script value (after `... && jiti app/lib/seo-icons.test.mjs`):

```
 && jiti app/components/floating-contact.links.test.mjs
```

- [ ] **Step 9: Rebuild shared dist (if not already fresh) then run web tsc + the web test chain**

Run: `npm run build -w @signex/shared`
Expected: exit 0 (ensures `dist` carries the Task 1 block for the web typecheck).

Run: `cd /home/ealflm/dev/signex/apps/web && node /home/ealflm/dev/signex/node_modules/typescript/bin/tsc --noEmit`
Expected: exit 0 — `dict.floatingButtons` resolves, `INITIAL_SNAPSHOT` satisfies `ReleaseSnapshot`.

Run: `npm test -w @signex/web`
Expected: PASS — the full chain, including the new `floating-contact.links.test.mjs`, is green.

- [ ] **Step 10: Commit**

```bash
git add apps/web/app/components/floating-contact.links.ts \
        apps/web/app/components/floating-contact.links.test.mjs \
        apps/web/app/components/floating-contact.tsx \
        apps/web/app/lib/content.ts \
        apps/web/app/lib/initial-snapshot.ts \
        apps/web/package.json
git commit -m "feat(web): floating buttons read floatingButtons links, fall back to phones"
```

Note: apps/api and apps/admin tsc remain EXPECTED RED until Tasks 3–4.

---

### Task 3: Importer seeds the block (api)

**Files:**
- Modify: `apps/api/src/importer/block-builder.ts` (`buildFloatingButtons` + `dataByKey` entry)

**Interfaces:**
- Consumes (from Task 1): `FloatingButtonsBlock`, `BLOCK_KIND_BY_KEY.floatingButtons`.
- Produces: `dataByKey.floatingButtons` so `buildBlocks` emits a valid `floatingButtons` block for a fresh site.

- [ ] **Step 1: Add the builder function**

In `apps/api/src/importer/block-builder.ts`, add a builder near the other `build*` functions (e.g. after `buildBusinessContact`), typing the return against the shared type. First extend the shared import to include the type:

```ts
import {
  parseBlock,
  BLOCK_KIND_BY_KEY,
  type BlockKey,
  type BlockKind as SharedBlockKind,
  type FloatingButtonsBlock,
} from '@signex/shared';
```

Then add:

```ts
function buildFloatingButtons(): FloatingButtonsBlock {
  // New sites seed empty links → the web falls back to the businessContact phone derivation.
  // Operators set real links later in the admin ("Floating buttons").
  return { callHref: '', zaloHref: '' };
}
```

- [ ] **Step 2: Wire it into `dataByKey`**

In the `dataByKey: Record<BlockKey, unknown>` literal inside `buildBlocks`, add after the `notFound:` line:

```ts
    notFound: buildNotFound(E, V, assets),
    floatingButtons: buildFloatingButtons(),
  };
```

- [ ] **Step 3: Build the api to verify it typechecks + the block validates**

Run: `npm run build -w @signex/api`
Expected: exit 0. (`buildBlocks` maps `dataByKey` through `parseBlock('SETTINGS', 'floatingButtons', {callHref:'',zaloHref:''})`; the schema default accepts it. A missing `dataByKey.floatingButtons` would be a compile error — proving completeness.)

- [ ] **Step 4: Run the api test suite**

Run: `npm test -w @signex/api` (jest)
Expected: PASS — the existing `block-builder.spec.ts` (which exercises `buildBlocks`) stays green with the new block wired in.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/importer/block-builder.ts
git commit -m "feat(api): importer seeds the floatingButtons block for new sites"
```

Note: apps/admin tsc remains EXPECTED RED until Task 4.

---

### Task 4: Admin "Floating buttons" entry (admin)

**Files:**
- Modify: `apps/admin/app/(dash)/editor/_lib/blocks.ts` (`SURFACE_GROUPS` item + `SURFACE_PATH_BY_BLOCK` entry)
- Create: `apps/admin/app/(dash)/editor/_lib/floating-buttons.test.ts`

**Interfaces:**
- Consumes (from Task 1): `BLOCK_REGISTRY.floatingButtons`, and the admin's `deriveFields` (in `apps/admin/app/lib/zodform-fields.ts`) which `unwrap`s `ZodDefault`.
- Produces: a "Floating buttons" entry in the Settings group; `SURFACE_PATH_BY_BLOCK.floatingButtons = null`; `BLOCK_LABELS.floatingButtons = "Floating buttons"` (derived).

- [ ] **Step 1: Write the failing test**

Create `apps/admin/app/(dash)/editor/_lib/floating-buttons.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { BLOCK_REGISTRY } from "@signex/shared";
import { deriveFields } from "@/app/lib/zodform-fields";
import { BLOCK_LABELS, SURFACE_PATH_BY_BLOCK } from "./blocks";

describe("floatingButtons admin surface", () => {
  it("is a labelled, global (null-path) settings block", () => {
    expect(BLOCK_LABELS.floatingButtons).toBe("Floating buttons");
    expect(SURFACE_PATH_BY_BLOCK.floatingButtons).toBe(null);
  });

  it("derives exactly two string fields (callHref, zaloHref)", () => {
    const fields = deriveFields(BLOCK_REGISTRY.floatingButtons);
    expect(fields.map((f) => f.name).sort()).toEqual(["callHref", "zaloHref"]);
    expect(fields.every((f) => f.kind === "string")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -w @signex/admin -- floating-buttons` (vitest, filtered by filename)
Expected: FAIL — at runtime `BLOCK_LABELS.floatingButtons` and `SURFACE_PATH_BY_BLOCK.floatingButtons` are `undefined` (vitest runs via esbuild without a full typecheck, so the not-yet-exhaustive `Record<BlockKey>` does not block the run; the assertions fail).

- [ ] **Step 3: Add the block list item**

In `apps/admin/app/(dash)/editor/_lib/blocks.ts`, add to the `"Settings"` group's `items` array (after the `{ blockKey: "notFound", label: "404 page" },` line):

```ts
      { blockKey: "notFound", label: "404 page" },
      { blockKey: "floatingButtons", label: "Floating buttons" },
    ],
```

- [ ] **Step 4: Add the surface-path entry**

In the same file, add to `SURFACE_PATH_BY_BLOCK` (after the `formConfig: null,` line — grouping it with the other global settings blocks):

```ts
  formConfig: null,
  floatingButtons: null,
```

- [ ] **Step 5: Run admin tsc + the test to verify pass**

Run: `cd /home/ealflm/dev/signex/apps/admin && node /home/ealflm/dev/signex/node_modules/typescript/bin/tsc --noEmit`
Expected: exit 0 (`SURFACE_PATH_BY_BLOCK` is now exhaustive; `BLOCK_LABELS` derives the new label).

Run: `npm run test -w @signex/admin -- floating-buttons`
Expected: PASS — the block is labelled, global, and derives two string fields.

- [ ] **Step 6: Commit**

```bash
git add "apps/admin/app/(dash)/editor/_lib/blocks.ts" \
        "apps/admin/app/(dash)/editor/_lib/floating-buttons.test.ts"
git commit -m "feat(admin): 'Floating buttons' block entry (callHref/zaloHref fields)"
```

At this point the whole branch typechecks and all four workspaces are green.

---

## Final verification (after all tasks — whole-branch review)

- [ ] Rebuild shared, then whole-repo build sanity: `npm run build -w @signex/shared && npm run build -w @signex/api && cd apps/web && node /home/ealflm/dev/signex/node_modules/typescript/bin/tsc --noEmit && cd ../admin && node /home/ealflm/dev/signex/node_modules/typescript/bin/tsc --noEmit` — all exit 0.
- [ ] Per-workspace tests green: `npm run test -w @signex/shared` and `npm test -w @signex/web`.
- [ ] Browser E2E (public): the two floating buttons still render on `/vi` with no config (they derive from the phones, unchanged from today). Then, to confirm the override path end-to-end, set `floatingButtons.zaloHref` on a draft in the admin, publish, and confirm the Zalo button's `href` is the exact link (not `zalo.me/<phone>`); an emptied field reverts to the derived link.
- [ ] Confirm no `data-sx-*`/`data-edit-*` leak from the buttons in public HTML.

## Deployment

Fast-forward merge to `main` after review. Rebuilds **shared + web + admin + api**. No Prisma migration — the block default-materializes on the existing production snapshot, so the live site is unchanged until an operator sets a link and publishes.
