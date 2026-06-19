import { z } from "zod";

/**
 * @signex/shared — placeholder shared types + an example zod schema.
 * Compiled to CommonJS in dist/ (see package.json "main"/"exports") so the
 * NestJS runtime can require() it. Build with `npm run build`.
 */

/** Placeholder shared identifier type. */
export type ID = string;

/** Placeholder generic API result envelope used across apps. */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Example DTO schema (proves the zod dependency + import path work).
 * Mirrors a contact-message payload; not wired to any feature yet.
 */
export const contactMessageSchema = z.object({
  name: z.string().min(1, "name is required"),
  email: z.string().email("must be a valid email"),
  message: z.string().min(1, "message is required"),
});

/** Inferred type for the example DTO. */
export type ContactMessage = z.infer<typeof contactMessageSchema>;

/** Re-export zod so consumers can build/extend schemas without their own dep. */
export { z };
