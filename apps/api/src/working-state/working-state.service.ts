import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma } from '@signex/db';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WorkingStateService {
  constructor(private readonly prisma: PrismaService) {}

  async ensure(): Promise<void> {
    await this.prisma.client.workingState.upsert({
      where: { id: 'singleton' },
      update: {},
      create: { id: 'singleton', revision: 0, lastPublishedRevision: 0 },
    });
  }

  async readState(): Promise<{ revision: number; lastPublishedRevision: number }> {
    await this.ensure();
    const row = await this.prisma.client.workingState.findUniqueOrThrow({
      where: { id: 'singleton' },
      select: { revision: true, lastPublishedRevision: true },
    });
    return row;
  }

  /**
   * Optimistic-lock guard. MUST be called inside the caller's tx so the
   * read+bump is atomic with the edit. Returns the new revision.
   */
  async guardAndBump(
    tx: Prisma.TransactionClient,
    expectedRevision: number,
    updatedById?: string,
  ): Promise<number> {
    const current = await tx.workingState.findUnique({
      where: { id: 'singleton' },
      select: { revision: true },
    });
    if (!current || current.revision !== expectedRevision) {
      throw new ConflictException({
        code: 'STALE_DRAFT',
        message: `Working state moved on (expected revision ${expectedRevision}, found ${current?.revision ?? 'none'}).`,
      });
    }
    const next = current.revision + 1;
    await tx.workingState.update({
      where: { id: 'singleton' },
      data: { revision: next, updatedById },
    });
    return next;
  }
}
