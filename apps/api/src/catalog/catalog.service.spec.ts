/**
 * CatalogService unit tests (global LIVE catalog).
 *
 * The service is backed by an in-memory Prisma mock so the real write primitive
 * runs: guardAndBump (optimistic lock), clone → mutate → validate the snapshot,
 * persist, audit, and fire a 'catalog' cache revalidation. We assert on the
 * PERSISTED snapshot (the arg to catalog.update) since applyMutation mutates a
 * structuredClone of the stored snapshot, never the fixture in place.
 */

import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { CatalogService } from './catalog.service';

const ACTOR = { id: 'cuser0000000000000000001', role: 'EDITOR' } as any;
const CAT_ID = 'ccat000000000000000001';
const PROD_ID = 'cprod00000000000000001';

/** Build a minimal but realistic CatalogSnapshot fixture (top-level categories). */
function makeSnapshot() {
  return {
    catalogSchemaVersion: 1,
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
  };
}

/**
 * Build a CatalogService over an in-memory prisma mock. `catalog.update` captures
 * the persisted snapshot into `persisted.snapshot`. `asset` is the tx asset mock
 * (default: findUnique → null, i.e. missing asset). `revalidate` is the cache
 * revalidation spy.
 */
function makeService(initial: any, assetRow?: any) {
  const persisted: { snapshot?: any } = {};
  const asset = { findUnique: jest.fn().mockResolvedValue(assetRow ?? null) };

  const tx = {
    asset,
    catalog: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn().mockResolvedValue({ id: 'singleton' }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ snapshot: initial }),
      update: jest.fn(async ({ data }: any) => {
        persisted.snapshot = data.snapshot;
        return {};
      }),
    },
  };

  const client = {
    catalog: {
      upsert: jest
        .fn()
        .mockResolvedValue({ id: 'singleton', revision: 0, snapshot: initial }),
    },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };

  const prisma = { client } as any;
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as any;
  const revalidate = jest.fn().mockResolvedValue({ ok: true });
  const revalidation = { revalidate } as any;

  const svc = new CatalogService(prisma, audit, revalidation);
  return { svc, persisted, asset, revalidate, updateMany: tx.catalog.updateMany };
}

const READY_ASSET = {
  id: 'casset0000000000000001',
  r2Key: 'originals/ab/cat.jpg',
  mime: 'image/jpeg',
  width: 1200,
  height: 800,
  poster: null,
  deletedAt: null,
};

// ---------------------------------------------------------------------------
// createCategory
// ---------------------------------------------------------------------------
describe('CatalogService.createCategory', () => {
  it('mints a cuid id + appends with contiguous sortOrder (max+1) + revalidates', async () => {
    const { svc, persisted, revalidate } = makeService(makeSnapshot());

    const result = await svc.createCategory(ACTOR, 5, {
      slug: 'new-cat',
      title: { en: 'New', vi: 'New' },
      tag: { en: 'T', vi: 'T' },
      intro: { en: 'I', vi: 'I' },
      productCount: 3,
      materialCount: 1,
    });

    expect(result.revision).toBe(6);
    expect(result.id).toMatch(/^c/); // cuid-v1 format starts with 'c'
    // live-on-save: every write revalidates the public catalog cache tag
    expect(revalidate).toHaveBeenCalledWith({ tags: ['catalog'] });

    const cats = persisted.snapshot.categories;
    expect(cats).toHaveLength(2);
    const newCat = cats[1];
    expect(newCat.id).toBeTruthy();
    expect(newCat.slug).toBe('new-cat');
    expect(newCat.sortOrder).toBe(1); // existing max = 0, so 0 + 1 = 1
    expect(newCat.items).toEqual([]);
  });

  it('throws DUPLICATE_SLUG when slug already exists globally (no persist, no revalidate)', async () => {
    const { svc, persisted, revalidate } = makeService(makeSnapshot());

    let err: any;
    await svc
      .createCategory(ACTOR, 5, {
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
    expect(persisted.snapshot).toBeUndefined(); // nothing persisted
    expect(revalidate).not.toHaveBeenCalled(); // no cache flush on failure
  });

  it('throws INVALID_ASSET when imageId is absent from the db', async () => {
    const { svc } = makeService(makeSnapshot()); // asset.findUnique → null

    let err: any;
    await svc
      .createCategory(ACTOR, 5, {
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
    const { svc } = makeService(makeSnapshot(), {
      id: 'asset-1',
      r2Key: 'x.jpg',
      mime: 'image/jpeg',
      width: 800,
      height: 600,
      poster: null,
      deletedAt: new Date(),
    });

    let err: any;
    await svc
      .createCategory(ACTOR, 5, {
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

  it('freezes a valid image onto the new category', async () => {
    const { svc, persisted } = makeService(makeSnapshot(), READY_ASSET);

    await svc.createCategory(ACTOR, 5, {
      slug: 'with-image',
      title: { en: 'X', vi: 'X' },
      tag: { en: 'T', vi: 'T' },
      intro: { en: 'I', vi: 'I' },
      productCount: 0,
      materialCount: 0,
      imageId: 'casset0000000000000001',
    });

    const newCat = persisted.snapshot.categories[1];
    expect(newCat.image).toMatchObject({
      assetId: 'casset0000000000000001',
      r2Key: 'originals/ab/cat.jpg',
      mime: 'image/jpeg',
      variants: [],
    });
  });

  it('bumps revision exactly once per op', async () => {
    const { svc, updateMany } = makeService(makeSnapshot());

    const result = await svc.createCategory(ACTOR, 10, {
      slug: 'another-cat',
      title: { en: 'X', vi: 'X' },
      tag: { en: 'T', vi: 'T' },
      intro: { en: 'I', vi: 'I' },
      productCount: 0,
      materialCount: 0,
    });

    expect(updateMany).toHaveBeenCalledTimes(1); // one optimistic-lock bump
    expect(result.revision).toBe(11);
  });
});

// ---------------------------------------------------------------------------
// updateCategory (image wipe/keep)
// ---------------------------------------------------------------------------
describe('CatalogService.updateCategory', () => {
  it('wipes the image when imageId is omitted (full-body-replace)', async () => {
    const snap = makeSnapshot();
    (snap.categories[0] as any).image = {
      assetId: 'old',
      r2Key: 'old.jpg',
      mime: 'image/jpeg',
      variants: [],
    };
    const { svc, persisted } = makeService(snap);

    await svc.updateCategory(ACTOR, CAT_ID, 5, {
      slug: 'existing-cat',
      title: { en: 'X', vi: 'X' },
      tag: { en: 'T', vi: 'T' },
      intro: { en: 'I', vi: 'I' },
      productCount: 5,
      materialCount: 2,
      // imageId omitted → image removed
    });

    expect(persisted.snapshot.categories[0].image).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// reorderCategories
// ---------------------------------------------------------------------------
describe('CatalogService.reorderCategories', () => {
  it('reassigns sortOrder by the position in the order array', async () => {
    const CAT_A = 'ccataaaaaaaaaaaaaaaaa01';
    const CAT_B = 'ccatbbbbbbbbbbbbbbbbb02';
    const snap: any = {
      catalogSchemaVersion: 1,
      categories: [
        {
          id: CAT_A,
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
          id: CAT_B,
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
    };
    const { svc, persisted } = makeService(snap);

    const result = await svc.reorderCategories(ACTOR, 5, [CAT_B, CAT_A]);

    expect(result).toEqual({ revision: 6 });
    const cats = persisted.snapshot.categories;
    expect(cats.find((c: any) => c.id === CAT_B).sortOrder).toBe(0);
    expect(cats.find((c: any) => c.id === CAT_A).sortOrder).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// deleteCategory
// ---------------------------------------------------------------------------
describe('CatalogService.deleteCategory', () => {
  it('splices the category node from the array', async () => {
    const { svc, persisted } = makeService(makeSnapshot());

    const result = await svc.deleteCategory(ACTOR, CAT_ID, 5);

    expect(result).toEqual({ revision: 6 });
    expect(persisted.snapshot.categories).toHaveLength(0);
  });

  it('throws NotFoundException for a non-existent category id', async () => {
    const { svc, persisted } = makeService(makeSnapshot());

    let err: any;
    await svc.deleteCategory(ACTOR, 'nonexistent-id', 5).catch((e) => {
      err = e;
    });

    expect(err).toBeInstanceOf(NotFoundException);
    expect(persisted.snapshot).toBeUndefined(); // not modified
  });
});

// ---------------------------------------------------------------------------
// createProduct
// ---------------------------------------------------------------------------
describe('CatalogService.createProduct', () => {
  it('mints a cuid id + appends with contiguous sortOrder within the category', async () => {
    const { svc, persisted } = makeService(makeSnapshot());

    const result = await svc.createProduct(ACTOR, CAT_ID, 5, {
      slug: 'new-product',
      title: { en: 'Prod B', vi: 'Prod B' },
      tag: { en: 'T', vi: 'T' },
      desc: { en: 'D', vi: 'D' },
    });

    expect(result.revision).toBe(6);
    expect(result.id).toMatch(/^c/);

    const cat = persisted.snapshot.categories[0];
    expect(cat.items).toHaveLength(2);
    const newProd = cat.items[1];
    expect(newProd.slug).toBe('new-product');
    expect(newProd.sortOrder).toBe(1); // existing item sortOrder = 0, so max+1 = 1
    expect(newProd.id).toBeTruthy();
  });

  it('throws DUPLICATE_SLUG when slug already exists within the category', async () => {
    const { svc, persisted } = makeService(makeSnapshot());

    let err: any;
    await svc
      .createProduct(ACTOR, CAT_ID, 5, {
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
    expect(persisted.snapshot).toBeUndefined(); // not modified
  });

  it('throws NotFoundException when the category does not exist', async () => {
    const { svc } = makeService(makeSnapshot());

    let err: any;
    await svc
      .createProduct(ACTOR, 'no-such-cat', 5, {
        slug: 'p',
        title: { en: 'X', vi: 'X' },
        tag: { en: 'T', vi: 'T' },
        desc: { en: 'D', vi: 'D' },
      })
      .catch((e) => {
        err = e;
      });

    expect(err).toBeInstanceOf(NotFoundException);
  });

  it('throws INVALID_ASSET for a bad imageId', async () => {
    const { svc } = makeService(makeSnapshot()); // asset.findUnique → null

    let err: any;
    await svc
      .createProduct(ACTOR, CAT_ID, 5, {
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
    const { svc, persisted } = makeService(makeSnapshot());

    const result = await svc.deleteProduct(ACTOR, CAT_ID, PROD_ID, 5);

    expect(result).toEqual({ revision: 6 });
    expect(persisted.snapshot.categories[0].items).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// reorderProducts
// ---------------------------------------------------------------------------
describe('CatalogService.reorderProducts', () => {
  it('reassigns sortOrder within a category by index position', async () => {
    const snap: any = makeSnapshot();
    // Add a second product for ordering
    snap.categories[0].items.push({
      id: 'cprod00000000000000002',
      slug: 'product-b',
      sortOrder: 1,
      title: { en: 'B', vi: 'B' },
      tag: { en: 't', vi: 't' },
      desc: { en: 'd', vi: 'd' },
    });
    const { svc, persisted } = makeService(snap);

    const result = await svc.reorderProducts(ACTOR, CAT_ID, 5, [
      'cprod00000000000000002',
      PROD_ID,
    ]);

    expect(result).toEqual({ revision: 6 });
    const items = persisted.snapshot.categories[0].items;
    expect(items.find((p: any) => p.id === 'cprod00000000000000002').sortOrder).toBe(0);
    expect(items.find((p: any) => p.id === PROD_ID).sortOrder).toBe(1);
  });
});
