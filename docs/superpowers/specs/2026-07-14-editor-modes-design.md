# Editor Modes (Media / Text / Colour / Content) — Design

**Date:** 2026-07-14
**Status:** Approved (key decisions confirmed by user)
**Area:** `packages/shared` (schema + emitter) · `apps/web` (stamp API + overlay engine) · `apps/admin` (toolbar, panels, shell) · `apps/api` (save-draft validation)
**Supersedes parts of:** `2026-07-08-editable-site-colors-design.md` (the `color-popover` interaction and the `overrides` shape)

## Goal

Replace the editor's implicit, per-element edit affordance with **four explicit modes**. The active
mode is the single axis that decides *what is clickable on the canvas* and *what the right panel
shows*. Colour editing grows from 3 hand-stamped anchors to **any element, every colour role**.

| Mode | Canvas: what is clickable | Right panel |
|---|---|---|
| **Media** | image/video zones only (today's hotspot layer) | every media in the selected section; click scrolls + highlights one |
| **Text** | text leaves only; edit in place (today's behaviour) | every text field in the selected section; click scrolls + highlights one |
| **Colour** | **any element** | colour roles of the clicked element + the 8 brand seeds |
| **Content** | nothing (canvas is read-only) | today's section form (arrays, SEO, form config) — unchanged |

## Why modes are load-bearing, not cosmetic

`data-edit-kind` holds exactly **one** value per element, and the overlay dispatches with
`closest('[data-edit-kind="…"]')`. An element therefore cannot be both text-editable and
colour-editable. That is why `hero.titleBottom` today needs **two nested spans** — an inner
`editText` span and an outer `editColor` wrapper — and why only 3 elements have colour at all.

Modes dissolve this. The stamp declares *capabilities*; the active mode decides which capability a
click invokes. One element can carry both. This removes the wrapper spans and is what makes
"colour on any element" reachable.

**Accepted trade-off:** editing a string and editing its colour become two actions in two modes.
In exchange, a click is never ambiguous.

## Decisions (confirmed)

1. **Colour scope** — any element × every colour role (not a curated list, not per-section lists).
2. **Panel** — dynamic per mode.
3. **Fourth mode** — "Content/Settings" keeps today's section form; the other three are purely visual.
4. **Element granularity** — auto-resolve per role; the user sees "the button", never the DOM.
5. **Element identity** — auto-generated scoped CSS selector (approach A).
6. **Media/Text panel with nothing clicked** — list the whole section (so array items and
   slider-internal media, which are deliberately not click-editable, still have a route).
7. **Default action when a colour comes from a token** — edit the token (site-wide).
8. **Mode switcher** — segmented control in the toolbar's centre gap.

---

## 1. Mode model

```ts
export type EditMode = "media" | "text" | "color" | "content";
```

Naming follows the existing convention in this codebase: **identifiers use "color"**
(`EditColorRole`, `editColor`, `PALETTE_VARS`), **prose and comments use "colour"**.

- Owned by `editor-shell`, posted to the preview on change and on `ready`:
  `{ source, type: "setMode", mode }`.
- The overlay keeps `mode` in a ref and gates hover/click on it. Mode is **UI state only** — it is
  never persisted to the snapshot and never affects the public render.
- Default mode on load: `content` (today's behaviour — a section form — so the editor opens
  exactly as it does now).

### Toolbar

A segmented control in the toolbar's centre gap (measured: **425px free** at a 1600px window;
four labelled buttons ≈ 340px).

```
│ ←Themes│Default│VI EN│□▫▪   [■ Media│T Chữ│◉ Màu│≡ Nội dung]   Saved·rev4 │
```

Deliberately **not** grouped with `VI/EN` and the device icons: those change *how you view*, mode
changes *what you edit*.

**Narrow windows:** below `1280px` the labels are dropped for icon-only + tooltip, matching the
existing device toggle. This is a real constraint, not a nicety — 340px only fits at ≥1440px.

### Canvas gating

| Mode | Overlay behaviour |
|---|---|
| `media` | media hotspot layer visible; text/colour hover suppressed |
| `text` | text leaves hoverable + `contentEditable` on click; hotspots hidden |
| `color` | every element hoverable (outline follows the resolved *meaningful block*); text editing disabled |
| `content` | all overlay affordances off; internal-link interception still on |

### Selection follows the click

Clicking any element **selects its owning block in the left rail**, in every mode — reusing the
canvas→panel path that already exists (the overlay posts the field; the shell selects the block and
navigates the surface if needed). So "the selected section" that the Media/Text panel lists is
always the section you last touched, and a click never leaves the panel showing an unrelated
section. Switching modes preserves the block selection; it does not clear the clicked element.

---

## 2. Stamp API (`apps/web/app/lib/edit-attrs.ts`)

Today: three helpers (`editAttrs`, `editText`, `editColor`) each emitting a single
`data-edit-kind`. Replace with one capability-based helper:

```ts
editable(flag, "hero.titleBottom", {
  text: { maxLength: 80 },
  color: { token: "accentAqua", roles: ["text"] },   // optional; auto-resolve covers the rest
})
```

Emits (preview only):

```
data-edit-field="hero.titleBottom"
data-edit-caps="text,color"
data-edit-maxlength="80"
```

- `data-edit-kind` is retired; the overlay selects by capability **and** current mode.
- `data-sx-block="<blockKey>"` is added to each of the ~10–15 section roots. This is the **only**
  new attribute on the public render, and it is the anchor every generated selector is scoped to.
- `data-sx-c` stays for elements that already have a stable id; a generated selector prefers it.

**Public-render invariant is preserved:** `data-edit-*` remain preview-only (0 on public);
`data-sx-block` is the single, deliberate public addition.

---

## 3. Colour engine

### 3.1 Click → resolve

1. `document.elementsFromPoint(x, y)` → the full stack, seeing through the pointer-transparent
   overlay layer (the overlay already uses this technique for media-over-text).
2. Pick the **meaningful block**: from the topmost non-overlay element, walk up to the nearest
   ancestor that is a link/button, carries `data-edit-field`/`data-sx-c`, or is the block root —
   whichever comes first. This is what gets outlined and named in the panel.
3. For each role, find the element that **actually paints it**:
   - `bg` — the nearest element in the block's subtree whose computed `background-color` is not
     fully transparent and whose box covers the block's box.
   - `text` — the nearest element containing a text node.
   - `border` — the nearest element with a non-zero border width and visible border colour.

This resolves the `.btn-bg` problem **structurally**. The nav CTA is a transparent `<a>` whose pill
is painted by a `.btn-bg` child; step 3 finds that child by construction.

> **Consequence:** `ANCHOR_PAINT_TARGETS` (added 2026-07-14 in `23d1fa2`) becomes dead and is
> **deleted**. It was the correct fix for the single-anchor architecture; this design subsumes it.

### 3.2 Token detection

For each resolved (element, role), walk `document.styleSheets` for the winning rule and read
whether its value is a `var(--…)` reference; map that custom property back through
`TOKEN_VARS` / `PALETTE_VARS` to a token key. (Verified working during the 2026-07-14 debug
session: it identified `.btn-bg { background-color: var(--_🎨-…button--primary--default--background) }`.)

Panel row per role:

```
Nền    #0d2b44   ⟵ Nút chính — nền     [Đổi cả site] [Chỉ phần tử này]
Chữ    #ffffff   ⟵ Nút chính — chữ     [Đổi cả site] [Chỉ phần tử này]
Viền   —         (không có viền)
```

**Token detection is what keeps "every colour" usable rather than a pile of per-element
overrides.** Without it every pick mints an override, and later changing a brand colour silently
skips everything already hard-overridden. Hence decision 7: picking a colour edits the **token** by
default; "Chỉ phần tử này" is the deliberate escape hatch.

Colours the picker cannot represent (gradients, non-sRGB spaces, an unresolved `color-mix`) are shown
read-only with the reason — never coerced into a lying hex.

> **Deviation, as shipped (commit f35067e).** This clause originally read "alpha via `color-mix`,
> gradients". **Alpha is now editable, not read-only.** Terminal palette values — the tier-B tokens
> and the per-element overrides — take `HexA` (`#rrggbbaa`); `rgbToHex` reads a translucent computed
> colour as 8-digit hex instead of returning "no colour". The design intent is unchanged, because the
> clause is conditioned on *cannot represent* and 8-digit hex represents alpha exactly: what changed
> is that alpha moved out of that set. Why it is safe to widen: no token or override is ever an
> operand of a `color-mix()` (all 16 calls in the template consume a **seed**), so a terminal alpha
> is the alpha rendered, not a multiplier. **Seeds stay opaque (`Hex`)** for precisely that reason —
> a seed at 0.5 read back through `--base--dark-64` measured 0.32 (0.5 × 0.64), i.e. a translucent
> seed means "every derived shade is translucent by a different, silently compounded amount".
> What still yields a read-only row is what hex genuinely cannot carry (above). Motivating case: a
> user clicked `aboutPage.hero.title.accent` (a `.tone-medium` span → `color-mix(… 64%, transparent)`)
> and the panel said "Không đổi được bằng mã hex" with nothing to do about it.

### 3.3 Selector generation (element identity)

Runs in the overlay, which has the DOM.

1. If the target carries `data-sx-c` → `[data-sx-c="<id>"]`. Done.
2. Otherwise walk from the target up to the block root, building a path. At each step prefer a
   class that is unique among siblings (Webflow classes are semantic: `.btn-bg`, `.cta_primary`);
   if still ambiguous add `:nth-of-type(k)`.
3. Prefix with `[data-sx-block="<blockKey>"]`.
4. **Self-verify:** `querySelectorAll(sel).length === 1 && [0] === target`. If not — **refuse to
   anchor**; the panel says so and offers token-only editing. A selector that cannot be proven
   unique is never stored.

### 3.4 Selector grammar + security

A stored selector flows from the DB into a `<style>` via `dangerouslySetInnerHTML` — **the exact
class of stored-XSS fixed in `7061210` (F1)**. `<style>` is an HTML raw-text element, so the HTML
parser does not honour CSS escapes: escaping is not a defence. The rule stands — **reject, never
escape** — and is enforced at two layers (schema on save, emitter on render; never trust the
stored snapshot).

Whitelisted grammar, expressed as a single anchored regex plus a length cap:

| Allowed | Notes |
|---|---|
| `[data-sx-block="<key>"]` | key ∈ `BLOCK_KEYS` |
| `[data-sx-c="<id>"]` | id matches `PALETTE_ANCHOR_ID_RE` |
| `.<class>` | `[A-Za-z0-9_-]+` — verified sufficient for every class in the template |
| `:nth-of-type(<n>)` | `n` ∈ 1–99 |
| ` ` (descendant), ` > ` (child) | single spaces only |
| max length | 300 chars |

Everything else is rejected. Lookups into any selector→config map use `Object.hasOwn` (the charset
permits `__proto__`/`constructor`).

---

## 4. Data model

Today `overrides` is a record keyed by `anchorId`, emitting `[data-sx-c="<key>"]`. Unify on one
mechanism — a hand-stamped anchor is just a special case of a selector:

```ts
PaletteOverrideSchema = z.object({
  selector: CssSelectorSchema,          // whitelisted grammar, ≤300 chars
  bg: Hex.optional(),
  text: Hex.optional(),
  border: Hex.optional(),
}).strict();

PaletteSchema = z.object({
  seeds: PaletteSeedsSchema.optional(),
  tokens: PaletteTokensSchema.optional(),
  overrides: z.array(PaletteOverrideSchema).max(200).optional(),   // was Record<anchorId, roles>
}).strict();
```

- **Dedupe by `selector`** on upsert (array, not record, because a selector is not a legal key).
- **Cap at 200** so a runaway loop can't bloat every public page's `<style>`.
- **Migration is free**: the only Theme's `draftSnapshot.palette` is `{}` (reset and verified on
  2026-07-14 after the E2E test), and no `Release` carries a non-empty palette. `schemaVersion`
  stays `1`; a stale record-shaped palette would fail `.strict()` and is treated as "no palette",
  which is the correct outcome for data that doesn't exist.

`paletteStyle()` emits each override's `selector` verbatim after re-validation, grouping roles into
one rule.

---

## 5. Data flow

```
overlay (preview, cross-origin)                admin shell
──────────────────────────────                 ────────────────────────────
click at (x,y) in colour mode
  resolve meaningful block
  per role: painting element,
            computed hex, token key,
            generated selector
  ── colourTarget ──────────────────────────▶  setColourTarget(...)
                                                colour panel renders rows
                                                user picks a colour
                                                  token  → setSeed/setToken
                                                  element→ upsert{selector,role,hex}
  ◀── applyPalette { css } ───────────────────  paletteStyle(pending)
  swap #signex-palette textContent
                                                Save draft → API (zod revalidates
                                                  grammar) → Theme.draftSnapshot
                                                Publish → Release → revalidateTag
public /vi SSR → <style id="signex-palette"> from the published snapshot
```

Unchanged from today: the `ready` handshake re-applies pending state, and the palette re-apply
stays **guarded** — posting unconditionally blanks the server-rendered node (fixed in `ad5549a`).

---

## 6. Targeted refactor

`editor-shell.tsx` is **1121 lines** and modes would grow it further. Scoped to what this work
touches:

| New file | Moves out of shell |
|---|---|
| `_lib/modes.ts` | `EditMode`, per-mode config, panel routing table |
| `_lib/preview-bridge.ts` | the postMessage listener + all posters (the largest block) |
| `_panels/media-panel.tsx` | media list + picker wiring |
| `_panels/text-panel.tsx` | text list + inline-edit mirror |
| `_panels/color-panel.tsx` | role rows + brand seeds (replaces `palette-panel` + `color-popover`) |

`context-panel.tsx` stays as-is and becomes the Content mode panel. The shell keeps orchestration
(pending state, save/publish, dirty tracking) only. No unrelated refactoring.

`color-popover.tsx` is **deleted** — properties live in the panel now.

---

## 7. Error handling

| Situation | Behaviour |
|---|---|
| Selector cannot be proven unique | Refuse to anchor; panel explains; token-only editing offered |
| Stored selector matches 0 or >1 elements at edit time | Panel flags the override as broken + offers removal |
| Array length changes → `nth-of-type` drifts | Surfaces as the broken-selector case above |
| Colour has alpha | **Editable** — read as `#rrggbbaa`; stored on the token/override, which is terminal. (Was "read-only row"; changed in f35067e — see §3.2.) |
| Colour is a gradient / non-sRGB / an unresolved `color-mix` | Read-only row with the reason |
| Malformed selector from the DB | Emitter rejects it (never escapes); other rules still emit |
| >200 overrides | Save rejected with a clear message |
| Mode switched mid text-edit | Commit the in-flight edit first (reuses the existing commit path) |

## 8. Testing

- **shared** — selector grammar accept/reject table (incl. `</style><script>`, `__proto__`,
  over-length); emitter output incl. multi-role grouping; array cap.
- **admin** — mode reducer + panel routing; override upsert/dedupe by selector; toolbar renders 4
  modes and narrows to icons.
- **web** — selector generation is unique and resolves to the intended target; role resolution
  finds `.btn-bg` for the nav CTA's bg; token detection maps back to `btnPrimaryBg`; mode gating
  (a text click in media mode does nothing).
- **browser E2E** — per mode: click → panel → pick → live preview → Save draft → Publish →
  public `/vi` reflects it; reset restores the baseline (0 palette nodes, 0 `data-edit-*`).

## 9. Out of scope (YAGNI)

- Typography/spacing/layout modes — colour, text, media only.
- Editing colours per breakpoint or per state (`:hover`, `:focus`).
- A DOM-tree browser or manual selector entry — auto-resolve is the contract (decision 4).
- Reordering/adding array items from the canvas — Content mode's form remains the route.
- Migrating historical palettes — there are none.

## 10. Risks

1. **Selector drift** is the main one. Mitigated by: the markup is a frozen faithful clone (text
   and image edits do not change structure), self-verification at generation, and broken-selector
   detection at edit time. Arrays are the real exposure and are surfaced, not hidden.
2. **Selector injection** — mitigated by the whitelist + two-layer reject, mirroring F1.
3. **Override sprawl** — mitigated by token-first defaults (decision 7) and the 200 cap.
4. **Mode discoverability** — a centred control can be missed. If it tests badly, the fallback is
   the full-width tab strip under the toolbar (costs ~40px of canvas).
