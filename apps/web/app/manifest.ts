// /manifest.webmanifest — minimal web app manifest (name/description/theme-color/icons) for
// installability + a consistent browser theme color. Locale-neutral, so it lives at the app root
// and sources copy from the default-locale (vi) dictionary to match the rest of the site.
import type { MetadataRoute } from "next";
import { getSiteContent } from "@/app/lib/content";
import { DEFAULT_LOCALE } from "@/app/lib/i18n-config";
import { THEME_COLOR } from "@/app/lib/seo";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { meta } = await getSiteContent(DEFAULT_LOCALE);
  return {
    name: meta.title,
    short_name: meta.siteName,
    description: meta.description,
    start_url: `/${DEFAULT_LOCALE}`,
    display: "standalone",
    background_color: "#ffffff",
    theme_color: THEME_COLOR,
    icons: [
      { src: "/assets/images/android-chrome-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/assets/images/android-chrome-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
