import { SetMetadata } from '@nestjs/common';
import type { RoleName } from '@signex/shared';

export const ROLES_KEY = 'sx:roles';
export const Roles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);
