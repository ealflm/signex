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

/**
 * A media slot that may hold EITHER an image (AssetRef) or a video (VideoRef).
 *
 * The two are structurally disjoint — an image carries `assetId`, a video carries
 * `posterAssetId`+`mp4AssetId` and no `assetId` — so a plain union discriminates cleanly AND every
 * value already stored as an AssetRef or a VideoRef still parses (no migration, no re-publish). A
 * z.discriminatedUnion is NOT used: it would need a literal tag on every member, which stored values
 * predate. AssetRef is listed FIRST so a hybrid `{assetId, mp4AssetId}` resolves to image and its
 * stray video keys are stripped — editor-shell.applyMediaRef must clean-replace so a hybrid is never
 * written in the first place.
 */
export const MediaRef = z.union([AssetRef, VideoRef]);
export type MediaRef = z.infer<typeof MediaRef>;

/** True when this MediaRef is a video. The one discriminator the web resolver and the admin picker
 *  both read: a video carries `mp4AssetId`, an image never does. */
export const isVideoRef = (m: MediaRef): m is VideoRef => "mp4AssetId" in m;
