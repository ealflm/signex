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
  // When true, `palette` (or {} if absent) REPLACES draftSnapshot.palette verbatim instead of being
  // merged — this is how a client-side "reset" can remove previously-saved keys, since the normal
  // merge is additive-only and can never delete a key.
  replacePalette: z.boolean().optional(),
});

export type SaveDraftInput = z.infer<typeof saveDraftSchema>;
