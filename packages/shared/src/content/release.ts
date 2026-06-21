import { z } from "zod";
import { BLOCK_REGISTRY } from "./registry";
import { FrozenCatalog } from "./catalog";

/** Stamped on every Release; web gates/migrates old snapshots on this. */
export const SCHEMA_VERSION = 1 as const;

/**
 * The whole serialized site. blocks reuses BLOCK_REGISTRY so the web snapshot
 * type and the api per-block validation share one definition — they can never diverge.
 */
export const ReleaseSnapshotSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  blocks: z.object(BLOCK_REGISTRY),
  catalog: FrozenCatalog,
});
export type ReleaseSnapshot = z.infer<typeof ReleaseSnapshotSchema>;
