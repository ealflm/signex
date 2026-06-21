/**
 * Cross-cutting invariant e2e suite — M10 acceptance (Task 77).
 *
 * Proves the foundation's core invariants hold against a LIVE Postgres +
 * booted Nest app:
 *   1. single-PUBLISHED: at most ONE Release.status='PUBLISHED' at any time,
 *      and the PublishedPointer targets it.
 *   2. monotonic + unique version: each publish mints a version strictly
 *      greater than the prior max; `Release.version @unique` is never reused.
 *   3. catalog↔zod roundtrip: the live release snapshot validates against
 *      ReleaseSnapshotSchema and contains ≥4 categories.
 *
 * DB hygiene contract:
 *   - beforeAll: captures the original live release + WorkingState + block data.
 *   - The monotonic test mutates a known real field in a content block's JSON
 *     data (reversible) + bumps WorkingState.revision to force a non-noop publish.
 *   - afterAll: FULL RESTORE — restores block data, WorkingState, deletes all
 *     test-created releases (FK-safe order), restores PublishedPointer to the
 *     original release, re-promotes it to PUBLISHED. The dev DB ends with the
 *     original release PUBLISHED + catalog intact.
 *
 * Gate: skips when DATABASE_URL is unset so the default unit run stays DB-free.
 * Run: npm run test:e2e -w @signex/api -- invariants
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { ReleaseSnapshotSchema } from '@signex/shared';

// Gate: skip the entire suite when there is no real database wired up.
const DESCRIBE = process.env.DATABASE_URL ? describe : describe.skip;

// ── Module-scope state (shared across describe blocks for later tasks) ─────────
let app: INestApplication<App>;
let prisma: PrismaService;
let agent: ReturnType<typeof request.agent>;

/** Snapshot of DB state captured in beforeAll — used in afterAll for restore. */
let originalReleaseId: string;
let originalVersion: number;
let originalWsRevision: number;
let originalWsLastPublished: number;

/**
 * Original raw block data (full JSON from the DB row) for the block we
 * temporarily mutate in the monotonic test to force a checksum change.
 */
let originalBlockData: unknown;

// Compound key for the content block we will temporarily mutate.
const MUTATE_BLOCK = { kind: 'SETTINGS' as const, key: 'businessContact' };

// ── Lifecycle ─────────────────────────────────────────────────────────────────
beforeAll(async () => {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = moduleFixture.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  await app.init();
  prisma = app.get(PrismaService);
  agent = request.agent(app.getHttpServer());

  // Capture the original live release + working state + block data.
  let livePtr = await prisma.client.publishedPointer.findUnique({
    where: { id: 'singleton' },
  });

  // Precondition repair: if previous test suites left no PUBLISHED release
  // (e.g. release-concurrency demotes all to ARCHIVED without re-promoting),
  // restore the highest-version release to PUBLISHED and upsert the pointer.
  // This keeps the single-PUBLISHED invariant test meaningful.
  if (!livePtr) {
    const highest = await prisma.client.release.findFirst({
      orderBy: { version: 'desc' },
    });
    if (highest) {
      await prisma.client.release.update({
        where: { id: highest.id },
        data: { status: 'PUBLISHED' },
      });
      livePtr = await prisma.client.publishedPointer.upsert({
        where: { id: 'singleton' },
        create: {
          id: 'singleton',
          releaseId: highest.id,
          publishedVersion: highest.version,
          publishedById: highest.createdById,
        },
        update: {
          releaseId: highest.id,
          publishedVersion: highest.version,
        },
      });
    }
  }

  if (livePtr) {
    originalReleaseId = livePtr.releaseId;
    originalVersion = livePtr.publishedVersion;
  }

  const ws = await prisma.client.workingState.findUnique({
    where: { id: 'singleton' },
  });
  if (ws) {
    originalWsRevision = ws.revision;
    originalWsLastPublished = ws.lastPublishedRevision;
  }

  const block = await prisma.client.contentBlock.findUnique({
    where: { kind_key: MUTATE_BLOCK },
  });
  if (block) {
    originalBlockData = block.data;
  }

  // Log in as the seeded admin (ADMIN ≥ PUBLISHER) — reuse session via cookie jar.
  await agent
    .post('/api/auth/login')
    .send({
      email: process.env.SEED_ADMIN_EMAIL,
      password: process.env.SEED_ADMIN_PASSWORD,
    })
    .expect(201);
}, 30_000);

afterAll(async () => {
  // ── Full restore so the dev DB ends with the original release PUBLISHED ───────

  // 1. Restore block data mutated by the monotonic test (idempotent — safe to
  //    run even if the test was skipped or didn't mutate the block).
  if (originalBlockData !== undefined) {
    await prisma.client.contentBlock.update({
      where: { kind_key: MUTATE_BLOCK },
      data: { data: originalBlockData as any },
    });
  }

  if (originalVersion !== undefined) {
    // 2. Restore PublishedPointer to the original release FIRST, before
    //    deleting newer releases (RESTRICT FK on releaseId).
    await prisma.client.publishedPointer.update({
      where: { id: 'singleton' },
      data: {
        releaseId: originalReleaseId,
        publishedVersion: originalVersion,
      },
    });

    // 3. Demote any test-created PUBLISHED release back to ARCHIVED so they
    //    can be safely deleted.
    await prisma.client.release.updateMany({
      where: {
        version: { gt: originalVersion },
        status: 'PUBLISHED',
      },
      data: { status: 'ARCHIVED' },
    });

    // 4. Delete ReleaseAssetRef rows referencing test-created releases
    //    (FK: ReleaseAssetRef.releaseId is RESTRICT on Release).
    await prisma.client.releaseAssetRef.deleteMany({
      where: { release: { version: { gt: originalVersion } } },
    });

    // 5. Delete test-created releases (versions > original).
    await prisma.client.release.deleteMany({
      where: { version: { gt: originalVersion } },
    });

    // 6. Re-promote the original release to PUBLISHED (the publish operation
    //    demoted it to ARCHIVED when it created the new release).
    await prisma.client.release.update({
      where: { id: originalReleaseId },
      data: { status: 'PUBLISHED' },
    });
  }

  // 7. Restore WorkingState to pre-test values.
  if (originalWsRevision !== undefined) {
    await prisma.client.workingState.update({
      where: { id: 'singleton' },
      data: {
        revision: originalWsRevision,
        lastPublishedRevision: originalWsLastPublished,
      },
    });
  }

  await app.close();
}, 30_000);

// ── Invariant suite ───────────────────────────────────────────────────────────
DESCRIBE('Schema invariants (e2e)', () => {
  it('single-PUBLISHED: exactly one PUBLISHED release and the pointer targets it', async () => {
    const published = await prisma.client.release.findMany({
      where: { status: 'PUBLISHED' },
    });
    expect(published).toHaveLength(1);
    const pointer = await prisma.client.publishedPointer.findUnique({
      where: { id: 'singleton' },
    });
    expect(pointer).not.toBeNull();
    expect(pointer!.releaseId).toBe(published[0].id);
    expect(pointer!.publishedVersion).toBe(published[0].version);
  });

  it('monotonic version: a publish assigns a version greater than the prior max', async () => {
    const before = await prisma.client.release.findFirst({
      orderBy: { version: 'desc' },
    });

    // Mutate a real field in businessContact so the snapshot checksum changes.
    // businessContactBlock is z.object() (strips, not strict) — we must change
    // an actual field, NOT just an unknown key (which Zod strips before checksum).
    // Append a unique timestamp suffix to taxId; restored to original in afterAll.
    // The timestamp ensures the new checksum never matches any existing release.
    const origData = originalBlockData as Record<string, unknown>;
    const origTaxId = typeof origData.taxId === 'string' ? origData.taxId : '';
    const mutatedData = {
      ...origData,
      taxId: `${origTaxId}-t${Date.now()}`,
    };
    await prisma.client.contentBlock.update({
      where: { kind_key: MUTATE_BLOCK },
      data: { data: mutatedData as any },
    });

    // Bump WorkingState.revision so publish sees dirty state
    // (revision > lastPublishedRevision required for a non-noop publish).
    await prisma.client.workingState.update({
      where: { id: 'singleton' },
      data: { revision: { increment: 1 } },
    });
    const wsNow = await prisma.client.workingState.findUnique({
      where: { id: 'singleton' },
    });

    const res = await agent
      .post('/api/releases/publish')
      .send({ note: 'invariant test', expectedRevision: wsNow!.revision })
      .expect(201);

    // The response body must have a numeric version (not a noop).
    expect(typeof res.body.version).toBe('number');
    expect(res.body.version).toBeGreaterThan(before!.version);

    // DB confirms a new highest-version release was minted.
    const after = await prisma.client.release.findFirst({
      orderBy: { version: 'desc' },
    });
    expect(after!.version).toBe(res.body.version);

    // Single-PUBLISHED invariant still holds after the publish (prev → ARCHIVED).
    const pub = await prisma.client.release.findMany({
      where: { status: 'PUBLISHED' },
    });
    expect(pub).toHaveLength(1);
  });

  it('catalog<->zod roundtrip: the live snapshot validates against ReleaseSnapshotSchema', async () => {
    const live = await prisma.client.release.findFirst({
      where: { status: 'PUBLISHED' },
      orderBy: { version: 'desc' },
    });
    expect(live).not.toBeNull();
    expect(() => ReleaseSnapshotSchema.parse(live!.snapshot)).not.toThrow();
    const parsed = ReleaseSnapshotSchema.parse(live!.snapshot);
    expect(parsed.catalog.categories.length).toBeGreaterThanOrEqual(4);
  });
});
