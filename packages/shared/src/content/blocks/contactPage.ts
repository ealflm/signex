import { z } from "zod";
import { LocalizedText, TwoToneTitle } from "../primitives";

/** The /contact page copy (dict.contactPage). NAP cards come from businessContact. */
export const contactPageBlock = z.object({
  hero: z.object({ title: TwoToneTitle, subtitle: LocalizedText }),
  map: z.object({ eyebrow: LocalizedText, title: TwoToneTitle }),
});
export type ContactPageBlock = z.infer<typeof contactPageBlock>;
