import { z } from "zod";
import {
  LocalizedText,
  LocalizedTextArray,
  TwoToneTitle,
  AssetRef,
  MediaRef,
} from "../primitives";

const section = z.object({
  eyebrow: LocalizedText.optional(),
  title: TwoToneTitle,
  body: LocalizedText.optional(),
});

/** The /about page (dict.aboutPage). title+titleAccent collapse into TwoToneTitle. */
export const aboutPageBlock = z.object({
  // hero.video OPTIONAL: web falls back to the literal 8440992-uhd poster+mp4+webm when
  // absent (published v1 snapshot stays valid — no re-publish required).
  hero: z.object({
    title: TwoToneTitle,
    subtitle: LocalizedText,
    video: MediaRef.optional(), // image OR video
  }),
  // testimonial.image OPTIONAL: web falls back to the literal pexels-stephanlouis still.
  testimonial: section.extend({
    body: LocalizedTextArray,
    image: AssetRef.optional(),
  }),
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
