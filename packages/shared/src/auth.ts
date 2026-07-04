import { z } from "zod";

/** The three RBAC roles, ordered ascending by privilege. */
export const ROLE_NAMES = ["EDITOR", "PUBLISHER", "ADMIN"] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

/** Ordered rank for `atLeast` comparisons (EDITOR=1 < PUBLISHER=2 < ADMIN=3). */
export const ROLE_RANK: Record<RoleName, number> = {
  EDITOR: 1,
  PUBLISHER: 2,
  ADMIN: 3,
};

/** True iff `role` is at least as privileged as `min`. */
export const atLeast = (role: RoleName, min: RoleName): boolean =>
  ROLE_RANK[role] >= ROLE_RANK[min];

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,30}$/, "3-30 chars: letters, digits, . _ -");

export const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const createUserSchema = z.object({
  username: usernameSchema,
  name: z.string().min(1),
  password: z.string().min(8),
  role: z.enum(ROLE_NAMES).default("EDITOR"),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;
