import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '@signex/db';
import { categoryInputSchema, productInputSchema } from '@signex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { WorkingStateService } from '../working-state/working-state.service';
import { AuditService } from '../audit/audit.service';
import { reconcileAssetRefs } from './asset-ref.reconcile';
import type { CollectedRef } from '../content/asset-ref.util';

function isZodError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { name?: string }).name === 'ZodError';
}

function validate<T>(schema: { parse: (v: unknown) => T }, raw: unknown, what: string): T {
  try {
    return schema.parse(raw);
  } catch (e) {
    if (isZodError(e)) {
      throw new UnprocessableEntityException({
        code: 'INVALID_INPUT',
        message: `${what} failed validation`,
        issues: (e as { issues: unknown }).issues,
      });
    }
    throw e;
  }
}

/**
 * Build a single-element CollectedRef array for an entity's image field.
 * Returns [] when there is no imageId (no ref to reconcile).
 */
function imageRef(imageId?: string | null, imageAlt?: unknown): CollectedRef[] {
  if (!imageId) return [];
  return [{ field: 'image', assetId: imageId, alt: imageAlt }];
}

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workingState: WorkingStateService,
    private readonly audit: AuditService,
  ) {}

  // ── Category ──────────────────────────────────────────────────────────────

  async createCategory(
    actor: { id: string },
    input: unknown,
    expectedRevision: number,
  ): Promise<{ id: string; revision: number }> {
    const data = validate(categoryInputSchema, input, 'Category');
    return this.prisma.client.$transaction(async (tx) => {
      const revision = await this.workingState.guardAndBump(tx, expectedRevision, actor.id);
      const row = await tx.category.create({ data: data as unknown as Prisma.CategoryUncheckedCreateInput });
      await reconcileAssetRefs(tx, 'category', row.id, imageRef(data.imageId, data.imageAlt));
      await this.audit.writeAudit(tx, {
        userId: actor.id,
        action: 'category.create',
        entityType: 'category',
        entityId: row.id,
      });
      return { id: row.id, revision };
    });
  }

  async updateCategory(
    actor: { id: string },
    id: string,
    input: unknown,
    expectedRevision: number,
  ): Promise<{ revision: number }> {
    const data = validate(categoryInputSchema, input, 'Category');
    return this.prisma.client.$transaction(async (tx) => {
      const revision = await this.workingState.guardAndBump(tx, expectedRevision, actor.id);
      await tx.category.update({ where: { id }, data: data as unknown as Prisma.CategoryUncheckedUpdateInput });
      await reconcileAssetRefs(tx, 'category', id, imageRef(data.imageId, data.imageAlt));
      await this.audit.writeAudit(tx, {
        userId: actor.id,
        action: 'category.update',
        entityType: 'category',
        entityId: id,
      });
      return { revision };
    });
  }

  async deleteCategory(
    actor: { id: string },
    id: string,
    expectedRevision: number,
  ): Promise<{ revision: number }> {
    return this.prisma.client.$transaction(async (tx) => {
      const revision = await this.workingState.guardAndBump(tx, expectedRevision, actor.id);
      await tx.category.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.writeAudit(tx, {
        userId: actor.id,
        action: 'category.delete',
        entityType: 'category',
        entityId: id,
      });
      return { revision };
    });
  }

  // ── Product ───────────────────────────────────────────────────────────────

  async createProduct(
    actor: { id: string },
    input: unknown,
    expectedRevision: number,
  ): Promise<{ id: string; revision: number }> {
    const data = validate(productInputSchema, input, 'Product');
    return this.prisma.client.$transaction(async (tx) => {
      const revision = await this.workingState.guardAndBump(tx, expectedRevision, actor.id);
      const row = await tx.product.create({ data: data as unknown as Prisma.ProductUncheckedCreateInput });
      await reconcileAssetRefs(tx, 'product', row.id, imageRef(data.imageId, data.imageAlt));
      await this.audit.writeAudit(tx, {
        userId: actor.id,
        action: 'product.create',
        entityType: 'product',
        entityId: row.id,
      });
      return { id: row.id, revision };
    });
  }

  async updateProduct(
    actor: { id: string },
    id: string,
    input: unknown,
    expectedRevision: number,
  ): Promise<{ revision: number }> {
    const data = validate(productInputSchema, input, 'Product');
    return this.prisma.client.$transaction(async (tx) => {
      const revision = await this.workingState.guardAndBump(tx, expectedRevision, actor.id);
      await tx.product.update({ where: { id }, data: data as unknown as Prisma.ProductUncheckedUpdateInput });
      await reconcileAssetRefs(tx, 'product', id, imageRef(data.imageId, data.imageAlt));
      await this.audit.writeAudit(tx, {
        userId: actor.id,
        action: 'product.update',
        entityType: 'product',
        entityId: id,
      });
      return { revision };
    });
  }

  async deleteProduct(
    actor: { id: string },
    id: string,
    expectedRevision: number,
  ): Promise<{ revision: number }> {
    return this.prisma.client.$transaction(async (tx) => {
      const revision = await this.workingState.guardAndBump(tx, expectedRevision, actor.id);
      await tx.product.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.writeAudit(tx, {
        userId: actor.id,
        action: 'product.delete',
        entityType: 'product',
        entityId: id,
      });
      return { revision };
    });
  }
}
