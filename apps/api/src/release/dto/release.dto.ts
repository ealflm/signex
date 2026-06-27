import { z } from '@signex/shared';

export const publishSchema = z.object({
  themeId: z.string(),
  expectedDraftRevision: z.number().int().nonnegative(),
  note: z.string().max(500).optional(),
});
export type PublishInput = z.infer<typeof publishSchema>;

export const rollbackSchema = z.object({
  toVersion: z.number().int().positive(),
  restoreWorkingState: z.boolean().default(false),
});
export type RollbackInput = z.infer<typeof rollbackSchema>;
