import { Injectable } from '@nestjs/common';
import type { Prisma } from '@signex/db';

export interface AuditEntry {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  meta?: unknown;
}

@Injectable()
export class AuditService {
  async writeAudit(
    tx: Prisma.TransactionClient,
    entry: AuditEntry,
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        meta: entry.meta as Prisma.InputJsonValue | undefined,
      },
    });
  }

  /** Alias for writeAudit — preferred name for new callers. */
  async record(tx: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
    return this.writeAudit(tx, entry);
  }
}
