/**
 * Release concurrency e2e — proves the publish invariant against real Postgres.
 *
 * The `release_version_seq` sequence + the TOCTOU revision-guard inside the
 * short transaction mean two parallel publishes can NEVER produce two releases
 * with the same `version` (`Release.version @unique`).
 *
 * Gated: skips when DATABASE_URL is unset so the default unit run stays DB-free.
 * Run under the docker-backed acceptance lane: `npm run test:e2e -w @signex/api`
 */
import { Test } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { prisma } from '@signex/db';
import { ReleaseService } from '../src/release/release.service';
import { SnapshotSerializer } from '../src/release/snapshot.serializer';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { RevalidationService } from '../src/revalidation/revalidation.service';
import { BLOCK_FIXTURES } from '../src/release/__fixtures__/blocks.fixture';

// Gate: skip the entire suite when there is no real database wired up.
const DESCRIBE = process.env.DATABASE_URL ? describe : describe.skip;

// ── constants ──────────────────────────────────────────────────────────────────
const TEST_USER_EMAIL = 'e2e-concurrency@signex.test';

/**
 * The assetId used by the blocks fixture (hero, nav, meta, notFound).
 * We seed a real Asset row so ReleaseAssetRef FK constraint is satisfied.
 */
const FIXTURE_ASSET_ID = 'clqt5s0000000000000000001';

/** All 12 DB keys matching the registry keys (last dot-segment = registry key). */
const BLOCK_ROWS = Object.entries(BLOCK_FIXTURES).map(([key, data]) => ({
  kind: 'PAGE' as const,
  key: `home.${key}`,
  data,
}));

// ── suite ──────────────────────────────────────────────────────────────────────
DESCRIBE('Release concurrency (integration)', () => {
  let service: ReleaseService;
  let actorId: string;

  beforeAll(async () => {
    // Ensure MEDIA_PUBLIC_BASE passes the publish gate (must not be r2.dev/unset).
    process.env.MEDIA_PUBLIC_BASE = 'https://media.signex.example';

    // Build a minimal NestJS module: real ReleaseService + real DB, but stub
    // RevalidationService (no web server running in the e2e environment).
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReleaseService,
        SnapshotSerializer,
        AuditService,
        { provide: PrismaService, useValue: { client: prisma } },
        {
          provide: RevalidationService,
          useValue: { revalidate: async () => ({ ok: true }) },
        },
      ],
    }).compile();

    service = moduleRef.get(ReleaseService);

    // ── Clean slate ────────────────────────────────────────────────────────────
    // Teardown any leftovers from a previous aborted run, in FK-safe order.
    await prisma.publishedPointer.deleteMany({
      where: { release: { createdBy: { email: { endsWith: '.test' } } } },
    });
    await prisma.releaseAssetRef.deleteMany({
      where: { assetId: FIXTURE_ASSET_ID },
    });
    await prisma.release.deleteMany({
      where: { createdBy: { email: { endsWith: '.test' } } },
    });
    await prisma.session.deleteMany({
      where: { user: { email: { endsWith: '.test' } } },
    });
    await prisma.auditLog.deleteMany({
      where: { user: { email: { endsWith: '.test' } } },
    });
    await prisma.user.deleteMany({
      where: { email: { endsWith: '.test' } },
    });
    await prisma.contentBlock.deleteMany({
      where: { key: { in: BLOCK_ROWS.map((r) => r.key) } },
    });
    await prisma.asset.deleteMany({ where: { id: FIXTURE_ASSET_ID } });

    // ── Seed test user ─────────────────────────────────────────────────────────
    const user = await prisma.user.upsert({
      where: { email: TEST_USER_EMAIL },
      update: {},
      create: {
        email: TEST_USER_EMAIL,
        name: 'E2E Concurrency',
        passwordHash: 'x',
        role: 'ADMIN',
      },
    });
    actorId = user.id;

    // ── Seed a real Asset row so block AssetRef FKs are satisfied ─────────────
    // The blocks fixture uses assetId: 'clqt5s0000000000000000001' for hero,
    // nav, meta, notFound. ReleaseAssetRef has a FK to Asset, so we need a
    // real row. r2Key + sha256 are unique — use values scoped to this test.
    await prisma.asset.upsert({
      where: { id: FIXTURE_ASSET_ID },
      update: {},
      create: {
        id: FIXTURE_ASSET_ID,
        kind: 'IMAGE',
        status: 'READY',
        sha256:
          'e2econcurrencytest0000000000000000000000000000000000000000000001',
        r2Key: 'e2e/concurrency/fixture.png',
        mime: 'image/png',
        bytes: BigInt(1024),
        width: 100,
        height: 100,
        originalName: 'fixture.png',
      },
    });

    // ── Seed ALL 12 ContentBlocks (snapshot serializer requires the full set) ──
    for (const row of BLOCK_ROWS) {
      await prisma.contentBlock.upsert({
        where: { kind_key: { kind: row.kind, key: row.key } },
        update: { data: row.data as any },
        create: { kind: row.kind, key: row.key, data: row.data as any },
      });
    }

    // ── Seed WorkingState singleton — revision=1, lastPublishedRevision=0 ──────
    // revision (1) > lastPublishedRevision (0) → dirty state → publish proceeds.
    await prisma.workingState.upsert({
      where: { id: 'singleton' },
      update: { revision: 1, lastPublishedRevision: 0 },
      create: { id: 'singleton', revision: 1, lastPublishedRevision: 0 },
    });
  });

  afterAll(async () => {
    // ── Full cleanup in FK-safe order ──────────────────────────────────────────
    // PublishedPointer.releaseId RESTRICT — delete pointers before releases.
    await prisma.publishedPointer.deleteMany({
      where: { release: { createdBy: { email: { endsWith: '.test' } } } },
    });
    // ReleaseAssetRef.releaseId RESTRICT — delete asset refs before releases.
    // Also delete ReleaseAssetRef rows that reference our test asset.
    await prisma.releaseAssetRef.deleteMany({
      where: { assetId: FIXTURE_ASSET_ID },
    });
    // Release.createdById RESTRICT — delete releases before users.
    await prisma.release.deleteMany({
      where: { createdBy: { email: { endsWith: '.test' } } },
    });
    // Session CASCADE from User — explicit delete is cleaner.
    await prisma.session.deleteMany({
      where: { user: { email: { endsWith: '.test' } } },
    });
    // AuditLog.userId SET NULL — delete audit entries for test users.
    await prisma.auditLog.deleteMany({
      where: { user: { email: { endsWith: '.test' } } },
    });
    // Remove test user.
    await prisma.user.deleteMany({
      where: { email: { endsWith: '.test' } },
    });
    // Remove seeded content blocks.
    await prisma.contentBlock.deleteMany({
      where: { key: { in: BLOCK_ROWS.map((r) => r.key) } },
    });
    // Remove the seeded fixture asset (no more ReleaseAssetRef rows reference it).
    await prisma.asset.deleteMany({ where: { id: FIXTURE_ASSET_ID } });
    // Reset WorkingState to clean base (revision = lastPublishedRevision = 0).
    await prisma.workingState.upsert({
      where: { id: 'singleton' },
      update: { revision: 0, lastPublishedRevision: 0 },
      create: { id: 'singleton', revision: 0, lastPublishedRevision: 0 },
    });

    await prisma.$disconnect();
  });

  // ── Test 1: parallel publishes — no version collision ───────────────────────
  it('two parallel publishes never collide on version; pointer stays singleton', async () => {
    const actor = { id: actorId } as any;

    // Fire two publishes simultaneously with the same expectedRevision.
    // The Postgres `release_version_seq` sequence guarantees distinct versions
    // even under full concurrency. The KEY invariant: Release.version @unique —
    // no collision / no 500 on duplicate-key violation.
    const results = await Promise.allSettled([
      service.publish(actor, { expectedRevision: 1 }),
      service.publish(actor, { expectedRevision: 1 }),
    ]);

    const published = results.filter(
      (r): r is PromiseFulfilledResult<any> =>
        r.status === 'fulfilled' && r.value.status === 'published',
    );

    // PRIMARY INVARIANT: all minted versions are distinct (sequence guarantee).
    const versions = published.map((r) => r.value.version);
    expect(new Set(versions).size).toBe(versions.length);

    // SECONDARY INVARIANT: at least one publish succeeded.
    expect(published.length).toBeGreaterThanOrEqual(1);

    // SINGLE-PUBLISHED INVARIANT: advisory lock serializes both publishes so the
    // second waits for the first to commit, then demotes the newly-PUBLISHED row
    // before creating its own. Exactly ONE Release.status='PUBLISHED' must exist.
    const publishedCount = await prisma.release.count({
      where: { status: 'PUBLISHED' },
    });
    expect(publishedCount).toBe(1);

    // POINTER INVARIANT: exactly one PublishedPointer singleton at all times.
    // The upsert inside the tx guarantees this regardless of race outcome.
    const pointers = await prisma.publishedPointer.count();
    expect(pointers).toBe(1);

    // The live pointer references the highest minted version.
    const live = await service.getLive();
    expect(live!.version).toBe(Math.max(...versions));

    // Confirm NO version-collision error occurred (no rejected with Prisma unique
    // constraint violation on Release.version). Any rejection should be a
    // ConflictException (stale-draft), NOT a DB unique-key 500.
    const rejections = results.filter((r) => r.status === 'rejected');
    for (const r of rejections as PromiseRejectedResult[]) {
      expect(r.reason).toBeInstanceOf(ConflictException);
    }
  });

  // ── Test 2: stale concurrent edit → exactly one 409 ConflictException ───────
  it('a concurrent stale edit during publish yields at least one 409', async () => {
    const actor = { id: actorId } as any;

    // Advance working state to revision=2 (dirty again for a fresh publish).
    await prisma.workingState.update({
      where: { id: 'singleton' },
      data: { revision: 2 },
    });

    // p1: fresh publish at current revision 2
    // p2: stale publish expecting old revision 1 → must throw ConflictException
    const p1 = service.publish(actor, { expectedRevision: 2 });
    const p2 = service.publish(actor, { expectedRevision: 1 });

    const settled = await Promise.allSettled([p1, p2]);

    const conflicts = settled.filter(
      (r): r is PromiseRejectedResult =>
        r.status === 'rejected' && r.reason instanceof ConflictException,
    );
    // The stale publish (p2) MUST reject — at least one ConflictException.
    expect(conflicts.length).toBeGreaterThanOrEqual(1);
  });
});
