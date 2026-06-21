import { z } from "zod";
import { LocalizedText, TwoToneTitle, Href, AssetRef } from "../primitives";

/** The 404 page (dict.notFound). */
export const notFoundBlock = z.object({
  eyebrow: LocalizedText,
  title: TwoToneTitle, // title (lead) + titleAccent
  body: LocalizedText,
  cta: z.object({ label: LocalizedText, href: Href }),
  image: AssetRef, // imageAlt becomes image.alt
});
export type NotFoundBlock = z.infer<typeof notFoundBlock>;
