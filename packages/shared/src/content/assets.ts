import { z } from "zod";
import { Id, LocalizedText } from "./primitives";

/**
 * A frozen asset reference inside a snapshot (content OR catalog). URL is NOT
 * frozen — the web resolves MEDIA_PUBLIC_BASE + '/' + r2Key at read time
 * (survives a CDN/domain migration). `variants` stays [] in the foundation
 * (a later responsive sub-project backfills without a snapshot migration).
 *
 * Lives in its own neutral module so both the content release snapshot and the
 * standalone catalog snapshot can import it without either domain depending on
 * the other's module.
 */
export const FrozenAsset = z.object({
  assetId: Id,
  r2Key: z.string(),
  mime: z.string(),
  width: z.number().optional(),
  height: z.number().optional(),
  alt: LocalizedText.optional(),
  poster: z.object({ r2Key: z.string() }).optional(),
  webm: z.object({ r2Key: z.string() }).optional(),
  variants: z
    .array(z.object({ label: z.string(), width: z.number(), r2Key: z.string() }))
    .default([]),
});
export type FrozenAsset = z.infer<typeof FrozenAsset>;
