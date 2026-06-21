// /sitemap.xml — one <url> entry per (route × locale) with a complete, reciprocal set of
// hreflang alternates (en, vi, x-default) so Google can map the localized versions. Served at
// the app root (proxy.ts skips dotted paths, so it isn't locale-redirected). Add new indexable
// routes to ROUTES; the 404 catch-all and the bare redirecting paths are intentionally excluded.
import type { MetadataRoute } from "next";
import { LOCALES, DEFAULT_LOCALE } from "@/app/lib/i18n-config";
import { getSiteContent } from "@/app/lib/content";
import { SITE_URL } from "@/app/lib/seo";

// Stable <lastmod> — a fixed date (bump it when page content meaningfully changes). NOT
// `new Date()`: that would change on every build even with no content change, which trains
// Google to distrust the signal.
const LAST_MODIFIED = "2026-06-16";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Indexable routes, path WITHOUT the locale prefix ("" = home). Category-detail pages are
  // derived from the dict so the sitemap stays in sync when categories change.
  const { products } = await getSiteContent(DEFAULT_LOCALE);
  const routes = [
    "", "/about", "/contact",
    ...products.categories.map((c) => `/products/${c.slug}`),
    ...products.categories.flatMap((c) => c.items.map((it) => `/products/${c.slug}/${it.slug}`)),
  ];
  return routes.flatMap((path) => {
    // Shared, reciprocal hreflang map for this route — identical on every locale's entry so
    // each <loc> references all versions (incl. itself) + x-default → the default locale.
    const languages: Record<string, string> = { "x-default": `${SITE_URL}/${DEFAULT_LOCALE}${path}` };
    for (const l of LOCALES) languages[l] = `${SITE_URL}/${l}${path}`;
    return LOCALES.map((locale) => ({
      url: `${SITE_URL}/${locale}${path}`,
      lastModified: LAST_MODIFIED,
      changeFrequency: "monthly" as const,
      priority: path === "" ? 1 : path.split("/").length >= 4 ? 0.6 : path.startsWith("/products/") ? 0.7 : 0.8,
      alternates: { languages },
    }));
  });
}
