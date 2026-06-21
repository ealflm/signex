import { z } from "zod";
import { BLOCK_REGISTRY } from "./registry";
import { FrozenAsset, FrozenCatalog } from "./catalog";

/** Stamped on every Release; web gates/migrates old snapshots on this. */
export const SCHEMA_VERSION = 1 as const;

/**
 * The whole serialized site. blocks reuses BLOCK_REGISTRY so the web snapshot
 * type and the api per-block validation share one definition — they can never diverge.
 *
 * `assets` is a flat map of every assetId referenced in blocks (AssetRef / VideoRef)
 * AND in catalog images, keyed by assetId. The web resolves any assetId → r2Key → URL
 * via MEDIA_PUBLIC_BASE + '/' + r2Key, so block images (which carry only { assetId })
 * can be displayed without a second round-trip.
 */
export const ReleaseSnapshotSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  blocks: z.object(BLOCK_REGISTRY),
  catalog: FrozenCatalog,
  assets: z.record(z.string(), FrozenAsset), // assetId -> FrozenAsset; resolves block + catalog images
});
export type ReleaseSnapshot = z.infer<typeof ReleaseSnapshotSchema>;
