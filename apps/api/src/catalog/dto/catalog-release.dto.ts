import { z } from '@signex/shared';

/**
 * Publish the GLOBAL catalog draft. No themeId — the catalog is global; the
 * optimistic lock is the catalog's own draftRevision.
 */
export const catalogPublishSchema = z.object({
  expectedDraftRevision: z.number().int().nonnegative(),
  note: z.string().max(500).optional(),
});
export type CatalogPublishInput = z.infer<typeof catalogPublishSchema>;

export const catalogRollbackSchema = z.object({
  toVersion: z.number().int().positive(),
});
export type CatalogRollbackInput = z.infer<typeof catalogRollbackSchema>;
