import type { RawDict } from './dict-source';
import { lt, type LT } from './zip';
import {
  categoryImageLogicalId,
  productImageLogicalId,
} from './asset-manifest';
import type { FrozenAssetEntry } from './asset-importer';

export interface ProductRow {
  slug: string;
  sortOrder: number;
  title: LT;
  tag: LT;
  desc: LT;
  imageId: string;
}

export interface CategoryRow {
  slug: string;
  sortOrder: number;
  title: LT;
  tag: LT;
  intro: LT;
  productCount: number;
  materialCount: number;
  imageId: string;
  items: ProductRow[];
}

interface RawItem {
  slug: string;
  title: string;
  tag: string;
  desc: string;
}

interface RawCategory {
  slug: string;
  title: string;
  tag: string;
  intro: string;
  products: number;
  materials: number;
  items: RawItem[];
}

function mustAsset(
  assets: Map<string, FrozenAssetEntry>,
  logicalId: string,
): string {
  const a = assets.get(logicalId);
  if (!a) throw new Error(`importer: missing imported asset for ${logicalId}`);
  return a.assetId;
}

/**
 * Builds the relational catalog rows from the real en/vi dicts and the
 * already-imported asset map.
 *
 * sortOrder is load-bearing:
 *   - category sortOrder = i (index in products.categories)
 *   - product  sortOrder = j (index in category.items)
 *
 * imageId is decoupled from the live i%6 cycle:
 *   - category i → categoryImageLogicalId(i) (4 unique category images)
 *   - product  j → productImageLogicalId(j)  (6 product images, 0..5 = within-category index)
 *   The live site uses productImage(j) where j is the within-category index (0..5),
 *   so initialImageId(j) == productImageLogicalId(j) exactly.
 */
export function buildCatalog(
  en: RawDict,
  vi: RawDict,
  assets: Map<string, FrozenAssetEntry>,
): { categories: CategoryRow[] } {
  const enCats = (en as any).products.categories as RawCategory[];
  const viCats = (vi as any).products.categories as RawCategory[];

  const categories = enCats.map((ec, i): CategoryRow => {
    const vc = viCats[i];
    return {
      slug: ec.slug,
      sortOrder: i,
      title: lt(ec.title, vc.title),
      tag: lt(ec.tag, vc.tag),
      intro: lt(ec.intro, vc.intro),
      productCount: ec.products,
      materialCount: ec.materials,
      imageId: mustAsset(assets, categoryImageLogicalId(i)),
      items: ec.items.map((ei, j): ProductRow => {
        const vi2 = vc.items[j];
        return {
          slug: ei.slug,
          sortOrder: j,
          title: lt(ei.title, vi2.title),
          tag: lt(ei.tag, vi2.tag),
          desc: lt(ei.desc, vi2.desc),
          // Decouple the live productImage(j) cycle into a concrete per-item asset:
          // the live site uses productImage(j) where j is the within-category index (0..5).
          imageId: mustAsset(assets, productImageLogicalId(j)),
        };
      }),
    };
  });

  return { categories };
}
