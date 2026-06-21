import { z } from '@signex/shared';

export const publishSchema = z.object({
  note: z.string().max(500).optional(),
  expectedRevision: z.number().int().nonnegative(),
});
export type PublishInput = z.infer<typeof publishSchema>;

export const rollbackSchema = z.object({
  toVersion: z.number().int().positive(),
  restoreWorkingState: z.boolean().default(false),
});
export type RollbackInput = z.infer<typeof rollbackSchema>;
