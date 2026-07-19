import { z } from "zod";
import { LocalizedText, MediaRef, Overlay } from "../primitives";

/** Home hero (dict.hero). titleTop/titleBottom are the two stacked lines. */
export const heroBlock = z.object({
  titleTop: LocalizedText,
  titleBottom: LocalizedText,
  subtitle: LocalizedText,
  image: MediaRef, // image OR video (MediaRef); dict.hero.imageAlt maps to an image's alt
  overlay: Overlay.optional(),
});
export type HeroBlock = z.infer<typeof heroBlock>;
