import { buildCatalog } from './catalog-builder';
import { loadDicts } from './dict-source';
import {
  categoryImageLogicalId,
  productImageLogicalId,
} from './asset-manifest';
import type { FrozenAssetEntry } from './asset-importer';

function fakeAssets(): Map<string, FrozenAssetEntry> {
  const m = new Map<string, FrozenAssetEntry>();
  [0, 1, 2, 3].forEach((i) =>
    m.set(categoryImageLogicalId(i), {
      assetId: `c${i}`,
      r2Key: `c${i}.k`,
      mime: 'image/avif',
    }),
  );
  [0, 1, 2, 3, 4, 5].forEach((j) =>
    m.set(productImageLogicalId(j), {
      assetId: `p${j}`,
      r2Key: `p${j}.k`,
      mime: 'image/avif',
    }),
  );
  return m;
}

describe('buildCatalog', () => {
  const { en, vi } = loadDicts();
  const cat = buildCatalog(en, vi, fakeAssets());

  it('produces 4 categories in dict order with sortOrder 0..3', () => {
    expect(cat.categories.map((c) => c.sortOrder)).toEqual([0, 1, 2, 3]);
    expect(cat.categories[0].slug).toBe('plastic-logos-emblems');
    expect(cat.categories[3].slug).toBe('oem-brand-parts');
  });

  it('each category has 6 items with sortOrder 0..5 and unique slugs', () => {
    for (const c of cat.categories) {
      expect(c.items).toHaveLength(6);
      expect(c.items.map((p) => p.sortOrder)).toEqual([0, 1, 2, 3, 4, 5]);
      expect(new Set(c.items.map((p) => p.slug)).size).toBe(6);
    }
  });

  it('localizes title/tag/intro from both dicts', () => {
    const c0 = cat.categories[0];
    expect(c0.title.en).toBe('Plastic logos & emblems');
    expect(c0.title.vi).toBe((vi as any).products.categories[0].title);
    expect(c0.intro.en).toBe((en as any).products.categories[0].intro);
    expect(c0.productCount).toBe(18);
    expect(c0.materialCount).toBe(4);
  });

  it('assigns the decoupled per-index category + product imageIds', () => {
    expect(cat.categories[2].imageId).toBe('c2');
    expect(cat.categories[0].items[5].imageId).toBe('p5');
    expect(cat.categories[1].items[0].imageId).toBe('p0');
  });
});
