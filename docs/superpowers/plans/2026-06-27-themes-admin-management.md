# Themes Admin Management Implementation Plan (Plan 2 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]` checkboxes.

**Goal:** Give the admin a `/themes` management page (card grid: live theme hoisted, actions Edit·Publish·Duplicate·Rename·Delete), an `activeThemeId` cookie + dash-header theme switcher, a "Themes" nav item, and fix the now-broken release actions — all against the Plan-1 theme-scoped API.

**Architecture:** Next 16 admin (`apps/admin`). Server components + server actions call `apiServer()`; client islands call the `/admin-api/[...path]` proxy. Theme state is a cookie (`active_theme_id`), read server-side in `(dash)/layout.tsx`, written by a small route handler + `router.refresh()`. No new global store.

**Tech Stack:** Next.js 16.2.7, React 19, shadcn/ui (new-york), `@signex/shared`. The themes API from Plan 1 is live (`feat/themes-model` branch).

## Global Constraints (verbatim / binding)

- **Next 16.2.7 breaking changes** (admin/AGENTS.md): `params`/`searchParams` are `Promise<…>` — `await` them. Routing middleware is `proxy.ts`. Use `useActionState` (not `useFormState`). Before any unfamiliar Next API, read `apps/admin/node_modules/next/dist/docs/`.
- **API access:** server code → `apiServer<T>(path, {method, body})` from `app/lib/api.ts` (returns `{ok,status,data}|{ok,status,error}`); client code → `fetch("/admin-api/<path>", …)` (the catch-all proxy forwards the `sx_session` cookie as Bearer and enforces the Origin allowlist on writes). API base = `env().API_URL`. Never call the API origin directly from the browser.
- **RBAC** (use `requireRole(...)` / `requireSession()` from the existing auth helper, and `atLeast(role, min)` from `@signex/shared`): EDITOR may list/duplicate/rename/edit + set active theme; **PUBLISHER+** may publish + delete. The `/themes` UI hides/disables PUBLISHER-only actions for EDITORs.
- **shadcn:** new-york style; `cn()` at `apps/admin/lib/utils.ts`; components live in `apps/admin/components/ui/`. Present already: alert-dialog, badge, button, card, dialog, dropdown-menu, input, label, scroll-area, select, separator, sheet, sidebar, skeleton, table, tabs, textarea, tooltip, sonner. Add a new one only if genuinely needed (prefer `dropdown-menu`, already present, for the switcher).
- **Theme API (Plan 1), all under the `/api` prefix:**
  - `GET /api/themes` → `ThemeListItem[]` = `{id, name, draftRevision, lastPublishedRevision, dirty, isLive, updatedAt}`.
  - `GET /api/themes/:id` → full `Theme` (incl. `draftSnapshot`, `liveSnapshot`).
  - `POST /api/themes/:id/duplicate` body `{name}` → new `Theme`. (EDITOR)
  - `PATCH /api/themes/:id` body `{name}` → renamed `Theme`; `name @unique` → 409. (EDITOR)
  - `DELETE /api/themes/:id` → 409 `LIVE_THEME` if live; else hard-delete. (PUBLISHER)
  - `POST /api/releases/publish` body `{themeId, expectedDraftRevision, note?}` → `{status:'published'|'noop', version?, releaseId?}`. (PUBLISHER)
  - `POST /api/releases/rollback` body `{toVersion}` (no `restoreWorkingState`). (PUBLISHER)
  - `GET /api/releases` → release rows; `GET /api/releases/live` → `{version,checksum,publishedAt}`. **`GET /api/releases/diff` NO LONGER EXISTS** — per-theme dirty comes from `GET /api/themes`.
- **Commit trailer** on every commit:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01W43GcnR1BXH9qm8TLt4DJ6
  ```
- **No secrets in code/commits.** Work on branch `feat/themes-model`.

---

## File Structure

- `apps/admin/app/lib/themes.ts` (NEW) — `ThemeListItem` interface + small server read helpers (`listThemes()`, `getActiveThemeId()`), `ACTIVE_THEME_COOKIE` constant.
- `apps/admin/app/(dash)/themes/page.tsx` (NEW) — server: list themes, render grid. + `loading.tsx`.
- `apps/admin/app/(dash)/themes/actions.ts` (NEW) — `"use server"`: duplicate/rename/delete/publish theme actions.
- `apps/admin/app/(dash)/themes/theme-card.tsx` (NEW) — `"use client"`: one card + its action menu.
- `apps/admin/app/(dash)/themes/theme-dialogs.tsx` (NEW) — `"use client"`: Duplicate, Rename, Delete (AlertDialog), Publish (AlertDialog) dialogs driven by `useActionState`.
- `apps/admin/app/admin-api/active-theme/route.ts` (NEW) — `POST {themeId}` sets the `active_theme_id` cookie (host-only), returns `{ok:true}`.
- `apps/admin/components/shell/theme-switcher.tsx` (NEW) — `"use client"`: dropdown of themes in the topbar.
- `apps/admin/components/shell/topbar.tsx` (MODIFY) — mount `<ThemeSwitcher>`.
- `apps/admin/components/shell/app-sidebar.tsx` (MODIFY) — add the "Themes" nav item.
- `apps/admin/app/(dash)/layout.tsx` (MODIFY) — read `active_theme_id` cookie + the theme list; pass to Topbar.
- `apps/admin/app/(dash)/releases/actions.ts` (MODIFY) — fix `rollbackAction` DTO (`{toVersion}`); remove the old `publishAction` (publishing moves to /themes) or repoint it (see Task 7).
- `apps/admin/app/(dash)/releases/page.tsx` + `publish-form.tsx` (MODIFY) — drop the broken publish form; keep release history + rollback.

---

## Task 1: Admin theme types + server read helpers

**Files:** Create `apps/admin/app/lib/themes.ts`.

**Interfaces — Produces:**
```ts
export const ACTIVE_THEME_COOKIE = "active_theme_id";
export interface ThemeListItem {
  id: string; name: string; draftRevision: number; lastPublishedRevision: number;
  dirty: boolean; isLive: boolean; updatedAt: string;
}
export async function listThemes(): Promise<ThemeListItem[]>;     // apiServer GET /api/themes; [] on !ok
export async function getActiveThemeId(): Promise<string | null>; // cookies().get(ACTIVE_THEME_COOKIE)?.value ?? null
```

- [ ] **Step 1: Implement** — mirror the read pattern in `releases/page.tsx` (uses `apiServer`). `listThemes` returns `res.ok ? res.data : []`. `getActiveThemeId` uses `cookies()` from `next/headers` (await it — Next 16). Server-only module.
- [ ] **Step 2: Verify** — `cd apps/admin && npx tsc --noEmit` passes.
- [ ] **Step 3: Commit** — `feat(admin): theme list types + server read helpers`.

---

## Task 2: `/themes` page + grid (read-only render first)

**Files:** Create `apps/admin/app/(dash)/themes/page.tsx`, `loading.tsx`, `theme-card.tsx`.

**Interfaces — Consumes:** `listThemes()`, `getActiveThemeId()` (Task 1). **Produces:** the page at `/themes`; `<ThemeCard theme activeThemeId canPublish>` rendering name, badges (Live / dirty "Unsaved changes since publish" / Active), `last published` (derive from `lastPublishedRevision>0`), and an actions row (buttons wired in Task 4; render them disabled-stub here is fine, but prefer to land Task 4 dialogs in the same card).

- [ ] **Step 1: Implement page** — server component: `requireRole("EDITOR")`; `const [themes, activeThemeId] = await Promise.all([listThemes(), getActiveThemeId()])`; sort live-first then by `updatedAt` desc; render a responsive card grid (`Card` from ui). Read the session role (see how `(dash)/layout.tsx`/`releases/page.tsx` get role) and pass `canPublish = atLeast(role,"PUBLISHER")`. Empty/non-live note if no live theme.
- [ ] **Step 2: ThemeCard** — `"use client"`. Header: name + badges (`Badge` ui — Live = default variant, dirty = secondary/destructive, Active = outline). Body: revision/last-published meta. Footer: action buttons (Edit links to `/editor/${theme.id}` — built in Plan 3; Publish/Duplicate/Rename/Delete open the Task-4 dialogs). Delete button disabled with a `Tooltip` ("Can't delete the live theme") when `theme.isLive`; Publish/Delete hidden when `!canPublish`.
- [ ] **Step 3: loading.tsx** — skeleton grid (mirror `releases/loading.tsx`).
- [ ] **Step 4: Verify** — `npx tsc --noEmit`; `/themes` renders the Default card with a Live badge (manual/agent check deferred to Task 8).
- [ ] **Step 5: Commit** — `feat(admin): /themes page + theme card grid`.

---

## Task 3: Theme server actions

**Files:** Create `apps/admin/app/(dash)/themes/actions.ts`.

**Interfaces — Produces** (`"use server"`, each returns a `{ok:boolean, error?:string}`-style state for `useActionState`; mirror `releases/actions.ts` + `catalog/actions.ts` shapes):
```ts
duplicateAction(prev, formData)  // requireRole EDITOR; reads name+sourceId; POST /api/themes/:sourceId/duplicate {name}; revalidatePath("/themes")
renameAction(prev, formData)     // requireRole EDITOR; POST? no — PATCH /api/themes/:id {name}; map 409→"Name already taken"; revalidatePath("/themes")
deleteAction(prev, formData)     // requireRole PUBLISHER; DELETE /api/themes/:id; map 409 LIVE_THEME→"Can't delete the live theme"; revalidatePath("/themes")
publishThemeAction(prev, formData) // requireRole PUBLISHER; reads themeId+expectedDraftRevision(+note); POST /api/releases/publish {themeId,expectedDraftRevision,note}; map 409 STALE_DRAFT→"Draft changed, refresh"; revalidatePath("/themes")+revalidatePath("/")
```

- [ ] **Step 1: Implement** — each: validate inputs, `apiServer(...)`, translate known error codes (`LIVE_THEME`, `STALE_DRAFT`, name-unique 409) to friendly messages, `revalidatePath`. `expectedDraftRevision` comes from the card's `theme.draftRevision` (passed via a hidden field).
- [ ] **Step 2: Verify** — `npx tsc --noEmit`.
- [ ] **Step 3: Commit** — `feat(admin): theme CRUD + publish server actions`.

---

## Task 4: Theme action dialogs (wire the card)

**Files:** Create `apps/admin/app/(dash)/themes/theme-dialogs.tsx`; finish wiring `theme-card.tsx`.

**Interfaces — Consumes:** the Task-3 actions. **Produces:** four client dialogs, each `useActionState`-driven, closing + toasting (sonner) on success:
- **DuplicateDialog** — `Dialog` + name `Input` (default `"${source.name} copy"`), hidden `sourceId`. On success toast "Theme duplicated".
- **RenameDialog** — `Dialog` + name `Input` prefilled.
- **DeleteDialog** — `AlertDialog` (destructive); body warns history is preserved; submit calls `deleteAction`.
- **PublishDialog** — `AlertDialog`; body: "Visitors will see **{name}**. The current live theme stays saved as a draft." (matches spec wording). Hidden `themeId` + `expectedDraftRevision`. On success toast "Published — now live".

- [ ] **Step 1: Implement dialogs** — follow the `useActionState` + `Dialog`/`AlertDialog` pattern from `users/user-forms.tsx` / `catalog/*-forms.tsx`. Show `state.error` inline. Use `useEffect` on success to close + `toast`.
- [ ] **Step 2: Wire ThemeCard** — open the right dialog per button.
- [ ] **Step 3: Verify** — `npx tsc --noEmit`.
- [ ] **Step 4: Commit** — `feat(admin): theme action dialogs (duplicate/rename/delete/publish)`.

---

## Task 5: `activeThemeId` cookie + route handler + layout read

**Files:** Create `apps/admin/app/admin-api/active-theme/route.ts`; modify `apps/admin/app/(dash)/layout.tsx`.

**Interfaces — Produces:** `POST /admin-api/active-theme` body `{themeId}` → validates a session exists, sets the `active_theme_id` cookie (`httpOnly:false` is fine — it's not a secret; `sameSite:lax`, `path:/`), returns `{ok:true}`. The layout reads the cookie + theme list and passes `{activeThemeId, themes}` to `<Topbar>`.

- [ ] **Step 1: Route handler** — mirror `admin-api/auth/logout/route.ts` cookie-set style (`res.cookies.set(ACTIVE_THEME_COOKIE, themeId, {...})`). Reject if no `sx_session`. Validate `themeId` is a non-empty string.
- [ ] **Step 2: Layout** — in `(dash)/layout.tsx` add `const activeThemeId = cookieStore.get(ACTIVE_THEME_COOKIE)?.value ?? null;` and `const themes = await listThemes();` (it already `await cookies()`s for `sidebar_state`); pass both to `<Topbar>`.
- [ ] **Step 3: Verify** — `npx tsc --noEmit`.
- [ ] **Step 4: Commit** — `feat(admin): active_theme_id cookie + route handler + layout read`.

---

## Task 6: Dash-header theme switcher + Themes nav item

**Files:** Create `apps/admin/components/shell/theme-switcher.tsx`; modify `topbar.tsx`, `app-sidebar.tsx`.

**Interfaces — Consumes:** `{activeThemeId, themes}` from layout. **Produces:** `<ThemeSwitcher themes activeThemeId>` — a `DropdownMenu` (already present) showing the active theme's name (fallback "Select theme"), listing all themes (Live one marked), each a `DropdownMenuRadioItem`; on select → `await fetch("/admin-api/active-theme",{method:"POST",body:JSON.stringify({themeId})})` then `router.refresh()`.

- [ ] **Step 1: ThemeSwitcher** — `"use client"`, `useRouter`. Disabled when `themes.length===0`.
- [ ] **Step 2: Topbar** — accept `themes`/`activeThemeId` props, render `<ThemeSwitcher>` between `<ThemeToggle/>` and the separator/`<UserMenu>`.
- [ ] **Step 3: Sidebar** — add `{ href: "/themes", label: "Themes", icon: Palette, match: "/themes" }` to `NAV_ITEMS` (import `Palette` from `lucide-react`).
- [ ] **Step 4: Verify** — `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `feat(admin): topbar theme switcher + Themes nav item`.

---

## Task 7: Fix the broken release actions (publish moves to /themes)

**Files:** Modify `apps/admin/app/(dash)/releases/actions.ts`, `releases/page.tsx`, `releases/publish-form.tsx` (+ delete if fully removed), `rollback-form.tsx`.

**Rationale:** `/releases` called `GET /api/releases/diff` (gone), `POST /api/releases/publish {note,expectedRevision}` (DTO changed), `POST /api/releases/rollback {toVersion,restoreWorkingState}` (DTO changed). Publishing is now per-theme on `/themes`. Keep `/releases` as **release history + rollback** only.

- [ ] **Step 1: actions.ts** — delete `publishAction`; fix `rollbackAction` body to `{toVersion}` only; keep `requireRole("PUBLISHER")` + `revalidatePath`.
- [ ] **Step 2: page.tsx** — remove the `GET /api/releases/diff` call + the publish form; keep `GET /api/releases` (history table) + `GET /api/releases/live`; add a short note linking to `/themes` for publishing. Keep the rollback form.
- [ ] **Step 3: remove `publish-form.tsx`** (and its import). Leave `rollback-form.tsx` (now sends `{toVersion}`).
- [ ] **Step 4: Verify** — `npx tsc --noEmit`; `cd apps/admin && npx next build` compiles (or at least `tsc`).
- [ ] **Step 5: Commit** — `fix(admin): releases page → history+rollback; publishing moved to /themes`.

---

## Task 8: Whole-stack acceptance (admin themes UI)

**Files:** none (manual/agent-driven verification + a short note). The stack is already rebuilt; rebuild admin: `docker compose build admin && docker compose up -d admin`.

- [ ] **Step 1: Rebuild admin** — `docker compose build admin && docker compose up -d admin`; wait healthy.
- [ ] **Step 2: Verify via agent browser (or curl for the API-backed bits):** login at `http://localhost:3061`; `/themes` shows the **Default** card with a **Live** badge; **Duplicate** Default → "QA Copy" appears as a draft card; **Rename** it; the **theme switcher** in the header lists both and setting it persists across reload (cookie); **Publish** the copy via the AlertDialog → it gains the Live badge, Default loses it, and `http://localhost:3062/vi` reflects the published theme; **Delete** is disabled on the live card and deleting a non-live theme works; **clean up** (re-publish Default, delete the copy) so the live site shows the real content.
- [ ] **Step 3: Commit** — `test(admin): themes management acceptance notes` (a short `test/themes-admin-acceptance.md` checklist if useful; otherwise fold the result into the ledger).

---

## Self-Review

- **Spec coverage:** `/themes` page with hoisted live theme + per-card actions + delete-disabled-on-live (T2,T4); duplicate/rename/delete/publish (T3,T4); publish AlertDialog wording (T4); `activeThemeId` cookie + header switcher (T5,T6); nav item (T6); retarget broken release actions (T7); acceptance incl. publish-flips-live + delete-live-blocked (T8). Edit→`/editor/[themeId]` is a forward link (built in Plan 3).
- **Deferred to Plan 3/4:** unified editor, catalog/content retarget, inline text. The Edit button links to `/editor/[id]` (dead until Plan 3 — acceptable in continuous execution).
- **Type consistency:** `ThemeListItem` (T1) is the single shape used by page/card/switcher; `expectedDraftRevision` always sourced from `theme.draftRevision`; publish DTO `{themeId,expectedDraftRevision,note?}` consistent across T3/T7.
