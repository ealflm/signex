/**
 * Importer e2e — M7 capstone.
 *
 * Runs ImporterService.run() against the live dev Postgres (localhost:3059),
 * stubs R2Service.putObject to a no-op (placeholder R2 creds; no real bucket),
 * and asserts the full post-import DB state + the committed initial-snapshot.ts.
 *
 * R2 stub rationale: register() computes the content-addressed r2Key from the
 * real file bytes' sha256 BEFORE calling putObject, and creates the Asset row
 * with that r2Key + real dims. The snapshot holds r2Keys, not bytes, so it is
 * byte-identical whether putObject really uploads or is a no-op. Byte-serving
 * is a deploy / local-MinIO concern, NOT this task.
 *
 * Clean-DB contract: beforeAll cleans all importer-created tables in FK-safe
 * order, then seeds the system admin (upsert by SYSTEM_USER_ID), making the
 * importer's idempotency guard pass on every re-run.
 *
 * afterAll: leaves the data populated (no teardown) so M8/M9 can use it.
 * Only disconnects Prisma.
 *
 * Gate: skips when DATABASE_URL is unset so the default unit run stays DB-free.
 * Run under the docker-backed acceptance lane:
 *   npm run test:e2e -w @signex/api -- importer.e2e-spec
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { prisma } from '@signex/db';
import { ReleaseSnapshotSchema } from '@signex/shared';
import { ImporterModule } from '../src/importer/importer.module';
import { ImporterService } from '../src/importer/importer.service';
import { R2Service } from '../src/assets/r2.service';
import { canonicalJson } from '../src/importer/snapshot-emit';
import { SYSTEM_USER_ID } from '../src/auth/seed-config';
import { hashPassword } from '../src/common/crypto/password';

// Gate: skip the entire suite when there is no real database wired up.
const DESCRIBE = process.env.DATABASE_URL ? describe : describe.skip;

const repoRoot = join(__dirname, '..', '..', '..');
const SNAP = join(repoRoot, 'apps', 'web', 'app', 'lib', 'initial-snapshot.ts');

/** Fake R2Service: putObject is a no-op — see module-level rationale above. */
const fakeR2 = {
  putObject: async () => undefined,
  presignPut: async () => ({ url: '', headers: {}, expiresIn: 0 }),
  headObject: async () => null,
  getObjectBytes: async () => Buffer.alloc(0),
  publicUrl: (r2Key: string) =>
    `${process.env.MEDIA_PUBLIC_BASE ?? 'https://media.signex.local'}/${r2Key}`,
};

DESCRIBE('importer (e2e)', () => {
  let res: { version: number; releaseId: string; snapshotPath: string };

  beforeAll(async () => {
    // ── Ensure SEED_ADMIN_EMAIL is set (setup-env loads .env; assert here) ────
    if (!process.env.SEED_ADMIN_EMAIL) {
      process.env.SEED_ADMIN_EMAIL = 'admin@signex.local';
    }

    // ── Clean importer-created tables in FK-safe order ────────────────────────
    // PublishedPointer → ReleaseAssetRef → Release → Product → Category →
    // ContentBlock → AssetRef → Asset → WorkingState
    // NOT migrate reset — purely additive Prisma deletes.
    await prisma.publishedPointer.deleteMany({});
    await prisma.releaseAssetRef.deleteMany({});
    await prisma.release.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.contentBlock.deleteMany({});
    // AssetRef.assetId → Asset.id (ON DELETE RESTRICT) — must precede asset.
    await prisma.assetRef.deleteMany({});
    // Null out self-referential poster FK so bulk delete can't hit the self-FK.
    await prisma.$executeRawUnsafe('UPDATE "Asset" SET "posterId" = NULL');
    await prisma.asset.deleteMany({});
    // Reset WorkingState to a clean base (absent = importer creates it fresh).
    await prisma.workingState.deleteMany({});
    // Reset the release_version_seq so the next Release minted is version 1.
    // (Sequence does NOT reset when rows are deleted — must be done explicitly.)
    await prisma.$executeRawUnsafe(
      `ALTER SEQUENCE release_version_seq RESTART WITH 1`,
    );

    // ── Ensure the seeded system admin exists (importer looks up by email) ────
    // hashPassword matches the same scrypt path login verifies.
    const passwordHash = await hashPassword(
      process.env.SEED_ADMIN_PASSWORD ?? 'change-me-please-now',
    );
    await prisma.user.upsert({
      where: { id: SYSTEM_USER_ID },
      create: {
        id: SYSTEM_USER_ID,
        email: process.env.SEED_ADMIN_EMAIL,
        name: process.env.SEED_ADMIN_NAME ?? 'System Admin',
        passwordHash,
        role: 'ADMIN',
        isActive: true,
      },
      update: {
        email: process.env.SEED_ADMIN_EMAIL,
        role: 'ADMIN',
        isActive: true,
      },
    });

    // ── Build a NestJS module: ImporterModule with R2Service stubbed ──────────
    // overrideProvider stubs only putObject so no real R2 / MinIO is required.
    const moduleRef = await Test.createTestingModule({
      imports: [ImporterModule],
    })
      .overrideProvider(R2Service)
      .useValue(fakeR2)
      .compile();

    const svc = moduleRef.get(ImporterService);
    res = await svc.run();
    await moduleRef.close();
  }, 120_000);

  // ── Assertion 1: Release v1 PUBLISHED + PublishedPointer ─────────────────
  it('mints Release v1 PUBLISHED with the PublishedPointer set', async () => {
    expect(res.version).toBe(1);
    const rel = await prisma.release.findUnique({ where: { version: 1 } });
    expect(rel?.status).toBe('PUBLISHED');
    const ptr = await prisma.publishedPointer.findUnique({
      where: { id: 'singleton' },
    });
    expect(ptr?.publishedVersion).toBe(1);
  });

  // ── Assertion 2: 4 categories × 6 products, sortOrder preserved ──────────
  it('seeds 4 categories with 6 products each, sortOrder preserved', async () => {
    const cats = await prisma.category.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { products: true },
    });
    expect(cats).toHaveLength(4);
    expect(cats.map((c) => c.sortOrder)).toEqual([0, 1, 2, 3]);
    for (const c of cats) expect(c.products).toHaveLength(6);
    expect(cats[0].slug).toBe('plastic-logos-emblems');
  });

  // ── Assertion 3: WorkingState bumped once and marked clean ────────────────
  it('bumped WorkingState.revision once and marked clean (lastPublishedRevision == revision)', async () => {
    const ws = await prisma.workingState.findUnique({
      where: { id: 'singleton' },
    });
    expect(ws!.revision).toBe(1);
    expect(ws!.lastPublishedRevision).toBe(1);
  });

  // ── Assertion 4: emitted file byte-equals (canonical) the DB snapshot ─────
  it('emitted initial-snapshot.ts is byte-equal (canonical) to the DB Release v1 snapshot', async () => {
    expect(existsSync(SNAP)).toBe(true);
    const rel = await prisma.release.findUnique({
      where: { version: 1 },
      select: { snapshot: true },
    });
    const dbSnap = ReleaseSnapshotSchema.parse(rel!.snapshot);
    const text = readFileSync(SNAP, 'utf8');
    // Extract the JSON object literal: find the `{` AFTER `INITIAL_SNAPSHOT = `.
    // (The banner contains `import type { ReleaseSnapshot }` which would be
    // found first by a naive indexOf('{'), so we anchor on the export marker.)
    const marker = 'INITIAL_SNAPSHOT = ';
    const start = text.indexOf('{', text.indexOf(marker));
    const json = text.slice(start, text.lastIndexOf('}') + 1);
    const fileSnap = ReleaseSnapshotSchema.parse(JSON.parse(json));
    expect(canonicalJson(fileSnap)).toBe(canonicalJson(dbSnap));
  });

  // ── (Optional) idempotency guard: second run is refused ──────────────────
  it('second run() is refused by the idempotency guard', async () => {
    const moduleRef2 = await Test.createTestingModule({
      imports: [ImporterModule],
    })
      .overrideProvider(R2Service)
      .useValue(fakeR2)
      .compile();
    const svc2 = moduleRef2.get(ImporterService);
    await expect(svc2.run()).rejects.toThrow(
      'importer: content already imported',
    );
    await moduleRef2.close();
  }, 30_000);

  afterAll(async () => {
    // Leave data populated for M8/M9 — only disconnect.
    await prisma.$disconnect();
  });
});
