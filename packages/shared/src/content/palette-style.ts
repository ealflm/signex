import { PALETTE_VARS, TOKEN_VARS, Hex } from "./palette";
import type { Palette } from "./palette";
import { isSafeSelector } from "./selector";

/** Reuse the exported Hex schema as the single source of truth (avoids regex drift). */
const isHex = (v: unknown): v is string => typeof v === "string" && Hex.safeParse(v).success;

/**
 * The selector our seed/token declarations are emitted on.
 *
 * WHY NOT PLAIN `:root`: the template declares all 12 tier-B tokens on BOTH `:root` and `body`
 * (the 8 seeds are `:root`-only). A declaration ON `body` beats a value INHERITED from `:root`, so
 * a `:root`-only override of a token was a silent no-op page-wide — the "change the whole site"
 * action did nothing. We therefore also target `body`.
 *
 * WHY `html body` AND NOT `body`: `html body` is (0,0,2) and beats the template's `body` (0,0,1) on
 * SPECIFICITY, so it wins regardless of source order. Matching the template's specificity instead
 * would make correctness depend on our <style> being emitted after the template stylesheet — true
 * today in both paths, but silently breakable by anyone moving a <link>, and the live
 * `applyPalette` path appends to <head> at runtime where order is not ours to guarantee. Specificity
 * is checked by the cascade; source order is checked by nobody.
 *
 * Seeds ride along on the same rule. That is provably inert for them: the template declares seeds
 * only at `:root`, so the extra `html body` decl introduces no conflict, and tokens re-declared at
 * `body` as `var(--seed)` resolve the seed from `body` itself rather than by inheritance — same
 * value either way.
 *
 * Section-scoped re-declarations (`.master_footer`, `.wrap_home-a`, …) are UNAFFECTED and must stay
 * that way: they declare the token directly on their own element, and a direct declaration always
 * beats an inherited one, whatever the specificity. Their local re-theming is by design.
 */
const ROOT_SELECTOR = ":root, html body";

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

  let css = rootDecls.length ? `${ROOT_SELECTOR}{${rootDecls.join(";")}}` : "";
  css += rules.join("");
  return css || null;
}
