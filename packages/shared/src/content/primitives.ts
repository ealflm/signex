import { z } from "zod";

/** Matches Prisma `@default(cuid())` ids (locked ID strategy). */
export const Id = z.string().cuid();

/**
 * Wraps an inner schema into the structurally-guaranteed `{ en, vi }` pair
 * that today is only convention across the two dictionary files.
 */
export const localized = <T extends z.ZodTypeAny>(inner: T) =>
  z.object({ en: inner, vi: inner });

export const LocalizedText = localized(z.string());
export type LocalizedText = z.infer<typeof LocalizedText>;

export const LocalizedTextArray = localized(z.array(z.string()));
export type LocalizedTextArray = z.infer<typeof LocalizedTextArray>;

/** "About " (lead) + "SIGNEX" (accent) split-tone heading. */
export const TwoToneTitle = z.object({
  lead: LocalizedText,
  accent: LocalizedText,
});
export type TwoToneTitle = z.infer<typeof TwoToneTitle>;

export const Href = z.string();

/** A reference to an Asset by id; alt lives on the USE, not the deduped Asset. */
export const AssetRef = z.object({
  assetId: Id,
  alt: LocalizedText.optional(),
});
export type AssetRef = z.infer<typeof AssetRef>;

/** Models the Webflow `w-background-video` (poster + mp4 + optional webm). */
export const VideoRef = z.object({
  posterAssetId: Id,
  mp4AssetId: Id,
  webmAssetId: Id.optional(),
});
export type VideoRef = z.infer<typeof VideoRef>;
