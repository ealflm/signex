import { z } from "zod";
import { LocalizedText, MediaRef, Overlay } from "../primitives";
import { HexA } from "../palette";

/** Home hero (dict.hero). titleTop/titleBottom are the two stacked lines. */
export const heroBlock = z.object({
  titleTop: LocalizedText,
  titleBottom: LocalizedText,
  subtitle: LocalizedText,
  image: MediaRef, // image OR video (MediaRef); dict.hero.imageAlt maps to an image's alt
  overlay: Overlay.optional(),
  // false → the hero renders WITHOUT the quote form (client option: show the full banner).
  showQuoteForm: z.boolean().default(true),
  // Uniform colour for ALL 10 field-label spans of the HERO form only. The contact form is
  // deliberately out of scope (its light card needs different colours; per-label overrides cover
  // it). `.describe("color")` is the admin zodform's colour-picker marker. Absent = the template's
  // own input--label token (the web's --sx-form-label fallback), i.e. today's colour, no change.
  formLabelColor: HexA.describe("color").optional(),
});
export type HeroBlock = z.infer<typeof heroBlock>;
