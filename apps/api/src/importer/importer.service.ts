import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { Prisma, User } from '@signex/db';
import type { ReleaseSnapshot } from '@signex/shared';
import { ReleaseSnapshotSchema } from '@signex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AssetsService } from '../assets/assets.service';
import { ReleaseService } from '../release/release.service';
import { canonicalJson } from '../release/canonical-json';
import { collectAssetIds, freezeAsset } from '../release/snapshot-assets';
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

/**
 * Generates a cuid-v1-compatible id (passes z.string().cuid()).
 * Matches CatalogService.mintCuid so importer-minted catalog ids look identical
 * to ids minted by the live create-category/create-product write path.
 */
function mintCuid(): string {
  return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 15);
}

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
      // ── 2. IDEMPOTENCY GUARD ────────────────────────────────────────────
      // The themes model stores all content inside Theme.draftSnapshot. If any
      // Theme already exists, content was already imported — refuse to re-seed.
      const existingThemes = await db.theme.count({});
      if (existingThemes > 0) {
        throw new Error(
          'importer: a Theme already exists — content already imported; refusing to double-import',
        );
      }

      // ── 3. LOAD DICTS + ASSERT PARITY ───────────────────────────────────
      const { en, vi } = loadDicts();
      assertParity(en, vi);

      // ── 4. SYSTEM ACTOR ─────────────────────────────────────────────────
      const actorEmail = process.env.SEED_ADMIN_EMAIL;
      if (!actorEmail) {
        throw new Error(
          'importer: SEED_ADMIN_EMAIL is not set — run auth:seed first',
        );
      }
      const actor = await db.user.findUniqueOrThrow({
        where: { email: actorEmail },
      });

      // ── 5. ASSETS (dedup by sha256) ─────────────────────────────────────
      // importAssets uses AssetsService.register (sha256, SVG sanitize, R2 put,
      // READY Asset row). Asset rows must exist before we freeze them below.
      const assetMap = await importAssets({ assets: this.assets });

      // ── 6. BUILD BLOCKS + CATALOG ROWS ──────────────────────────────────
      const builtBlocks = buildBlocks(en, vi, assetMap);
      const catalogRows = buildCatalog(en, vi, assetMap);

      // ── 7. ASSEMBLE THE RELEASE SNAPSHOT IN MEMORY (no content tables) ──
      // blocks: the 12 registry-keyed blocks → { [key]: data }.
      const blocks = Object.fromEntries(
        builtBlocks.map((b) => [b.key, b.data]),
      );

      // Collect every assetId referenced by blocks + catalog images.
      const assetIds = collectAssetIds(blocks);
      for (const c of catalogRows.categories) {
        assetIds.add(c.imageId);
        for (const p of c.items) assetIds.add(p.imageId);
      }

      // Resolve the referenced Asset rows and freeze them (mirrors how
      // ThemeService.applyDraftMutation rebuilds snap.assets).
      const assetRows = await db.asset.findMany({
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
      const byId = new Map(assetRows.map((r) => [r.id, r]));
      const assets = Object.fromEntries(
        assetRows.map((r) => [r.id, freezeAsset(r)]),
      );

      // catalog: FrozenCategory[] — mint a cuid id per category/product node
      // (matching CatalogService) and inline the frozen image.
      const catalog = {
        categories: catalogRows.categories.map((c) => {
          const cImg = byId.get(c.imageId);
          return {
            id: mintCuid(),
            slug: c.slug,
            sortOrder: c.sortOrder,
            title: c.title,
            tag: c.tag,
            intro: c.intro,
            productCount: c.productCount,
            materialCount: c.materialCount,
            ...(cImg ? { image: freezeAsset(cImg) } : {}),
            items: c.items.map((p) => {
              const pImg = byId.get(p.imageId);
              return {
                id: mintCuid(),
                slug: p.slug,
                sortOrder: p.sortOrder,
                title: p.title,
                tag: p.tag,
                desc: p.desc,
                ...(pImg ? { image: freezeAsset(pImg) } : {}),
              };
            }),
          };
        }),
      };

      // Schema gate — throws ZodError loudly if anything doesn't conform.
      const snapshot = ReleaseSnapshotSchema.parse({
        schemaVersion: 1,
        blocks,
        catalog,
        assets,
      });
      const checksum = createHash('sha256')
        .update(canonicalJson(snapshot))
        .digest('hex');

      // ── 8. MINT THE DEFAULT THEME (draft == live snapshot) ──────────────
      const theme = await db.theme.create({
        data: {
          name: 'Default',
          draftSnapshot: snapshot as unknown as Prisma.InputJsonValue,
          liveSnapshot: snapshot as unknown as Prisma.InputJsonValue,
          draftRevision: 1,
          lastPublishedRevision: 1,
          lastPublishedChecksum: checksum,
          createdById: actor.id,
        },
      });

      // ── 9. MINT RELEASE v1 (publish the Default theme's draft) ──────────
      const publishResult = await this.release.publish(actor as User, {
        themeId: theme.id,
        expectedDraftRevision: 1,
        note: 'Initial content import (v1)',
      });

      if (publishResult.status !== 'published') {
        throw new Error(
          `importer: release.publish returned "${publishResult.status}" — not published; ` +
            'content may already be published or checksum matches existing release',
        );
      }

      const { version, releaseId } = publishResult;

      // ── 10. READ SNAPSHOT BACK FROM THE COMMITTED RELEASE ROW ───────────
      // Emitting from the authoritative Release row guarantees byte-equality
      // with what the web read-path will serve.
      const relRow = await db.release.findUniqueOrThrow({
        where: { id: releaseId },
      });
      const releaseSnapshot = ReleaseSnapshotSchema.parse(relRow.snapshot);

      // ── 11. EMIT WEB FALLBACK ────────────────────────────────────────────
      const snapshotPath = this.emitSnapshot(releaseSnapshot);
      this.logger.log(
        `importer: minted Default theme (${theme.id}) + Release v${version} (${releaseId}); emitted ${snapshotPath}`,
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
