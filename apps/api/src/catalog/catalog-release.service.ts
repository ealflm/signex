import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { CatalogRelease, Prisma, User } from '@signex/db';
import { CatalogSnapshotSchema, CATALOG_SCHEMA_VERSION } from '@signex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RevalidationService } from '../revalidation/revalidation.service';
import { canonicalJson } from '../release/canonical-json';
import { collectAssetIds } from '../release/snapshot-assets';
import type {
  CatalogPublishInput,
  CatalogRollbackInput,
} from './dto/catalog-release.dto';

/**
 * Next.js cache tag the web read-path tags the published catalog with (M-G).
 * Publishing/rolling back the catalog revalidates ONLY this tag, so the catalog
 * ships independently of the content release (tag 'release').
 */
export const CATALOG_REVALIDATE_TAG = 'catalog';

/**
 * Advisory lock key for the catalog publish/rollback critical section —
 * DISTINCT from the content release lock (91051) so a content publish and a
 * catalog publish never serialize against each other. 0x163AC (91052 decimal).
 */
const CATALOG_RELEASE_LOCK_KEY = 91052;

export type CatalogPublishResult =
  | { status: 'noop' }
  | { status: 'published'; version: number; releaseId: string };

/**
 * The catalog-domain release engine — the twin of ReleaseService, but on the
 * CatalogDraft / CatalogRelease / CatalogPublishedPointer tables and gated only
 * by the catalog's own draftRevision (no theme). Catalog images are inline in
 * the snapshot, so assetRefs are pinned purely for asset-delete GC safety.
 */
@Injectable()
export class CatalogReleaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly revalidation: RevalidationService,
    private readonly audit: AuditService,
  ) {}

  private assertMediaBaseConfigured(): void {
    const base = process.env.MEDIA_PUBLIC_BASE;
    if (!base || base.includes('r2.dev')) {
      throw new ServiceUnavailableException(
        'MEDIA_PUBLIC_BASE not configured for publish',
      );
    }
  }

  async publish(
    actor: User,
    input: CatalogPublishInput,
  ): Promise<CatalogPublishResult> {
    // 0. GATE
    this.assertMediaBaseConfigured();

    // 1. Read draft + validate/serialize OUTSIDE the tx.
    const draft = await this.prisma.client.catalogDraft.findUniqueOrThrow({
      where: { id: 'singleton' },
    });
    const snapshot = CatalogSnapshotSchema.parse(draft.draftSnapshot);
    const checksum = createHash('sha256')
      .update(canonicalJson(snapshot))
      .digest('hex');
    const assetIds = [...collectAssetIds(snapshot)];

    // 2. Stale revision check (pre-tx fast fail).
    if (input.expectedDraftRevision !== draft.draftRevision) {
      throw new ConflictException('STALE_DRAFT');
    }

    // 3. Gated no-op: the live catalog already has this exact checksum.
    const live = await this.prisma.client.catalogPublishedPointer.findUnique({
      where: { id: 'singleton' },
      include: { release: { select: { checksum: true } } },
    });
    if (live?.release?.checksum === checksum) {
      return { status: 'noop' };
    }

    // 4. SHORT tx — lock + revision guard + sequence version + writes.
    const result = await this.prisma.client.$transaction(
      async (tx) => {
        // Serialize concurrent catalog publish/rollback.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CATALOG_RELEASE_LOCK_KEY})`;

        // TOCTOU guard: re-read draftRevision inside the tx.
        const draftNow = await tx.catalogDraft.findUniqueOrThrow({
          where: { id: 'singleton' },
        });
        if (draftNow.draftRevision !== input.expectedDraftRevision) {
          throw new ConflictException('STALE_DRAFT');
        }

        // In-lock dedup: a sibling may have published identical bytes while we
        // waited for the lock.
        const liveAfterLock =
          await tx.catalogPublishedPointer.findUnique({
            where: { id: 'singleton' },
            include: { release: { select: { checksum: true } } },
          });
        if (liveAfterLock?.release?.checksum === checksum) {
          return null; // noop — sibling already published identical state
        }

        // Monotonic version from the catalog sequence (NEVER max+1).
        const seq = await tx.$queryRaw<Array<{ nextval: bigint }>>`
          SELECT nextval('catalog_release_version_seq')`;
        const version = Number(seq[0].nextval);

        // Demote current published catalog release → ARCHIVED.
        await tx.catalogRelease.updateMany({
          where: { status: 'PUBLISHED' },
          data: { status: 'ARCHIVED' },
        });

        const release = await tx.catalogRelease.create({
          data: {
            version,
            status: 'PUBLISHED',
            label: null,
            note: input.note ?? null,
            snapshot: snapshot as unknown as Prisma.InputJsonValue,
            checksum,
            schemaVersion: CATALOG_SCHEMA_VERSION,
            fromRevision: draft.draftRevision,
            createdById: actor.id,
            publishedById: actor.id,
            publishedAt: new Date(),
          },
        });

        // Repoint the CatalogPublishedPointer singleton.
        await tx.catalogPublishedPointer.upsert({
          where: { id: 'singleton' },
          create: {
            id: 'singleton',
            releaseId: release.id,
            publishedVersion: version,
            publishedById: actor.id,
          },
          update: {
            releaseId: release.id,
            publishedVersion: version,
            publishedById: actor.id,
            publishedAt: new Date(),
          },
        });

        // Pin the assets referenced by this catalog release (GC safety).
        if (assetIds.length > 0) {
          await tx.catalogReleaseAssetRef.createMany({
            data: assetIds.map((assetId) => ({ releaseId: release.id, assetId })),
            skipDuplicates: true,
          });
        }

        // Freeze live snapshot + bookkeeping on the draft (clean after publish).
        await tx.catalogDraft.update({
          where: { id: 'singleton' },
          data: {
            liveSnapshot: snapshot as unknown as Prisma.InputJsonValue,
            lastPublishedRevision: draft.draftRevision,
            lastPublishedChecksum: checksum,
          },
        });

        await this.audit.record(tx, {
          userId: actor.id,
          action: 'catalog.release.publish',
          entityType: 'catalogRelease',
          entityId: release.id,
          meta: { version },
        });

        return { version, releaseId: release.id };
      },
      { timeout: 10000, maxWait: 5000 },
    );

    if (result === null) {
      return { status: 'noop' };
    }

    // 5. AFTER commit — non-fatal revalidation of ONLY the catalog tag.
    await this.revalidation
      .revalidate({ tags: [CATALOG_REVALIDATE_TAG] })
      .catch(() => {
        /* non-fatal: published release stands; reFire() can retry */
      });

    return {
      status: 'published',
      version: result.version,
      releaseId: result.releaseId,
    };
  }

  async rollback(
    actor: User,
    input: CatalogRollbackInput,
  ): Promise<{ version: number; releaseId: string }> {
    this.assertMediaBaseConfigured();

    const result = await this.prisma.client.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CATALOG_RELEASE_LOCK_KEY})`;

        const target = await tx.catalogRelease.findUniqueOrThrow({
          where: { version: input.toVersion },
          include: { assetRefs: { select: { assetId: true } } },
        });

        const seq = await tx.$queryRaw<Array<{ nextval: bigint }>>`
          SELECT nextval('catalog_release_version_seq')`;
        const version = Number(seq[0].nextval);

        await tx.catalogRelease.updateMany({
          where: { status: 'PUBLISHED' },
          data: { status: 'ARCHIVED' },
        });

        const release = await tx.catalogRelease.create({
          data: {
            version,
            status: 'PUBLISHED',
            label: null,
            note: `rollback to v${input.toVersion}`,
            snapshot: target.snapshot as Prisma.InputJsonValue,
            checksum: target.checksum,
            schemaVersion: CATALOG_SCHEMA_VERSION,
            fromRevision: 0,
            rolledBackFromVersion: input.toVersion,
            createdById: actor.id,
            publishedById: actor.id,
            publishedAt: new Date(),
          },
        });

        await tx.catalogPublishedPointer.upsert({
          where: { id: 'singleton' },
          create: {
            id: 'singleton',
            releaseId: release.id,
            publishedVersion: version,
            publishedById: actor.id,
          },
          update: {
            releaseId: release.id,
            publishedVersion: version,
            publishedById: actor.id,
            publishedAt: new Date(),
          },
        });

        const assetIds = target.assetRefs.map(
          (r: { assetId: string }) => r.assetId,
        );
        if (assetIds.length > 0) {
          await tx.catalogReleaseAssetRef.createMany({
            data: assetIds.map((assetId: string) => ({
              releaseId: release.id,
              assetId,
            })),
            skipDuplicates: true,
          });
        }

        await this.audit.record(tx, {
          userId: actor.id,
          action: 'catalog.release.rollback',
          entityType: 'catalogRelease',
          entityId: release.id,
          meta: { toVersion: input.toVersion, version },
        });

        return { version, releaseId: release.id };
      },
      { timeout: 10000, maxWait: 5000 },
    );

    this.revalidation
      .revalidate({ tags: [CATALOG_REVALIDATE_TAG] })
      .catch(() => {
        /* non-fatal */
      });

    return result;
  }

  async getLive(): Promise<{
    version: number;
    checksum: string;
    publishedAt: Date;
    snapshot: unknown;
  } | null> {
    const live = await this.prisma.client.catalogPublishedPointer.findUnique({
      where: { id: 'singleton' },
      include: {
        release: {
          select: {
            version: true,
            checksum: true,
            publishedAt: true,
            snapshot: true,
          },
        },
      },
    });
    if (!live) return null;
    return {
      version: live.release.version,
      checksum: live.release.checksum,
      publishedAt: live.release.publishedAt as Date,
      snapshot: live.release.snapshot,
    };
  }

  async listReleases(): Promise<CatalogRelease[]> {
    return this.prisma.client.catalogRelease.findMany({
      orderBy: { version: 'desc' },
    });
  }

  async getByVersion(version: number): Promise<CatalogRelease | null> {
    return this.prisma.client.catalogRelease.findUnique({ where: { version } });
  }
}
