import type { User } from '@signex/db';
import type { RoleName } from '@signex/shared';

export interface AuthedUser {
  id: string;
  email: string;
  name: string;
  role: RoleName;
  isActive: boolean;
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
