import { z } from "zod";
import { BLOCK_REGISTRY } from "./registry";
import { FrozenAsset } from "./assets";
import { FrozenCatalog } from "./catalog";
import { PaletteSchema } from "./palette";

/** Stamped on every Release; web gates/migrates old snapshots on this. */
export const SCHEMA_VERSION = 1 as const;

/**
 * The whole serialized site. blocks reuses BLOCK_REGISTRY so the web snapshot
 * type and the api per-block validation share one definition — they can never diverge.
 *
 * `assets` is a flat map of every assetId referenced in blocks (AssetRef / VideoRef),
 * keyed by assetId. The web resolves any assetId → r2Key → URL via
 * MEDIA_PUBLIC_BASE + '/' + r2Key, so block images (which carry only { assetId })
 * can be displayed without a second round-trip. (Catalog images are inline
 * FrozenAssets and are NOT resolved through this map.)
 *
 * `catalog` is OPTIONAL: the product catalog now lives in its own global,
 * independently-published domain (CatalogSnapshotSchema). The content publish
 * path strips it (M-F), and the web reads the catalog from its own pointer
 * (M-G); historical snapshots that still embed it keep parsing (dormant). Catalog
 * images are inline FrozenAssets and are NOT resolved through this `assets` map.
 */
export const ReleaseSnapshotSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  blocks: z.object(BLOCK_REGISTRY),
  catalog: FrozenCatalog.optional(),
  assets: z.record(z.string(), FrozenAsset), // assetId -> FrozenAsset; resolves block images
  palette: PaletteSchema.optional(),
});
export type ReleaseSnapshot = z.infer<typeof ReleaseSnapshotSchema>;
