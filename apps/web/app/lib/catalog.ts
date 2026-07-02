// apps/web/app/lib/catalog.ts
// PUBLIC catalog read-path. The catalog is its own GLOBAL, LIVE domain (no
// draft/publish/release). It is read straight from Postgres via @signex/db (the
// Catalog singleton), validated by the SAME zod schema the api wrote it with,
// and cached under cacheTag('catalog') so any catalog edit (api → /api/revalidate
// with tags:['catalog']) marks it stale. Any Prisma/parse error → INITIAL_CATALOG,
// so the site never 500s on data.
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
    const row = await prisma.catalog.findUnique({
      where: { id: "singleton" },
      select: { snapshot: true },
    });
    if (!row?.snapshot) return INITIAL_CATALOG;
    return CatalogSnapshotSchema.parse(row.snapshot);
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
