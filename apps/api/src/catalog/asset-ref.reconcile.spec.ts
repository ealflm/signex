import { reconcileAssetRefs } from './asset-ref.reconcile';

describe('reconcileAssetRefs', () => {
  it('deletes all existing owner refs then creates the new set', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 3 });
    const createMany = jest.fn().mockResolvedValue({ count: 2 });
    const tx = { assetRef: { deleteMany, createMany } } as any;

    await reconcileAssetRefs(tx, 'contentBlock', 'PAGE:home.hero', [
      { field: 'hero.image', assetId: 'a1', alt: { en: 'x', vi: 'y' } },
      { field: 'gallery[0]', assetId: 'a2' },
    ]);

    expect(deleteMany).toHaveBeenCalledWith({
      where: { ownerType: 'contentBlock', ownerId: 'PAGE:home.hero' },
    });
    expect(createMany).toHaveBeenCalledWith({
      data: [
        { ownerType: 'contentBlock', ownerId: 'PAGE:home.hero', field: 'hero.image', assetId: 'a1', alt: { en: 'x', vi: 'y' } },
        { ownerType: 'contentBlock', ownerId: 'PAGE:home.hero', field: 'gallery[0]', assetId: 'a2', alt: undefined },
      ],
    });
  });

  it('still deletes but skips createMany when there are no refs', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const createMany = jest.fn();
    const tx = { assetRef: { deleteMany, createMany } } as any;
    await reconcileAssetRefs(tx, 'product', 'prod_1', []);
    expect(deleteMany).toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
  });
});
