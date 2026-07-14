// app/(dash)/editor/_lib/palette-patch.ts
// Pure, immutable reducers over the client-held palette working patch (mirrors the `pending` Map
// pattern for block edits, but palette is a single small object rather than a per-block map).
// `PalettePatch` aliases `@signex/shared`'s `Palette` — the same shape persisted on
// ReleaseSnapshot.palette and rendered via `paletteStyle`.

import { PALETTE_VARS, TOKEN_VARS, type Palette } from "@signex/shared";

export type PalettePatch = Palette;

export function setSeed(p: PalettePatch, key: string, hex: string): PalettePatch {
  return { ...p, seeds: { ...(p.seeds ?? {}), [key]: hex } };
}

export function setToken(p: PalettePatch, key: string, hex: string): PalettePatch {
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
export function setTokenColor(p: PalettePatch, tokenKey: string, hex: string): PalettePatch {
  // Object.hasOwn, never `in` — `"toString" in PALETTE_VARS` is true.
  if (Object.hasOwn(PALETTE_VARS, tokenKey)) return setSeed(p, tokenKey, hex);
  if (Object.hasOwn(TOKEN_VARS, tokenKey)) return setToken(p, tokenKey, hex);
  return p;
}

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

export function resetAll(): PalettePatch {
  return {};
}

export function isEmptyPalette(p: PalettePatch | undefined | null): boolean {
  if (!p) return true;
  const n =
    Object.keys(p.seeds ?? {}).length +
    Object.keys(p.tokens ?? {}).length +
    (p.overrides ?? []).length;
  return n === 0;
}
