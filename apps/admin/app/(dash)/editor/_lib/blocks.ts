import type { BlockKey } from "@signex/shared";

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
      { blockKey: "meta", label: "SEO + GA4" },
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
  notFound: null,
};
