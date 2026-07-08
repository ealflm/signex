import { z, PaletteSchema } from '@signex/shared';

export const saveDraftSchema = z.object({
  edits: z.array(
    z.object({
      key: z.string(),
      data: z.unknown(),
    }),
  ),
  expectedDraftRevision: z.number().int().min(0),
  palette: PaletteSchema.optional(),
});

export type SaveDraftInput = z.infer<typeof saveDraftSchema>;
