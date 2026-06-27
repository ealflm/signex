import { z } from '@signex/shared';

export const saveDraftSchema = z.object({
  edits: z.array(
    z.object({
      key: z.string(),
      data: z.unknown(),
    }),
  ),
  expectedDraftRevision: z.number().int().min(0),
});

export type SaveDraftInput = z.infer<typeof saveDraftSchema>;
