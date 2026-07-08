// app/(dash)/editor/_lib/palette-patch.ts
// Pure, immutable reducers over the client-held palette working patch (mirrors the `pending` Map
// pattern for block edits, but palette is a single small object rather than a per-block map).
// `PalettePatch` aliases `@signex/shared`'s `Palette` — the same shape persisted on
// ReleaseSnapshot.palette and rendered via `paletteStyle`.

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
