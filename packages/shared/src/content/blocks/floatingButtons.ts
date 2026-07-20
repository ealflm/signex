import { z } from "zod";

/**
 * FLOATING BUTTONS — links for the two fixed bottom-right quick-contact buttons
 * (Gọi / Zalo). Locale-invariant scalars (a link is not translated). Both leaves
 * default to "" meaning "fall back to the businessContact phone derivation" (the web
 * resolves that), so the buttons keep working with no config.
 *
 * The top-level `.default({...})` is LOAD-BEARING: ReleaseSnapshotSchema is
 * `blocks: z.object(BLOCK_REGISTRY)`, and the currently-published snapshot predates
 * this block. The default makes Zod fill the missing key on parse, so every existing
 * published + draft snapshot stays valid (no migration, no site-blanking to
 * INITIAL_SNAPSHOT). deriveFields (admin) unwraps ZodDefault, so the form still renders.
 *
 * Permissive `z.string()` (NOT a URL validator): the field accepts a full link OR a
 * bare phone number; the web normalizes and only ever emits http/https/tel/mailto.
 */
export const floatingButtonsBlock = z
  .object({
    callHref: z.string().default(""),
    zaloHref: z.string().default(""),
  })
  .default({ callHref: "", zaloHref: "" });

export type FloatingButtonsBlock = z.infer<typeof floatingButtonsBlock>;
