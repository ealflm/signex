import { Injectable, Logger } from '@nestjs/common';
import { join } from 'node:path';
import type { ReleaseSnapshot } from '@signex/shared';
import { ReleaseSnapshotSchema } from '@signex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AssetsService } from '../assets/assets.service';
import { ReleaseService } from '../release/release.service';
import { loadDicts, resolveRepoRoot } from './dict-source';
import { assertParity } from './parity';
import { importAssets } from './asset-importer';
import { buildCatalog } from './catalog-builder';
import { buildBlocks } from './block-builder';
import { emitInitialSnapshot } from './snapshot-emit';

/**
 * Stable advisory lock key for the importer's exclusive session lock.
 * Distinct from the release engine's pg_advisory_xact_lock key (91051).
 * Session-scoped: acquired at start, released in the finally block.
 */
const IMPORTER_ADVISORY_LOCK_KEY = 728_173;

@Injectable()
export class ImporterService {
  private readonly logger = new Logger(ImporterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly assets: AssetsService,
    private readonly release: ReleaseService,
  ) {}

  async run(): Promise<{
    version: number;
    releaseId: string;
    snapshotPath: string;
  }> {
    const db = this.prisma.client;

    // ── 1. EXCLUSIVE SESSION ADVISORY LOCK ─────────────────────────────────
    // Session-scoped (not xact): survives Prisma's internal txn wrapping.
    // A second concurrent import attempt fails fast here.
    const lockRows = (await db.$queryRawUnsafe(
      `SELECT pg_try_advisory_lock(${IMPORTER_ADVISORY_LOCK_KEY}) as pg_try_advisory_lock`,
    )) as Array<{ pg_try_advisory_lock: boolean }>;

    if (!lockRows[0]?.pg_try_advisory_lock) {
      throw new Error(
        'importer: advisory lock held — another import is already running',
      );
    }

    try {
      // ── 2. IDEMPOTENCY GUARD ──────────────────────────────────────────────
      // If a Release row already exists, the content was already imported.
      // Proceeding would hit unique constraints (release_version_seq v1 already used).
      const existingCount = await db.release.count({});
      if (existingCount > 0) {
        throw new Error(
          'importer: content already imported — a Release row exists; refusing to double-import',
        );
      }

      // ── 3. LOAD DICTS + ASSERT PARITY ────────────────────────────────────
      const { en, vi } = loadDicts();
      assertParity(en, vi);

      // ── 4. SYSTEM ACTOR ──────────────────────────────────────────────────
      const actorEmail = process.env.SEED_ADMIN_EMAIL;
      if (!actorEmail) {
        throw new Error(
          'importer: SEED_ADMIN_EMAIL is not set — run auth:seed first',
        );
      }
      const actor = await db.user.findUniqueOrThrow({
        where: { email: actorEmail },
      });

      // ── 5. ASSETS (dedup by sha256, outside the persist tx) ──────────────
      // importAssets uses AssetsService.register which handles sha256, R2 upload,
      // and Asset row creation. FK constraint: assets must exist before catalog rows.
      const assetMap = await importAssets({ assets: this.assets });

      // ── 6. BUILD ROWS ─────────────────────────────────────────────────────
      const catalog = buildCatalog(en, vi, assetMap);
      const blocks = buildBlocks(en, vi, assetMap);

      // ── 7. PERSIST IN ONE TRANSACTION (single revision bump) ──────────────
      // FK order: categories → products (FK categoryId), then contentBlocks,
      // then workingState (revision bump). All in ONE tx → one revision increment.
      await db.$transaction(async (tx) => {
        for (const c of catalog.categories) {
          const cat = await tx.category.create({
            data: {
              slug: c.slug,
              sortOrder: c.sortOrder,
              title: c.title as object,
              tag: c.tag as object,
              intro: c.intro as object,
              productCount: c.productCount,
              materialCount: c.materialCount,
              imageId: c.imageId,
            },
          });
          for (const p of c.items) {
            await tx.product.create({
              data: {
                categoryId: cat.id,
                slug: p.slug,
                sortOrder: p.sortOrder,
                title: p.title as object,
                tag: p.tag as object,
                desc: p.desc as object,
                imageId: p.imageId,
              },
            });
          }
        }

        for (const b of blocks) {
          await tx.contentBlock.upsert({
            where: { kind_key: { kind: b.kind, key: b.key } },
            create: { kind: b.kind, key: b.key, data: b.data as object },
            update: { data: b.data as object },
          });
        }

        // Single revision bump — upsert creates with revision=1 if absent,
        // or increments by 1 if it somehow already exists.
        await tx.workingState.upsert({
          where: { id: 'singleton' },
          create: {
            id: 'singleton',
            revision: 1,
            lastPublishedRevision: 0,
            updatedById: actor.id,
          },
          update: {
            revision: { increment: 1 },
            updatedById: actor.id,
          },
        });
      });

      // ── 8. READ BACK REVISION FOR PUBLISH ─────────────────────────────────
      // Must read the COMMITTED revision (post-tx) — publish uses expectedRevision
      // as a TOCTOU guard inside its own transaction.
      const ws = await db.workingState.findUnique({
        where: { id: 'singleton' },
      });
      const expectedRevision = ws!.revision;

      // ── 9. MINT RELEASE v1 ─────────────────────────────────────────────────
      const publishResult = await this.release.publish(actor as any, {
        note: 'Initial content import (v1)',
        expectedRevision,
      });

      if (publishResult.status !== 'published') {
        throw new Error(
          `importer: release.publish returned "${publishResult.status}" — not published; ` +
            'content may already be published or checksum matches existing release',
        );
      }

      const { version, releaseId } = publishResult;

      // ── 10. READ SNAPSHOT FROM THE COMMITTED RELEASE ROW ──────────────────
      // publish() does NOT return the snapshot — we read it from the Release row.
      // This is the authoritative source; emitting from it guarantees byte-equality.
      const relRow = await db.release.findUniqueOrThrow({
        where: { id: releaseId },
      });
      const snapshot = ReleaseSnapshotSchema.parse(relRow.snapshot);

      // ── 11. EMIT WEB FALLBACK ──────────────────────────────────────────────
      const snapshotPath = this.emitSnapshot(snapshot);
      this.logger.log(
        `importer: minted Release v${version} (${releaseId}); emitted ${snapshotPath}`,
      );

      return { version, releaseId, snapshotPath };
    } finally {
      // Release the session advisory lock regardless of success/failure.
      await db
        .$queryRawUnsafe(
          `SELECT pg_advisory_unlock(${IMPORTER_ADVISORY_LOCK_KEY})`,
        )
        .catch(() => {
          /* best-effort unlock — session close also releases it */
        });
    }
  }

  /**
   * Private seam: writes apps/web/app/lib/initial-snapshot.ts.
   * Extracted so unit tests can spy on it without touching the filesystem.
   */
  private emitSnapshot(snapshot: ReleaseSnapshot): string {
    const out = join(
      resolveRepoRoot(),
      'apps',
      'web',
      'app',
      'lib',
      'initial-snapshot.ts',
    );
    emitInitialSnapshot(snapshot, out);
    return out;
  }
}
