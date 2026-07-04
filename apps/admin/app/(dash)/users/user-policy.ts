import type { RoleName } from "@signex/shared";

/**
 * UI-side mirror of the api's user guards (`apps/api/src/users/users.service.ts`).
 * The api is the hard gate — these helpers only decide what the row menu offers so a
 * user never *tries* an action the api would reject (self-lockout / last-admin removal).
 */
export interface UserLike {
  id: string;
  role: RoleName;
  isActive: boolean;
}

export function countActiveAdmins(users: UserLike[]): number {
  return users.filter((u) => u.role === "ADMIN" && u.isActive).length;
}

export function isLastActiveAdmin(
  user: UserLike,
  activeAdminCount: number,
): boolean {
  return user.role === "ADMIN" && user.isActive && activeAdminCount <= 1;
}

/** Human reason a Deactivate is disallowed, or null when it's allowed. */
export function deactivateBlockReason(opts: {
  isSelf: boolean;
  lastActiveAdmin: boolean;
}): string | null {
  if (opts.isSelf) return "You can't deactivate your own account.";
  if (opts.lastActiveAdmin) {
    return "This is the last active admin — appoint another admin first.";
  }
  return null;
}
