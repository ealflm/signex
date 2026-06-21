import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword } from '../common/crypto/password';
import { publicUser, type AuthedUser } from '../auth/auth.types';
import type { RoleName } from '@signex/shared';

interface CreateUserInput {
  email: string;
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

  async create(dto: CreateUserInput): Promise<AuthedUser> {
    try {
      const user = await this.prisma.client.user.create({
        data: {
          email: dto.email,
          name: dto.name,
          passwordHash: await hashPassword(dto.password),
          role: dto.role,
        },
      });
      return publicUser(user);
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        throw new ConflictException('Email already in use');
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateUserInput): Promise<AuthedUser> {
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

  async deactivate(id: string): Promise<AuthedUser> {
    const user = await this.prisma.client.user.update({
      where: { id },
      data: { isActive: false },
    });
    await this.revokeSessions(id);
    return publicUser(user);
  }

  private async revokeSessions(userId: string): Promise<void> {
    await this.prisma.client.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
