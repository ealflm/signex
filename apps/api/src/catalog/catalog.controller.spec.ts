import { CatalogController } from './catalog.controller';

describe('CatalogController (global live catalog)', () => {
  const actor = { id: 'u1' } as any;

  const service = {
    getCatalog: jest.fn().mockResolvedValue({ revision: 1, categories: [] }),
    listCategories: jest.fn().mockResolvedValue([{ id: 'c1' }]),
    listProducts: jest.fn().mockResolvedValue([{ id: 'p1', categorySlug: 'c' }]),
    createCategory: jest.fn().mockResolvedValue({ id: 'c1', revision: 2 }),
    updateCategory: jest.fn().mockResolvedValue({ revision: 3 }),
    deleteCategory: jest.fn().mockResolvedValue({ revision: 4 }),
    reorderCategories: jest.fn().mockResolvedValue({ revision: 3 }),
    createProduct: jest.fn().mockResolvedValue({ id: 'p1', revision: 5 }),
    updateProduct: jest.fn().mockResolvedValue({ revision: 6 }),
    deleteProduct: jest.fn().mockResolvedValue({ revision: 7 }),
    reorderProducts: jest.fn().mockResolvedValue({ revision: 6 }),
  } as any;

  const ctrl = new CatalogController(service);

  it('getCatalog delegates to the service (no themeId)', async () => {
    const result = await ctrl.getCatalog();
    expect(result).toMatchObject({ revision: 1, categories: [] });
    expect(service.getCatalog).toHaveBeenCalledWith();
  });

  it('listCategories + listProducts delegate to the service', async () => {
    expect(await ctrl.listCategories()).toEqual([{ id: 'c1' }]);
    expect(await ctrl.listProducts()).toEqual([{ id: 'p1', categorySlug: 'c' }]);
  });

  it('createCategory delegates with actor + input (no themeId)', async () => {
    const body = {
      expectedRevision: 1,
      slug: 'pvc',
      title: { en: 'PVC', vi: 'PVC' },
      tag: { en: 'T', vi: 'T' },
      intro: { en: 'I', vi: 'I' },
      productCount: 0,
      materialCount: 0,
    };
    const result = await ctrl.createCategory(body as any, actor);
    expect(result).toEqual({ id: 'c1', revision: 2 });
    expect(service.createCategory).toHaveBeenCalledWith(actor, 1, {
      slug: 'pvc',
      title: { en: 'PVC', vi: 'PVC' },
      tag: { en: 'T', vi: 'T' },
      intro: { en: 'I', vi: 'I' },
      productCount: 0,
      materialCount: 0,
    });
  });

  it('updateCategory passes id + input', async () => {
    const body = {
      expectedRevision: 2,
      slug: 'pvc-v2',
      title: { en: 'PVC v2', vi: 'PVC v2' },
      tag: { en: 'T', vi: 'T' },
      intro: { en: 'I', vi: 'I' },
      productCount: 1,
      materialCount: 1,
    };
    await ctrl.updateCategory('c1', body as any, actor);
    expect(service.updateCategory).toHaveBeenCalledWith(
      actor,
      'c1',
      2,
      expect.objectContaining({ slug: 'pvc-v2' }),
    );
  });

  it('deleteCategory passes id + expectedRevision', async () => {
    await ctrl.deleteCategory('c1', { expectedRevision: 3 } as any, actor);
    expect(service.deleteCategory).toHaveBeenCalledWith(actor, 'c1', 3);
  });

  it('reorderCategories passes order', async () => {
    await ctrl.reorderCategories(
      { expectedRevision: 2, order: ['c2', 'c1'] } as any,
      actor,
    );
    expect(service.reorderCategories).toHaveBeenCalledWith(actor, 2, ['c2', 'c1']);
  });

  it('createProduct delegates with categoryId + input', async () => {
    const body = {
      expectedRevision: 1,
      slug: 'prod-a',
      title: { en: 'A', vi: 'A' },
      tag: { en: 'T', vi: 'T' },
      desc: { en: 'D', vi: 'D' },
    };
    await ctrl.createProduct('c1', body as any, actor);
    expect(service.createProduct).toHaveBeenCalledWith(
      actor,
      'c1',
      1,
      expect.objectContaining({ slug: 'prod-a' }),
    );
  });

  it('deleteProduct passes categoryId + pid', async () => {
    await ctrl.deleteProduct('c1', 'p1', { expectedRevision: 5 } as any, actor);
    expect(service.deleteProduct).toHaveBeenCalledWith(actor, 'c1', 'p1', 5);
  });
});
