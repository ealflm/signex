import { BLOCK_REGISTRY, type BlockKey } from "@signex/shared";

// ─── Locale ──────────────────────────────────────────────────────────────────
export type Locale = "vi" | "en";

// ─── DeviceWidth ─────────────────────────────────────────────────────────────
export type DeviceWidth = "desktop" | "tablet" | "mobile";

export const DEVICE_MAX_WIDTH: Record<DeviceWidth, number | null> = {
  desktop: null,
  tablet: 834,
  mobile: 430,
};

// ─── Selection ────────────────────────────────────────────────────────────────
export interface Selection {
  blockKey: BlockKey;
  fieldPath: string | null;
  locale: Locale;
}

/**
 * Is this a block we have a schema for? A blockKey the CANVAS reported (the overlay reads it off
 * `data-sx-block`, and the bridge proves origin and nothing else) is a string until checked —
 * selecting an unknown one hands `BLOCK_REGISTRY[k]` → undefined to deriveFields, which throws
 * while reading `_def` off it and takes the whole editor down with it.
 *
 * The REGISTRY, not BLOCK_LABELS: the registry is what ContextPanel actually indexes. And
 * Object.hasOwn, never `in` — `"toString" in BLOCK_REGISTRY` is true (same trap as color-target's
 * isTokenKey).
 */
export const isBlockKey = (v: unknown): v is BlockKey =>
  typeof v === "string" && Object.hasOwn(BLOCK_REGISTRY, v);

// ─── ToolbarStatus ────────────────────────────────────────────────────────────
export type ToolbarStatus =
  | { kind: "saved"; revision: number }
  | { kind: "unsaved"; count: number }
  | { kind: "saving" };

// ─── SurfaceGroup ─────────────────────────────────────────────────────────────
export interface SurfaceGroup {
  label: string;
  items: { blockKey: BlockKey; label: string }[];
}

export const SURFACE_GROUPS: SurfaceGroup[] = [
  {
    label: "Page: Home",
    items: [
      { blockKey: "hero", label: "Hero" },
      { blockKey: "features", label: "Features" },
      { blockKey: "about", label: "About" },
      { blockKey: "productsHeader", label: "Products header" },
    ],
  },
  {
    label: "Page: About",
    items: [{ blockKey: "aboutPage", label: "About page" }],
  },
  {
    label: "Page: Contact",
    items: [{ blockKey: "contactPage", label: "Contact page" }],
  },
  {
    label: "Global",
    items: [
      { blockKey: "nav", label: "Navigation" },
      { blockKey: "footer", label: "Footer" },
    ],
  },
  {
    label: "Settings",
    items: [
      { blockKey: "meta", label: "SEO" },
      { blockKey: "businessContact", label: "Business contact" },
      { blockKey: "formConfig", label: "Form config" },
      { blockKey: "notFound", label: "404 page" },
    ],
  },
];

// ─── BLOCK_LABELS ─────────────────────────────────────────────────────────────
// Derived from SURFACE_GROUPS for convenient label lookup by blockKey.
export const BLOCK_LABELS: Record<BlockKey, string> = Object.fromEntries(
  SURFACE_GROUPS.flatMap((g) => g.items.map((i) => [i.blockKey, i.label])),
) as Record<BlockKey, string>;

// ─── SURFACE_PATH_BY_BLOCK ────────────────────────────────────────────────────
// "" = home, "/about" = about page, "/contact" = contact page, null = global / settings
export const SURFACE_PATH_BY_BLOCK: Record<BlockKey, string | null> = {
  hero: "",
  features: "",
  about: "",
  productsHeader: "",
  aboutPage: "/about",
  contactPage: "/contact",
  nav: null,
  footer: null,
  meta: null,
  businessContact: null,
  formConfig: null,
  notFound: "/404",
};
