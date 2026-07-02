"use client";

import { useState } from "react";
import { ImageOff, Package, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/admin/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deleteProduct } from "./actions";
import {
  CreateProductDialog,
  EditProductDialog,
  type CategoryOption,
  type ProductData,
} from "./product-dialog";
import { DeleteButton, nativeSelectCls, type AssetOption } from "./catalog-fields";

export interface ProductRowData extends ProductData {
  /** Resolved public thumbnail URL, or null when unset / not yet READY. */
  imageSrc: string | null;
  /** Parent category slug, for the category chip. */
  categorySlug: string;
}

const headCls =
  "h-10 px-5 text-xs font-medium uppercase tracking-wide text-muted-foreground";

export function ProductsPanel({
  products,
  categories,
  assets,
}: {
  products: ProductRowData[];
  categories: CategoryOption[];
  assets: AssetOption[];
}) {
  const [filter, setFilter] = useState<string>("all");
  const filtered =
    filter === "all" ? products : products.filter((p) => p.categoryId === filter);

  return (
    <section className="rounded-xl border border-border bg-card" aria-labelledby="catalog-products-heading">
      <header className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-baseline gap-2">
          <h2 id="catalog-products-heading" className="text-sm font-semibold text-foreground">
            Products
          </h2>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {filter === "all"
              ? products.length
              : `${filtered.length} / ${products.length}`}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Category</span>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              aria-label="Filter products by category"
              disabled={categories.length === 0}
              className={cn(nativeSelectCls, "h-8 w-auto min-w-44 text-xs")}
            >
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.slug}
                </option>
              ))}
            </select>
          </label>
          <CreateProductDialog
            categories={categories}
            assets={assets}
            defaultCategoryId={filter === "all" ? "" : filter}
            disabled={categories.length === 0}
          />
        </div>
      </header>

      {products.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No products yet"
          description="Add the first product to one of your categories."
        />
      ) : (
        <div className="max-h-[560px] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur [&_tr]:border-b [&_tr]:border-border">
              <TableRow className="hover:bg-transparent">
                <TableHead scope="col" className={headCls}>
                  Product
                </TableHead>
                <TableHead scope="col" className={headCls}>
                  Slug
                </TableHead>
                <TableHead scope="col" className={headCls}>
                  Category
                </TableHead>
                <TableHead scope="col" className={headCls}>
                  Tag
                </TableHead>
                <TableHead scope="col" className={cn(headCls, "text-right")}>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow
                  key={p.id || `${p.categorySlug}-${p.slug}`}
                  className="border-border transition-colors duration-150 hover:bg-muted/50"
                >
                  <TableCell className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                        {p.imageSrc ? (
                          // eslint-disable-next-line @next/next/no-img-element -- external MinIO host; thumbnail
                          <img
                            src={p.imageSrc}
                            alt=""
                            loading="lazy"
                            className="size-full object-cover"
                          />
                        ) : (
                          <ImageOff className="size-4 text-muted-foreground/60" aria-hidden />
                        )}
                      </span>
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium text-foreground">
                          {p.title.en || p.slug}
                        </span>
                        {p.title.vi && (
                          <span className="truncate text-xs text-muted-foreground" lang="vi">
                            {p.title.vi}
                          </span>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap px-5 py-3 font-mono text-xs tabular-nums text-muted-foreground">
                    {p.slug}
                  </TableCell>
                  <TableCell className="px-5 py-3">
                    <span className="inline-flex items-center whitespace-nowrap rounded-md border border-border bg-muted/50 px-2 py-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                      {p.categorySlug}
                    </span>
                  </TableCell>
                  <TableCell className="px-5 py-3 text-xs text-muted-foreground">
                    {p.tag.en}
                  </TableCell>
                  <TableCell className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <EditProductDialog
                        product={p}
                        categories={categories}
                        assets={assets}
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Edit product ${p.slug}`}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Pencil aria-hidden />
                          </Button>
                        }
                      />
                      <DeleteButton
                        action={deleteProduct}
                        hidden={{ id: p.id, categoryId: p.categoryId }}
                        confirmMessage={`Delete product "${p.slug}"? This cannot be undone.`}
                        srLabel={`Delete product ${p.slug}`}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {filtered.length === 0 && (
            <p className="px-5 py-14 text-center text-sm text-muted-foreground">
              No products in this category yet.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
