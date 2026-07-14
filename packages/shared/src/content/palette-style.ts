import { PALETTE_VARS, TOKEN_VARS, Hex } from "./palette";
import type { Palette } from "./palette";
import { isSafeSelector } from "./selector";

/** Reuse the exported Hex schema as the single source of truth (avoids regex drift). */
const isHex = (v: unknown): v is string => typeof v === "string" && Hex.safeParse(v).success;

/**
 * Build the CSS text for a palette, or null when there is nothing to emit.
 * Every value is re-validated against HEX here (defence in depth — never trust the stored snapshot),
 * so no free-form string can reach the stylesheet.
 */
export function paletteStyle(palette: Palette | undefined | null): string | null {
  if (!palette) return null;

  const rootDecls: string[] = [];
  for (const [key, val] of Object.entries(palette.seeds ?? {})) {
    const meta = PALETTE_VARS[key as keyof typeof PALETTE_VARS];
    if (meta && isHex(val)) rootDecls.push(`${meta.cssVar}:${val}`);
  }
  for (const [key, val] of Object.entries(palette.tokens ?? {})) {
    const meta = TOKEN_VARS[key as keyof typeof TOKEN_VARS];
    if (meta && isHex(val)) rootDecls.push(`${meta.cssVar}:${val}`);
  }

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

  let css = rootDecls.length ? `:root{${rootDecls.join(";")}}` : "";
  css += rules.join("");
  return css || null;
}
