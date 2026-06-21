import { requireRole } from "@/app/lib/session";
import { apiServer } from "@/app/lib/api";
import {
  CreateCategoryForm,
  EditCategoryForm,
  DeleteCategoryForm,
} from "./category-forms";
import {
  CreateProductForm,
  EditProductForm,
  DeleteProductForm,
} from "./product-forms";

// ── API response shapes ───────────────────────────────────────────────────────

interface Loc {
  en: string;
  vi: string;
}

interface CategoryRow {
  id: string;
  slug: string;
  sortOrder: number;
  title: Loc;
  tag: Loc;
  intro: Loc;
  productCount: number;
  materialCount: number;
  imageId: string | null;
}

interface ProductRow {
  id: string;
  categoryId: string;
  slug: string;
  sortOrder: number;
  title: Loc;
  tag: Loc;
  desc: Loc;
  imageId: string | null;
}

interface AssetRow {
  id: string;
  status: string;
  originalName: string;
  r2Key: string;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function CatalogPage() {
  // Hard role gate — redirects to / if under-ranked
  await requireRole("EDITOR");

  const [catsRes, prodsRes, assetsRes] = await Promise.all([
    apiServer<CategoryRow[]>("/api/catalog/categories"),
    apiServer<ProductRow[]>("/api/catalog/products"),
    apiServer<AssetRow[]>("/api/assets"),
  ]);

  const categories = catsRes.ok ? catsRes.data : [];
  const products = prodsRes.ok ? prodsRes.data : [];
  // Asset picker only shows READY assets (status guard)
  const assets = assetsRes.ok
    ? assetsRes.data.filter((a) => a.status === "READY")
    : [];

  const apiError = !catsRes.ok || !prodsRes.ok;

  // Slim asset shape for form components (no r2Key needed on the client)
  const assetOptions = assets.map(({ id, originalName }) => ({
    id,
    originalName,
  }));

  // Slim category shape for product form category select
  const categoryOptions = categories.map(({ id, slug }) => ({ id, slug }));

  return (
    <section className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-gray-900">Catalog</h1>
        <p className="text-sm text-gray-500">
          Manage categories and products. Changes are unpublished until you
          publish a release.
        </p>
      </div>

      {/* API error banner */}
      {apiError && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          Could not load catalog data. The API may be unavailable.
        </p>
      )}

      {/* ── Categories ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-gray-900">Categories</h2>

        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          {categories.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-gray-400">
              No categories yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-3">Sort</th>
                    <th className="px-4 py-3">Slug</th>
                    <th className="px-4 py-3">Title (en)</th>
                    <th className="px-4 py-3">Tag (en)</th>
                    <th className="px-4 py-3">Products</th>
                    <th className="px-4 py-3">Image / actions</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {categories.map((c) => (
                    <tr
                      key={c.id}
                      className="align-top transition-colors hover:bg-gray-50"
                    >
                      <td className="px-4 py-3 font-mono text-gray-700">
                        {c.sortOrder}
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-900">
                        {c.slug}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{c.title.en}</td>
                      <td className="px-4 py-3 text-gray-500">{c.tag.en}</td>
                      <td className="px-4 py-3 text-gray-500">
                        {c.productCount} / {c.materialCount}
                      </td>
                      <td className="px-4 py-3">
                        <EditCategoryForm
                          category={c}
                          assets={assetOptions}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <DeleteCategoryForm
                          categoryId={c.id}
                          slug={c.slug}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <CreateCategoryForm assets={assetOptions} />
      </div>

      {/* ── Products ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-gray-900">Products</h2>

        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          {products.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-gray-400">
              No products yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-3">Sort</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Slug</th>
                    <th className="px-4 py-3">Title (en)</th>
                    <th className="px-4 py-3">Tag (en)</th>
                    <th className="px-4 py-3">Image / actions</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {products.map((p) => {
                    const catSlug =
                      categories.find((c) => c.id === p.categoryId)?.slug ??
                      p.categoryId;
                    return (
                      <tr
                        key={p.id}
                        className="align-top transition-colors hover:bg-gray-50"
                      >
                        <td className="px-4 py-3 font-mono text-gray-700">
                          {p.sortOrder}
                        </td>
                        <td className="px-4 py-3 font-mono text-gray-500">
                          {catSlug}
                        </td>
                        <td className="px-4 py-3 font-mono text-gray-900">
                          {p.slug}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {p.title.en}
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {p.tag.en}
                        </td>
                        <td className="px-4 py-3">
                          <EditProductForm
                            product={p}
                            categories={categoryOptions}
                            assets={assetOptions}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <DeleteProductForm
                            productId={p.id}
                            slug={p.slug}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <CreateProductForm categories={categoryOptions} assets={assetOptions} />
      </div>
    </section>
  );
}
