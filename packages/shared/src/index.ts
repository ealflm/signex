import { z } from "zod";

/**
 * @signex/shared — the cross-app content + auth contract.
 * Compiled to CommonJS in dist/ (see package.json "main"/"exports") so the
 * NestJS runtime and the Next apps can require() it. Build with `npm run build`.
 */

/** Placeholder shared identifier type. */
export type ID = string;

/** Placeholder generic API result envelope used across apps. */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Example DTO schema (kept from the original placeholder; the contact form
 * still validates against it).
 */
export const contactMessageSchema = z.object({
  name: z.string().min(1, "name is required"),
  email: z.string().email("must be a valid email"),
  message: z.string().min(1, "message is required"),
});

/** Inferred type for the example DTO. */
export type ContactMessage = z.infer<typeof contactMessageSchema>;

// ===== Content + auth registry (build step 0) =====
export * from "./content/primitives";
export * from "./content/slug";
export * from "./content/assets";
export * from "./content/blocks";
export * from "./content/registry";
export * from "./content/catalog";
export * from "./content/palette";
export * from "./content/palette-style";
export * from "./content/release";
export * from "./content/selector";
export * from "./auth";
export * from "./analytics";
export * from "./edit-mode";

/** Re-export zod so consumers can build/extend schemas without their own dep. */
export { z };
