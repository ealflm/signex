# Floating Buttons — Configurable Links (design)

**Goal:** Give the two floating quick-contact buttons (Gọi / Zalo, fixed bottom-right on every page) their own admin-editable links, instead of always deriving the link from the `businessContact` phone numbers.

**Confirmed with the user:**
- **Both** buttons get a link field (not just Zalo).
- **Link-only** — no enable/disable, no label, no new-tab toggle (YAGNI).
- The config lives in a **dedicated "Floating buttons" entry** in the admin block list (its own block, NOT a sub-object of Business contact).
- Empty link → keep today's behavior (derive from `businessContact.phones`). Full link → use verbatim. Bare number → auto-format.

## Current behavior (what we're changing)

`apps/web/app/components/floating-contact.tsx` renders the two buttons and **derives** each href from `businessContact.phones`:
- the `kind: "tel"` phone → `telHref(value)` → `tel:<digits>`
- the `kind: "zalo"` phone → `zaloHref(value)` → `https://zalo.me/<digits, 84→0>`

There is no independent link. A Zalo Official-Account / group / custom link cannot be expressed, because the href is always `zalo.me/<the phone number>`. The buttons render on every page via `apps/web/app/[lang]/layout.tsx` (and the five `apps/web/app/preview/**` pages), fed the whole `dict`.

The two normalizer helpers (`telHref`, `zaloHref`) already live in `floating-contact.tsx` and are reused, extended with a "already a safe URL → pass through" branch.

## Global constraints (binding)

- **No new user-facing copy.** The button links are locale-invariant scalars (a URL is not translated), like `businessContact.phones[].value`.
- **`@signex/shared` compiles to CommonJS `dist/` (`tsc`) before web/admin/api consume it.** Rebuild it after schema changes: `npm run build -w @signex/shared`.
- **NEVER `npm run test` (turbo-all).** Per-workspace only.
- web tsc: `cd apps/web && node /home/ealflm/dev/signex/node_modules/typescript/bin/tsc --noEmit` (npx tsc is a decoy). admin tsc likewise from `apps/admin`.
- Public render leaks zero `data-edit-*`/`data-sx-*` (the buttons are already non-editable-on-canvas; they stay that way — edited only via the admin field form).
- Branch off `main`. Commit trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## The new block

New file `packages/shared/src/content/blocks/floatingButtons.ts`:

```ts
import { z } from "zod";

/**
 * FLOATING BUTTONS — links for the two fixed bottom-right quick-contact buttons
 * (Gọi / Zalo). Locale-invariant scalars (a link is not translated). Both OPTIONAL:
 * an empty string means "fall back to the businessContact phone derivation" (the
 * web resolves that), so the buttons keep working with no config.
 *
 * Top-level `.default({...})` is LOAD-BEARING: ReleaseSnapshotSchema is
 * `blocks: z.object(BLOCK_REGISTRY)`, and the currently-published snapshot predates
 * this block. The default makes Zod fill the missing key on parse, so every existing
 * published + draft snapshot stays valid (no migration, no site-blanking to
 * INITIAL_SNAPSHOT). deriveFields (admin) unwraps ZodDefault, so the form still renders.
 */
export const floatingButtonsBlock = z
  .object({
    callHref: z.string().default(""),
    zaloHref: z.string().default(""),
  })
  .default({ callHref: "", zaloHref: "" });

export type FloatingButtonsBlock = z.infer<typeof floatingButtonsBlock>;
```

- **Permissive `z.string()`, NOT a strict URL/`Href` validator** — the field must accept a full link *or* a bare phone number; the web normalizes. Field-level `.default("")` keeps each leaf present after parse (so `callHref`/`zaloHref` are non-optional in the output type — no optional-chaining needed downstream).
- Exported from `packages/shared/src/content/blocks/index.ts` and re-exported from `packages/shared/src/index.ts` alongside the other block types.

## Registration (`packages/shared/src/content/registry.ts`)

Add the block to the single source of truth:
- `BLOCK_REGISTRY.floatingButtons = floatingButtonsBlock`
- `BLOCK_KIND_BY_KEY.floatingButtons = 'SETTINGS'` (exhaustive `Record<BlockKey,…>` — omitting it is a build error, which is the safety net).
- `registry.test.ts` enumerates every block key; add `"floatingButtons"` to that expected list (and any count assertion).

Because `ReleaseBlocks = { [K in BlockKey]: infer<schema> }` and the schema's **output** type has both hrefs present (field defaults), `floatingButtons` becomes a required key of `ReleaseSnapshot['blocks']` — so `INITIAL_SNAPSHOT` and any other `ReleaseSnapshot` literal must include it, enforced by tsc.

## API importer (`apps/api/src/importer/block-builder.ts`)

`buildBlocks` builds `dataByKey: Record<BlockKey, unknown>` — adding the registry key forces a new entry (tsc error otherwise). Add:

```ts
function buildFloatingButtons(): FloatingButtonsBlock {
  // New sites seed empty links → the web falls back to the businessContact phone derivation.
  return { callHref: "", zaloHref: "" };
}
```

and `floatingButtons: buildFloatingButtons()` in `dataByKey`. The importer only runs for a fresh site (it refuses once a Theme exists), so this does not touch the production data; production materializes the block via the schema default on read/save.

## Web read path (`apps/web/app/lib/content.ts`)

Expose the block in the resolved view-model:

```ts
floatingButtons: {
  callHref: b.floatingButtons.callHref,
  zaloHref: b.floatingButtons.zaloHref,
},
```

`b.floatingButtons` is guaranteed present (schema default), so no optional-chain is required — but the value strings may be empty (the "derive from phone" signal). Also add `floatingButtons: { callHref: "", zaloHref: "" }` to `apps/web/app/lib/initial-snapshot.ts` so the INITIAL_SNAPSHOT literal typechecks.

## Web component (`apps/web/app/components/floating-contact.tsx`)

Resolve each button's final href as: **explicit link (if set) → else phone-derived (today)**. A safe-scheme whitelist prevents emitting anything but `http/https/tel/mailto`.

```ts
const SAFE = /^(https?:|tel:|mailto:)/i;

/** explicit link wins; a bare value is run through the same formatter as before. */
function resolveCall(explicit: string, phone: string | undefined): string {
  const e = explicit.trim();
  if (e) return SAFE.test(e) ? e : telHref(e);   // full link verbatim, else format as tel:
  return phone ? telHref(phone) : "";
}
function resolveZalo(explicit: string, phone: string | undefined): string {
  const e = explicit.trim();
  if (e) return SAFE.test(e) ? e : zaloHref(e);   // full link verbatim, else format as zalo.me/<num>
  return phone ? zaloHref(phone) : "";
}
```

`FloatingContact` reads `dict.floatingButtons.callHref` / `.zaloHref` and the existing `dict.businessContact.phones` for the fallback. Show/hide is unchanged: a button whose resolved href is empty is not rendered; if both are empty the component returns `null`.

Extract the resolver (`resolveCall`/`resolveZalo` + `SAFE` + reused `telHref`/`zaloHref`) into a tiny pure module `apps/web/app/components/floating-contact.links.ts` so it is unit-testable without rendering.

## Admin (`apps/admin/app/(dash)/editor/_lib/blocks.ts`)

- Add `{ blockKey: "floatingButtons", label: "Floating buttons" }` to the block list that ContextPanel renders.
- Add `floatingButtons: null` to the canvas-selectable map (the `businessContact: null` pattern) — a fields-only block edited through the field form, not clicked on the canvas.
- No custom form UI: `deriveFields(BLOCK_REGISTRY.floatingButtons)` yields two string inputs (`callHref`, `zaloHref`) automatically; `unwrap()` handles the `.default()` wrappers.

## Backward compatibility & data flow (summary)

| Path | Behavior with the new block |
|---|---|
| Existing **published** snapshot (no `floatingButtons`) | `ReleaseSnapshotSchema.parse` fills the default → block present, empty links → web derives from phones. **Site unchanged.** |
| Existing **draft** snapshot (no `floatingButtons`) | Same default-fill on load; first save of the block persists it. **No migration.** |
| **New** site (importer) | `buildFloatingButtons` seeds empty links. |
| Editor sets a link + **publishes** | New Release snapshot carries the link; web uses it verbatim (or formats a bare number). |

No `SCHEMA_VERSION` bump (old snapshots still parse as v1). No Prisma migration.

## Testing

- **shared:** registry test lists `floatingButtons`; a `floatingButtons.test.ts` asserts the default-fill (`floatingButtonsBlock.parse(undefined)` → `{callHref:"",zaloHref:""}`) and that a partial `{}` fills both leaves.
- **web:** `floating-contact.links.test.mjs` — empty→derive-from-phone, full-link→verbatim, bare-number→formatted, unsafe-scheme (`javascript:`)→dropped/formatted-away, both-empty→hidden. Plus web tsc (which fails if the `INITIAL_SNAPSHOT` literal omits the new required `floatingButtons` key) + the existing `npm test -w @signex/web` chain stays green.
- **admin:** admin tsc + the existing test chain; a smoke assertion that the block list contains `floatingButtons` and `deriveFields` returns the two fields.

## Out of scope

- No enable/label/new-tab/icon config. No canvas inline-editing of the buttons. No change to the button styling or the `businessContact` block. No catalog/palette interaction.

## Deployment

Branch off `main`; after review + tsc + per-workspace test chains + browser check, fast-forward merge. Rebuilds **shared + web + admin + api**. No migration; the block default-materializes on the existing production snapshot, so publishing is only needed once the operator actually sets a link.
