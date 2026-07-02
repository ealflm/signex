import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@signex/db';
import { freezeAsset } from '../release/snapshot-assets';
import { CatalogDraftService } from './catalog-draft.service';
import type { AuthedUser } from '../auth/auth.types';

/**
 * Generates a cuid-v1-compatible id (passes z.string().cuid()).
 * Starts with 'c', followed by base36 timestamp + random suffix.
 */
function mintCuid(): string {
  return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 15);
}

/** Validate an asset reference inside an applyCatalogMutation tx. */
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
 * CRUD over the GLOBAL catalog draft (CatalogDraft singleton). Every mutation
 * runs through CatalogDraftService.applyCatalogMutation, which owns the
 * optimistic lock, snapshot validation, persistence, and audit. Mutators mutate
 * `snap.categories` (the top-level array of the CatalogSnapshot) in place.
 */
@Injectable()
export class CatalogService {
  constructor(private readonly draft: CatalogDraftService) {}

  // ── Reads ────────────────────────────────────────────────────────────────

  /** The draft categories (with revisions/dirty) for the admin catalog editor. */
  async getDraft() {
    return this.draft.getDraft();
  }

  /** Flat categories list (CatalogItem[] for the overview stat). */
  async listCategories(): Promise<any[]> {
    const d = await this.draft.getDraft();
    return d.categories;
  }

  /** Flat products list across all categories (CatalogItem[] for the overview stat). */
  async listProducts(): Promise<CatalogProductRow[]> {
    const d = await this.draft.getDraft();
    const out: CatalogProductRow[] = [];
    for (const cat of d.categories) {
      for (const p of cat.items ?? []) {
        out.push({ ...p, categoryId: cat.id, categorySlug: cat.slug });
      }
    }
    return out;
  }

  // ── Categories ─────────────────────────────────────────────────────────────

  async createCategory(
    actor: AuthedUser,
    expectedDraftRevision: number,
    input: CategoryInput,
  ): Promise<{ id: string; draftRevision: number }> {
    let capturedId = '';

    const result = await this.draft.applyCatalogMutation(
      actor,
      expectedDraftRevision,
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

    return { id: capturedId, draftRevision: result.draftRevision };
  }

  async updateCategory(
    actor: AuthedUser,
    id: string,
    expectedDraftRevision: number,
    input: CategoryInput,
  ): Promise<{ draftRevision: number }> {
    return this.draft.applyCatalogMutation(
      actor,
      expectedDraftRevision,
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
    expectedDraftRevision: number,
  ): Promise<{ draftRevision: number }> {
    return this.draft.applyCatalogMutation(
      actor,
      expectedDraftRevision,
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
    expectedDraftRevision: number,
    order: string[],
  ): Promise<{ draftRevision: number }> {
    return this.draft.applyCatalogMutation(
      actor,
      expectedDraftRevision,
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
    expectedDraftRevision: number,
    input: ProductInput,
  ): Promise<{ id: string; draftRevision: number }> {
    let capturedId = '';

    const result = await this.draft.applyCatalogMutation(
      actor,
      expectedDraftRevision,
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

    return { id: capturedId, draftRevision: result.draftRevision };
  }

  async updateProduct(
    actor: AuthedUser,
    categoryId: string,
    pid: string,
    expectedDraftRevision: number,
    input: ProductInput,
  ): Promise<{ draftRevision: number }> {
    return this.draft.applyCatalogMutation(
      actor,
      expectedDraftRevision,
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
    expectedDraftRevision: number,
  ): Promise<{ draftRevision: number }> {
    return this.draft.applyCatalogMutation(
      actor,
      expectedDraftRevision,
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
    expectedDraftRevision: number,
    order: string[],
  ): Promise<{ draftRevision: number }> {
    return this.draft.applyCatalogMutation(
      actor,
      expectedDraftRevision,
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
