import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@signex/db';
import { CatalogSnapshotSchema, CATALOG_SCHEMA_VERSION } from '@signex/shared';
import { freezeAsset } from '../release/snapshot-assets';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { RevalidationService } from '../revalidation/revalidation.service';
import type { AuthedUser } from '../auth/auth.types';

/** Cache tag the public site reads the catalog under; revalidated on every write. */
export const CATALOG_REVALIDATE_TAG = 'catalog';

/** Shape passed to applyMutation to record the audit entry. */
interface ApplyAuditMeta {
  action: string;
  meta?: unknown;
}

/** Read view of the live global catalog (for the admin catalog editor). */
export interface CatalogView {
  revision: number;
  categories: any[];
}

/**
 * Generates a cuid-v1-compatible id (passes z.string().cuid()).
 * Starts with 'c', followed by base36 timestamp + random suffix.
 */
function mintCuid(): string {
  return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 15);
}

function emptySnapshot(): Prisma.InputJsonValue {
  return {
    catalogSchemaVersion: CATALOG_SCHEMA_VERSION,
    categories: [],
  } as unknown as Prisma.InputJsonValue;
}

/** Validate an asset reference inside an applyMutation tx. */
async function resolveAsset(
  tx: Prisma.TransactionClient,
  imageId: string,
): Promise<{
  id: string;
  r2Key: string;
  mime: string;
  width?: number | null;
  height?: number | null;
  poster?: { r2Key: string } | null;
}> {
  const asset = await tx.asset.findUnique({
    where: { id: imageId },
    select: {
      id: true,
      r2Key: true,
      mime: true,
      width: true,
      height: true,
      poster: { select: { r2Key: true } },
      deletedAt: true,
    },
  });
  if (!asset || (asset as any).deletedAt) {
    throw new UnprocessableEntityException({ code: 'INVALID_ASSET' });
  }
  return asset;
}

export interface CategoryInput {
  slug: string;
  title: unknown;
  tag: unknown;
  intro: unknown;
  productCount: number;
  materialCount: number;
  imageId?: string | null;
  imageAlt?: unknown;
}

export interface ProductInput {
  slug: string;
  title: unknown;
  tag: unknown;
  desc: unknown;
  imageId?: string | null;
  imageAlt?: unknown;
}

/** Flattened product row (for GET /catalog/products — overview + admin lists). */
export interface CatalogProductRow {
  id?: string;
  categoryId?: string;
  categorySlug: string;
  slug: string;
  sortOrder: number;
  title: unknown;
  tag: unknown;
  desc: unknown;
  image?: unknown;
}

/**
 * The GLOBAL catalog is a single LIVE singleton (Magento-OSS style): every CRUD
 * write mutates it in place and is immediately live — there is no draft/publish/
 * release/rollback. This service owns:
 *   - the write primitive `applyMutation` (optimistic lock on `revision`, snapshot
 *     validation, persistence, audit, and cache revalidation so the public site
 *     reflects the change at once),
 *   - CRUD mutators that edit `snap.categories` in place.
 * Catalog images are inline, self-contained FrozenAssets (frozen on write), so
 * there is no separate assets map to reconcile.
 */
@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly revalidation: RevalidationService,
  ) {}

  // ── Write primitive ─────────────────────────────────────────────────────────

  /**
   * Self-heal: the seed/backfill creates the singleton, but a fresh/dev system
   * may not have run it. `upsert` is atomic, so two concurrent first-ever writes
   * can't both race a `create` into a P2002 unique violation.
   */
  private async ensureCatalog() {
    return this.prisma.client.catalog.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', snapshot: emptySnapshot() },
      update: {},
    });
  }

  /**
   * Optimistic-lock guard on the singleton: a single CONDITIONAL atomic bump.
   * Only the row still at `expectedRevision` is touched — a concurrent writer
   * that committed first moves the revision, so the predicate no longer matches
   * and this affects 0 rows → 409 STALE_CATALOG instead of a lost update.
   */
  private async guardAndBump(
    tx: Prisma.TransactionClient,
    expectedRevision: number,
  ): Promise<number> {
    const res = await tx.catalog.updateMany({
      where: { id: 'singleton', revision: expectedRevision },
      data: { revision: { increment: 1 } },
    });

    if (res.count === 0) {
      const exists = await tx.catalog.findUnique({
        where: { id: 'singleton' },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('catalog not found');
      throw new ConflictException('STALE_CATALOG');
    }

    return expectedRevision + 1;
  }

  /**
   * Core catalog mutation — ONE transaction that:
   *   1. guardAndBump (optimistic-lock)
   *   2. clones the snapshot (normalizes shape)
   *   3. calls mutate(snap, tx) — any throw → propagates, no persist
   *   4. CatalogSnapshotSchema backstop (fail → 422 INVALID_SNAPSHOT)
   *   5. persists { snapshot, revision, updatedById }
   *   6. writes audit entry
   * AFTER commit it revalidates the 'catalog' cache tag so the write is live.
   */
  private async applyMutation(
    actor: AuthedUser,
    expectedRevision: number,
    mutate: (snap: any, tx: Prisma.TransactionClient) => void | Promise<void>,
    auditMeta: ApplyAuditMeta,
  ): Promise<{ revision: number }> {
    // Ensure the singleton exists before the guard so a fresh system bumps from 0.
    await this.ensureCatalog();

    const result = await this.prisma.client.$transaction(async (tx) => {
      // 1. Optimistic-lock bump — throws 409 STALE_CATALOG on mismatch.
      const rev = await this.guardAndBump(tx, expectedRevision);

      // 2. Fetch + clone the current snapshot; normalize its shape.
      const row = await tx.catalog.findUniqueOrThrow({
        where: { id: 'singleton' },
        select: { snapshot: true },
      });
      const snap: any = structuredClone(row.snapshot);
      if (snap.catalogSchemaVersion == null) {
        snap.catalogSchemaVersion = CATALOG_SCHEMA_VERSION;
      }
      if (!Array.isArray(snap.categories)) snap.categories = [];

      // 3. Apply the caller's mutation. Any throw aborts (no persist, no bump committed).
      await mutate(snap, tx);

      // 4. Schema backstop — the catalog must stay a valid CatalogSnapshot.
      const parsed = CatalogSnapshotSchema.safeParse(snap);
      if (!parsed.success) {
        throw new UnprocessableEntityException({
          code: 'INVALID_SNAPSHOT',
          issues: parsed.error.issues,
        });
      }

      // 5. Persist snapshot + revision + author atomically.
      await tx.catalog.update({
        where: { id: 'singleton' },
        data: {
          snapshot: snap as unknown as Prisma.InputJsonValue,
          revision: rev,
          updatedById: actor.id,
        },
      });

      // 6. Audit trail.
      await this.audit.record(tx, {
        userId: actor.id,
        action: auditMeta.action,
        entityType: 'catalog',
        entityId: 'singleton',
        meta: auditMeta.meta,
      });

      return { revision: rev };
    });

    // AFTER commit — non-fatal cache revalidation so the public site updates
    // immediately (edit-in-place, no publish step). Never blocks/breaks the write.
    this.revalidation.revalidate({ tags: [CATALOG_REVALIDATE_TAG] }).catch(() => {});

    return result;
  }

  // ── Reads ────────────────────────────────────────────────────────────────

  /** The live catalog (categories + revision) for the admin catalog editor. */
  async getCatalog(): Promise<CatalogView> {
    const c = await this.ensureCatalog();
    const snap = c.snapshot as { categories?: any[] };
    return {
      revision: c.revision,
      categories: Array.isArray(snap?.categories) ? snap.categories : [],
    };
  }

  /** Flat categories list (CatalogItem[] for the overview stat). */
  async listCategories(): Promise<any[]> {
    const c = await this.getCatalog();
    return c.categories;
  }

  /** Flat products list across all categories (CatalogItem[] for the overview stat). */
  async listProducts(): Promise<CatalogProductRow[]> {
    const c = await this.getCatalog();
    const out: CatalogProductRow[] = [];
    for (const cat of c.categories) {
      for (const p of cat.items ?? []) {
        out.push({ ...p, categoryId: cat.id, categorySlug: cat.slug });
      }
    }
    return out;
  }

  // ── Categories ─────────────────────────────────────────────────────────────

  async createCategory(
    actor: AuthedUser,
    expectedRevision: number,
    input: CategoryInput,
  ): Promise<{ id: string; revision: number }> {
    let capturedId = '';

    const result = await this.applyMutation(
      actor,
      expectedRevision,
      async (snap, tx) => {
        const categories: any[] = snap.categories;

        // Slug uniqueness — category slugs are globally unique.
        if (categories.some((c: any) => c.slug === input.slug)) {
          throw new UnprocessableEntityException({ code: 'DUPLICATE_SLUG' });
        }

        // Image validation.
        let image: unknown;
        if (input.imageId) {
          const asset = await resolveAsset(tx, input.imageId);
          image = freezeAsset(asset, input.imageAlt);
        }

        capturedId = mintCuid();
        const sortOrder =
          categories.length > 0
            ? Math.max(...categories.map((c: any) => c.sortOrder)) + 1
            : 0;

        categories.push({
          id: capturedId,
          slug: input.slug,
          sortOrder,
          title: input.title,
          tag: input.tag,
          intro: input.intro,
          productCount: input.productCount,
          materialCount: input.materialCount,
          ...(image ? { image } : {}),
          items: [],
        });
      },
      { action: 'catalog.category.create' },
    );

    return { id: capturedId, revision: result.revision };
  }

  async updateCategory(
    actor: AuthedUser,
    id: string,
    expectedRevision: number,
    input: CategoryInput,
  ): Promise<{ revision: number }> {
    return this.applyMutation(
      actor,
      expectedRevision,
      async (snap, tx) => {
        const categories: any[] = snap.categories;
        const cat = categories.find((c: any) => c.id === id);
        if (!cat) throw new NotFoundException(`Category ${id} not found`);

        // Slug uniqueness — exclude the category being updated.
        if (categories.some((c: any) => c.slug === input.slug && c.id !== id)) {
          throw new UnprocessableEntityException({ code: 'DUPLICATE_SLUG' });
        }

        // Image validation.
        let image: unknown;
        if (input.imageId) {
          const asset = await resolveAsset(tx, input.imageId);
          image = freezeAsset(asset, input.imageAlt);
        }

        Object.assign(cat, {
          slug: input.slug,
          title: input.title,
          tag: input.tag,
          intro: input.intro,
          productCount: input.productCount,
          materialCount: input.materialCount,
        });
        if (image) {
          cat.image = image;
        } else {
          delete cat.image;
        }
      },
      { action: 'catalog.category.update' },
    );
  }

  async deleteCategory(
    actor: AuthedUser,
    id: string,
    expectedRevision: number,
  ): Promise<{ revision: number }> {
    return this.applyMutation(
      actor,
      expectedRevision,
      async (snap) => {
        const categories: any[] = snap.categories;
        const idx = categories.findIndex((c: any) => c.id === id);
        if (idx === -1) throw new NotFoundException(`Category ${id} not found`);
        categories.splice(idx, 1);
      },
      { action: 'catalog.category.delete' },
    );
  }

  async reorderCategories(
    actor: AuthedUser,
    expectedRevision: number,
    order: string[],
  ): Promise<{ revision: number }> {
    return this.applyMutation(
      actor,
      expectedRevision,
      async (snap) => {
        const categories: any[] = snap.categories;
        order.forEach((catId, idx) => {
          const cat = categories.find((c: any) => c.id === catId);
          if (cat) cat.sortOrder = idx;
        });
      },
      { action: 'catalog.categories.reorder' },
    );
  }

  // ── Products ───────────────────────────────────────────────────────────────

  async createProduct(
    actor: AuthedUser,
    categoryId: string,
    expectedRevision: number,
    input: ProductInput,
  ): Promise<{ id: string; revision: number }> {
    let capturedId = '';

    const result = await this.applyMutation(
      actor,
      expectedRevision,
      async (snap, tx) => {
        const categories: any[] = snap.categories;
        const cat = categories.find((c: any) => c.id === categoryId);
        if (!cat) throw new NotFoundException(`Category ${categoryId} not found`);

        const items: any[] = cat.items;

        // Slug uniqueness — product slugs unique within their category.
        if (items.some((p: any) => p.slug === input.slug)) {
          throw new UnprocessableEntityException({ code: 'DUPLICATE_SLUG' });
        }

        // Image validation.
        let image: unknown;
        if (input.imageId) {
          const asset = await resolveAsset(tx, input.imageId);
          image = freezeAsset(asset, input.imageAlt);
        }

        capturedId = mintCuid();
        const sortOrder =
          items.length > 0
            ? Math.max(...items.map((p: any) => p.sortOrder)) + 1
            : 0;

        items.push({
          id: capturedId,
          slug: input.slug,
          sortOrder,
          title: input.title,
          tag: input.tag,
          desc: input.desc,
          ...(image ? { image } : {}),
        });
      },
      { action: 'catalog.product.create' },
    );

    return { id: capturedId, revision: result.revision };
  }

  async updateProduct(
    actor: AuthedUser,
    categoryId: string,
    pid: string,
    expectedRevision: number,
    input: ProductInput,
  ): Promise<{ revision: number }> {
    return this.applyMutation(
      actor,
      expectedRevision,
      async (snap, tx) => {
        const categories: any[] = snap.categories;
        const cat = categories.find((c: any) => c.id === categoryId);
        if (!cat) throw new NotFoundException(`Category ${categoryId} not found`);

        const items: any[] = cat.items;
        const product = items.find((p: any) => p.id === pid);
        if (!product) throw new NotFoundException(`Product ${pid} not found`);

        // Slug uniqueness — exclude the product being updated.
        if (items.some((p: any) => p.slug === input.slug && p.id !== pid)) {
          throw new UnprocessableEntityException({ code: 'DUPLICATE_SLUG' });
        }

        // Image validation.
        let image: unknown;
        if (input.imageId) {
          const asset = await resolveAsset(tx, input.imageId);
          image = freezeAsset(asset, input.imageAlt);
        }

        Object.assign(product, {
          slug: input.slug,
          title: input.title,
          tag: input.tag,
          desc: input.desc,
        });
        if (image) {
          product.image = image;
        } else {
          delete product.image;
        }
      },
      { action: 'catalog.product.update' },
    );
  }

  async deleteProduct(
    actor: AuthedUser,
    categoryId: string,
    pid: string,
    expectedRevision: number,
  ): Promise<{ revision: number }> {
    return this.applyMutation(
      actor,
      expectedRevision,
      async (snap) => {
        const categories: any[] = snap.categories;
        const cat = categories.find((c: any) => c.id === categoryId);
        if (!cat) throw new NotFoundException(`Category ${categoryId} not found`);

        const idx = cat.items.findIndex((p: any) => p.id === pid);
        if (idx === -1) throw new NotFoundException(`Product ${pid} not found`);
        cat.items.splice(idx, 1);
      },
      { action: 'catalog.product.delete' },
    );
  }

  async reorderProducts(
    actor: AuthedUser,
    categoryId: string,
    expectedRevision: number,
    order: string[],
  ): Promise<{ revision: number }> {
    return this.applyMutation(
      actor,
      expectedRevision,
      async (snap) => {
        const categories: any[] = snap.categories;
        const cat = categories.find((c: any) => c.id === categoryId);
        if (!cat) throw new NotFoundException(`Category ${categoryId} not found`);

        order.forEach((pid, idx) => {
          const p = cat.items.find((item: any) => item.id === pid);
          if (p) p.sortOrder = idx;
        });
      },
      { action: 'catalog.products.reorder' },
    );
  }
}
