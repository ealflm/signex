# Themes Unified Editor Implementation Plan (Plan 3 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the standalone `/visual` editor and the per-block `/content` forms with ONE theme-scoped Unified Editor at `apps/admin/app/(dash)/editor/[themeId]` doing structured + media editing with instant preview, explicit Save draft, and Publish.

**Architecture:** A server `page.tsx` loads the theme's `draftSnapshot` + `draftRevision` + asset library; a client `editor-shell.tsx` controller holds the selection `{blockKey,fieldPath,locale}` and a client-held pending `Map<blockKey, blockData>`, drives a cross-origin `/preview` iframe via postMessage, batches all pending into ONE `POST /api/themes/:id/save-draft`, and publishes via `POST /api/releases/publish`. The right-hand context panel edits structured fields (writing into the pending map); the canvas does media-hotspot picking + live `<img>`/`<video>` swap. The field editors are extracted into a shared `editor/_fields/*` consumed by BOTH the panel and the retargeted `/content` fallback.

**Tech Stack:** Next.js 16.2.7 (admin, port 3061; web, port 3062), React client components, shadcn/ui (new-york), NestJS 11 API (port 3060), `@signex/shared` zod registry, Prisma 6.

## Global Constraints

These apply to EVERY task. Copied verbatim from the author brief / approved spec.

- **Next 16.2.7:** `params` / `searchParams` are Promises — `await` them. Read `node_modules/next/dist/docs/` before unfamiliar Next APIs. The routing/middleware file is `proxy.ts`.
- **API access:** server components/actions use `apiServer` (`apps/admin/app/lib/api.ts`); client code uses the same-origin `/admin-api/[...path]` proxy (which maps `/admin-api/<x>` → `${API_URL}/api/<x>` and forwards the `sx_session` cookie as `Authorization: Bearer`). Base origin = `env().API_URL`.
- **RBAC:** EDITOR may edit + Save draft; PUBLISHER+ may Publish (and delete themes). Server gate = `requireRole("EDITOR")` / `requireRole("PUBLISHER")` from `apps/admin/app/lib/session.ts`. The API enforces `@Roles('EDITOR')` on save-draft/catalog and `@Roles('PUBLISHER')` on publish.
- **save-draft DTO:** `POST /api/themes/:themeId/save-draft` body `{ edits: [{ key, data }], expectedDraftRevision }` → 200 `{ draftRevision }`; 409 `STALE_DRAFT`; 422 `{ code:"INVALID_BLOCK"|"UNKNOWN_BLOCK"|"INVALID_SNAPSHOT", key?, detail?, issues? }`. ONE revision bump per batch.
- **publish DTO:** `POST /api/releases/publish` body `{ themeId, expectedDraftRevision, note? }`; 409 `STALE_DRAFT`.
- **preview:** `GET/POST /api/preview/snapshot?themeId=` (header `x-preview-secret`); the web preview island reads it via `getPreviewSnapshot(lang, themeId)`.
- **catalog (theme-scoped, FLAT bodies, NO GET routes):** `POST/PATCH/DELETE /api/themes/:themeId/catalog/categories[/:id]` and `.../categories/:catId/products[/:pid]`, plus `PATCH .../categories/reorder` and `.../products/reorder`. Category body `{ expectedDraftRevision, slug, title, tag, intro, productCount, materialCount, imageId?, imageAlt? }` (NO `sortOrder`, NO `input` wrapper). Product body `{ expectedDraftRevision, slug, title, tag, desc, imageId?, imageAlt? }` (categoryId is in the PATH, not the body). Catalog READ comes from `GET /api/themes/:id` → `draftSnapshot.catalog.categories`.
- **`parseBlock(key, data)` is 2-arg** (registry key) — overload 1 in `packages/shared/src/content/registry.ts`. The 3-arg `parseBlock(kind, dbKey, data)` overload still exists but is NOT used here.
- **Block keys (12, registry keys):** `hero, features, about, productsHeader, footer, nav, meta, businessContact, formConfig, aboutPage, contactPage, notFound` (`BLOCK_REGISTRY` / `BLOCK_KEYS`).
- **shadcn:** new-york; `cn()` at `apps/admin/lib/utils.ts`. Present already: `alert-dialog, dropdown-menu, scroll-area, tabs, tooltip, separator, badge, button, input, textarea, label, select, sonner, table`. MISSING (add when first needed): `resizable`, `collapsible`.
- **Active theme:** cookie `active_theme_id` (`ACTIVE_THEME_COOKIE`), read via `getActiveThemeId()` (`apps/admin/app/lib/themes.ts`); set client-side by `POST /admin-api/active-theme {themeId}`. A header `ThemeSwitcher` already exists.
- **Branch:** `feat/themes-model`.
- **Commit trailer (every commit):**
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01W43GcnR1BXH9qm8TLt4DJ6
  ```
- **Per-task gate:** admin = `cd apps/admin && npx tsc --noEmit`; web = `cd apps/web && npx tsc --noEmit`. Integration tasks also run `next build`. The admin app has NO unit-test runner — verification is `tsc` + the browser acceptance notes in Task 9. (The plan therefore uses tsc-as-the-failing/passing gate instead of a test runner; this is intentional, matching the existing admin codebase.)

## Scope boundary (Plan 3 vs Plan 4)

**IN (Plan 3):** editor shell, toolbar, sections-nav, context-panel (panel text editing only), shared `_fields/*`, save-draft/publish/discard, media-hotspot picking + live media swap, theme-scoped preview, catalog retarget, `/content` retarget.

**OUT (DEFER to Plan 4 — do NOT build here):** inline `contentEditable` text editing on the canvas; wrapping section components' inline text leaves in `<span>`s; `edit-attrs.ts` `"text"` kind; the five inline-text gates; the markup-delta gate; `notFound.image` stamping + making 404 reachable in preview; two-way panel↔canvas highlight; observer-based hotspot positioning (keep the existing rAF). In Plan 3 the canvas does media-hotspot + selection only; ALL text editing happens in the right-hand context panel.

---

## File Structure

**New (admin, the editor):**
- `apps/admin/app/(dash)/editor/[themeId]/page.tsx` — server loader (theme draft + revision + assets + flags) → renders `<EditorShell>`.
- `apps/admin/app/(dash)/editor/[themeId]/loading.tsx` — skeleton.
- `apps/admin/app/(dash)/editor/editor-shell.tsx` — client controller (selection, pending Map, applyFieldEdit/applyMediaRef, save-draft, publish, status, guards, postMessage bridge, MediaPickerDialog host). Composes the three zones.
- `apps/admin/app/(dash)/editor/toolbar.tsx` — presentational toolbar (Back · name · locale · device · status pill · Reload · Discard · Save draft · Publish ▾).
- `apps/admin/app/(dash)/editor/sections-nav.tsx` — presentational Collapsible tree grouped by surface, with dirty dots.
- `apps/admin/app/(dash)/editor/context-panel.tsx` — presentational panel (derives fields, renders `_fields` FieldEditor, onChange → callback).
- `apps/admin/app/(dash)/editor/_fields/field-editor.tsx` — the extracted field editors (`StringField`/`LocalizedField`/`AssetRefField`/`VideoRefField`/`ObjectField`/`JsonField` + `FieldEditor` switch) — SINGLE source.
- `apps/admin/app/(dash)/editor/_lib/blocks.ts` — `SURFACE_GROUPS`, `BLOCK_LABELS`, `SURFACE_PATH_BY_BLOCK`, editor primitive types (`Locale`, `DeviceWidth`, `ToolbarStatus`, `Selection`).

**Modified (admin):**
- `apps/admin/app/(dash)/content/[blockKey]/page.tsx` + `zod-form.tsx` — import shared `_fields`; read from `GET /api/themes/:id`; save via save-draft.
- `apps/admin/app/(dash)/catalog/page.tsx` + `actions.ts` + `category-forms.tsx` + `product-forms.tsx` — read from theme draft, theme-scoped writes, drop sortOrder input.
- `apps/admin/components/shell/*` (sidebar nav) — remove the `/visual` entry; (the editor is reached from `/themes`, already linked).

**Removed (admin):**
- `apps/admin/app/(dash)/visual/page.tsx`, `visual-editor.tsx`, `loading.tsx` — the old standalone editor route (its API endpoints are gone). KEEP `visual/media-picker-dialog.tsx`, `asset-grid.tsx`, `crop-view.tsx`, `aspect-presets.ts` — reused by the editor.

**Modified (web):**
- `apps/web/app/preview/[lang]/page.tsx`, `about/page.tsx`, `contact/page.tsx`, `products/[slug]/page.tsx` — accept `searchParams.theme`, pass to `getPreviewSnapshot(locale, theme)`.
- `apps/web/app/components/editor/edit-overlay.tsx` — hotspot scan → image/video only; inbound `applyEdits` swap; outbound `ready` handshake; preserve `theme` across in-iframe navigation.

---

## Task 1: Extract shared `_fields` + retarget `/content` to themes

Establishes the single-source field editors and proves the themes save-draft round-trip from the simplest surface.

**Files:**
- Create: `apps/admin/app/(dash)/editor/_fields/field-editor.tsx`
- Modify: `apps/admin/app/(dash)/content/[blockKey]/zod-form.tsx`
- Modify: `apps/admin/app/(dash)/content/[blockKey]/page.tsx`

**Interfaces:**
- Consumes: `deriveFields`, `FieldPlan`, `FieldKind` from `@/app/lib/zodform-fields`; `parseBlock`, `BLOCK_REGISTRY`, `BLOCK_KIND_BY_KEY`, `BlockKey` from `@signex/shared`; `getActiveThemeId` from `@/app/lib/themes`; `apiServer` from `@/app/lib/api`.
- Produces:
  - `FieldEditor` component with props:
    ```ts
    export interface FieldAssetRow { id: string; originalName: string }
    export interface FieldEditorProps {
      field: FieldPlan;
      value: unknown;
      assets: FieldAssetRow[];
      onChange: (v: unknown) => void;
      onValidityChange: (name: string, valid: boolean) => void;
      // When provided, AssetRef/VideoRef fields render a "Choose media…" button that calls this
      // (the editor panel opens MediaPickerDialog); when omitted they fall back to the native <select>.
      onPickMedia?: (fieldName: string, kind: "image" | "video") => void;
    }
    export function FieldEditor(props: FieldEditorProps): React.ReactElement;
    ```

- [ ] **Step 1: Create `_fields/field-editor.tsx` by lifting the editors verbatim from `zod-form.tsx`.**

Move the six components (`StringField`, `LocalizedField`, `AssetRefField`, `VideoRefField`, `ObjectField`, `JsonField`) and the `FieldEditor` switch out of `content/[blockKey]/zod-form.tsx` into the new file. Start the file with `"use client";`, the imports they need (`useState` from react; `parseBlock` is NOT needed here; `FieldPlan` from `@/app/lib/zodform-fields`; `Field` from `@/components/admin/field`; `StatusBadge` from `@/components/admin/status-badge`; `Input`, `Textarea` from `@/components/ui/*`; `Button` from `@/components/ui/button`), and export the types above. The local `AssetRow` becomes the exported `FieldAssetRow`.

Apply this diff to `AssetRefField` and `VideoRefField` so they accept `onPickMedia` and render a button when present (shown for `AssetRefField`; mirror it in `VideoRefField` with `kind="video"`):

```tsx
function AssetRefField({ field, value, onChange, assets, onPickMedia }: {
  field: FieldPlan; value: unknown; onChange: (v: unknown) => void;
  assets: FieldAssetRow[]; onPickMedia?: (fieldName: string, kind: "image" | "video") => void;
}) {
  const v = (value as { assetId?: string; alt?: { en?: string; vi?: string } }) ?? {};
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <legend className="px-1 text-sm font-medium text-foreground">{field.label}</legend>
      {onPickMedia ? (
        <Button type="button" variant="outline" size="sm" onClick={() => onPickMedia(field.name, "image")}>
          {v.assetId ? "Replace image…" : "Choose image…"}
        </Button>
      ) : (
        <Field label="Asset" htmlFor={`field-${field.name}-asset`}>
          <select
            id={`field-${field.name}-asset`}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] duration-150 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            value={v.assetId ?? ""}
            onChange={(e) => onChange({ ...v, assetId: e.target.value || undefined })}
          >
            <option value="">— none —</option>
            {assets.map((a) => (<option key={a.id} value={a.id}>{a.originalName}</option>))}
          </select>
        </Field>
      )}
    </fieldset>
  );
}
```

Thread the optional `onPickMedia` down through the `FieldEditor` switch and `ObjectField` (pass it to each recursive child) so nested media fields (e.g. `features.featured.image`) still get the button.

- [ ] **Step 2: Re-point `zod-form.tsx` at the shared editors + retarget save.**

Delete the now-moved components from `zod-form.tsx`. Add `import { FieldEditor, type FieldAssetRow } from "@/app/(dash)/editor/_fields/field-editor";`. Change `Props` to drop `kind`, keep `blockKey` (now the REGISTRY key), `expectedRevision` → `expectedDraftRevision`, and add `themeId: string`. Replace client validation + the PUT with save-draft:

```tsx
// client-side validate with the 2-arg overload (registry key)
try { parseBlock(blockKey as BlockKey, data); }
catch (e) { /* …existing ZodError formatting, setMsg, return… */ }

const res = await fetch(`/admin-api/themes/${themeId}/save-draft`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ edits: [{ key: blockKey, data }], expectedDraftRevision }),
});
if (res.ok) {
  const body = (await res.json().catch(() => null)) as { draftRevision?: number } | null;
  if (body && typeof body.draftRevision === "number") setExpectedDraftRevision(body.draftRevision);
  setMsg({ text: "Saved to draft.", type: "success" });
} else if (res.status === 409) {
  setMsg({ text: "Conflict (409) — the theme draft changed. Reload to get the latest before saving again.", type: "warn" });
} else if (res.status === 422) {
  const b = (await res.json().catch(() => null)) as { detail?: string; code?: string } | null;
  setMsg({ text: `Validation failed (422)${b?.detail ? ` — ${b.detail}` : b?.code ? ` — ${b.code}` : ""}.`, type: "error" });
} else { /* …existing generic error… */ }
```

Hold `expectedDraftRevision` in `useState` (initialised from the prop) so consecutive saves use the bumped revision: `const [expectedDraftRevision, setExpectedDraftRevision] = useState(initialExpectedDraftRevision);`.

- [ ] **Step 3: Retarget `content/[blockKey]/page.tsx` read.**

Replace the `/api/content/blocks/...` + `/api/releases/diff` fetches with a single theme read. Resolve the active theme; if none, render a clear notice. The URL param `blockKey` is already a registry key in the nav links (`/content/${k}`), so drop the `registryKeyFrom`/`kind` routing — keep `BLOCK_KIND_BY_KEY[key]` only for the cosmetic header:

```tsx
import { getActiveThemeId } from "@/app/lib/themes";
import type { ReleaseSnapshot } from "@signex/shared";

const { blockKey } = await params;
if (!(blockKey in BLOCK_REGISTRY)) notFound();
const key = blockKey as BlockKey;
const themeId = await getActiveThemeId();
if (!themeId) { /* render EmptyState: "Pick an active theme in the header to edit content." */ }
const themeRes = await apiServer<{ draftSnapshot: ReleaseSnapshot; draftRevision: number }>(`/api/themes/${themeId}`);
const snapshot = themeRes.ok ? themeRes.data.draftSnapshot : null;
const initialData = (snapshot?.blocks as Record<string, Record<string, unknown>> | undefined)?.[key] ?? {};
const expectedDraftRevision = themeRes.ok ? themeRes.data.draftRevision : 0;
const assetsRes = await apiServer<{ id: string; originalName: string }[]>("/api/assets");
const assets = assetsRes.ok && Array.isArray(assetsRes.data) ? assetsRes.data : [];
```

Pass `themeId`, `blockKey={key}`, `fields={deriveFields(BLOCK_REGISTRY[key])}`, `initialData`, `initialExpectedDraftRevision={expectedDraftRevision}`, `assets` to `<ZodForm>`. The `/content/${k}` nav loop stays (registry keys).

- [ ] **Step 4: Gate.**

Run: `cd apps/admin && npx tsc --noEmit`
Expected: PASS (no errors). If `zod-form.tsx` references a removed component, the compile surfaces it.

- [ ] **Step 5: Commit.**

```bash
git add apps/admin/app/\(dash\)/editor/_fields apps/admin/app/\(dash\)/content
git commit -m "feat(editor): extract shared _fields editors; retarget /content to theme save-draft"
```

---

## Task 2: shadcn setup + editor primitives + `toolbar.tsx`

**Files:**
- Create: `apps/admin/app/(dash)/editor/_lib/blocks.ts`
- Create: `apps/admin/app/(dash)/editor/toolbar.tsx`
- Add shadcn: `apps/admin/components/ui/resizable.tsx`, `apps/admin/components/ui/collapsible.tsx`

**Interfaces:**
- Consumes: `cn` from `@/lib/utils`; `Button`, `dropdown-menu`, `tooltip`, `toggle-group` from `@/components/ui/*`; `BlockKey`, `BLOCK_KEYS` from `@signex/shared`.
- Produces (in `_lib/blocks.ts`):
  ```ts
  export type Locale = "vi" | "en";
  export type DeviceWidth = "desktop" | "tablet" | "mobile";
  export interface Selection { blockKey: BlockKey; fieldPath: string | null; locale: Locale }
  export type ToolbarStatus =
    | { kind: "saved"; revision: number }
    | { kind: "unsaved"; count: number }
    | { kind: "saving" };
  export const DEVICE_MAX_WIDTH: Record<DeviceWidth, number | null>; // desktop:null, tablet:834, mobile:430
  export interface SurfaceGroup { label: string; items: { blockKey: BlockKey; label: string }[] }
  export const SURFACE_GROUPS: SurfaceGroup[];
  export const SURFACE_PATH_BY_BLOCK: Record<BlockKey, string | null>; // "" home, "/about", "/contact", null = global/settings
  ```
- Produces (in `toolbar.tsx`):
  ```ts
  export interface ToolbarProps {
    themeName: string; backHref: string;
    lang: Locale; onLangChange: (l: Locale) => void;
    device: DeviceWidth; onDeviceChange: (d: DeviceWidth) => void;
    status: ToolbarStatus;
    draftAheadOf: { draftRevision: number; publishedRevision: number } | null;
    canPublish: boolean; publishEnabled: boolean; saveEnabled: boolean;
    busy: boolean;
    onReload: () => void; onDiscard: () => void; onSave: () => void; onPublish: () => void;
  }
  export function Toolbar(props: ToolbarProps): React.ReactElement;
  ```

- [ ] **Step 1: Add the two missing shadcn primitives.**

Run: `cd apps/admin && npx shadcn@latest add resizable collapsible`
Expected: creates `components/ui/resizable.tsx` and `components/ui/collapsible.tsx` (new-york). If the CLI prompts, accept defaults; it pulls `react-resizable-panels` + `@radix-ui/react-collapsible` into `apps/admin/package.json`.

- [ ] **Step 2: Write `_lib/blocks.ts`.**

Define the types/maps above. `SURFACE_GROUPS` (mirrors the spec's navigator grouping):
```ts
export const SURFACE_GROUPS: SurfaceGroup[] = [
  { label: "Page: Home", items: [
    { blockKey: "hero", label: "Hero" }, { blockKey: "features", label: "Features" },
    { blockKey: "about", label: "About" }, { blockKey: "productsHeader", label: "Products header" } ] },
  { label: "Page: About", items: [ { blockKey: "aboutPage", label: "About page" } ] },
  { label: "Page: Contact", items: [ { blockKey: "contactPage", label: "Contact page" } ] },
  { label: "Global", items: [ { blockKey: "nav", label: "Navigation" }, { blockKey: "footer", label: "Footer" } ] },
  { label: "Settings", items: [
    { blockKey: "meta", label: "SEO + GA4" }, { blockKey: "businessContact", label: "Business contact" },
    { blockKey: "formConfig", label: "Form config" }, { blockKey: "notFound", label: "404 page" } ] },
];
export const SURFACE_PATH_BY_BLOCK: Record<BlockKey, string | null> = {
  hero: "", features: "", about: "", productsHeader: "",
  aboutPage: "/about", contactPage: "/contact",
  nav: null, footer: null, meta: null, businessContact: null, formConfig: null, notFound: null,
};
export const DEVICE_MAX_WIDTH: Record<DeviceWidth, number | null> = { desktop: null, tablet: 834, mobile: 430 };
```
(Add a `BLOCK_LABELS` derived from `SURFACE_GROUPS` if convenient.)

- [ ] **Step 3: Write `toolbar.tsx` (`"use client"`).**

Render, left→right: a Back button (`asChild` `<a href={backHref}>`, ArrowLeft icon, "Themes"); the theme name; a locale segmented control (two buttons VI/EN driving `onLangChange`); a device toggle-group (Desktop/Tablet/Mobile → `onDeviceChange`); a flexible spacer; the status pill (render `status`: `saving` → "Saving…"; `unsaved` → "Unsaved · {count}"; `saved` → "Saved · rev{revision}"), and below/next to it, when `draftAheadOf`, a muted "Draft ahead of published (rev {draftRevision} vs {publishedRevision})"; a Reload button (RefreshCw); a Discard button (disabled unless there are unsaved edits — i.e. `status.kind==="unsaved"`); a Save draft button (`disabled={!saveEnabled || busy}`); and, only when `canPublish`, a Publish split-button using `DropdownMenu` ("Publish ▾", `disabled={!publishEnabled || busy}`, calling `onPublish`). Keep it purely presentational — no fetches, no local business state beyond UI.

- [ ] **Step 4: Gate.**

Run: `cd apps/admin && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/admin/components/ui/resizable.tsx apps/admin/components/ui/collapsible.tsx apps/admin/app/\(dash\)/editor/_lib apps/admin/app/\(dash\)/editor/toolbar.tsx apps/admin/package.json
git commit -m "feat(editor): add resizable/collapsible; editor primitives + toolbar"
```

---

## Task 3: `sections-nav.tsx`

**Files:**
- Create: `apps/admin/app/(dash)/editor/sections-nav.tsx`

**Interfaces:**
- Consumes: `SURFACE_GROUPS` from `_lib/blocks`; `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent` from `@/components/ui/collapsible`; `ScrollArea` from `@/components/ui/scroll-area`; `cn`; `BlockKey`.
- Produces:
  ```ts
  export interface SectionsNavProps {
    selectedBlockKey: BlockKey | null;
    dirtyKeys: Set<BlockKey>;          // blockKeys present in the pending map
    onSelect: (blockKey: BlockKey) => void;
  }
  export function SectionsNav(props: SectionsNavProps): React.ReactElement;
  ```

- [ ] **Step 1: Write `sections-nav.tsx` (`"use client"`).**

Render a `ScrollArea` containing one `Collapsible` per `SURFACE_GROUPS` entry (default `open`). Each group's `CollapsibleContent` lists its items as buttons: `onClick={() => onSelect(item.blockKey)}`, active styling when `item.blockKey === selectedBlockKey`, and a `●` dirty dot (`<span aria-label="unsaved">`) when `dirtyKeys.has(item.blockKey)`. Presentational only.

- [ ] **Step 2: Gate.**

Run: `cd apps/admin && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add apps/admin/app/\(dash\)/editor/sections-nav.tsx
git commit -m "feat(editor): sections navigator (collapsible tree + dirty dots)"
```

---

## Task 4: `context-panel.tsx`

**Files:**
- Create: `apps/admin/app/(dash)/editor/context-panel.tsx`

**Interfaces:**
- Consumes: `deriveFields` from `@/app/lib/zodform-fields`; `BLOCK_REGISTRY`, `BlockKey` from `@signex/shared`; `FieldEditor`, `FieldAssetRow` from `./_fields/field-editor`; `ScrollArea`.
- Produces:
  ```ts
  export interface ContextPanelProps {
    blockKey: BlockKey | null;
    blockData: Record<string, unknown>;      // working block data (pending ∪ base) for blockKey
    assets: FieldAssetRow[];
    onFieldChange: (fieldName: string, value: unknown) => void; // top-level field name within the block
    onPickMedia: (fieldName: string, kind: "image" | "video") => void;
    onValidityChange: (name: string, valid: boolean) => void;
  }
  export function ContextPanel(props: ContextPanelProps): React.ReactElement;
  ```

- [ ] **Step 1: Write `context-panel.tsx` (`"use client"`).**

When `blockKey` is null, render an EmptyState ("Select a section to edit its content."). Otherwise compute `const fields = deriveFields(BLOCK_REGISTRY[blockKey]);` and map them to `<FieldEditor>` inside a `ScrollArea`:

```tsx
{fields.map((f) => (
  <FieldEditor
    key={f.name}
    field={f}
    value={blockData[f.name]}
    assets={assets}
    onChange={(v) => onFieldChange(f.name, v)}
    onPickMedia={onPickMedia}
    onValidityChange={onValidityChange}
  />
))}
```

The panel has NO Save button (Save draft lives in the toolbar). Show the block label as a small header.

- [ ] **Step 2: Gate.**

Run: `cd apps/admin && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add apps/admin/app/\(dash\)/editor/context-panel.tsx
git commit -m "feat(editor): context panel (derived fields → onChange callback)"
```

---

## Task 5: `editor-shell.tsx` controller (selection + pending + save-draft + publish + guards + bridge)

The spine. Holds all client state and composes Tasks 2–4. Media wiring is stubbed to a no-op `openMediaPicker` here and completed in Task 7 — but save-draft, publish, status, selection, iframe, and guards are FULLY implemented in this task.

**Files:**
- Create: `apps/admin/app/(dash)/editor/editor-shell.tsx`

**Interfaces:**
- Consumes: `Toolbar`/`ToolbarProps`, `SectionsNav`, `ContextPanel`; `_lib/blocks` (`Locale`, `DeviceWidth`, `Selection`, `ToolbarStatus`, `SURFACE_PATH_BY_BLOCK`, `DEVICE_MAX_WIDTH`); `ResizablePanelGroup`/`ResizablePanel`/`ResizableHandle`; `AlertDialog`; `Toaster`/`toast` from sonner; `BlockKey`, `BLOCK_REGISTRY`, `ReleaseSnapshot` from `@signex/shared`.
- Produces:
  ```ts
  export interface EditorShellProps {
    webOrigin: string; previewSecret: string; themeId: string; themeName: string;
    initialSnapshot: ReleaseSnapshot;
    initialDraftRevision: number; initialPublishedRevision: number;
    canPublish: boolean;
    assets: import("./_fields/field-editor").FieldAssetRow[];
  }
  export function EditorShell(props: EditorShellProps): React.ReactElement;
  ```
- Internal helpers reused by Task 7: `setPath`, `getPath` (copied verbatim from `visual/visual-editor.tsx`), `applyFieldEdit`, `pending` Map, `workingBlockData(blockKey)`.

- [ ] **Step 1: State + the `setPath`/`getPath`/working-data primitives.**

Copy `setPath(obj, path, value)` and `getPath(obj, path)` verbatim from `apps/admin/app/(dash)/visual/visual-editor.tsx` (lines 37–57). Declare state:

```tsx
const SOURCE = "signex-editor";
const [lang, setLang] = useState<Locale>("vi");
const [device, setDevice] = useState<DeviceWidth>("desktop");
const [previewPath, setPreviewPath] = useState<string>("");          // "" | "/about" | "/contact"
const [selection, setSelection] = useState<Selection | null>(null);
const [pending, setPending] = useState<Map<BlockKey, Record<string, unknown>>>(new Map());
const [draftRevision, setDraftRevision] = useState(initialDraftRevision);
const [publishedRevision, setPublishedRevision] = useState(initialPublishedRevision);
const [saving, setSaving] = useState(false);
const [publishing, setPublishing] = useState(false);
const [discardAsk, setDiscardAsk] = useState<null | { kind: "discard" | "leave"; href?: string }>(null);
// base snapshot is the last server-known draft; pending layers on top for the panel + dirty dots.
const baseRef = useRef<ReleaseSnapshot>(structuredClone(initialSnapshot));
const iframeRef = useRef<HTMLIFrameElement>(null);
const savingRef = useRef(false);

const workingBlockData = useCallback((key: BlockKey): Record<string, unknown> => {
  const fromPending = pending.get(key);
  if (fromPending) return fromPending;
  const blocks = baseRef.current.blocks as unknown as Record<string, Record<string, unknown>>;
  return blocks[key] ?? {};
}, [pending]);
```

- [ ] **Step 2: `applyFieldEdit` (panel) + the iframe URL.**

```tsx
// fieldName is a path WITHIN the block (e.g. "titleTop" or "featured.image").
const applyFieldEdit = useCallback((blockKey: BlockKey, fieldName: string, value: unknown) => {
  setPending((prev) => {
    const next = new Map(prev);
    const base = next.get(blockKey) ?? structuredClone(
      (baseRef.current.blocks as unknown as Record<string, Record<string, unknown>>)[blockKey] ?? {});
    next.set(blockKey, setPath(base, fieldName, value));
    return next;
  });
}, []);

const previewUrl = useMemo(
  () => `${webOrigin}/preview/${lang}${previewPath}?secret=${encodeURIComponent(previewSecret)}&editable=1&theme=${encodeURIComponent(themeId)}`,
  [webOrigin, lang, previewPath, previewSecret, themeId],
);
```
The iframe uses `key={`${lang}${previewPath}`}` so a locale or surface change remounts (clean overlay re-attach). Wrap the iframe in a centered container whose `max-width` follows `DEVICE_MAX_WIDTH[device]`.

- [ ] **Step 3: Selection → panel + (page-backed) iframe navigation.**

```tsx
const onSelect = useCallback((blockKey: BlockKey) => {
  setSelection({ blockKey, fieldPath: null, locale: lang });
  const surface = SURFACE_PATH_BY_BLOCK[blockKey];
  if (surface !== null && surface !== previewPath) setPreviewPath(surface);
}, [lang, previewPath]);
```

- [ ] **Step 4: Save draft.**

```tsx
const dirtyKeys = useMemo(() => new Set(pending.keys()), [pending]);

const saveDraft = useCallback(async (): Promise<boolean> => {
  if (pending.size === 0 || savingRef.current) return true;
  savingRef.current = true; setSaving(true);
  const edits = [...pending.entries()].map(([key, data]) => ({ key, data }));
  try {
    const res = await fetch(`/admin-api/themes/${themeId}/save-draft`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ edits, expectedDraftRevision: draftRevision }),
    });
    if (res.ok) {
      const body = (await res.json()) as { draftRevision: number };
      // adopt persisted state into the base snapshot, clear pending
      const blocks = baseRef.current.blocks as unknown as Record<string, Record<string, unknown>>;
      for (const [k, d] of pending) blocks[k] = d;
      setDraftRevision(body.draftRevision);
      setPending(new Map());
      toast.success("Saved to draft.");
      iframeRef.current?.contentWindow?.postMessage({ source: SOURCE, type: "refresh" }, webOrigin);
      return true;
    }
    if (res.status === 409) {
      // STALE_DRAFT: refetch the theme, adopt the latest revision + base, retry once with the kept edits.
      const fresh = await fetch(`/admin-api/themes/${themeId}`, { cache: "no-store" });
      if (fresh.ok) {
        const t = (await fresh.json()) as { draftSnapshot: ReleaseSnapshot; draftRevision: number };
        baseRef.current = t.draftSnapshot; setDraftRevision(t.draftRevision);
        toast.message("Draft changed elsewhere — re-applying your edits on the latest. Save again to retry.");
      } else { toast.error("Draft conflict (409). Reload the editor."); }
      return false;
    }
    if (res.status === 422) {
      const b = (await res.json().catch(() => null)) as { code?: string; key?: string; detail?: string } | null;
      toast.error(`Validation failed${b?.key ? ` on ${b.key}` : ""}${b?.detail ? ` — ${b.detail}` : ""}.`);
      return false;
    }
    toast.error(`Save failed (${res.status}).`); return false;
  } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed."); return false; }
  finally { setSaving(false); savingRef.current = false; }
}, [pending, themeId, draftRevision, webOrigin]);
```

- [ ] **Step 5: Publish (save pending first).**

```tsx
const publish = useCallback(async (note?: string) => {
  if (publishing) return;
  setPublishing(true);
  try {
    if (pending.size > 0) { const ok = await saveDraft(); if (!ok) return; }
    const res = await fetch("/admin-api/releases/publish", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ themeId, expectedDraftRevision: draftRevision, note: note || "Unified editor" }),
    });
    if (res.ok) { setPublishedRevision(draftRevision); toast.success("Published."); }
    else if (res.status === 409) toast.error("Publish conflict (409) — draft changed. Save again, then publish.");
    else { const b = (await res.json().catch(() => null)) as { error?: string } | null; toast.error(b?.error ?? `Publish failed (${res.status}).`); }
  } catch (e) { toast.error(e instanceof Error ? e.message : "Publish failed."); }
  finally { setPublishing(false); }
}, [publishing, pending, saveDraft, themeId, draftRevision]);
```
Note: `draftRevision` may be stale by one bump after `saveDraft` inside the same tick; read it from a ref updated in `saveDraft` if needed. Simplest robust approach: have `saveDraft` return the new revision and pass it to publish: change `saveDraft` to `Promise<number | null>` (null on failure) and use the returned value as `expectedDraftRevision`. Update Step 4's success branch to `return body.draftRevision;` and the `if (pending.size>0)` branch to `const rev = await saveDraft(); if (rev == null) return; expected = rev;` else `expected = draftRevision`.

Render Publish behind an `AlertDialog`: title "Save & publish" when `pending.size>0` else "Publish"; body "Visitors will see this theme; the current live theme is kept as a draft." with an optional note `<Input>`.

- [ ] **Step 6: Status, guards, postMessage bridge, layout.**

Compute `status: ToolbarStatus`:
```tsx
const status: ToolbarStatus = saving ? { kind: "saving" }
  : pending.size > 0 ? { kind: "unsaved", count: pending.size }
  : { kind: "saved", revision: draftRevision };
const draftAhead = draftRevision !== publishedRevision ? { draftRevision, publishedRevision } : null;
const publishEnabled = pending.size > 0 || draftRevision !== publishedRevision;
```

`beforeunload` guard:
```tsx
useEffect(() => {
  if (pending.size === 0) return;
  const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
  window.addEventListener("beforeunload", h);
  return () => window.removeEventListener("beforeunload", h);
}, [pending.size]);
```
In-app: the Toolbar's Back link and Discard button route through `setDiscardAsk` when `pending.size>0`; the `AlertDialog` confirms. Discard = `setPending(new Map())` + reload the iframe (`postMessage refresh`). Leave = `window.location.assign(href)`. (Locale/device switches do NOT prompt — pending survives the remount; media re-applies on the Task-7 `ready` handshake; panel state is unaffected.)

Inbound message listener (origin-checked) handling `edit` (→ `openMediaPicker`, filled in Task 7) and `ready` (→ re-apply media, Task 7); keep a stub `openMediaPicker = (field: string, kind: "image"|"video") => {}` for now.

Render: `<Toaster />` + the discard `AlertDialog` + a column with `<Toolbar …>` on top and a `ResizablePanelGroup direction="horizontal"` below holding `<SectionsNav>` (left, collapsible), the iframe (center, device-width container), and `<ContextPanel>` (right, collapsible). Wire `ContextPanel.onFieldChange={(name,v)=>applyFieldEdit(selection!.blockKey,name,v)}`, `onPickMedia={(name,kind)=>openMediaPicker(`${selection!.blockKey}.${name}`, kind)}`, `blockData={selection ? workingBlockData(selection.blockKey) : {}}`.

- [ ] **Step 7: Gate.**

Run: `cd apps/admin && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit.**

```bash
git add apps/admin/app/\(dash\)/editor/editor-shell.tsx
git commit -m "feat(editor): shell controller — selection, pending map, save-draft, publish, guards"
```

---

## Task 6: Editor route loader (`page.tsx` + `loading.tsx`)

**Files:**
- Create: `apps/admin/app/(dash)/editor/[themeId]/page.tsx`
- Create: `apps/admin/app/(dash)/editor/[themeId]/loading.tsx`

**Interfaces:**
- Consumes: `requireRole` from `@/app/lib/session`; `atLeast` + `ReleaseSnapshot` from `@signex/shared`; `apiServer`; `env` from `@/app/lib/env`; `EditorShell`/`EditorShellProps`; `FieldAssetRow`. (`requireRole("EDITOR")` returns the `SessionUser` with `.role`.)
- Produces: the `/editor/[themeId]` route (the `/themes` cards already link here via `<Link href={`/editor/${theme.id}`}>`).

- [ ] **Step 1: Write `page.tsx` (server component).**

```tsx
export default async function EditorPage({ params }: { params: Promise<{ themeId: string }> }) {
  const session = await requireRole("EDITOR");           // returns SessionUser
  const { themeId } = await params;
  const { NEXT_PUBLIC_WEB_URL, PREVIEW_SECRET } = env();
  if (!PREVIEW_SECRET) { /* render the same "PREVIEW_SECRET not configured" EmptyState as visual/page.tsx */ }
  const webOrigin = (NEXT_PUBLIC_WEB_URL || "http://localhost:3062").replace(/\/+$/, "");

  const [themeRes, assetsRes] = await Promise.all([
    apiServer<{ id: string; name: string; draftSnapshot: ReleaseSnapshot; draftRevision: number; lastPublishedRevision: number }>(`/api/themes/${themeId}`),
    apiServer<FieldAssetRow[]>("/api/assets"),
  ]);
  if (!themeRes.ok) notFound();
  const theme = themeRes.data;
  const assets = assetsRes.ok && Array.isArray(assetsRes.data) ? assetsRes.data : [];
  const canPublish = atLeast(session.role, "PUBLISHER"); // atLeast + RoleName from @signex/shared (see session.ts)

  return (
    <EditorShell
      webOrigin={webOrigin} previewSecret={PREVIEW_SECRET} themeId={theme.id} themeName={theme.name}
      initialSnapshot={theme.draftSnapshot}
      initialDraftRevision={theme.draftRevision} initialPublishedRevision={theme.lastPublishedRevision}
      canPublish={canPublish} assets={assets}
    />
  );
}
```
Use the same full-bleed layout treatment the editor needs (the `(dash)` layout wraps it; the shell manages its own height with the toolbar + resizable row at e.g. `h-[calc(100vh-…)]`).

- [ ] **Step 2: Write `loading.tsx`** — a simple skeleton (reuse the `visual/loading.tsx` pattern: a `Skeleton` toolbar bar + a large preview Skeleton).

- [ ] **Step 3: Gate.**

Run: `cd apps/admin && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add apps/admin/app/\(dash\)/editor/\[themeId\]
git commit -m "feat(editor): route loader (theme draft + assets) renders EditorShell"
```

---

## Task 7: Media — picker wiring, instant-preview swap, overlay generalization, preview `theme`

Completes the canvas + panel media path. Decision (per the brief): **primary instant-preview = live DOM swap via an `applyEdits` postMessage** handled by the overlay for `<img>` / `<video>` zones (these ARE the `[data-edit-field]` elements). After Save draft the iframe reloads (`refresh`) and the server-rendered draft reconciles. A `ready` handshake re-applies media after any (re)load/locale-switch. Panel TEXT edits are NOT pushed to the canvas live in Plan 3 — they render after Save-draft reload (inline live text is Plan 4).

**Files:**
- Modify: `apps/admin/app/(dash)/editor/editor-shell.tsx`
- Modify: `apps/web/app/components/editor/edit-overlay.tsx`
- Modify: `apps/web/app/preview/[lang]/page.tsx`, `about/page.tsx`, `contact/page.tsx`, `products/[slug]/page.tsx`

**Interfaces:**
- Consumes: `MediaPickerDialog`, `AssetRow`, `EditTarget`, `MediaRef` from `@/app/(dash)/visual/media-picker-dialog`; `getPreviewSnapshot(lang, themeId?)` (already accepts themeId).
- Produces: extended postMessage protocol — admin→preview adds `{ source, type:"applyEdits", edits: { field:string; kind:"image"|"video"; url?:string; posterUrl?:string; mp4Url?:string; webmUrl?:string }[] }`; preview→admin adds `{ source, type:"ready" }`.

- [ ] **Step 1: Shell — host `MediaPickerDialog` + `applyMediaRef` + `openMediaPicker`.**

Replace the Task-5 stub. Add state: `assets` (init from props, refetchable via `loadAssets()` hitting `/admin-api/assets`), `mediaTarget: EditTarget | null`, `pickerOpen`, and `mediaPreview: Map<string, {field:string;kind:"image"|"video";url?:string;posterUrl?:string;mp4Url?:string;webmUrl?:string}>` (keyed by full field). Implement:

```tsx
const openMediaPicker = useCallback((field: string, kind: "image"|"video") => {
  setMediaTarget({ field, mediaKind: kind }); setPickerOpen(true); void loadAssets();
}, [loadAssets]);

function resolveUrl(assetId: string | undefined): string | undefined {
  if (!assetId) return undefined;
  return assets.find((a) => a.id === assetId)?.url; // AssetRow has url
}

const applyMediaRef = useCallback(async (ref: MediaRef) => {
  if (!mediaTarget) return;
  const [blockKey, ...rest] = mediaTarget.field.split(".") as [BlockKey, ...string[]];
  const path = rest.join(".");
  // ensure just-uploaded asset is resolvable
  let list = assets;
  const need = ref.type === "image" ? ref.assetId : ref.posterAssetId;
  if (!list.find((a) => a.id === need)) list = await loadAssets();
  const find = (id: string | undefined) => (id ? list.find((a) => a.id === id)?.url : undefined);
  const base = pending.get(blockKey) ?? structuredClone(
    (baseRef.current.blocks as unknown as Record<string, Record<string, unknown>>)[blockKey] ?? {});
  const existing = (getPath(base, path) as Record<string, unknown> | undefined) ?? {};
  let nextValue: Record<string, unknown>; let preview: { kind:"image"|"video"; url?:string; posterUrl?:string; mp4Url?:string; webmUrl?:string };
  if (ref.type === "image") {
    nextValue = { ...existing, assetId: ref.assetId };
    preview = { kind: "image", url: find(ref.assetId) };
  } else {
    nextValue = { ...existing, posterAssetId: ref.posterAssetId, mp4AssetId: ref.mp4AssetId };
    if (ref.webmAssetId) nextValue.webmAssetId = ref.webmAssetId; else delete nextValue.webmAssetId;
    preview = { kind: "video", posterUrl: find(ref.posterAssetId), mp4Url: find(ref.mp4AssetId), webmUrl: find(ref.webmAssetId) };
  }
  setPending((prev) => { const n = new Map(prev); n.set(blockKey, setPath(base, path, nextValue)); return n; });
  setMediaPreview((prev) => { const n = new Map(prev); n.set(mediaTarget.field, { field: mediaTarget.field, ...preview }); return n; });
  postApplyEdits([{ field: mediaTarget.field, ...preview }]);
  setPickerOpen(false); setMediaTarget(null);
}, [mediaTarget, assets, pending, loadAssets]);

function postApplyEdits(edits: unknown[]) {
  iframeRef.current?.contentWindow?.postMessage({ source: SOURCE, type: "applyEdits", edits }, webOrigin);
}
```
Inbound listener: on `{type:"edit", field, mediaKind}` → `openMediaPicker(field, mediaKind)`; on `{type:"ready"}` → `postApplyEdits([...mediaPreview.values()])` (re-apply after reload/remount). Render `<MediaPickerDialog open={pickerOpen} target={mediaTarget} assets={assets} assetsLoading={…} saving={false} onAssetsRefresh={loadAssets} onApply={applyMediaRef} onOpenChange={(o)=>{setPickerOpen(o); if(!o) setMediaTarget(null);}} />`. (`saving` stays false — applyMediaRef does not block on a server round-trip; it only updates client pending.)

- [ ] **Step 2: Web overlay — narrow scan, `applyEdits` handler, `ready` handshake, preserve `theme`.**

In `apps/web/app/components/editor/edit-overlay.tsx`:
1. Change the scan selector from `[data-edit-field]` to `[data-edit-kind="image"],[data-edit-kind="video"]` (forward-compat with Plan 4 text zones).
2. After the layer is attached and entries built, post the handshake: `window.parent.postMessage({ source: SOURCE, type: "ready" }, "*");`
3. Extend the inbound `onMessage` to handle `applyEdits`:
```ts
if (data.type === "applyEdits" && Array.isArray(data.edits)) {
  for (const ed of data.edits) {
    const el = document.querySelector<HTMLElement>(`[data-edit-field="${CSS.escape(ed.field)}"]`);
    if (!el) continue;
    if (ed.kind === "image" && ed.url) {
      const img = el.tagName === "IMG" ? (el as HTMLImageElement) : el.querySelector("img");
      if (img) { img.removeAttribute("srcset"); img.src = ed.url; }
      else el.style.backgroundImage = `url("${ed.url}")`;
    } else if (ed.kind === "video") {
      const video = (el.tagName === "VIDEO" ? el : el.querySelector("video")) as HTMLVideoElement | null;
      if (video) {
        if (ed.posterUrl) video.poster = ed.posterUrl;
        const src = video.querySelector("source");
        if (src && ed.mp4Url) { src.setAttribute("src", ed.mp4Url); video.load(); }
      }
    }
  }
}
```
4. In the internal-navigation interceptor (`onDocClick`), read `theme` from the current URL and append it so edit-mode + theme survive in-iframe navigation:
```ts
const theme = new URLSearchParams(here.search).get("theme") ?? "";
const qs = `?secret=${encodeURIComponent(secret)}&editable=1${theme ? `&theme=${encodeURIComponent(theme)}` : ""}`;
```
Keep the existing rAF positioning (observer-based positioning is deferred to Plan 4).

- [ ] **Step 3: Web preview pages — accept `theme`.**

In each of the four preview pages, widen `searchParams` to `Promise<{ secret?: string; theme?: string }>`, destructure `theme`, and pass it: `const dict = await getPreviewSnapshot(locale, theme);`. (The token check is unchanged.) Example for `[lang]/page.tsx`:
```tsx
searchParams: Promise<{ secret?: string; theme?: string }>;
const { secret, theme } = await searchParams;
…
const dict = await getPreviewSnapshot(locale, theme);
```

- [ ] **Step 4: Gates.**

Run: `cd apps/admin && npx tsc --noEmit` → PASS.
Run: `cd apps/web && npx tsc --noEmit` → PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/admin/app/\(dash\)/editor/editor-shell.tsx apps/web/app/components/editor/edit-overlay.tsx apps/web/app/preview
git commit -m "feat(editor): media picker + instant swap; overlay applyEdits/ready; preview accepts theme"
```

---

## Task 8: Catalog retarget (read via theme draft, theme-scoped writes)

**Files:**
- Modify: `apps/admin/app/(dash)/catalog/page.tsx`
- Modify: `apps/admin/app/(dash)/catalog/actions.ts`
- Modify: `apps/admin/app/(dash)/catalog/category-forms.tsx`
- Modify: `apps/admin/app/(dash)/catalog/product-forms.tsx`

**Interfaces:**
- Consumes: `getActiveThemeId`; `apiServer`; `ReleaseSnapshot`, `FrozenCategory`, `FrozenProduct` from `@signex/shared`.
- Produces: retargeted catalog admin. Category id = `FrozenCategory.id`; product parent id = its category's `id`. Writes carry `expectedDraftRevision` (fetched fresh from `GET /api/themes/:id` per action).

- [ ] **Step 1: `page.tsx` — read from the theme draft.**

```tsx
const themeId = await getActiveThemeId();
if (!themeId) { /* EmptyState: "Pick an active theme in the header to manage its catalog." */ }
const [themeRes, assetsRes] = await Promise.all([
  apiServer<{ draftSnapshot: ReleaseSnapshot }>(`/api/themes/${themeId}`),
  apiServer<{ id: string; status: string; originalName: string }[]>("/api/assets"),
]);
const cats = (themeRes.ok ? themeRes.data.draftSnapshot.catalog.categories : []) as FrozenCategory[];
// category rows
const categories = cats.map((c) => ({
  id: c.id ?? "", slug: c.slug, sortOrder: c.sortOrder, title: c.title, tag: c.tag, intro: c.intro,
  productCount: c.productCount, materialCount: c.materialCount, imageId: c.image?.assetId ?? null,
}));
// product rows flattened with their parent category id (path param for writes)
const products = cats.flatMap((c) => c.items.map((p) => ({
  id: p.id ?? "", categoryId: c.id ?? "", slug: p.slug, sortOrder: p.sortOrder,
  title: p.title, tag: p.tag, desc: p.desc, imageId: p.image?.assetId ?? null,
})));
```
Keep the existing table markup; drop the `sortOrder` editable input (now server-managed). Pass `categoryId` into the product edit/delete forms and `categories` (id+slug) into the create-product select. Filter assets to READY for the `assetOptions`.

- [ ] **Step 2: `actions.ts` — theme-scoped, flat bodies, fresh revision.**

Replace the `/api/releases/diff`-based `currentRevision()` with a theme-draft read, and switch every call to the theme-scoped routes with FLAT bodies:

```ts
async function activeTheme(): Promise<{ id: string; rev: number } | null> {
  const id = await getActiveThemeId(); if (!id) return null;
  const res = await apiServer<{ draftRevision: number }>(`/api/themes/${id}`);
  return res.ok ? { id, rev: res.data.draftRevision } : { id, rev: 0 };
}
```
createCategory:
```ts
const t = await activeTheme(); if (!t) return { error: "No active theme selected." };
const res = await apiServer(`/api/themes/${t.id}/catalog/categories`, {
  method: "POST",
  body: { expectedDraftRevision: t.rev, slug: String(fd.get("slug") ?? ""),
    title: localized(fd,"title"), tag: localized(fd,"tag"), intro: localized(fd,"intro"),
    productCount: Number(fd.get("productCount") ?? 0), materialCount: Number(fd.get("materialCount") ?? 0),
    imageId: imageId(fd) },
});
```
updateCategory → `PATCH /api/themes/${t.id}/catalog/categories/${id}` (same flat body, id from `fd.get("id")`). deleteCategory → `DELETE /api/themes/${t.id}/catalog/categories/${id}` body `{ expectedDraftRevision: t.rev }`. createProduct → `POST /api/themes/${t.id}/catalog/categories/${categoryId}/products` body `{ expectedDraftRevision, slug, title, tag, desc, imageId }` (categoryId from `fd.get("categoryId")` — PATH, not body). updateProduct → `PATCH /api/themes/${t.id}/catalog/categories/${categoryId}/products/${pid}`. deleteProduct → `DELETE /api/themes/${t.id}/catalog/categories/${categoryId}/products/${pid}` body `{ expectedDraftRevision }`. Keep `revalidatePath("/catalog")` on success. Map 409 → "Draft changed elsewhere — refresh and retry."; 422 (`DUPLICATE_SLUG`/`INVALID_ASSET`) → surface `res.error`.

- [ ] **Step 3: Forms — drop `sortOrder` input; carry `categoryId`.**

`category-forms.tsx`: remove the `sortOrder` `<Input>` from create + edit (the API ignores/manages it; display-only stays in the page table). Keep the hidden `id` on edit/delete. `product-forms.tsx`: ensure create carries `categoryId` (the category select's value), and edit/delete carry a hidden `categoryId` (the product's parent) + hidden `id`. No `expectedRevision`/`expectedDraftRevision` hidden field is needed — the action fetches it fresh.

- [ ] **Step 4: Gate.**

Run: `cd apps/admin && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/admin/app/\(dash\)/catalog
git commit -m "feat(catalog): retarget admin to theme-scoped draft (read + writes + expectedDraftRevision)"
```

---

## Task 9: Integration build + decommission `/visual` + acceptance

**Files:**
- Remove: `apps/admin/app/(dash)/visual/page.tsx`, `apps/admin/app/(dash)/visual/visual-editor.tsx`, `apps/admin/app/(dash)/visual/loading.tsx`
- Modify: the admin sidebar nav source under `apps/admin/components/shell/*` (remove the `/visual` link; the editor is reached from `/themes`).
- (KEEP `apps/admin/app/(dash)/visual/media-picker-dialog.tsx`, `asset-grid.tsx`, `crop-view.tsx`, `aspect-presets.ts` — imported by the editor.)

- [ ] **Step 1: Remove the old standalone editor route + nav entry.**

Delete the three `visual/` route files above. Grep the shell for the visual nav item and remove it:
Run: `cd apps/admin && grep -rn "/visual" components app/\(dash\)/layout.tsx`
Remove the matching nav entry. Do NOT delete the four reused helper files.

- [ ] **Step 2: Confirm `/themes` Edit link.**

Run: `cd apps/admin && grep -n "editor/" app/\(dash\)/themes/theme-card.tsx`
Expected: `<Link href={`/editor/${theme.id}`}>Edit</Link>` already present (Plan 2). No change needed.

- [ ] **Step 3: Admin build.**

Run: `cd apps/admin && npx tsc --noEmit && npx next build`
Expected: type-check passes; build compiles all routes including `/editor/[themeId]`. Note: `next build` may need the workspace deps built first — if it errors on `@signex/shared`/`@signex/db` imports, run `npm run build -w @signex/shared -w @signex/db` from the repo root first (Turbo `^build` ordering).

- [ ] **Step 4: Web build.**

Run: `cd apps/web && npx tsc --noEmit && npx next build`
Expected: PASS (preview pages + overlay compile).

- [ ] **Step 5: Browser acceptance (manual, full stack up via `docker compose up -d --build` or the dev servers).**

Verify, recording results inline as checklist notes:
- `/themes` lists themes; live theme hoisted with Live badge; "Edit" → `/editor/<id>`.
- Editor loads: toolbar (Back/name/locale/device/status/Reload/Discard/Save/Publish), left nav tree with groups, center preview iframe (theme draft), right panel.
- Select Home → Hero: panel shows hero fields. Edit `titleTop` (vi) in the panel → status pill flips to "Unsaved · 1"; dirty dot on Hero.
- Click a media zone in the canvas (hero image) → MediaPickerDialog opens; pick/upload an image → the canvas `<img>` swaps INSTANTLY; status shows the media block unsaved.
- Save draft → toast "Saved to draft."; iframe reloads showing persisted text + media; pill → "Saved · rev N"; dirty dots clear.
- Locale toggle VI/EN remounts iframe; media re-applies via the `ready` handshake if still pending.
- Publish (as PUBLISHER): "Save & publish" dialog when pending; on confirm publishes; pill loses "Draft ahead". As EDITOR, the Publish control is hidden.
- Leave with unsaved pending → `beforeunload` warns; in-app Back/Discard → confirm dialog; Discard reverts the preview.
- `/catalog` reads the active theme's categories/products; create/edit/delete a category + product round-trips (409 surfaces a refresh hint; duplicate slug → 422 message).
- The public site reflects only the published theme; editing a non-live theme's draft is invisible publicly until published.

- [ ] **Step 6: Commit.**

```bash
git add -A
git commit -m "chore(editor): decommission /visual route + nav; integration build green"
```

---

## Self-Review

**1. Spec coverage** (against `2026-06-26-themes-model-design.md` "Unified Editor", "Admin UX", "Edit flow", "Publish/preview/web-read", "File change list"):
- Editor route + shell (page loader, controller, postMessage bridge generalizing `visual-editor.tsx`) — Tasks 5, 6.
- Toolbar (Back · name · `[vi|en]` remount via key · device-width · status pill · Reload · Discard · Save draft · Publish ▾) — Tasks 2, 5.
- Sections navigator (Collapsible tree grouped by surface, dirty dots) — Task 3 (groups match the spec's Home/About/Contact/Global/Settings layout).
- Context panel (extracted field editors via `deriveFields`, writes into pending, no own PUT, media fields reuse MediaPickerDialog) — Tasks 1, 4, 7.
- `_fields/*` single source consumed by panel + retargeted `/content` — Task 1.
- Media editing: hotspot pick + instant live swap (`applyEdits`) with save-draft reload reconcile; `ready` handshake re-applies — Task 7. Decision (live-swap vs reload) documented in Task 7's preamble per the brief.
- Save draft / Publish: pending grouped by blockKey, ONE save-draft batch with `expectedDraftRevision`; 409/422 handling; publish saves pending first; status pill + draft-ahead + leave/discard guards — Task 5.
- Theme-scoped preview (`/preview/[lang]?secret&editable=1&theme=`) + web route accepts `theme` (+ overlay preserves it across nav) — Task 7.
- Catalog retarget (read via theme draft, theme-scoped flat-body writes, active theme) — Task 8.
- `/content` retarget (read via `GET /api/themes/:id`, save via save-draft, imports `_fields`) — Task 1.
- shadcn `resizable`/`collapsible` added; others confirmed present — Task 2.
- `/themes` Edit entry — confirmed present (Plan 2), Task 9 Step 2.

**2. Placeholder scan:** No "TBD"/"handle errors"/"similar to" left. The one deliberate cross-task stub (`openMediaPicker` no-op in Task 5) is explicitly replaced in Task 7 Step 1 with full code — flagged, not hidden. `next build` workspace-dep ordering note added (Task 9 Step 3).

**3. Type consistency:** `FieldEditorProps.onPickMedia(fieldName, kind)` (panel passes the within-block name) ↔ shell composes `${blockKey}.${name}` before calling `openMediaPicker(fullField, kind)` ↔ `applyMediaRef` splits the full field back into `[blockKey, ...rest]` — consistent. Pending map is `Map<BlockKey, Record<string,unknown>>` (full block data) everywhere (workingBlockData, applyFieldEdit, applyMediaRef, saveDraft edits) — consistent with the save-draft DTO `{key,data}`. `expectedDraftRevision` (not `expectedRevision`) used in save-draft, publish, and all catalog writes — matches the API DTOs. `MediaRef`/`EditTarget`/`AssetRow` imported from the existing `media-picker-dialog.tsx` (unchanged) — `AssetRow` carries `url` (used by `resolveUrl`). `getPreviewSnapshot(lang, themeId?)` already threads themeId (no API change needed). `parseBlock(key, data)` 2-arg used in the retargeted `zod-form.tsx`.

**4. Plan-3/Plan-4 boundary:** No task plans inline `contentEditable`, `<span>` wrapping, `edit-attrs` `"text"` kind, the inline-text gates, the markup-delta gate, `notFound.image` stamping (notFound stays panel-only, `SURFACE_PATH_BY_BLOCK.notFound = null`), two-way highlight, or observer-based hotspot positioning. All explicitly deferred and noted in the scope-boundary section and Task 7's preamble.
