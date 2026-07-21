// app/(dash)/editor/_lib/palette-working-set.ts
// Pure, immutable reducers over the client-held palette WORKING SET.
//
// A working set, explicitly NOT a patch — the opposite of `pending`, the per-block Map these
// reducers used to be described as mirroring. `pending` layers a PATCH on baseRef per block; the
// palette is one COMPLETE value. The difference is load-bearing in both directions:
//   • a patch cannot express a DELETION (both merges — the shell's and theme.service.ts's — are
//     additive-only), so a reset could never reach the server under one;
//   • a patch cannot be SHOWN. Binding the panel to one is a bug this branch already shipped and
//     fixed: the moment a save cleared the patch the panel fell back to the TEMPLATE defaults while
//     the preview correctly rendered the saved colours.
// So the value these reducers take and return is always the whole palette, and `replacePalette:
// true` is correct precisely because of it. If you find yourself reaching for `pendingPalette` to
// feed one of these, re-read editor-shell.tsx's palette section first — that is the bug above.
//
// `PaletteWorkingSet` aliases `@signex/shared`'s `Palette` — the same shape persisted on
// ReleaseSnapshot.palette and rendered via `paletteStyle`.

import { PALETTE_VARS, TOKEN_VARS, type Palette } from "@signex/shared";

export type PaletteWorkingSet = Palette;

/** The roles an override can carry — the three default-state roles plus the two hover roles. */
export type OverrideRole = "bg" | "text" | "border" | "hoverBg" | "hoverText";

export function setSeed(p: PaletteWorkingSet, key: string, hex: string): PaletteWorkingSet {
  return { ...p, seeds: { ...(p.seeds ?? {}), [key]: hex } };
}

export function setToken(p: PaletteWorkingSet, key: string, hex: string): PaletteWorkingSet {
  return { ...p, tokens: { ...(p.tokens ?? {}), [key]: hex } };
}

/**
 * Site-wide pick from the colour panel: write `hex` behind `tokenKey`, whichever tier it belongs to.
 *
 * The panel resolves ONE key per role — whatever custom property the winning CSS rule reads — and
 * has no way to know whether that lands in tier A (seeds) or tier B (tokens). The two are stored in
 * different slices and validated by different key enums, so the routing has to happen exactly once,
 * and this is it. An unrecognised key is a no-op rather than a write: it would 422 the entire
 * save-draft batch, and the caller has already been told (readColorTarget) that it isn't a token.
 */
export function setTokenColor(p: PaletteWorkingSet, tokenKey: string, hex: string): PaletteWorkingSet {
  // Object.hasOwn, never `in` — `"toString" in PALETTE_VARS` is true.
  if (Object.hasOwn(PALETTE_VARS, tokenKey)) return setSeed(p, tokenKey, hex);
  if (Object.hasOwn(TOKEN_VARS, tokenKey)) return setToken(p, tokenKey, hex);
  return p;
}

export function setOverride(
  p: PaletteWorkingSet,
  selector: string,
  role: OverrideRole,
  hex: string,
): PaletteWorkingSet {
  const list = p.overrides ?? [];
  const i = list.findIndex((o) => o.selector === selector);
  const next =
    i >= 0
      ? list.map((o, j) => (j === i ? { ...o, [role]: hex } : o))
      : [...list, { selector, [role]: hex }];
  return { ...p, overrides: next };
}

/**
 * Clear ONE role on one selector — what a role's × means, and all it may mean.
 *
 * Multi-role-per-selector is first-class here, not hypothetical: `setOverride` upserts a role onto
 * an existing entry precisely so one element can carry `bg` + `text` + `border`, `painterFor`
 * returns the same painter for `bg` and `border` on any element that has both, and theme.service.ts
 * merges role-wise per selector BECAUSE of it. So dropping the whole entry to clear one role
 * silently destroys the sibling roles the user never touched — colour mode's one standing rule is
 * that a user's colour is never removed except where they said so.
 *
 * The entry itself goes only when its LAST role does: an entry with no roles emits no declarations
 * (paletteStyle skips it), so keeping one would persist a selector that means nothing and audit as
 * "broken" the moment its element moved.
 */
export function clearOverrideRole(
  p: PaletteWorkingSet,
  selector: string,
  role: OverrideRole,
): PaletteWorkingSet {
  const next: PaletteWorkingSet["overrides"] = [];
  for (const o of p.overrides ?? []) {
    if (o.selector !== selector) {
      next.push(o);
      continue;
    }
    const rest = { ...o };
    delete rest[role];
    // `rest` still holds `selector`; the ROLES are what decide whether the entry survives.
    if (
      rest.bg !== undefined || rest.text !== undefined || rest.border !== undefined ||
      rest.hoverBg !== undefined || rest.hoverText !== undefined
    ) next.push(rest);
  }
  return { ...p, overrides: next };
}

/** Clear an ENTIRE entry — every role on it. The broken-override row's "Xoá": its element is gone
 *  from the page, so there is no role on it left to mean anything. A role's × is the other function. */
export function clearOverride(p: PaletteWorkingSet, selector: string): PaletteWorkingSet {
  return { ...p, overrides: (p.overrides ?? []).filter((o) => o.selector !== selector) };
}

// ── 409 rebase ────────────────────────────────────────────────────────────────

type Slice = Record<string, string | undefined>;

/** Three-way merge of one flat slice. `base` is what `ours` was derived from, so `ours` vs `base`
 *  is this session's INTENT — and a key we never touched is one the other session owns. */
function rebaseSlice(ours: Slice, base: Slice, theirs: Slice): Slice {
  const out: Slice = { ...theirs };
  for (const k of new Set([...Object.keys(base), ...Object.keys(ours)])) {
    if (ours[k] === base[k]) continue; // untouched by us → whatever they say stands
    if (ours[k] === undefined) delete out[k]; // we deleted it → it stays deleted
    else out[k] = ours[k];
  }
  return out;
}

/** An override entry minus its `selector` — i.e. just the roles, which is what merges. */
const rolesOf = (o: { selector: string } | undefined): Slice => {
  if (!o) return {};
  const roles = { ...o } as Slice;
  delete roles.selector;
  return roles;
};

/**
 * Re-apply this session's palette edits onto a palette that changed underneath it — the palette half
 * of what the 409 retry already does for block edits.
 *
 * WHY THIS EXISTS. Every touched save now sends `replacePalette: true`, because the working set is
 * COMPLETE and replace is the only verb under which a deletion can reach the server (theme.service.ts
 * merges additively and can never remove a key). But `replace` means the retry after a 409 hands the
 * server a working set derived from a base that is no longer there — so, without this, it would
 * overwrite every colour the other session saved, including the ones this session never looked at.
 * That is not what the 409 toast promises ("re-applying your edits on the latest") and not what the
 * block path does: `pending` is per-BLOCK, so an untouched block keeps their data by construction.
 * The palette is ONE object, so the same "keep what I didn't touch" has to be computed, key by key.
 *
 * `base` is what `ours` was derived from — every panel edit is f(effectivePalette), and
 * effectivePalette IS savedPalette until the first edit — which is what makes the diff below mean
 * this session's intent, deletions included:
 *   • key we changed or added → ours wins (this is the edit being retried)
 *   • key we deleted          → stays deleted; theirs is NOT resurrected
 *   • key we never touched    → theirs wins (they are the later writer on it)
 *
 * Overrides merge role-wise per selector, for the same reason the server does (theme.service.ts) and
 * the same reason clearOverrideRole exists: `bg` and `text` on one element are two separate colours
 * two people can own separately.
 */
export function rebasePalette(
  ours: PaletteWorkingSet,
  base: PaletteWorkingSet,
  theirs: PaletteWorkingSet,
): PaletteWorkingSet {
  const bySelector = (l: PaletteWorkingSet["overrides"]) =>
    new Map((l ?? []).map((o) => [o.selector, o] as const));
  const O = bySelector(ours.overrides);
  const B = bySelector(base.overrides);
  const T = bySelector(theirs.overrides);

  const overrides: NonNullable<PaletteWorkingSet["overrides"]> = [];
  for (const sel of new Set([...T.keys(), ...B.keys(), ...O.keys()])) {
    const roles = rebaseSlice(rolesOf(O.get(sel)), rolesOf(B.get(sel)), rolesOf(T.get(sel)));
    // An entry whose every role went is an entry that is gone — same rule as clearOverrideRole.
    if (Object.values(roles).some((v) => v !== undefined)) {
      overrides.push({ selector: sel, ...roles } as NonNullable<PaletteWorkingSet["overrides"]>[number]);
    }
  }

  return {
    seeds: rebaseSlice(ours.seeds ?? {}, base.seeds ?? {}, theirs.seeds ?? {}) as PaletteWorkingSet["seeds"],
    tokens: rebaseSlice(
      ours.tokens ?? {},
      base.tokens ?? {},
      theirs.tokens ?? {},
    ) as PaletteWorkingSet["tokens"],
    overrides,
  };
}
