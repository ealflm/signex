import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { WorkingStateService } from '../working-state/working-state.service';
import { AuditService } from '../audit/audit.service';
import * as shared from '@signex/shared';

jest.mock('@signex/shared', () => ({
  categoryInputSchema: { parse: jest.fn((v) => v) },
  productInputSchema: { parse: jest.fn((v) => v) },
}));

function buildTx() {
  return {
    category: {
      create: jest.fn().mockResolvedValue({ id: 'cat_1' }),
      update: jest.fn().mockResolvedValue({ id: 'cat_1' }),
    },
    product: {
      create: jest.fn().mockResolvedValue({ id: 'prod_1' }),
      update: jest.fn().mockResolvedValue({ id: 'prod_1' }),
    },
    assetRef: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    workingState: {
      findUnique: jest.fn().mockResolvedValue({ revision: 1 }),
      update: jest.fn().mockResolvedValue({ revision: 2 }),
    },
  } as any;
}
function build(tx: any) {
  const prisma = { client: { $transaction: (fn: any) => fn(tx) } } as any;
  return new CatalogService(
    prisma,
    new WorkingStateService(prisma),
    new AuditService(),
  );
}

describe('CatalogService', () => {
  beforeEach(() => {
    shared.categoryInputSchema.parse.mockImplementation((v: any) => v);
    shared.productInputSchema.parse.mockImplementation((v: any) => v);
  });

  it('createCategory validates, creates, reconciles image ref, bumps + audits', async () => {
    const tx = buildTx();
    const svc = build(tx);
    const input = {
      slug: 'pvc',
      sortOrder: 0,
      title: { en: 'PVC', vi: 'PVC' },
      imageId: 'a1',
    };
    const res = await svc.createCategory({ id: 'u1' }, input, 1);
    expect(res).toEqual({ id: 'cat_1', revision: 2 });
    expect(shared.categoryInputSchema.parse).toHaveBeenCalledWith(input);
    expect(tx.category.create).toHaveBeenCalled();
    expect(tx.assetRef.createMany).toHaveBeenCalledWith({
      data: [
        {
          ownerType: 'category',
          ownerId: 'cat_1',
          field: 'image',
          assetId: 'a1',
          alt: undefined,
        },
      ],
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'category.create',
        entityType: 'category',
        entityId: 'cat_1',
      }),
    });
  });

  it('createCategory throws 422 on invalid input (no bump)', async () => {
    shared.categoryInputSchema.parse.mockImplementation(() => {
      const e: any = new Error('bad');
      e.name = 'ZodError';
      e.issues = [];
      throw e;
    });
    const tx = buildTx();
    await expect(
      build(tx).createCategory({ id: 'u' }, {}, 1),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(tx.category.create).not.toHaveBeenCalled();
  });

  it('updateProduct throws 409 when revision is stale', async () => {
    const tx = buildTx();
    tx.workingState.findUnique.mockResolvedValue({ revision: 9 });
    await expect(
      build(tx).updateProduct({ id: 'u' }, 'prod_1', { slug: 'x' }, 1),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('deleteCategory soft-deletes (sets deletedAt) and bumps', async () => {
    const tx = buildTx();
    const svc = build(tx);
    const res = await svc.deleteCategory({ id: 'u1' }, 'cat_1', 1);
    expect(res).toEqual({ revision: 2 });
    expect(tx.category.update).toHaveBeenCalledWith({
      where: { id: 'cat_1' },
      data: { deletedAt: expect.any(Date) },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'category.delete',
        entityType: 'category',
        entityId: 'cat_1',
      }),
    });
  });

  it('createProduct validates, creates, reconciles image ref, bumps + audits', async () => {
    const tx = buildTx();
    const svc = build(tx);
    const input = {
      categoryId: 'cat_1',
      slug: 'prod-a',
      sortOrder: 0,
      title: { en: 'A', vi: 'A' },
      imageId: 'img1',
    };
    const res = await svc.createProduct({ id: 'u1' }, input, 1);
    expect(res).toEqual({ id: 'prod_1', revision: 2 });
    expect(shared.productInputSchema.parse).toHaveBeenCalledWith(input);
    expect(tx.product.create).toHaveBeenCalled();
    expect(tx.assetRef.createMany).toHaveBeenCalledWith({
      data: [
        {
          ownerType: 'product',
          ownerId: 'prod_1',
          field: 'image',
          assetId: 'img1',
          alt: undefined,
        },
      ],
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'product.create',
        entityType: 'product',
        entityId: 'prod_1',
      }),
    });
  });

  it('deleteProduct soft-deletes (sets deletedAt) and bumps', async () => {
    const tx = buildTx();
    const svc = build(tx);
    const res = await svc.deleteProduct({ id: 'u1' }, 'prod_1', 1);
    expect(res).toEqual({ revision: 2 });
    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: 'prod_1' },
      data: { deletedAt: expect.any(Date) },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'product.delete',
        entityType: 'product',
        entityId: 'prod_1',
      }),
    });
  });

  it('updateCategory validates, updates, reconciles image ref, bumps + audits', async () => {
    const tx = buildTx();
    const svc = build(tx);
    const input = {
      slug: 'pvc',
      sortOrder: 1,
      title: { en: 'PVC2', vi: 'PVC2' },
      imageId: 'a2',
      imageAlt: { en: 'alt', vi: 'alt' },
    };
    const res = await svc.updateCategory({ id: 'u1' }, 'cat_1', input, 1);
    expect(res).toEqual({ revision: 2 });
    expect(shared.categoryInputSchema.parse).toHaveBeenCalledWith(input);
    expect(tx.category.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cat_1' } }),
    );
    expect(tx.assetRef.createMany).toHaveBeenCalledWith({
      data: [
        {
          ownerType: 'category',
          ownerId: 'cat_1',
          field: 'image',
          assetId: 'a2',
          alt: { en: 'alt', vi: 'alt' },
        },
      ],
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'category.update',
        entityType: 'category',
        entityId: 'cat_1',
      }),
    });
  });
});
