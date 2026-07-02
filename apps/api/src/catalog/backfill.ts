import 'dotenv/config';
import { createHash } from 'node:crypto';
import { prisma, type Prisma } from '@signex/db';
import { CatalogSnapshotSchema, CATALOG_SCHEMA_VERSION } from '@signex/shared';
import { canonicalJson } from '../release/canonical-json';
import { collectAssetIds } from '../release/snapshot-assets';

/**
 * One-time (idempotent) backfill: mint CatalogRelease v1 + seed the CatalogDraft
 * singleton from the CURRENT LIVE catalog, so the new global catalog domain
 * starts life exactly matching what the site already serves — the cutover is a
 * no-op for visitors.
 *
 * Deploy order (spec §5b), after the M-B migration is deployed:
 *   auth:seed  →  importer (content v1)  →  catalog:backfill (<-- THIS)
 *
 * Idempotent: if a CatalogPublishedPointer already exists, it exits without
 * touching anything — safe to re-run on every deploy.
 */
async function main(): Promise<void> {
  // Idempotency guard — the catalog domain is already initialized.
  const existing = await prisma.catalogPublishedPointer.findUnique({
    where: { id: 'singleton' },
  });
  if (existing) {
    console.log(
      `catalog:backfill skipped — CatalogPublishedPointer already LIVE at v${existing.publishedVersion}`,
    );
    return;
  }

  // v1 source of truth: the categories embedded in the LIVE content release.
  // Tolerant read of just the catalog slice — blocks/assets are irrelevant here,
  // and the live snapshot was already validated when it was published.
  const livePointer = await prisma.publishedPointer.findUnique({
    where: { id: 'singleton' },
    include: { release: { select: { snapshot: true, createdById: true } } },
  });
  const liveSnap = livePointer?.release?.snapshot as
    | { catalog?: { categories?: unknown[] } }
    | undefined;
  const categories: unknown[] = liveSnap?.catalog?.categories ?? [];

  // Actor: the live release's author, else the first ADMIN. Fail loudly if none.
  let actorId = livePointer?.release?.createdById;
  if (!actorId) {
    const admin = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      orderBy: { createdAt: 'asc' },
    });
    actorId = admin?.id;
  }
  if (!actorId) {
    throw new Error(
      'no actor user found (need a live release author or an ADMIN) — run auth:seed first',
    );
  }
  const author: string = actorId;

  // Build + validate the standalone catalog snapshot (rejects a malformed live catalog).
  const snapshot = CatalogSnapshotSchema.parse({
    catalogSchemaVersion: CATALOG_SCHEMA_VERSION,
    categories,
  });
  const checksum = createHash('sha256')
    .update(canonicalJson(snapshot))
    .digest('hex');
  const assetIds = [...collectAssetIds(snapshot)];
  const json = snapshot as unknown as Prisma.InputJsonValue;

  const result = await prisma.$transaction(async (tx) => {
    const seq = await tx.$queryRaw<Array<{ nextval: bigint }>>`
      SELECT nextval('catalog_release_version_seq')`;
    const version = Number(seq[0].nextval);

    const release = await tx.catalogRelease.create({
      data: {
        version,
        status: 'PUBLISHED',
        label: 'v1 (backfill)',
        note: 'Seeded from the live content release at catalog-domain cutover.',
        snapshot: json,
        checksum,
        schemaVersion: CATALOG_SCHEMA_VERSION,
        fromRevision: 0,
        createdById: author,
        publishedById: author,
        publishedAt: new Date(),
      },
    });

    await tx.catalogPublishedPointer.create({
      data: {
        id: 'singleton',
        releaseId: release.id,
        publishedVersion: version,
        publishedById: author,
      },
    });

    if (assetIds.length > 0) {
      await tx.catalogReleaseAssetRef.createMany({
        data: assetIds.map((assetId) => ({ releaseId: release.id, assetId })),
        skipDuplicates: true,
      });
    }

    // Seed the editable draft = live so it starts CLEAN (not dirty).
    await tx.catalogDraft.upsert({
      where: { id: 'singleton' },
      create: {
        id: 'singleton',
        draftSnapshot: json,
        liveSnapshot: json,
        draftRevision: 0,
        lastPublishedRevision: 0,
        lastPublishedChecksum: checksum,
        updatedById: author,
      },
      update: {
        draftSnapshot: json,
        liveSnapshot: json,
        lastPublishedRevision: 0,
        lastPublishedChecksum: checksum,
        updatedById: author,
      },
    });

    return { version, releaseId: release.id };
  });

  const products = snapshot.categories.reduce(
    (n, c) => n + (c.items?.length ?? 0),
    0,
  );
  console.log(
    `catalog:backfill done — CatalogRelease v${result.version} LIVE ` +
      `(${snapshot.categories.length} categories, ${products} products, ${assetIds.length} asset pins); ` +
      `CatalogDraft seeded clean (checksum ${checksum.slice(0, 12)}…).`,
  );
}

main()
  .catch((err: unknown) => {
    console.error(`catalog:backfill failed: ${(err as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
