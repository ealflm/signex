import { z } from "zod";
import { CssSelectorSchema } from "./selector";

/**
 * An OPAQUE hex — `#rgb` or `#rrggbb`. The seeds' type, and deliberately still alpha-free.
 *
 * A seed is the one palette value that is not terminal: all 16 `color-mix()` in the template consume
 * `base--dark-100` / `base--light-100` and nothing else, so every derived shade
 * (`color-mix(in srgb, var(--…base--dark-100) 64%, transparent)`) MULTIPLIES the seed's own alpha by
 * its own percentage. Measured in Chrome: a seed at alpha 0.5 read back through `--base--dark-64` as
 * 0.321 (= 0.5 × 0.64), at 0.25 as 0.161. So a translucent seed does not mean "this colour is
 * translucent" — it means every shade derived from it is translucent by a different, silently
 * compounded amount. Alpha stays out of the multiplier input; see HexA for where it belongs.
 */
export const Hex = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "must be a #rgb or #rrggbb hex colour");

/**
 * A hex that MAY carry alpha — `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`. The type of every TERMINAL
 * palette value: the tier-B tokens and the per-element overrides.
 *
 * Terminal is the whole argument, and it is a fact about this template rather than a hope: no token
 * is ever an operand of a `color-mix()` (all 16 take a seed), and a per-element override is a
 * `background-color`/`color`/`border-color` declaration — the end of the line by construction. So
 * overriding either REPLACES the template's derivation outright instead of feeding it. Measured:
 * overriding a derived var with 50% alpha renders at exactly 0.5, with no multiplication. That is
 * what makes alpha here mean what the user picked, and it is why seeds are excluded (see Hex).
 *
 * WHY 8-DIGIT HEX AND NOT `rgba(…)`. CSS parses `#rrggbbaa` natively, so nothing downstream has to
 * translate. It is strictly backward compatible — `#rrggbb` stays valid and every palette stored
 * today is 6-digit, so no snapshot 422s and no migration exists to get wrong. And it keeps the same
 * CHARACTER CLASS as the value it replaces: this string is emitted into a `<style>`, which is HTML
 * raw text where escaping is not a defence (see selector.ts / 7061210), so the security rule is
 * REJECT and the regex that does the rejecting stays `#` + hex digits, anchored at both ends.
 * `rgba(…)` would widen that alphabet with parens, commas, dots and whitespace for no gain.
 */
export const HexA = z
  .string()
  .regex(
    /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/,
    "must be a #rgb, #rgba, #rrggbb or #rrggbbaa hex colour",
  );

/** `#rrggbbaa` → `{ rgb: "#rrggbb", alpha: 0–1 }`; the short forms expand, and an alpha-free hex
 *  reads as fully opaque. Undefined for anything HexA does not accept — callers must not guess. */
export function splitHexAlpha(hex: string): { rgb: string; alpha: number } | undefined {
  if (!HexA.safeParse(hex).success) return undefined;
  const body = hex.slice(1);
  const pairs = body.length <= 4 ? body.split("").map((c) => c + c) : (body.match(/../g) as string[]);
  const [r, g, b, a] = pairs;
  return { rgb: `#${r}${g}${b}`.toLowerCase(), alpha: a === undefined ? 1 : parseInt(a, 16) / 255 };
}

/**
 * `("#rrggbb", 0–1)` → `#rrggbb` when fully opaque, `#rrggbbaa` otherwise.
 *
 * The opaque case MUST stay 6-digit: it is what keeps this format backward compatible in the
 * direction that actually gets exercised — an untouched opaque colour re-saved through the new picker
 * has to round-trip to the bytes already in the snapshot, or every save would rewrite every value.
 */
export function joinHexAlpha(rgb: string, alpha: number): string {
  const split = splitHexAlpha(rgb);
  const base = split ? split.rgb : "#000000";
  const a = Math.min(1, Math.max(0, alpha));
  if (a >= 1) return base;
  const byte = Math.round(a * 255)
    .toString(16)
    .padStart(2, "0");
  return `${base}${byte}`;
}

// ── Tier A: the 8 seed swatches. Overriding these re-themes the whole site. ──
// cssVar values are copied VERBATIM from caladan-template.shared.*.css (emoji is literal). A name
// that matches nothing in that stylesheet fails NOWHERE — the override emits, parses, applies, and
// paints nothing, site-wide. apps/web/app/lib/palette-template.test.mjs reads the template and
// holds every name below to it; it lives there because only apps/web can legally see both halves.
export const PALETTE_VARS = {
  accentAqua:      { cssVar: "--_🎨-color--base---accent--aqua",      default: "#2ec4b6", label: "Màu nhấn (aqua)" },
  accentOcean:     { cssVar: "--_🎨-color--base---accent--ocean",     default: "#0f4c81", label: "Đại dương" },
  accentDarkOcean: { cssVar: "--_🎨-color--base---accent--dark-ocean", default: "#0d2b44", label: "Đại dương đậm" },
  accentDeepNavy:  { cssVar: "--_🎨-color--base---accent--deep-navy", default: "#071522", label: "Navy sâu" },
  baseDark:        { cssVar: "--_🎨-color--base---base--dark-100",    default: "#0b1f33", label: "Nền tối" },
  baseLight:       { cssVar: "--_🎨-color--base---base--light-100",   default: "#ffffff", label: "Nền sáng" },
  liftDark:        { cssVar: "--_🎨-color--base---lift--dark",        default: "#272727", label: "Lift tối" },
  liftLight:       { cssVar: "--_🎨-color--base---lift--light",       default: "#d9d9d9", label: "Lift sáng" },
} as const;

export type SeedKey = keyof typeof PALETTE_VARS;
export const SEED_KEYS = Object.keys(PALETTE_VARS) as SeedKey[];

/**
 * Seeds the template DECLARES but that no rule anywhere ever READS via `var()`.
 *
 * Being declared is only half of what makes an override paint (that half is held by
 * palette-template.test.mjs). A name nothing reads is the other silent failure of the same family:
 * the `<style>` emits, parses and applies, and the site does not change. accentAqua is declared
 * once and read zero times — so the panel's most prominent swatch, "Màu nhấn (aqua)", painted
 * nothing, silently.
 *
 * THIS IS A FACT ABOUT THE TEMPLATE, NOT ABOUT US. Point one `var()` at accentAqua and it becomes
 * live. So it is DATA here, derived from the stylesheet and held to it by
 * apps/web/app/lib/palette-template.test.mjs — the only workspace that may legally see both the
 * registry and the template (shared must never depend on an app; see the root AGENTS.md build
 * order). Make one live and that test fails, naming the key to drop from this list; the swatch
 * comes back. The alternative — a hardcoded name in the admin panel — could only rot into a
 * stale comment, because nothing would be checking it.
 *
 * SCOPE: this list changes what the UI OFFERS, and NOTHING about what the system ACCEPTS. These
 * keys stay fully valid — PaletteSeedsSchema takes them, paletteStyle() emits them, and stored
 * snapshots keep them untouched. palette.test.ts pins exactly that.
 *
 * Tier B has the same shape (inkLift, inkSemi are declared 31x, read 0x) but needs no list:
 * detectToken can only ever surface a token whose var is actually READ, so those two are
 * unreachable rather than merely inert, and no UI offers them. That argument is unchanged by the
 * tone--* tokens joining the tier — every one of those IS read (46/5/4/2/1 times), so they arrive
 * reachable, and inkLift/inkSemi stay exactly as unreachable as they were.
 */
export const INERT_SEED_KEYS: readonly SeedKey[] = ["accentAqua"];

/** True when overriding `key` provably paints nothing on this template. See INERT_SEED_KEYS. */
export const isInertSeed = (key: SeedKey): boolean => INERT_SEED_KEYS.includes(key);

// ── Tier B: :root-level semantic tokens worth overriding site-wide. ──
// Allowlist only. Two things re-declare these tokens in the template, and they are NOT the same:
//   1. `body` re-declares all 17 — page-wide, and therefore NOT a local override at all. An
//      override emitted only at `:root` loses to it everywhere, which made this whole tier a silent
//      no-op. paletteStyle() now out-specifies it (see ROOT_SELECTOR there); nothing to work around.
//   2. ~29 section selectors (`.master_footer`, `.wrap_home-a`, `.card_team`, …) re-declare them for
//      their own subtree. Those still win locally — BY DESIGN, not a limitation: a site-wide token
//      change should not flatten a section that deliberately re-themes itself.
//
// (2) IS LOAD-BEARING FOR THE UI, and this is where that stopped being theoretical. Every one of the
// 31 declarers of each token is `:root`, `body`, or one of those 29 sections — so for an element
// INSIDE such a section, a site-wide override of the very token it reads paints nothing on it, while
// still repainting everything outside. Measured on /vi/about: overriding tone--medium moves 105
// elements and NOT the `.tone-medium` span in `.content_hero-home-c` (which re-declares it as
// light-64). "By design" for the cascade is still a lie when the PANEL offers it as this element's
// site-wide route — the accentAqua failure one layer down. So whether the route reaches a given
// element is measured per click, in the preview, where the DOM is: see color-engine's `tokenReaches`.
export const TOKEN_VARS = {
  inkBase:            { cssVar: "--_🎨-color--tokens---ink--base",                        label: "Chữ chính" },
  inkLift:            { cssVar: "--_🎨-color--tokens---ink--lift",                        label: "Chữ nổi" },
  inkSemi:            { cssVar: "--_🎨-color--tokens---ink--semi-transparent",            label: "Chữ mờ" },
  btnPrimaryBg:       { cssVar: "--_🎨-color--tokens---button--primary--default--background", label: "Nút chính — nền" },
  btnPrimaryText:     { cssVar: "--_🎨-color--tokens---button--primary--default--text",       label: "Nút chính — chữ" },
  btnPrimaryHoverBg:  { cssVar: "--_🎨-color--tokens---button--primary--hover--background",    label: "Nút chính — nền (hover)" },
  btnPrimaryHoverText: { cssVar: "--_🎨-color--tokens---button--primary--hover--text", label: "Nút chính — chữ (hover)" },
  btnSecondaryBg:     { cssVar: "--_🎨-color--tokens---button--secondary--default--background", label: "Nút phụ — nền" },
  btnSecondaryText:   { cssVar: "--_🎨-color--tokens---button--secondary--default--text",       label: "Nút phụ — chữ" },
  btnTertiaryText:    { cssVar: "--_🎨-color--tokens---button--tertiary--default--text",         label: "Nút chữ — màu chữ" },
  inputDefaultBg:     { cssVar: "--_🎨-color--tokens---input--default--background",         label: "Ô nhập — nền" },
  inputDefaultText:   { cssVar: "--_🎨-color--tokens---input--default--text",               label: "Ô nhập — chữ" },
  inputActiveBorder:  { cssVar: "--_🎨-color--tokens---input--active--border",              label: "Ô nhập — viền (active)" },

  // The TONE ladder — one opacity step each, over whichever base the surrounding section sets.
  // Harvested verbatim from the template by scratchpad/gen-tone.mjs, never re-typed: these names
  // carry a literal 🎨 and palette-template.test.mjs holds every one of them to the stylesheet.
  //
  // These five were the registry's largest hole: the template DECLARES each 31x and READS them 46
  // (strong), 5 (medium), 4 (good), 2 (subtle) and 1 (faint) times, and not one was listed here — so
  // detectToken resolved nothing for the ~264 elements tone--strong paints and the panel could only
  // ever offer the per-element escape hatch for them.
  //
  // Read almost entirely by `color` (37 of tone--strong's 46 reads; every read of medium/good/subtle),
  // hence the "Sắc độ" register rather than a per-role name — tone--strong also paints 2
  // backgrounds and 1 border, and a label saying "Chữ" would be wrong on those.
  toneStrong:         { cssVar: "--_🎨-color--tokens---tone--strong", label: "Sắc độ — nổi bật" },
  toneGood:           { cssVar: "--_🎨-color--tokens---tone--good", label: "Sắc độ — rõ" },
  toneMedium:         { cssVar: "--_🎨-color--tokens---tone--medium", label: "Sắc độ — vừa" },
  toneSubtle:         { cssVar: "--_🎨-color--tokens---tone--subtle", label: "Sắc độ — nhạt" },
  toneFaint:          { cssVar: "--_🎨-color--tokens---tone--faint", label: "Sắc độ — rất nhạt" },
} as const;

export type TokenKey = keyof typeof TOKEN_VARS;
export const TOKEN_KEYS = Object.keys(TOKEN_VARS) as TokenKey[];

const SeedKeyEnum = z.enum(SEED_KEYS as [SeedKey, ...SeedKey[]]);
const TokenKeyEnum = z.enum(TOKEN_KEYS as [TokenKey, ...TokenKey[]]);

/** Seeds are the `color-mix` multiplier input — opaque only. See Hex. */
export const PaletteSeedsSchema = z.record(SeedKeyEnum, Hex);
/** Tokens are terminal — no `color-mix` ever takes one — so alpha here means what it says. See HexA. */
export const PaletteTokensSchema = z.record(TokenKeyEnum, HexA);

/**
 * One per-element override. `selector` is the full CSS target — a hand-stamped anchor is just the
 * special case `[data-sx-c="…"]`, which is why there is no separate anchorId mechanism.
 * Grammar-constrained (see selector.ts): this string is emitted into `<style>`.
 *
 * The three roles take HexA, not Hex: an override is a terminal `background-color`/`color`/
 * `border-color` declaration, so its alpha is the rendered alpha and nothing downstream compounds it.
 */
export const PaletteOverrideSchema = z
  .object({
    selector: CssSelectorSchema,
    bg: HexA.optional(),
    text: HexA.optional(),
    border: HexA.optional(),
    // Per-element HOVER colours. The emitter appends `:hover` to the (validated) selector — the
    // stored selector stays pseudo-class-free, so the grammar/stored-XSS defense is unchanged.
    hoverBg: HexA.optional(),
    hoverText: HexA.optional(),
  })
  .strict();

/** Capped so a runaway client cannot bloat the `<style>` on every public page. */
export const PaletteOverridesSchema = z.array(PaletteOverrideSchema).max(200);

export type PaletteOverride = z.infer<typeof PaletteOverrideSchema>;

export const PaletteSchema = z
  .object({
    seeds: PaletteSeedsSchema.optional(),
    tokens: PaletteTokensSchema.optional(),
    overrides: PaletteOverridesSchema.optional(),
  })
  .strict();

export type PaletteSeeds = z.infer<typeof PaletteSeedsSchema>;
export type PaletteTokens = z.infer<typeof PaletteTokensSchema>;
export type PaletteOverrides = z.infer<typeof PaletteOverridesSchema>;
export type Palette = z.infer<typeof PaletteSchema>;
