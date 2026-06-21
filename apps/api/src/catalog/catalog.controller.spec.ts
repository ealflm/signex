import { CatalogController } from './catalog.controller';

describe('CatalogController', () => {
  const service = {
    createCategory: jest.fn().mockResolvedValue({ id: 'c1', revision: 2 }),
    updateCategory: jest.fn().mockResolvedValue({ revision: 3 }),
    deleteCategory: jest.fn().mockResolvedValue({ revision: 4 }),
    createProduct: jest.fn().mockResolvedValue({ id: 'p1', revision: 5 }),
    updateProduct: jest.fn().mockResolvedValue({ revision: 6 }),
    deleteProduct: jest.fn().mockResolvedValue({ revision: 7 }),
    listCategories: jest.fn().mockResolvedValue([{ id: 'c1' }]),
    listProducts: jest.fn().mockResolvedValue([{ id: 'p1' }]),
  } as any;
  const ctrl = new CatalogController(service);
  const actor = { id: 'u1' } as any;

  it('createCategory delegates with actor + body + expectedRevision', async () => {
    const body = { input: { slug: 'pvc' }, expectedRevision: 1 };
    expect(await ctrl.createCategory(body as any, actor)).toEqual({
      id: 'c1',
      revision: 2,
    });
    expect(service.createCategory).toHaveBeenCalledWith(
      actor,
      { slug: 'pvc' },
      1,
    );
  });

  it('updateCategory passes the :id param', async () => {
    await ctrl.updateCategory(
      'c1',
      { input: { slug: 'x' }, expectedRevision: 2 } as any,
      actor,
    );
    expect(service.updateCategory).toHaveBeenCalledWith(
      actor,
      'c1',
      { slug: 'x' },
      2,
    );
  });

  it('deleteCategory passes id + expectedRevision', async () => {
    await ctrl.deleteCategory('c1', { expectedRevision: 3 } as any, actor);
    expect(service.deleteCategory).toHaveBeenCalledWith(actor, 'c1', 3);
  });

  it('createProduct delegates', async () => {
    await ctrl.createProduct(
      { input: { slug: 'a' }, expectedRevision: 1 } as any,
      actor,
    );
    expect(service.createProduct).toHaveBeenCalledWith(actor, { slug: 'a' }, 1);
  });
});
