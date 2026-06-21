# Task 74 Report: Registry-driven content block editor

## Status
DONE

## Commit
`d05724f` — feat(admin): registry-driven content block editor (<ZodForm> from BLOCK_REGISTRY)

## Files created
- `apps/admin/app/(dash)/content/[blockKey]/page.tsx` (server component)
- `apps/admin/app/(dash)/content/[blockKey]/zod-form.tsx` (client component)

## tsc + build + lint
- `npx tsc --noEmit -p apps/admin/tsconfig.json` → clean (no output)
- `npm run build -w @signex/admin` → green; `/content/[blockKey]` (ƒ Dynamic) in route table
- `npm run lint -w @signex/admin` → 0 errors

## (kind, key) resolution
The URL `blockKey` param is the full DB key (e.g., `home.hero`, `hero`, `nav`). The registry
key is derived via `registryKeyFrom(dbKey)` = last dot-segment (so `home.hero` → `hero`,
`hero` → `hero`). The `kind` (BlockKind) is resolved via `BLOCK_KIND_MAP`, an inline Record
that mirrors `BLOCK_KIND_BY_KEY` from `apps/api/src/importer/block-builder.ts`. Cross-app
imports are forbidden, so this 12-entry map is replicated in the page file with a comment
citing the canonical source.

Note: the actual importer stores DB keys without composite prefixes (the registry key IS the
DB key for most blocks). The dot-segment logic gracefully handles both `/content/hero` and
the layout's aspirational `/content/home.hero` link (both resolve to registry key `hero`).

## Field kinds — real inputs vs JSON textarea
| FieldPlan kind | Rendered as |
|---|---|
| `string` | `<input type="text">` labeled input |
| `localized` | `<fieldset>` with paired en + vi text inputs |
| `assetRef` | `<select>` asset picker from GET /api/assets |
| `localizedArray` | Raw JSON `<textarea>` (labeled "raw JSON") |
| `array` | Raw JSON `<textarea>` (labeled "raw JSON") |
| `json` | Raw JSON `<textarea>` (labeled "raw JSON") |

JSON textareas have inline client-side parse validation (shows error if not valid JSON,
prevents save while malformed).

## Client-side parseBlock validation
`ZodForm.onSave()` calls `parseBlock(kind, blockKey, data)` (the 3-arg form with BlockKind +
DB key) BEFORE the fetch. On ZodError: extracts `.issues` array, formats as
`"fieldPath: message"` list, sets error msg and returns without hitting the server.
`@signex/shared` is imported in the `"use client"` component — Next.js bundles it into
the client JS (acceptable; shared has no Node-only deps).

## 409/422 handling
- `409 Conflict` → amber "warn" alert: stale lock, instructs user to reload
- `422 Unprocessable Entity` → red "error" alert with extracted `error` field from body
- Network errors → caught and surfaced as red alert
- All status messages rendered with `role="alert" aria-live="polite"`

## expectedRevision source
Fetched from `GET /api/releases/diff` (returns `{dirty, revision, lastPublishedRevision}`).
`revision` is the current working state revision — the correct value for the optimistic lock.
Note: `GET /api/content/blocks/:kind/:key` returns raw `data` only (no revision field), so
diff endpoint is the correct source.

## requireRole
Server page calls `await requireRole("EDITOR")` before any data fetch; bounces sub-EDITOR
roles to `/` (defense-in-depth; API re-checks independently).

## Block navigator
Renders pill-links for all 12 BLOCK_REGISTRY keys; active key highlighted. Links use
registry key directly (`/content/hero`) matching the page's resolution logic.

## Fix pass (JSON-field validity gates Save)
Bug: `JsonField` showed a red "invalid JSON" error but the Save button remained enabled because
`JsonField` only called `onChange` on a successful parse (keeping stale last-valid data in
`ZodForm`), so clicking Save would silently submit the stale value — contradicting the error
message.

Fix applied to `apps/admin/app/(dash)/content/[blockKey]/zod-form.tsx`:
1. `JsonField` gains `onValidityChange(name, valid)` prop; called on every keystroke in both
   the success (`true`) and catch (`false`) branches.
2. `ZodForm` tracks `jsonErrors: Set<string>` via `handleValidityChange` (adds/removes field
   names as validity changes).
3. Save button: `disabled={busy || jsonErrors.size > 0}` + `aria-disabled` mirrors it.
4. `onSave` early-returns with a form-level error ("Fix the highlighted JSON field(s) before
   saving.") when `jsonErrors.size > 0` — before `setBusy(true)` — so no stale value is ever
   submitted.
5. `FieldEditor` threads `onValidityChange` down to `JsonField`; `// TODO: alt editing`
   comment added near `AssetRefField`.

Verify: `npx tsc --noEmit -p apps/admin/tsconfig.json` clean; `npm run build -w @signex/admin`
green (all routes, no TS errors); `npm run lint -w @signex/admin` 0 errors.
