import 'dotenv/config';
import { prisma, type Prisma } from '@signex/db';
import { CatalogSnapshotSchema, CATALOG_SCHEMA_VERSION } from '@signex/shared';

/**
 * One-time (idempotent) bootstrap: seed the live Catalog singleton from the
 * CURRENT LIVE catalog, so the global live catalog starts life exactly matching
 * what the site already serves.
 *
 * Deploy order (after migrations), on a fresh install:
 *   auth:seed  →  importer (content v1)  →  catalog:backfill (<-- THIS)
 *
 * Idempotent: if the Catalog singleton already exists, it exits without touching
 * anything — safe to re-run on every deploy.
 */
async function main(): Promise<void> {
  // Idempotency guard — the live catalog is already initialized.
  const existing = await prisma.catalog.findUnique({
    where: { id: 'singleton' },
  });
  if (existing) {
    console.log(
      `catalog:backfill skipped — live Catalog already exists (revision ${existing.revision}).`,
    );
    return;
  }

  // Source of truth for the catalog categories: the LIVE THEME's draft catalog
  // (Theme.draftSnapshot.catalog), falling back to the live release snapshot.
  // Tolerant read of just the catalog slice — validated on write.
  const livePointer = await prisma.publishedPointer.findUnique({
    where: { id: 'singleton' },
    include: {
      release: { select: { snapshot: true, themeId: true, createdById: true } },
    },
  });

  let categories: unknown[] = [];
  const themeId = livePointer?.release?.themeId;
  if (themeId) {
    const theme = await prisma.theme.findUnique({
      where: { id: themeId },
      select: { draftSnapshot: true },
    });
    const themeSnap = theme?.draftSnapshot as
      | { catalog?: { categories?: unknown[] } }
      | undefined;
    categories = themeSnap?.catalog?.categories ?? [];
  }
  if (categories.length === 0) {
    const relSnap = livePointer?.release?.snapshot as
      | { catalog?: { categories?: unknown[] } }
      | undefined;
    categories = relSnap?.catalog?.categories ?? [];
  }

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

  // Build + validate the standalone catalog snapshot (rejects a malformed live catalog).
  const snapshot = CatalogSnapshotSchema.parse({
    catalogSchemaVersion: CATALOG_SCHEMA_VERSION,
    categories,
  });
  const json = snapshot as unknown as Prisma.InputJsonValue;

  await prisma.catalog.create({
    data: {
      id: 'singleton',
      snapshot: json,
      revision: 0,
      updatedById: actorId,
    },
  });

  const products = snapshot.categories.reduce(
    (n, c) => n + (c.items?.length ?? 0),
    0,
  );
  console.log(
    `catalog:backfill done — live Catalog seeded ` +
      `(${snapshot.categories.length} categories, ${products} products).`,
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
