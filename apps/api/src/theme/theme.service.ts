import {
  ConflictException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@signex/db';
import {
  BLOCK_REGISTRY,
  parseBlock,
  ReleaseSnapshotSchema,
  type BlockKey,
} from '@signex/shared';
import type { AuthedUser } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { collectAssetIds, freezeAsset } from '../release/snapshot-assets';
import type { SaveDraftInput } from './save-draft.dto';

export interface ThemeListItem {
  id: string;
  name: string;
  draftRevision: number;
  lastPublishedRevision: number;
  dirty: boolean;
  isLive: boolean;
  updatedAt: Date;
}

@Injectable()
export class ThemeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Optimistic-lock guard: re-reads draftRevision inside a transaction,
   * throws ConflictException('STALE_DRAFT') on mismatch, otherwise bumps
   * and persists the new revision and returns it.
   */
  async guardAndBump(
    tx: Prisma.TransactionClient,
    themeId: string,
    expectedDraftRevision: number,
  ): Promise<number> {
    const theme = await tx.theme.findUniqueOrThrow({
      where: { id: themeId },
      select: { draftRevision: true },
    });

    if (theme.draftRevision !== expectedDraftRevision) {
      throw new ConflictException('STALE_DRAFT');
    }

    const newRev = expectedDraftRevision + 1;
    await tx.theme.update({
      where: { id: themeId },
      data: { draftRevision: newRev },
    });
    return newRev;
  }

  async list(): Promise<ThemeListItem[]> {
    const [themes, pointer] = await Promise.all([
      this.prisma.client.theme.findMany({
        select: {
          id: true,
          name: true,
          draftRevision: true,
          lastPublishedRevision: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.client.publishedPointer.findUnique({
        where: { id: 'singleton' },
        select: { release: { select: { themeId: true } } },
      }),
    ]);

    const liveThemeId = pointer?.release?.themeId ?? null;

    return themes.map((t) => ({
      ...t,
      dirty: t.draftRevision !== t.lastPublishedRevision,
      isLive: t.id === liveThemeId,
    }));
  }

  async get(id: string) {
    return this.prisma.client.theme.findUniqueOrThrow({ where: { id } });
  }

  async duplicate(actor: AuthedUser, sourceId: string, name: string) {
    const src = await this.prisma.client.theme.findUniqueOrThrow({
      where: { id: sourceId },
    });

    return this.prisma.client.theme.create({
      data: {
        name,
        draftSnapshot: structuredClone(src.draftSnapshot) as Prisma.InputJsonValue,
        liveSnapshot: null,
        draftRevision: 0,
        lastPublishedRevision: 0,
        createdById: actor.id,
      },
    });
  }

  async rename(id: string, name: string) {
    // P2002 unique-constraint on name → the global PrismaExceptionFilter maps
    // it to 409. We let it propagate; no manual catch needed here.
    return this.prisma.client.theme.update({
      where: { id },
      data: { name },
    });
  }

  async remove(id: string) {
    const pointer = await this.prisma.client.publishedPointer.findUnique({
      where: { id: 'singleton' },
      select: { release: { select: { themeId: true } } },
    });

    if (pointer?.release?.themeId === id) {
      throw new ConflictException('LIVE_THEME');
    }

    return this.prisma.client.theme.delete({ where: { id } });
  }

  async saveDraft(
    actor: AuthedUser,
    themeId: string,
    body: SaveDraftInput,
  ): Promise<{ draftRevision: number }> {
    const { edits, expectedDraftRevision } = body;

    return this.prisma.client.$transaction(async (tx) => {
      // 1. Optimistic-lock bump — throws 409 STALE_DRAFT on mismatch.
      const rev = await this.guardAndBump(tx, themeId, expectedDraftRevision);

      // 2. Fetch the current draft snapshot.
      const theme = await tx.theme.findUniqueOrThrow({
        where: { id: themeId },
        select: { draftSnapshot: true },
      });

      const snap = structuredClone(theme.draftSnapshot) as Record<string, unknown> & {
        blocks: Record<string, unknown>;
        assets: Record<string, unknown>;
      };
      if (!snap.blocks) (snap as any).blocks = {};

      // 3. Apply each edit. Any parse failure aborts (throws 422).
      for (const { key, data } of edits) {
        try {
          if (!(key in BLOCK_REGISTRY)) {
            throw Object.assign(new Error(`Unknown block key: "${key}"`), {
              _unknownBlock: true,
            });
          }
          (snap.blocks as Record<string, unknown>)[key] = parseBlock(
            key as BlockKey,
            data,
          );
        } catch (err: unknown) {
          const e = err as Record<string, unknown> & { message?: string };
          const code = e._unknownBlock ? 'UNKNOWN_BLOCK' : 'INVALID_BLOCK';
          throw new UnprocessableEntityException({
            code,
            key,
            detail: e.message,
          });
        }
      }

      // 4. Reconcile assets: collect every assetId referenced in the snapshot,
      //    fetch rows from the DB, and rebuild snap.assets (prunes orphans).
      const assetIds = collectAssetIds(snap);
      const assetRows = await tx.asset.findMany({
        where: { id: { in: [...assetIds] } },
        select: {
          id: true,
          r2Key: true,
          mime: true,
          width: true,
          height: true,
          poster: { select: { r2Key: true } },
        },
      });
      snap.assets = Object.fromEntries(
        assetRows.map((r) => [r.id, freezeAsset(r)]),
      );

      // 5. Schema backstop — ensures the snapshot is still structurally valid.
      const parsed = ReleaseSnapshotSchema.safeParse(snap);
      if (!parsed.success) {
        throw new UnprocessableEntityException({
          code: 'INVALID_SNAPSHOT',
          issues: parsed.error.issues,
        });
      }

      // 6. Persist snapshot + revision atomically.
      await tx.theme.update({
        where: { id: themeId },
        data: {
          draftSnapshot: snap as unknown as Prisma.InputJsonValue,
          draftRevision: rev,
        },
      });

      // 7. Audit trail.
      await this.audit.record(tx, {
        userId: actor.id,
        action: 'theme.savedraft',
        entityType: 'theme',
        entityId: themeId,
        meta: { keys: edits.map((e) => e.key) },
      });

      return { draftRevision: rev };
    });
  }
}
