import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword } from '../common/crypto/password';
import { SYSTEM_USER_ID, type SeedAdminConfig } from './seed-config';

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotently creates/repairs the fixed SYSTEM/ADMIN user.
   * - id is the deterministic SYSTEM_USER_ID (never reassigned on update).
   * - role/isActive are re-asserted so a demoted/deactivated system user heals.
   * - password is hashed with the shared scrypt hasher (same one login verifies).
   * Returns created:true only when the row was newly inserted (createdAt === updatedAt).
   */
  async seedAdmin(
    cfg: SeedAdminConfig,
  ): Promise<{ id: string; created: boolean }> {
    const passwordHash = await hashPassword(cfg.password);
    const fields = {
      username: cfg.username,
      name: cfg.name,
      passwordHash,
      role: 'ADMIN' as const,
      isActive: true,
    };

    const user = await this.prisma.client.user.upsert({
      where: { id: SYSTEM_USER_ID },
      create: { id: SYSTEM_USER_ID, ...fields },
      update: { ...fields },
      select: { id: true, createdAt: true, updatedAt: true },
    });

    const created = user.createdAt.getTime() === user.updatedAt.getTime();
    this.logger.log(
      `${created ? 'Created' : 'Updated'} system admin ${cfg.username} (${user.id})`,
    );
    return { id: user.id, created };
  }
}
