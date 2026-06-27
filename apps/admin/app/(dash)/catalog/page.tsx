import { requireRole } from "@/app/lib/session";
import { apiServer } from "@/app/lib/api";
import { getActiveThemeId } from "@/app/lib/themes";
import type { ReleaseSnapshot, FrozenCategory } from "@signex/shared";
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

// ── Local row shapes (built from the theme draft snapshot) ────────────────────

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

interface AssetOption {
  id: string;
  originalName: string;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function CatalogPage() {
  // Hard role gate — redirects to / if under-ranked
  await requireRole("EDITOR");

  // Catalog data is read from the active theme's draft snapshot.
  // There are no standalone catalog GET routes in this API version.
  const themeId = await getActiveThemeId();
  if (!themeId) {
    return (
      <section className="flex flex-col gap-8">
        <PageHeader
          title="Catalog"
          subtitle="Manage categories and products. Changes are unpublished until you publish a release."
        />
        <EmptyState
          icon={Layers}
          title="No active theme selected."
          description="Pick an active theme in the header to manage its catalog."
        />
      </section>
    );
  }

  const [themeRes, assetsRes] = await Promise.all([
    apiServer<{ draftSnapshot: ReleaseSnapshot }>(`/api/themes/${themeId}`),
    apiServer<{ id: string; status: string; originalName: string }[]>(
      "/api/assets",
    ),
  ]);

  // Build rows from the snapshot catalog
  const cats = (
    themeRes.ok ? themeRes.data.draftSnapshot.catalog.categories : []
  ) as FrozenCategory[];

  const categories: CategoryRow[] = cats.map((c) => ({
    id: c.id ?? "",
    slug: c.slug,
    sortOrder: c.sortOrder,
    title: c.title,
    tag: c.tag,
    intro: c.intro,
    productCount: c.productCount,
    materialCount: c.materialCount,
    imageId: c.image?.assetId ?? null,
  }));

  // Products flattened from all categories, carrying their parent categoryId
  const products: ProductRow[] = cats.flatMap((c) =>
    c.items.map((p) => ({
      id: p.id ?? "",
      categoryId: c.id ?? "",
      slug: p.slug,
      sortOrder: p.sortOrder,
      title: p.title,
      tag: p.tag,
      desc: p.desc,
      imageId: p.image?.assetId ?? null,
    })),
  );

  // Asset picker only shows READY assets (status guard)
  const assets = assetsRes.ok
    ? assetsRes.data.filter((a) => a.status === "READY")
    : [];

  // Slim asset shape for form components
  const assetOptions: AssetOption[] = assets.map(({ id, originalName }) => ({
    id,
    originalName,
  }));

  // Slim category shape for product form category select
  const categoryOptions = categories.map(({ id, slug }) => ({ id, slug }));

  const apiError = !themeRes.ok;

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
                          categoryId={p.categoryId}
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
