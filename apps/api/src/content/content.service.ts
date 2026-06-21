import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import type { BlockKind, Prisma } from '@signex/db';
import { parseBlock } from '@signex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { WorkingStateService } from '../working-state/working-state.service';
import { AuditService } from '../audit/audit.service';
import { collectAssetRefs } from './asset-ref.util';
import { reconcileAssetRefs } from '../catalog/asset-ref.reconcile';

function ownerId(kind: BlockKind, key: string): string {
  return `${kind}:${key}`;
}

function isZodError(e: unknown): e is { name: string; issues: unknown } {
  return typeof e === 'object' && e !== null && (e as { name?: string }).name === 'ZodError';
}

@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workingState: WorkingStateService,
    private readonly audit: AuditService,
  ) {}

  async getBlock(kind: BlockKind, key: string): Promise<unknown> {
    const row = await this.prisma.client.contentBlock.findUnique({
      where: { kind_key: { kind, key } },
      select: { data: true },
    });
    return row?.data ?? null;
  }

  async updateBlock(
    actor: { id: string },
    kind: BlockKind,
    key: string,
    data: unknown,
    expectedRevision: number,
  ): Promise<{ revision: number }> {
    // Validate by (kind, key) via the shared registry BEFORE opening the tx so
    // an invalid block never bumps revision.
    let validated: unknown;
    try {
      validated = parseBlock(kind, key, data);
    } catch (e) {
      if (isZodError(e)) {
        throw new UnprocessableEntityException({
          code: 'INVALID_BLOCK',
          message: `Block ${kind}:${key} failed validation`,
          issues: (e as { issues: unknown }).issues,
        });
      }
      throw e;
    }

    return this.prisma.client.$transaction(async (tx) => {
      // (1) Optimistic lock — guard first so stale edit 409s before any write.
      const revision = await this.workingState.guardAndBump(tx, expectedRevision, actor.id);

      // (2) Upsert the ContentBlock by (kind, key).
      const block = await tx.contentBlock.upsert({
        where: { kind_key: { kind, key } },
        create: { kind, key, data: validated as Prisma.InputJsonValue },
        update: { data: validated as Prisma.InputJsonValue },
      });

      // (3) Rebuild the AssetRef cache for this block.
      await reconcileAssetRefs(tx, 'contentBlock', ownerId(kind, key), collectAssetRefs(validated));

      // (4) Write the audit row.
      await this.audit.writeAudit(tx, {
        userId: actor.id,
        action: 'content.update',
        entityType: 'contentBlock',
        entityId: ownerId(kind, key),
        meta: { kind, key, blockId: block.id },
      });

      return { revision };
    });
  }
}
