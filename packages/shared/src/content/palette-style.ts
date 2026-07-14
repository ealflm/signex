import { ANCHOR_PAINT_TARGETS, PALETTE_ANCHOR_ID_RE, PALETTE_VARS, TOKEN_VARS, Hex } from "./palette";
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

  const ROLE_PROP = { bg: "background-color", text: "color", border: "border-color" } as const;

  const rules: string[] = [];
  for (const [anchorId, roles] of Object.entries(palette.overrides ?? {})) {
    if (!isSafeAnchorId(anchorId)) continue; // reject, never escape — see isSafeAnchorId doc above
    const base = `[data-sx-c="${anchorId}"]`;
    // Most roles land on the anchor, but a role listed in ANCHOR_PAINT_TARGETS is painted by a
    // descendant and must be declared THERE instead (see that map's doc). Roles for one anchor can
    // therefore split across selectors, so group declarations by the selector they belong to.
    const bySelector = new Map<string, string[]>();
    for (const [role, prop] of Object.entries(ROLE_PROP) as [keyof typeof ROLE_PROP, string][]) {
      const val = roles[role];
      if (!isHex(val)) continue;
      // hasOwn, not a bare index: anchorId comes from the stored snapshot and the charset permits
      // "__proto__"/"constructor", which would otherwise walk the prototype chain instead of missing.
      const paintedBy = Object.hasOwn(ANCHOR_PAINT_TARGETS, anchorId)
        ? ANCHOR_PAINT_TARGETS[anchorId][role]
        : undefined;
      const selector = paintedBy ? `${base} ${paintedBy}` : base;
      const decls = bySelector.get(selector) ?? [];
      decls.push(`${prop}:${val}`);
      bySelector.set(selector, decls);
    }
    for (const [selector, decls] of bySelector) rules.push(`${selector}{${decls.join(";")}}`);
  }

  let css = rootDecls.length ? `:root{${rootDecls.join(";")}}` : "";
  css += rules.join("");
  return css || null;
}
