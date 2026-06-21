import { z } from "zod";
import { LocalizedText, LocalizedTextArray, TwoToneTitle } from "../primitives";

/** Home "About SIGNEX" section (dict.about). */
export const aboutBlock = z.object({
  eyebrow: LocalizedText,
  title: TwoToneTitle, // dict title (lead) + titleAccent
  body: LocalizedText,
  mission: z.object({
    title: LocalizedText,
    body: LocalizedText,
    items: LocalizedTextArray,
  }),
  vision: z.object({ title: LocalizedText, body: LocalizedText }),
  values: z.object({ title: LocalizedText, body: LocalizedText }),
});
export type AboutBlock = z.infer<typeof aboutBlock>;
