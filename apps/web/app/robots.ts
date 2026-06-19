// /robots.txt — allow all crawlers and point them at the sitemap. Served at the app root
// (proxy.ts skips dotted paths). No private areas to disallow (static marketing site).
import type { MetadataRoute } from "next";
import { SITE_URL } from "@/app/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
