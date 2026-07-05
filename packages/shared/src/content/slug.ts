import { z } from "zod";

/**
 * URL-safe slug format: lowercase alphanumerics, single hyphens between groups,
 * no leading/trailing/double hyphens. This is exactly the shape `slugify()`
 * produces, so a slugified string always satisfies `slugSchema`.
 * e.g. "plastic-logos-emblems", "logo-nganh-may".
 */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Unicode combining diacritical marks (U+0300–U+036F) left over after NFD
// decomposition — stripped so "Ản" → "an", "Ầ" → "a", etc.
const DIACRITICS = /[̀-ͯ]/g;

/**
 * Normalize arbitrary text (incl. Vietnamese) into a URL-safe slug.
 * "Lô go ngành may" → "lo-go-nganh-may"; "Ảnh Sản Phẩm" → "anh-san-pham".
 * Returns "" when nothing usable remains (callers add their own fallback if needed).
 * Output always matches SLUG_PATTERN (or is empty).
 */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * A required, URL-safe slug. Used by catalog category/product create+update
 * inputs (both the admin BFF and the api validate against this), so a slug with
 * spaces or accents can never be persisted and break the public product URL.
 */
export const slugSchema = z
  .string()
  .min(1, "Slug is required")
  .regex(
    SLUG_PATTERN,
    "Slug must be lowercase letters, numbers, and single hyphens (e.g. plastic-logos)",
  );
