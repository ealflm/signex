import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Prisma, Release, User } from '@signex/db';
import { ReleaseSnapshotSchema } from '@signex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RevalidationService } from '../revalidation/revalidation.service';
import { canonicalJson } from './canonical-json';
import { collectAssetIds } from './snapshot-assets';
import type { PublishInput } from './dto/release.dto';

const SCHEMA_VERSION = 1;

/**
 * Application-scoped advisory lock key for the publish/rollback critical section.
 * pg_advisory_xact_lock(key) serializes concurrent publish/rollback transactions
 * so only one runs at a time — ensuring the single-PUBLISHED invariant holds even
 * under READ COMMITTED (the Postgres default). The lock is auto-released at
 * transaction commit or rollback.
 *
 * Key: 0x163AB (91051 decimal) — stable, arbitrary, app-wide constant.
 */
const RELEASE_LOCK_KEY = 91051;

export type PublishResult =
  | { status: 'noop' }
  | { status: 'published'; version: number; releaseId: string };

@Injectable()
export class ReleaseService {
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

  async publish(actor: User, input: PublishInput): Promise<PublishResult> {
    // 0. GATE
    this.assertMediaBaseConfigured();

    // 1. Read theme and parse snapshot OUTSIDE the tx
    const theme = await this.prisma.client.theme.findUniqueOrThrow({
      where: { id: input.themeId },
    });
    const parsed = ReleaseSnapshotSchema.parse(theme.draftSnapshot);
    // The catalog is now its own global, independently-published domain. Strip it
    // from the content release so the content checksum, asset pins, and frozen
    // snapshot all EXCLUDE catalog (catalog images are pinned by
    // CatalogReleaseAssetRef, and the web reads the catalog from its own pointer).
    const snapshot = { ...parsed };
    delete snapshot.catalog;
    const checksum = createHash('sha256')
      .update(canonicalJson(snapshot))
      .digest('hex');
    const assetIds = [...collectAssetIds(snapshot)];

    // 2. Stale revision check (pre-tx fast fail)
    if (input.expectedDraftRevision !== theme.draftRevision) {
      throw new ConflictException('STALE_DRAFT');
    }

    // 3. Gated no-op: same theme + same checksum → nothing changed
    const live = await this.prisma.client.publishedPointer.findUnique({
      where: { id: 'singleton' },
      include: { release: { select: { themeId: true, checksum: true } } },
    });
    if (
      live?.release?.themeId === input.themeId &&
      live.release.checksum === checksum
    ) {
      return { status: 'noop' };
    }

    // 4. SHORT tx — revision guard + sequence version + writes
    const result = await this.prisma.client.$transaction(
      async (tx) => {
        // Serialize concurrent publish/rollback operations: only one critical
        // section runs at a time. The second publish waits here until the first
        // commits, then re-reads the demoted PUBLISHED → single-PUBLISHED invariant.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${RELEASE_LOCK_KEY})`;

        // TOCTOU guard: re-read theme.draftRevision inside tx
        const themeNow = await tx.theme.findUniqueOrThrow({
          where: { id: input.themeId },
        });
        if (themeNow.draftRevision !== input.expectedDraftRevision) {
          throw new ConflictException('STALE_DRAFT');
        }

        // In-lock dedup: if the same theme+checksum was already published by a
        // concurrent request (which committed while we were waiting for the lock),
        // the second request no-ops here rather than minting a duplicate release.
        const liveAfterLock = await tx.publishedPointer.findUnique({
          where: { id: 'singleton' },
          include: { release: { select: { themeId: true, checksum: true } } },
        });
        if (
          liveAfterLock?.release?.themeId === input.themeId &&
          liveAfterLock.release.checksum === checksum
        ) {
          return null; // noop — sibling already published identical state
        }

        // Monotonic version from Postgres sequence (NEVER max+1)
        const seq = await tx.$queryRaw<Array<{ nextval: bigint }>>`
          SELECT nextval('release_version_seq')`;
        const version = Number(seq[0].nextval);

        // Demote current published release → ARCHIVED
        await tx.release.updateMany({
          where: { status: 'PUBLISHED' },
          data: { status: 'ARCHIVED' },
        });

        // Create the new Release
        const release = await tx.release.create({
          data: {
            version,
            status: 'PUBLISHED',
            label: null,
            note: input.note ?? null,
            snapshot: snapshot as unknown as Prisma.InputJsonValue,
            checksum,
            schemaVersion: SCHEMA_VERSION,
            themeId: input.themeId,
            fromRevision: theme.draftRevision,
            createdById: actor.id,
            publishedById: actor.id,
            publishedAt: new Date(),
          },
        });

        // Repoint the PublishedPointer singleton
        await tx.publishedPointer.upsert({
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

        // Pin the assets referenced by this release (GC safety)
        if (assetIds.length > 0) {
          await tx.releaseAssetRef.createMany({
            data: assetIds.map((assetId) => ({
              releaseId: release.id,
              assetId,
            })),
            skipDuplicates: true,
          });
        }

        // Freeze live snapshot + bookkeeping on the theme itself
        await tx.theme.update({
          where: { id: input.themeId },
          data: {
            liveSnapshot: snapshot as unknown as Prisma.InputJsonValue,
            lastPublishedRevision: theme.draftRevision,
            lastPublishedChecksum: checksum,
          },
        });

        // Audit
        await this.audit.record(tx as unknown as Prisma.TransactionClient, {
          userId: actor.id,
          action: 'release.publish',
          entityType: 'release',
          entityId: release.id,
          meta: { version },
        });

        return { version, releaseId: release.id };
      },
      { timeout: 10000, maxWait: 5000 },
    );

    // null means the in-lock dedup caught a concurrent duplicate mint.
    if (result === null) {
      return { status: 'noop' };
    }

    // 5. AFTER commit — non-fatal revalidation (failure must NOT roll back)
    await this.revalidation.revalidate({}).catch(() => {
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
    input: { toVersion: number },
  ): Promise<{ version: number; releaseId: string }> {
    this.assertMediaBaseConfigured();

    const result = await this.prisma.client.$transaction(
      async (tx) => {
        // Serialize rollback vs concurrent publish/rollback — same lock as publish.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${RELEASE_LOCK_KEY})`;

        const target = await tx.release.findUniqueOrThrow({
          where: { version: input.toVersion },
          include: { assetRefs: { select: { assetId: true } } },
        });

        const seq = await tx.$queryRaw<Array<{ nextval: bigint }>>`
          SELECT nextval('release_version_seq')`;
        const version = Number(seq[0].nextval);

        await tx.release.updateMany({
          where: { status: 'PUBLISHED' },
          data: { status: 'ARCHIVED' },
        });

        const release = await tx.release.create({
          data: {
            version,
            status: 'PUBLISHED',
            label: null,
            note: `rollback to v${input.toVersion}`,
            snapshot: target.snapshot as Prisma.InputJsonValue,
            checksum: target.checksum,
            schemaVersion: SCHEMA_VERSION,
            fromRevision: 0,
            rolledBackFromVersion: input.toVersion,
            createdById: actor.id,
            publishedById: actor.id,
            publishedAt: new Date(),
          },
        });

        await tx.publishedPointer.upsert({
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
          await tx.releaseAssetRef.createMany({
            data: assetIds.map((assetId: string) => ({
              releaseId: release.id,
              assetId,
            })),
            skipDuplicates: true,
          });
        }

        await this.audit.record(tx as unknown as Prisma.TransactionClient, {
          userId: actor.id,
          action: 'release.rollback',
          entityType: 'release',
          entityId: release.id,
          meta: { toVersion: input.toVersion, version },
        });

        return { version, releaseId: release.id };
      },
      { timeout: 10000, maxWait: 5000 },
    );

    // AFTER commit — non-fatal revalidation
    this.revalidation.revalidate({}).catch(() => {
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
    const live = await this.prisma.client.publishedPointer.findUnique({
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

  async listReleases(): Promise<Release[]> {
    return this.prisma.client.release.findMany({
      orderBy: { version: 'desc' },
    });
  }

  async getByVersion(version: number): Promise<Release | null> {
    return this.prisma.client.release.findUnique({ where: { version } });
  }
}
