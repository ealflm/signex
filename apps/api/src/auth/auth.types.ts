import type { User } from '@signex/db';
import type { RoleName } from '@signex/shared';

export interface AuthedUser {
  id: string;
  email: string;
  name: string;
  role: RoleName;
  isActive: boolean;
}

/** Extended public shape for the admin users list (includes audit/display fields). */
export interface PublicUserRow extends AuthedUser {
  lastLoginAt: Date | null;
  createdAt: Date;
}

export function publicUser(u: User): AuthedUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role as RoleName,
    isActive: u.isActive,
  };
}

export function publicUserRow(u: User): PublicUserRow {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role as RoleName,
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt ?? null,
    createdAt: u.createdAt,
  };
}
