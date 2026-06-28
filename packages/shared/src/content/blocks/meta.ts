import { z } from "zod";
import { LocalizedText, AssetRef } from "../primitives";

const pageMeta = z.object({ title: LocalizedText, description: LocalizedText });

// GA4 measurement id, e.g. `G-XXXXXXXXXX`. Light shape check only. The regex ALSO allows the
// empty string so an admin "unset" submit (empty field) stays valid → when empty/undefined the
// web injects no Google Analytics at all (no gtag, no network). Exported + reused by the global
// SiteConfig (the Settings page), NOT the theme meta block: GA4 is site-wide infrastructure that
// must NOT change when a different theme is published.
export const Ga4Id = z
  .string()
  .trim()
  .regex(/^(G-[A-Z0-9]+)?$/i, "Must look like a GA4 id, e.g. G-XXXXXXXXXX");

/** Site SEO metadata (dict.meta) + promoted og/favicon/siteUrl/themeColor literals. */
export const metaBlock = z.object({
  siteName: z.string(),
  siteUrl: z.string().url(),
  themeColor: z.string(),
  title: LocalizedText,
  description: LocalizedText,
  ogImage: AssetRef, // ogImageAlt becomes ogImage.alt
  favicons: z.array(z.object({ rel: z.string(), asset: AssetRef })).default([]),
  about: pageMeta,
  contact: pageMeta,
  // NOTE: analytics/GA4 lived here in v1/v2 snapshots. It has moved OUT to the global SiteConfig
  // singleton (admin Settings page). This object is NON-strict, so old snapshots that still carry
  // `meta.analytics` keep parsing — the unknown key is simply stripped.
});
export type MetaBlock = z.infer<typeof metaBlock>;

/**
 * Global site-wide config (the `SiteConfig` singleton) — edited on the admin Settings page,
 * independent of which theme is published. Reuses the `Ga4Id` regex.
 */
export const siteConfigSchema = z.object({ ga4Id: Ga4Id.optional() });
export type SiteConfigInput = z.infer<typeof siteConfigSchema>;
