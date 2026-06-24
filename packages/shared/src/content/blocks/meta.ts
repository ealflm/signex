import { z } from "zod";
import { LocalizedText, AssetRef } from "../primitives";

const pageMeta = z.object({ title: LocalizedText, description: LocalizedText });

// GA4 measurement id, e.g. `G-XXXXXXXXXX`. Light shape check only; kept optional and the regex
// ALSO allows the empty string so an admin "unset" submit (empty field) and a published snapshot
// WITHOUT analytics (v1/v2) both stay valid. When empty/undefined the web injects no Google
// Analytics at all (no gtag, no network) — the site owner sets the id in admin.
// NOTE: stays a plain optional ZodString (regex doesn't change the inner type) so the admin's
// deriveFields recursion renders it as a text INPUT rather than a raw-JSON textarea.
const Ga4Id = z
  .string()
  .trim()
  .regex(/^(G-[A-Z0-9]+)?$/i, "Must look like a GA4 id, e.g. G-XXXXXXXXXX")
  .optional();

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
  // OPTIONAL site-wide analytics. Nested object so the admin editor renders it as a fieldset
  // (deriveFields recurses one level → a `ga4Id` text input). Absent in v1/v2 snapshots.
  analytics: z.object({ ga4Id: Ga4Id }).optional(),
});
export type MetaBlock = z.infer<typeof metaBlock>;
