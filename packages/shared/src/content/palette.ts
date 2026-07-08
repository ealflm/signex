import { z } from "zod";

/** #rgb or #rrggbb. Alpha is NOT stored — the token system derives transparency from the seeds. */
export const Hex = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "must be a #rgb or #rrggbb hex colour");

// ── Tier A: the 8 seed swatches. Overriding these re-themes the whole site. ──
// cssVar values are copied VERBATIM from caladan-template.shared.*.css (emoji is literal).
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

// ── Tier B: :root-level semantic tokens worth overriding site-wide. ──
// Allowlist only; section-scoped re-declarations still win locally (documented limitation).
export const TOKEN_VARS = {
  inkBase:            { cssVar: "--_🎨-color--tokens---ink--base",                        label: "Chữ chính" },
  inkLift:            { cssVar: "--_🎨-color--tokens---ink--lift",                        label: "Chữ nổi" },
  inkSemi:            { cssVar: "--_🎨-color--tokens---ink--semi-transparent",            label: "Chữ mờ" },
  btnPrimaryBg:       { cssVar: "--_🎨-color--tokens---button--primary--default--background", label: "Nút chính — nền" },
  btnPrimaryText:     { cssVar: "--_🎨-color--tokens---button--primary--default--text",       label: "Nút chính — chữ" },
  btnPrimaryHoverBg:  { cssVar: "--_🎨-color--tokens---button--primary--hover--background",    label: "Nút chính — nền (hover)" },
  btnSecondaryBg:     { cssVar: "--_🎨-color--tokens---button--secondary--default--background", label: "Nút phụ — nền" },
  btnSecondaryText:   { cssVar: "--_🎨-color--tokens---button--secondary--default--text",       label: "Nút phụ — chữ" },
  btnTertiaryText:    { cssVar: "--_🎨-color--tokens---button--tertiary--default--text",         label: "Nút chữ — màu chữ" },
  inputDefaultBg:     { cssVar: "--_🎨-color--tokens---input--default--background",         label: "Ô nhập — nền" },
  inputDefaultText:   { cssVar: "--_🎨-color--tokens---input--default--text",               label: "Ô nhập — chữ" },
  inputActiveBorder:  { cssVar: "--_🎨-color--tokens---input--active--border",              label: "Ô nhập — viền (active)" },
} as const;

export type TokenKey = keyof typeof TOKEN_VARS;
export const TOKEN_KEYS = Object.keys(TOKEN_VARS) as TokenKey[];

const SeedKeyEnum = z.enum(SEED_KEYS as [SeedKey, ...SeedKey[]]);
const TokenKeyEnum = z.enum(TOKEN_KEYS as [TokenKey, ...TokenKey[]]);

export const PaletteSeedsSchema = z.record(SeedKeyEnum, Hex);
export const PaletteTokensSchema = z.record(TokenKeyEnum, Hex);
export const PaletteOverrideRolesSchema = z
  .object({ bg: Hex, text: Hex, border: Hex })
  .partial()
  .strict();
/** Keyed by anchorId = the same "<blockKey>.<path>" string used by data-edit-field. */
export const PaletteOverridesSchema = z.record(z.string(), PaletteOverrideRolesSchema);

export const PaletteSchema = z
  .object({
    seeds: PaletteSeedsSchema.optional(),
    tokens: PaletteTokensSchema.optional(),
    overrides: PaletteOverridesSchema.optional(),
  })
  .strict();

export type PaletteSeeds = z.infer<typeof PaletteSeedsSchema>;
export type PaletteTokens = z.infer<typeof PaletteTokensSchema>;
export type PaletteOverrideRoles = z.infer<typeof PaletteOverrideRolesSchema>;
export type PaletteOverrides = z.infer<typeof PaletteOverridesSchema>;
export type Palette = z.infer<typeof PaletteSchema>;
