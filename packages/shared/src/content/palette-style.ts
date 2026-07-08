import { PALETTE_VARS, TOKEN_VARS } from "./palette";
import type { Palette } from "./palette";

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const isHex = (v: unknown): v is string => typeof v === "string" && HEX.test(v);

/** CSS.escape is browser-only; this covers the attribute-selector metacharacters we care about. */
function escapeAttr(v: string): string {
  return v.replace(/["\\{}\]]/g, (c) => "\\" + c);
}

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
    const parts: string[] = [];
    if (isHex(roles.bg)) parts.push(`background-color:${roles.bg}`);
    if (isHex(roles.text)) parts.push(`color:${roles.text}`);
    if (isHex(roles.border)) parts.push(`border-color:${roles.border}`);
    if (parts.length) rules.push(`[data-sx-c="${escapeAttr(anchorId)}"]{${parts.join(";")}}`);
  }

  let css = rootDecls.length ? `:root{${rootDecls.join(";")}}` : "";
  css += rules.join("");
  return css || null;
}
