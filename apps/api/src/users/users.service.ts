import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword } from '../common/crypto/password';
import {
  publicUser,
  publicUserRow,
  type AuthedUser,
  type PublicUserRow,
} from '../auth/auth.types';
import type { RoleName } from '@signex/shared';

interface CreateUserInput {
  username: string;
  name: string;
  password: string;
  role: RoleName;
}
interface UpdateUserInput {
  name?: string;
  role?: RoleName;
  isActive?: boolean;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<PublicUserRow[]> {
    const rows = await this.prisma.client.user.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(publicUserRow);
  }

  async create(dto: CreateUserInput): Promise<AuthedUser> {
    try {
      const user = await this.prisma.client.user.create({
        data: {
          username: dto.username,
          name: dto.name,
          passwordHash: await hashPassword(dto.password),
          role: dto.role,
        },
      });
      return publicUser(user);
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        throw new ConflictException('Username already in use');
      }
      throw err;
    }
  }

  async update(
    id: string,
    dto: UpdateUserInput,
    actingUserId: string,
  ): Promise<AuthedUser> {
    // Business invariants (the api is the hard gate — the admin UI only mirrors these):
    // you can't lock yourself out, and the site can't be left with no active admin.
    if (dto.isActive === false) this.assertNotSelf(id, actingUserId);
    if (dto.isActive === false || this.isDemotion(dto.role)) {
      await this.assertNotLastActiveAdmin(id);
    }

    const user = await this.prisma.client.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    // Role change (possible demote) or deactivation => revoke live sessions (instant kill).
    if (dto.role !== undefined || dto.isActive === false) {
      await this.revokeSessions(id);
    }
    return publicUser(user);
  }

  async deactivate(id: string, actingUserId: string): Promise<AuthedUser> {
    this.assertNotSelf(id, actingUserId);
    await this.assertNotLastActiveAdmin(id);

    const user = await this.prisma.client.user.update({
      where: { id },
      data: { isActive: false },
    });
    await this.revokeSessions(id);
    return publicUser(user);
  }

  /** Deactivating your own account would instantly sign you out with no way back in. */
  private assertNotSelf(id: string, actingUserId: string): void {
    if (id === actingUserId) {
      throw new ConflictException('You cannot deactivate your own account');
    }
  }

  private isDemotion(role?: RoleName): boolean {
    return role !== undefined && role !== 'ADMIN';
  }

  /**
   * Guard the site's last remaining active admin: refuse to deactivate or demote them.
   * No-op when the target isn't an active admin (nothing to protect).
   */
  private async assertNotLastActiveAdmin(id: string): Promise<void> {
    const target = await this.prisma.client.user.findUnique({ where: { id } });
    if (!target || target.role !== 'ADMIN' || !target.isActive) return;
    const activeAdmins = await this.prisma.client.user.count({
      where: { role: 'ADMIN', isActive: true },
    });
    if (activeAdmins <= 1) {
      throw new ConflictException(
        'Cannot deactivate or demote the last active admin',
      );
    }
  }

  private async revokeSessions(userId: string): Promise<void> {
    await this.prisma.client.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
