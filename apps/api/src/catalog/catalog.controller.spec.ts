import { CatalogController } from './catalog.controller';

describe('CatalogController', () => {
  const THEME_ID = 'ctheme00000000000000001';
  const actor = { id: 'u1' } as any;

  const service = {
    createCategory: jest.fn().mockResolvedValue({ id: 'c1', draftRevision: 2 }),
    updateCategory: jest.fn().mockResolvedValue({ draftRevision: 3 }),
    deleteCategory: jest.fn().mockResolvedValue({ draftRevision: 4 }),
    reorderCategories: jest.fn().mockResolvedValue({ draftRevision: 3 }),
    createProduct: jest.fn().mockResolvedValue({ id: 'p1', draftRevision: 5 }),
    updateProduct: jest.fn().mockResolvedValue({ draftRevision: 6 }),
    deleteProduct: jest.fn().mockResolvedValue({ draftRevision: 7 }),
    reorderProducts: jest.fn().mockResolvedValue({ draftRevision: 6 }),
  } as any;

  const ctrl = new CatalogController(service);

  it('createCategory delegates with themeId + input + actor', async () => {
    const body = {
      expectedDraftRevision: 1,
      slug: 'pvc',
      title: { en: 'PVC', vi: 'PVC' },
      tag: { en: 'T', vi: 'T' },
      intro: { en: 'I', vi: 'I' },
      productCount: 0,
      materialCount: 0,
    };
    const result = await ctrl.createCategory(THEME_ID, body as any, actor);
    expect(result).toEqual({ id: 'c1', draftRevision: 2 });
    expect(service.createCategory).toHaveBeenCalledWith(
      actor,
      THEME_ID,
      1,
      {
        slug: 'pvc',
        title: { en: 'PVC', vi: 'PVC' },
        tag: { en: 'T', vi: 'T' },
        intro: { en: 'I', vi: 'I' },
        productCount: 0,
        materialCount: 0,
      },
    );
  });

  it('updateCategory passes themeId + id + input', async () => {
    const body = {
      expectedDraftRevision: 2,
      slug: 'pvc-v2',
      title: { en: 'PVC v2', vi: 'PVC v2' },
      tag: { en: 'T', vi: 'T' },
      intro: { en: 'I', vi: 'I' },
      productCount: 1,
      materialCount: 1,
    };
    await ctrl.updateCategory(THEME_ID, 'c1', body as any, actor);
    expect(service.updateCategory).toHaveBeenCalledWith(
      actor,
      THEME_ID,
      'c1',
      2,
      expect.objectContaining({ slug: 'pvc-v2' }),
    );
  });

  it('deleteCategory passes themeId + id + expectedDraftRevision', async () => {
    await ctrl.deleteCategory(THEME_ID, 'c1', { expectedDraftRevision: 3 } as any, actor);
    expect(service.deleteCategory).toHaveBeenCalledWith(actor, THEME_ID, 'c1', 3);
  });

  it('reorderCategories passes themeId + order', async () => {
    await ctrl.reorderCategories(
      THEME_ID,
      { expectedDraftRevision: 2, order: ['c2', 'c1'] } as any,
      actor,
    );
    expect(service.reorderCategories).toHaveBeenCalledWith(actor, THEME_ID, 2, ['c2', 'c1']);
  });

  it('createProduct delegates with themeId + categoryId + input', async () => {
    const body = {
      expectedDraftRevision: 1,
      slug: 'prod-a',
      title: { en: 'A', vi: 'A' },
      tag: { en: 'T', vi: 'T' },
      desc: { en: 'D', vi: 'D' },
    };
    await ctrl.createProduct(THEME_ID, 'c1', body as any, actor);
    expect(service.createProduct).toHaveBeenCalledWith(
      actor,
      THEME_ID,
      'c1',
      1,
      expect.objectContaining({ slug: 'prod-a' }),
    );
  });

  it('deleteProduct passes themeId + categoryId + pid', async () => {
    await ctrl.deleteProduct(THEME_ID, 'c1', 'p1', { expectedDraftRevision: 5 } as any, actor);
    expect(service.deleteProduct).toHaveBeenCalledWith(actor, THEME_ID, 'c1', 'p1', 5);
  });
});
