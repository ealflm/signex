import { z } from "zod";
import {
  LocalizedText,
  LocalizedTextArray,
  TwoToneTitle,
} from "../primitives";

const section = z.object({
  eyebrow: LocalizedText.optional(),
  title: TwoToneTitle,
  body: LocalizedText.optional(),
});

/** The /about page (dict.aboutPage). title+titleAccent collapse into TwoToneTitle. */
export const aboutPageBlock = z.object({
  hero: z.object({ title: TwoToneTitle, subtitle: LocalizedText }),
  testimonial: section.extend({ body: LocalizedTextArray }),
  approach: z
    .array(z.object({ title: LocalizedText, body: LocalizedTextArray }))
    .min(1),
  intro: section,
  capability: section.extend({
    groups: z
      .array(z.object({ title: LocalizedText, items: LocalizedTextArray }))
      .min(1),
    closing: LocalizedTextArray,
  }),
  process: section.extend({
    steps: z
      .array(z.object({ title: LocalizedText, body: LocalizedText }))
      .min(1),
  }),
  timeline: section.extend({
    intro: LocalizedTextArray,
    milestones: z
      .array(
        z.object({
          num: z.string(),
          title: LocalizedText,
          body: LocalizedText,
          items: LocalizedTextArray.optional(),
          note: LocalizedText.optional(),
        }),
      )
      .min(1),
  }),
});
export type AboutPageBlock = z.infer<typeof aboutPageBlock>;
