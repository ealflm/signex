import { requireRole } from "@/app/lib/session";
import { apiServer } from "@/app/lib/api";
import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { EmptyState } from "@/components/admin/empty-state";
import { Package, Layers } from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
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
      <PageHeader
        title="Catalog"
        subtitle="Manage categories and products. Changes are unpublished until you publish a release."
      />

      {/* API error banner */}
      {apiError && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          Could not load catalog data. The API may be unavailable.
        </p>
      )}

      {/* ── Categories ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <SectionCard title="Categories" bodyClassName="p-0">
          {categories.length === 0 ? (
            <EmptyState
              icon={Layers}
              title="No categories yet."
              description="Add the first category below."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border hover:bg-transparent">
                  <TableHead
                    scope="col"
                    className="h-10 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    Sort
                  </TableHead>
                  <TableHead
                    scope="col"
                    className="h-10 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    Slug
                  </TableHead>
                  <TableHead
                    scope="col"
                    className="h-10 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    Title (en)
                  </TableHead>
                  <TableHead
                    scope="col"
                    className="h-10 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    Tag (en)
                  </TableHead>
                  <TableHead
                    scope="col"
                    className="h-10 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    Products
                  </TableHead>
                  <TableHead
                    scope="col"
                    className="h-10 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    Image / actions
                  </TableHead>
                  <TableHead
                    scope="col"
                    className="h-10 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    <span className="sr-only">Delete</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((c) => (
                  <TableRow
                    key={c.id}
                    className="border-b border-border last:border-0 align-top transition-colors duration-150 hover:bg-muted/50"
                  >
                    <TableCell className="px-4 py-3 font-mono tabular-nums text-xs text-muted-foreground">
                      {c.sortOrder}
                    </TableCell>
                    <TableCell className="px-4 py-3 font-mono tabular-nums text-sm text-foreground">
                      {c.slug}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-foreground">
                      {c.title.en}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                      {c.tag.en}
                    </TableCell>
                    <TableCell className="px-4 py-3 font-mono tabular-nums text-xs text-muted-foreground">
                      {c.productCount} / {c.materialCount}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <EditCategoryForm
                        category={c}
                        assets={assetOptions}
                      />
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <DeleteCategoryForm
                        categoryId={c.id}
                        slug={c.slug}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>

        <CreateCategoryForm assets={assetOptions} />
      </div>

      {/* ── Products ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <SectionCard title="Products" bodyClassName="p-0">
          {products.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No products yet."
              description="Add the first product below."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border hover:bg-transparent">
                  <TableHead
                    scope="col"
                    className="h-10 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    Sort
                  </TableHead>
                  <TableHead
                    scope="col"
                    className="h-10 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    Category
                  </TableHead>
                  <TableHead
                    scope="col"
                    className="h-10 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    Slug
                  </TableHead>
                  <TableHead
                    scope="col"
                    className="h-10 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    Title (en)
                  </TableHead>
                  <TableHead
                    scope="col"
                    className="h-10 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    Tag (en)
                  </TableHead>
                  <TableHead
                    scope="col"
                    className="h-10 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    Image / actions
                  </TableHead>
                  <TableHead
                    scope="col"
                    className="h-10 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    <span className="sr-only">Delete</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => {
                  const catSlug =
                    categories.find((c) => c.id === p.categoryId)?.slug ??
                    p.categoryId;
                  return (
                    <TableRow
                      key={p.id}
                      className="border-b border-border last:border-0 align-top transition-colors duration-150 hover:bg-muted/50"
                    >
                      <TableCell className="px-4 py-3 font-mono tabular-nums text-xs text-muted-foreground">
                        {p.sortOrder}
                      </TableCell>
                      <TableCell className="px-4 py-3 font-mono tabular-nums text-xs text-muted-foreground">
                        {catSlug}
                      </TableCell>
                      <TableCell className="px-4 py-3 font-mono tabular-nums text-sm text-foreground">
                        {p.slug}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm text-foreground">
                        {p.title.en}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                        {p.tag.en}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <EditProductForm
                          product={p}
                          categories={categoryOptions}
                          assets={assetOptions}
                        />
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <DeleteProductForm
                          productId={p.id}
                          slug={p.slug}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </SectionCard>

        <CreateProductForm categories={categoryOptions} assets={assetOptions} />
      </div>
    </section>
  );
}
