// app/(dash)/editor/_lib/color-target.ts
// The admin's reading of what the preview overlay says a colour-mode click landed on.
//
// The overlay (apps/web edit-overlay.tsx) posts, per click:
//   { source, type:"colorTarget", blockKey, label, roles }
// where `roles` is color-engine's `resolveRoles(block)` — one entry per colour ROLE the clicked
// block actually has, each carrying the rendered hex, the seed/token key driving it, and a
// per-element selector. Only the preview can answer any of that: it has the DOM and the CSSOM; the
// admin has neither.
//
// WHY THIS IS A PARSE AND NOT A CAST. The bridge's gate (preview-bridge.ts) proves origin + source
// and deliberately nothing else, so every field here is `unknown` in fact as well as in type. Each
// one is also a value that ends up in a PERSISTED palette, where the failure modes are not
// hypothetical:
//   • an unknown tokenKey → a key PaletteSeeds/TokensSchema's enum rejects → 422 on save-draft,
//     failing the WHOLE batch including unrelated block edits;
//   • a selector outside the grammar → the stored-XSS class fixed in 7061210 (a selector is emitted
//     into a `<style>`, which is HTML raw text — escaping is not a defence, so the rule is REJECT);
//   • a non-hex → same 422.
// So a field that doesn't parse is DROPPED, not repaired and not fatal: a role with no token still
// has its selector (the per-element path), and a role with neither is still worth showing as
// read-only. Losing one field must never lose the click.

import { HexA, PALETTE_VARS, TOKEN_VARS, isSafeSelector, type SeedKey, type TokenKey } from "@signex/shared";

export type ColorRole = "bg" | "text" | "border";

const ROLES = ["bg", "text", "border"] as const;

export const ROLE_LABEL: Record<ColorRole, string> = { bg: "Nền", text: "Chữ", border: "Viền" };

/** Mirrors color-engine.ts's RoleInfo. The two apps cannot see each other's types (`tsc` doesn't
 *  cross the workspace), so this declaration and that one are held together by the wire — and by
 *  color-target.test.ts, which is written against the shape the overlay literally posts. */
export interface RoleInfo {
  role: ColorRole;
  /** The rendered colour, as `#rrggbb` or — since alpha became storable — `#rrggbbaa`. Absent only
   *  for what hex genuinely cannot carry, e.g. a gradient. */
  hex?: string;
  /** The seed/token key the winning CSS rule reads. Absent is NORMAL, not an error — see the panel. */
  tokenKey?: string;
  /** Whether a site-wide edit of `tokenKey` would actually move this element. False when a section
   *  re-declares the token for its own subtree, which shadows the override — see color-engine's
   *  tokenReaches. Absent (from an older preview) is read as "no reason to think otherwise". */
  tokenReaches?: boolean;
  /** A provably-unique per-element target. Absent when buildSelector could not prove one. */
  selector?: string;
}

export interface ColorTarget {
  /** The enclosing [data-sx-block] key, when there is one ("" otherwise). */
  blockKey: string;
  /** What to call this element in the panel — the overlay sends `field || <tagname>`. */
  label: string;
  roles: RoleInfo[];
}

/**
 * HexA, not Hex — and this line is load-bearing. `r.hex` is what the element RENDERS, which since
 * rgbToHex learned alpha arrives as `#rrggbbaa` for every color-mix-derived colour in the template.
 * Gating it on the seeds' opaque `Hex` would drop exactly those values back to undefined and rebuild
 * the dead end this feature exists to remove, one layer further out.
 */
const isHex = (v: unknown): v is string => typeof v === "string" && HexA.safeParse(v).success;

/** A key of PALETTE_VARS (tier A seed) or TOKEN_VARS (tier B token).
 *  Object.hasOwn, never `in`: `"toString" in PALETTE_VARS` is TRUE, and a truthy `in` here would
 *  send tokenKey:"toString" to setSeed and 422 the save. */
export const isTokenKey = (v: unknown): v is string =>
  typeof v === "string" && (Object.hasOwn(PALETTE_VARS, v) || Object.hasOwn(TOKEN_VARS, v));

/** The registry's Vietnamese label for a seed/token key; the key itself when it is neither. */
export function tokenLabel(key: string): string {
  if (Object.hasOwn(PALETTE_VARS, key)) return PALETTE_VARS[key as SeedKey].label;
  if (Object.hasOwn(TOKEN_VARS, key)) return TOKEN_VARS[key as TokenKey].label;
  return key;
}

function readRoles(v: unknown): RoleInfo[] {
  if (!Array.isArray(v)) return [];
  const out: RoleInfo[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const role = ROLES.find((x) => x === r.role);
    if (!role) continue;
    out.push({
      role,
      hex: isHex(r.hex) ? r.hex : undefined,
      tokenKey: isTokenKey(r.tokenKey) ? r.tokenKey : undefined,
      // Only a literal `false` suppresses the site-wide route. A preview that predates the field
      // sends nothing, and "the field is missing" is not evidence the route is shadowed — the panel
      // reads undefined as the status quo ante and still offers it.
      tokenReaches: typeof r.tokenReaches === "boolean" ? r.tokenReaches : undefined,
      selector: isSafeSelector(r.selector) ? r.selector : undefined,
    });
  }
  return out;
}

/** The overlay's colorTarget payload, or null if this message isn't one. */
export function readColorTarget(data: Record<string, unknown>): ColorTarget | null {
  if (data.type !== "colorTarget") return null;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    blockKey: str(data.blockKey),
    // An unlabelled target is still a target: an element with no data-edit-field and no tag name to
    // speak of should open the panel, not swallow the click.
    label: str(data.label) || "Phần tử",
    roles: readRoles(data.roles),
  };
}
