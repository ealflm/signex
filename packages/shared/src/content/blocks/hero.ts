import { z } from "zod";
import { LocalizedText, AssetRef } from "../primitives";

/** Home hero (dict.hero). titleTop/titleBottom are the two stacked lines. */
export const heroBlock = z.object({
  titleTop: LocalizedText,
  titleBottom: LocalizedText,
  subtitle: LocalizedText,
  image: AssetRef, // dict.hero.imageAlt becomes image.alt
});
export type HeroBlock = z.infer<typeof heroBlock>;
