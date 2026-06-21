// Shared SEO/metadata builder. Next merges metadata SHALLOWLY — a page that defines
// `openGraph` overwrites the layout's `openGraph` entirely (it does NOT deep-merge). So
// every segment that wants page-specific OG must emit a COMPLETE object. This helper keeps
// that DRY and consistent: the root layout and each page call it with their own title +
// description + path, and get a full, localized Metadata object back.
import type { Metadata } from "next";
import { DEFAULT_LOCALE, type Locale } from "@/app/lib/i18n-config";
import type { Dictionary } from "@/app/[lang]/dictionaries";

export const SITE_URL = "https://signex.vn";
export const THEME_COLOR = "#071522"; // brand deep-navy (browser theme-color + PWA manifest)
// Fallback OG image path (used when no snapshot-resolved URL is available — INITIAL_SNAPSHOT path).
// When the snapshot is published, meta.ogImageUrl carries the CDN URL (Task 61b).
const OG_IMAGE_FALLBACK = "/assets/images/signex-og.png";
// Favicons (favicon.io set: SIGNEX lotus mark). The .ico is auto-served from app/favicon.ico;
// these PNGs add the type/size hints modern browsers + Apple devices prefer.
const ICONS = {
  icon: [
    { url: "/assets/images/favicon-32x32.png", type: "image/png", sizes: "32x32" },
    { url: "/assets/images/favicon-16x16.png", type: "image/png", sizes: "16x16" },
  ],
  apple: "/assets/images/apple-touch-icon.png",
};

export function buildMetadata({
  locale,
  meta,
  title,
  description,
  path = "",
}: {
  locale: Locale;
  meta: Dictionary["meta"];
  title: string;
  description: string;
  /** Route path WITHOUT the locale prefix, e.g. "" (home), "/about", "/contact". */
  path?: string;
}): Metadata {
  const url = `/${locale}${path}`;
  const ogLocale = locale === "vi" ? "vi_VN" : "en_US";
  const altLocale = locale === "vi" ? "en_US" : "vi_VN";
  // Prefer the snapshot-resolved CDN URL (meta.ogImageUrl); fall back to the bundled path.
  const ogImage = meta.ogImageUrl || OG_IMAGE_FALLBACK;
  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    applicationName: meta.siteName,
    alternates: {
      canonical: url,
      // hreflang: point each locale at the same page in the other language; x-default →
      // the site default (Vietnamese) for visitors with no matching language preference.
      languages: { en: `/en${path}`, vi: `/vi${path}`, "x-default": `/${DEFAULT_LOCALE}${path}` },
    },
    openGraph: {
      type: "website",
      siteName: meta.siteName,
      title,
      description,
      url,
      locale: ogLocale,
      alternateLocale: altLocale,
      images: [{ url: ogImage, width: 1200, height: 630, alt: meta.ogImageAlt, type: "image/png" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
    icons: ICONS,
  };
}
