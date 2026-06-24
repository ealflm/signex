import { z } from "zod";
import { LocalizedText, TwoToneTitle, Href, VideoRef, AssetRef } from "../primitives";

/** Home "Why Brands Choose Us" (dict.features). */
export const featuresBlock = z.object({
  eyebrow: LocalizedText,
  title: TwoToneTitle, // titleTop -> lead, titleBottom -> accent
  cta: z.object({ label: LocalizedText, href: Href }),
  video: z.object({
    title: LocalizedText,
    text: LocalizedText,
    media: VideoRef.optional(),
  }),
  featured: z.object({
    title: LocalizedText,
    desc: LocalizedText,
    // Featured value-tile image. OPTIONAL: web falls back to the literal
    // pexels-saeb-mahajna still when absent (published v1 snapshot stays valid).
    image: AssetRef.optional(),
  }),
  cards: z
    .array(z.object({ title: LocalizedText, desc: LocalizedText }))
    .min(1),
});
export type FeaturesBlock = z.infer<typeof featuresBlock>;
