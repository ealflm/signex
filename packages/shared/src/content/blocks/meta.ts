import { z } from "zod";
import { LocalizedText, AssetRef } from "../primitives";

const pageMeta = z.object({ title: LocalizedText, description: LocalizedText });

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
});
export type MetaBlock = z.infer<typeof metaBlock>;
