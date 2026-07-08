import { PALETTE_ANCHOR_ID_RE, PALETTE_VARS, TOKEN_VARS, Hex } from "./palette";
import type { Palette } from "./palette";

/** Reuse the exported Hex schema as the single source of truth (avoids regex drift). */
const isHex = (v: unknown): v is string => typeof v === "string" && Hex.safeParse(v).success;

/**
 * anchorId is emitted RAW (well-formed, unquoted-safe chars only) into a `<style>` element via
 * dangerouslySetInnerHTML. `<style>` is an HTML raw-text element, so the HTML parser does NOT
 * interpret CSS escapes inside it — a key containing e.g. `</style><script>…` would break out and
 * execute regardless of any CSS-level escaping. The schema (palette.ts) already constrains a
 * freshly-saved anchorId to this charset, but this is defence in depth: never trust the stored
 * snapshot — an already-persisted hostile key (saved before this fix, or written directly to the
 * DB) must still be rejected here, not escaped.
 */
const isSafeAnchorId = (v: string): boolean => PALETTE_ANCHOR_ID_RE.test(v);

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

  const rules: string[] = [];
  for (const [anchorId, roles] of Object.entries(palette.overrides ?? {})) {
    if (!isSafeAnchorId(anchorId)) continue; // reject, never escape — see isSafeAnchorId doc above
    const parts: string[] = [];
    if (isHex(roles.bg)) parts.push(`background-color:${roles.bg}`);
    if (isHex(roles.text)) parts.push(`color:${roles.text}`);
    if (isHex(roles.border)) parts.push(`border-color:${roles.border}`);
    if (parts.length) rules.push(`[data-sx-c="${anchorId}"]{${parts.join(";")}}`);
  }

  let css = rootDecls.length ? `:root{${rootDecls.join(";")}}` : "";
  css += rules.join("");
  return css || null;
}
