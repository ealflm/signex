// apps/web/app/lib/catalog.ts
// PUBLIC catalog read-path. The catalog is its own GLOBAL domain, published
// independently of the content release. It is read straight from Postgres via
// @signex/db (CatalogPublishedPointer → CatalogRelease), validated by the SAME
// zod schema the api wrote it with, and cached under cacheTag('catalog') so a
// catalog Publish (api → /api/revalidate with tags:['catalog']) marks it stale.
// Any Prisma/parse error → INITIAL_CATALOG, so the site never 500s on data.
import "server-only";
import { cacheTag } from "next/cache";
import { prisma } from "@signex/db";
import { CatalogSnapshotSchema, type CatalogSnapshot } from "@signex/shared";
import { INITIAL_CATALOG } from "@/app/lib/initial-catalog";

/**
 * Read the LIVE catalog snapshot (uncached). The content loader calls this
 * INSIDE its own cached unit so the composed page shares one cache entry; a
 * standalone catalog-only consumer should use getPublishedCatalog() instead.
 */
export async function readPublishedCatalog(): Promise<CatalogSnapshot> {
  try {
    const ptr = await prisma.catalogPublishedPointer.findUnique({
      where: { id: "singleton" },
      select: { release: { select: { snapshot: true } } },
    });
    if (!ptr?.release?.snapshot) return INITIAL_CATALOG;
    return CatalogSnapshotSchema.parse(ptr.release.snapshot);
  } catch {
    // ANY Prisma/parse error → last-known-good build constant.
    return INITIAL_CATALOG;
  }
}

/** Cached, catalog-tagged read for standalone consumers (not the composed page). */
export async function getPublishedCatalog(): Promise<CatalogSnapshot> {
  "use cache";
  cacheTag("catalog");
  return readPublishedCatalog();
}
