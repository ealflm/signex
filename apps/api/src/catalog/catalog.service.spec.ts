/**
 * CatalogService unit tests — Task 6.
 *
 * ThemeService.applyDraftMutation is mocked to execute the mutate callback
 * synchronously against a cloned snapshot so we can verify the array mutations
 * without wiring up the full Theme/Prisma machinery.
 */

import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { CatalogService } from './catalog.service';

const ACTOR = { id: 'cuser0000000000000000001', role: 'EDITOR' } as any;
const THEME_ID = 'ctheme00000000000000001';
const CAT_ID = 'ccat000000000000000001';
const PROD_ID = 'cprod00000000000000001';

/** Build a minimal but realistic draftSnapshot catalog fixture. */
function makeSnapshot() {
  return {
    schemaVersion: 1,
    blocks: {},
    catalog: {
      categories: [
        {
          id: CAT_ID,
          slug: 'existing-cat',
          sortOrder: 0,
          title: { en: 'PVC', vi: 'PVC' },
          tag: { en: 'tag', vi: 'tag' },
          intro: { en: 'intro', vi: 'intro' },
          productCount: 5,
          materialCount: 2,
          items: [
            {
              id: PROD_ID,
              slug: 'existing-product',
              sortOrder: 0,
              title: { en: 'Prod A', vi: 'Prod A' },
              tag: { en: 'tag', vi: 'tag' },
              desc: { en: 'desc', vi: 'desc' },
            },
          ],
        },
      ],
    },
    assets: {},
  };
}

/**
 * Build a mock ThemeService whose applyDraftMutation runs the mutate callback
 * against `snap` and a lightweight tx mock, then returns { draftRevision: rev+1 }.
 */
function makeThemeService(snap: ReturnType<typeof makeSnapshot>) {
  const txMock = {
    asset: {
      findUnique: jest.fn(),
    },
  };

  const applyDraftMutation = jest.fn(
    async (
      _actor: any,
      _themeId: any,
      expectedRev: number,
      mutate: (s: any, tx: any) => Promise<void>,
    ) => {
      await mutate(snap, txMock);
      return { draftRevision: expectedRev + 1 };
    },
  );

  return { themeService: { applyDraftMutation } as any, txMock, applyDraftMutation };
}

// ---------------------------------------------------------------------------
// createCategory
// ---------------------------------------------------------------------------
describe('CatalogService.createCategory', () => {
  it('mints a cuid id + appends with contiguous sortOrder (max+1)', async () => {
    const snap = makeSnapshot();
    const { themeService, applyDraftMutation } = makeThemeService(snap);
    const svc = new CatalogService(themeService);

    const result = await svc.createCategory(ACTOR, THEME_ID, 5, {
      slug: 'new-cat',
      title: { en: 'New', vi: 'New' },
      tag: { en: 'T', vi: 'T' },
      intro: { en: 'I', vi: 'I' },
      productCount: 3,
      materialCount: 1,
    });

    expect(result.draftRevision).toBe(6);
    expect(result.id).toMatch(/^c/); // cuid-v1 format starts with 'c'
    expect(applyDraftMutation).toHaveBeenCalledTimes(1);

    const cats = snap.catalog.categories;
    expect(cats).toHaveLength(2);
    const newCat = cats[1] as any;
    expect(newCat.id).toBeTruthy();
    expect(newCat.slug).toBe('new-cat');
    expect(newCat.sortOrder).toBe(1); // existing max = 0, so 0 + 1 = 1
    expect(newCat.items).toEqual([]);
  });

  it('throws DUPLICATE_SLUG when slug already exists globally', async () => {
    const snap = makeSnapshot();
    const { themeService } = makeThemeService(snap);
    const svc = new CatalogService(themeService);

    let err: any;
    await svc
      .createCategory(ACTOR, THEME_ID, 5, {
        slug: 'existing-cat', // conflicts with CAT_ID
        title: { en: 'X', vi: 'X' },
        tag: { en: 'T', vi: 'T' },
        intro: { en: 'I', vi: 'I' },
        productCount: 0,
        materialCount: 0,
      })
      .catch((e) => {
        err = e;
      });

    expect(err).toBeInstanceOf(UnprocessableEntityException);
    expect(err.getResponse()).toMatchObject({ code: 'DUPLICATE_SLUG' });
    // snapshot must NOT have been modified
    expect(snap.catalog.categories).toHaveLength(1);
  });

  it('throws INVALID_ASSET when imageId is absent from the db', async () => {
    const snap = makeSnapshot();
    const { themeService, txMock } = makeThemeService(snap);
    txMock.asset.findUnique.mockResolvedValue(null);
    const svc = new CatalogService(themeService);

    let err: any;
    await svc
      .createCategory(ACTOR, THEME_ID, 5, {
        slug: 'new-cat',
        title: { en: 'X', vi: 'X' },
        tag: { en: 'T', vi: 'T' },
        intro: { en: 'I', vi: 'I' },
        productCount: 0,
        materialCount: 0,
        imageId: 'nonexistent',
      })
      .catch((e) => {
        err = e;
      });

    expect(err).toBeInstanceOf(UnprocessableEntityException);
    expect(err.getResponse()).toMatchObject({ code: 'INVALID_ASSET' });
  });

  it('throws INVALID_ASSET when imageId points to a soft-deleted asset', async () => {
    const snap = makeSnapshot();
    const { themeService, txMock } = makeThemeService(snap);
    txMock.asset.findUnique.mockResolvedValue({
      id: 'asset-1',
      r2Key: 'x.jpg',
      mime: 'image/jpeg',
      width: 800,
      height: 600,
      poster: null,
      deletedAt: new Date(),
    });
    const svc = new CatalogService(themeService);

    let err: any;
    await svc
      .createCategory(ACTOR, THEME_ID, 5, {
        slug: 'new-cat',
        title: { en: 'X', vi: 'X' },
        tag: { en: 'T', vi: 'T' },
        intro: { en: 'I', vi: 'I' },
        productCount: 0,
        materialCount: 0,
        imageId: 'asset-1',
      })
      .catch((e) => {
        err = e;
      });

    expect(err).toBeInstanceOf(UnprocessableEntityException);
    expect(err.getResponse()).toMatchObject({ code: 'INVALID_ASSET' });
  });

  it('bumps draftRevision exactly once per op', async () => {
    const snap = makeSnapshot();
    const { themeService, applyDraftMutation } = makeThemeService(snap);
    const svc = new CatalogService(themeService);

    const result = await svc.createCategory(ACTOR, THEME_ID, 10, {
      slug: 'another-cat',
      title: { en: 'X', vi: 'X' },
      tag: { en: 'T', vi: 'T' },
      intro: { en: 'I', vi: 'I' },
      productCount: 0,
      materialCount: 0,
    });

    expect(applyDraftMutation).toHaveBeenCalledTimes(1);
    expect(result.draftRevision).toBe(11);
  });
});

// ---------------------------------------------------------------------------
// reorderCategories
// ---------------------------------------------------------------------------
describe('CatalogService.reorderCategories', () => {
  it('reassigns sortOrder by the position in the order array', async () => {
    const snap: any = {
      schemaVersion: 1,
      blocks: {},
      catalog: {
        categories: [
          {
            id: 'cat-a',
            slug: 'a',
            sortOrder: 0,
            title: { en: 'A', vi: 'A' },
            tag: { en: 't', vi: 't' },
            intro: { en: 'i', vi: 'i' },
            productCount: 0,
            materialCount: 0,
            items: [],
          },
          {
            id: 'cat-b',
            slug: 'b',
            sortOrder: 1,
            title: { en: 'B', vi: 'B' },
            tag: { en: 't', vi: 't' },
            intro: { en: 'i', vi: 'i' },
            productCount: 0,
            materialCount: 0,
            items: [],
          },
        ],
      },
      assets: {},
    };

    const txMock = { asset: { findUnique: jest.fn() } };
    const applyDraftMutation = jest.fn(
      async (_a: any, _t: any, rev: number, mutate: any) => {
        await mutate(snap, txMock);
        return { draftRevision: rev + 1 };
      },
    );
    const svc = new CatalogService({ applyDraftMutation } as any);

    const result = await svc.reorderCategories(ACTOR, THEME_ID, 5, [
      'cat-b',
      'cat-a',
    ]);

    expect(result).toEqual({ draftRevision: 6 });
    const cats = snap.catalog.categories;
    expect(cats.find((c: any) => c.id === 'cat-b').sortOrder).toBe(0);
    expect(cats.find((c: any) => c.id === 'cat-a').sortOrder).toBe(1);
    expect(applyDraftMutation).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// deleteCategory
// ---------------------------------------------------------------------------
describe('CatalogService.deleteCategory', () => {
  it('splices the category node from the array', async () => {
    const snap = makeSnapshot();
    const { themeService, applyDraftMutation } = makeThemeService(snap);
    const svc = new CatalogService(themeService);

    const result = await svc.deleteCategory(ACTOR, THEME_ID, CAT_ID, 5);

    expect(result).toEqual({ draftRevision: 6 });
    expect(applyDraftMutation).toHaveBeenCalledTimes(1);
    expect(snap.catalog.categories).toHaveLength(0);
  });

  it('throws NotFoundException for a non-existent category id', async () => {
    const snap = makeSnapshot();
    const { themeService } = makeThemeService(snap);
    const svc = new CatalogService(themeService);

    let err: any;
    await svc
      .deleteCategory(ACTOR, THEME_ID, 'nonexistent-id', 5)
      .catch((e) => {
        err = e;
      });

    expect(err).toBeInstanceOf(NotFoundException);
    expect(snap.catalog.categories).toHaveLength(1); // not modified
  });
});

// ---------------------------------------------------------------------------
// createProduct
// ---------------------------------------------------------------------------
describe('CatalogService.createProduct', () => {
  it('mints a cuid id + appends with contiguous sortOrder within the category', async () => {
    const snap = makeSnapshot();
    const { themeService, applyDraftMutation } = makeThemeService(snap);
    const svc = new CatalogService(themeService);

    const result = await svc.createProduct(ACTOR, THEME_ID, CAT_ID, 5, {
      slug: 'new-product',
      title: { en: 'Prod B', vi: 'Prod B' },
      tag: { en: 'T', vi: 'T' },
      desc: { en: 'D', vi: 'D' },
    });

    expect(result.draftRevision).toBe(6);
    expect(result.id).toMatch(/^c/);
    expect(applyDraftMutation).toHaveBeenCalledTimes(1);

    const cat = snap.catalog.categories[0] as any;
    expect(cat.items).toHaveLength(2);
    const newProd = cat.items[1];
    expect(newProd.slug).toBe('new-product');
    expect(newProd.sortOrder).toBe(1); // existing item sortOrder = 0, so max+1 = 1
    expect(newProd.id).toBeTruthy();
  });

  it('throws DUPLICATE_SLUG when slug already exists within the category', async () => {
    const snap = makeSnapshot();
    const { themeService } = makeThemeService(snap);
    const svc = new CatalogService(themeService);

    let err: any;
    await svc
      .createProduct(ACTOR, THEME_ID, CAT_ID, 5, {
        slug: 'existing-product', // conflicts with PROD_ID
        title: { en: 'X', vi: 'X' },
        tag: { en: 'T', vi: 'T' },
        desc: { en: 'D', vi: 'D' },
      })
      .catch((e) => {
        err = e;
      });

    expect(err).toBeInstanceOf(UnprocessableEntityException);
    expect(err.getResponse()).toMatchObject({ code: 'DUPLICATE_SLUG' });

    const cat = snap.catalog.categories[0] as any;
    expect(cat.items).toHaveLength(1); // not modified
  });

  it('throws INVALID_ASSET for a bad imageId', async () => {
    const snap = makeSnapshot();
    const { themeService, txMock } = makeThemeService(snap);
    txMock.asset.findUnique.mockResolvedValue(null);
    const svc = new CatalogService(themeService);

    let err: any;
    await svc
      .createProduct(ACTOR, THEME_ID, CAT_ID, 5, {
        slug: 'new-product',
        title: { en: 'X', vi: 'X' },
        tag: { en: 'T', vi: 'T' },
        desc: { en: 'D', vi: 'D' },
        imageId: 'bad-asset',
      })
      .catch((e) => {
        err = e;
      });

    expect(err).toBeInstanceOf(UnprocessableEntityException);
    expect(err.getResponse()).toMatchObject({ code: 'INVALID_ASSET' });
  });
});

// ---------------------------------------------------------------------------
// deleteProduct
// ---------------------------------------------------------------------------
describe('CatalogService.deleteProduct', () => {
  it('splices the product node from the category items array', async () => {
    const snap = makeSnapshot();
    const { themeService, applyDraftMutation } = makeThemeService(snap);
    const svc = new CatalogService(themeService);

    const result = await svc.deleteProduct(ACTOR, THEME_ID, CAT_ID, PROD_ID, 5);

    expect(result).toEqual({ draftRevision: 6 });
    expect(applyDraftMutation).toHaveBeenCalledTimes(1);

    const cat = snap.catalog.categories[0] as any;
    expect(cat.items).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// reorderProducts
// ---------------------------------------------------------------------------
describe('CatalogService.reorderProducts', () => {
  it('reassigns sortOrder within a category by index position', async () => {
    const snap: any = makeSnapshot();
    // Add a second product for ordering
    snap.catalog.categories[0].items.push({
      id: 'cprod00000000000000002',
      slug: 'product-b',
      sortOrder: 1,
      title: { en: 'B', vi: 'B' },
      tag: { en: 't', vi: 't' },
      desc: { en: 'd', vi: 'd' },
    });

    const txMock = { asset: { findUnique: jest.fn() } };
    const applyDraftMutation = jest.fn(
      async (_a: any, _t: any, rev: number, mutate: any) => {
        await mutate(snap, txMock);
        return { draftRevision: rev + 1 };
      },
    );
    const svc = new CatalogService({ applyDraftMutation } as any);

    const result = await svc.reorderProducts(ACTOR, THEME_ID, CAT_ID, 5, [
      'cprod00000000000000002',
      PROD_ID,
    ]);

    expect(result).toEqual({ draftRevision: 6 });
    const items = snap.catalog.categories[0].items;
    expect(items.find((p: any) => p.id === 'cprod00000000000000002').sortOrder).toBe(0);
    expect(items.find((p: any) => p.id === PROD_ID).sortOrder).toBe(1);
    expect(applyDraftMutation).toHaveBeenCalledTimes(1);
  });
});
