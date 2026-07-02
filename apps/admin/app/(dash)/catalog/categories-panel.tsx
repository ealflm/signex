"use client";

import { Layers, Package, Pencil, Ruler } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/admin/empty-state";
import { deleteCategory } from "./actions";
import { CreateCategoryDialog, EditCategoryDialog, type CategoryData } from "./category-dialog";
import { DeleteButton, type AssetOption } from "./catalog-fields";

export interface CategoryCardData extends CategoryData {
  /** Resolved public thumbnail URL, or null when unset / not yet READY. */
  imageSrc: string | null;
}

function CategoryCard({
  category,
  assets,
}: {
  category: CategoryCardData;
  assets: AssetOption[];
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-shadow duration-150 hover:shadow-elevated">
      <div className="aspect-[4/3] w-full overflow-hidden border-b border-border bg-muted">
        {category.imageSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- external MinIO host; thumbnail
          <img
            src={category.imageSrc}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted-foreground/10 text-3xl font-semibold text-muted-foreground/40">
            {(category.title.en || category.slug).slice(0, 1).toUpperCase()}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        {category.tag.en && (
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {category.tag.en}
          </p>
        )}
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="truncate text-base font-semibold leading-snug text-foreground">
            {category.title.en || category.slug}
          </h3>
          {category.title.vi && (
            <p className="truncate text-xs text-muted-foreground" lang="vi">
              {category.title.vi}
            </p>
          )}
        </div>

        <p className="truncate font-mono text-xs text-muted-foreground" title={category.slug}>
          {category.slug}
        </p>

        <dl className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Package className="size-3.5 text-muted-foreground/70" aria-hidden />
            <dd className="font-mono tabular-nums text-foreground">{category.productCount}</dd>
            <dt>products</dt>
          </div>
          <div className="flex items-center gap-1.5">
            <Ruler className="size-3.5 text-muted-foreground/70" aria-hidden />
            <dd className="font-mono tabular-nums text-foreground">{category.materialCount}</dd>
            <dt>materials</dt>
          </div>
        </dl>

        <div className="mt-auto flex items-center justify-end gap-1 pt-2">
          <EditCategoryDialog
            category={category}
            assets={assets}
            trigger={
              <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground hover:text-foreground">
                <Pencil aria-hidden />
                Edit
              </Button>
            }
          />
          <DeleteButton
            action={deleteCategory}
            hidden={{ id: category.id }}
            confirmMessage={`Delete category "${category.slug}"? This cannot be undone.`}
            srLabel={`Delete category ${category.slug}`}
          />
        </div>
      </div>
    </div>
  );
}

export function CategoriesPanel({
  categories,
  assets,
}: {
  categories: CategoryCardData[];
  assets: AssetOption[];
}) {
  return (
    <section className="flex flex-col gap-4" aria-labelledby="catalog-categories-heading">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 id="catalog-categories-heading" className="text-sm font-semibold text-foreground">
            Categories
          </h2>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {categories.length}
          </span>
        </div>
        <CreateCategoryDialog assets={assets} />
      </header>

      {categories.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border">
          <EmptyState
            icon={Layers}
            title="No categories yet"
            description="Create the first category to start organizing the catalog."
          />
        </div>
      ) : (
        <div
          className={cn(
            "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4",
          )}
        >
          {categories.map((c) => (
            <CategoryCard key={c.id || c.slug} category={c} assets={assets} />
          ))}
        </div>
      )}
    </section>
  );
}
