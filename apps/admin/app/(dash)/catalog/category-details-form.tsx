"use client";

import { useActionState } from "react";
import {
  Boxes,
  Check,
  Loader2,
  Package,
  Ruler,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/admin/field";
import { deleteCategory, updateCategory } from "./actions";
import { ActionFeedback, emptyState, LocalizedField } from "./catalog-fields";
import type { CategoryData } from "./category-dialog";
import { CatalogImagePicker } from "./catalog-image-picker";

/** One cell of the hero stat strip (hairline-divided, mono figure). */
function Stat({
  icon: Icon,
  value,
  label,
  hint,
}: {
  icon: LucideIcon;
  value: number;
  label: string;
  hint: string;
}) {
  return (
    <div className="flex flex-col gap-1 bg-card p-3" title={hint}>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5" aria-hidden />
        <dt className="text-[11px] font-medium uppercase tracking-wide">
          {label}
        </dt>
      </div>
      <dd className="font-mono text-xl font-semibold tabular-nums text-foreground">
        {value}
      </dd>
    </div>
  );
}

/**
 * Category detail editor — an identity hero (the category's own product image +
 * name + live stats, echoing the theme editor's live banner) over a details
 * card. One <form> spans both so a single Save posts every field (updateCategory
 * is a full-body replace). Delete lives in the hero via a sibling form (buttons
 * reference it by id — no nested forms). Catalog is live-on-save.
 */
export function CategoryDetailsForm({
  category,
  defaultImageUrl,
  productCount,
}: {
  category: CategoryData;
  /** Server-resolved URL of the current image, for the preview (null if none). */
  defaultImageUrl: string | null;
  /** Actual number of products in this category (for the "in catalog" stat). */
  productCount: number;
}) {
  const [state, formAction, pending] = useActionState(
    updateCategory,
    emptyState,
  );
  const [delState, delAction, delPending] = useActionState(
    deleteCategory,
    emptyState,
  );
  const idBase = `cat-detail-${category.id}`;
  const displayName = category.title.en || category.slug;
  const fallbackText = displayName.slice(0, 1).toUpperCase();

  return (
    <div className="flex flex-col gap-6">
      <form
        id="cat-update"
        action={formAction}
        className="flex flex-col gap-6"
      >
        <input type="hidden" name="id" value={category.id} />

        {/* ── Identity hero ─────────────────────────────────────────────── */}
        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-elevated">
          <div className="grid sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <div className="border-b border-border p-5 sm:border-b-0 sm:border-r">
              <CatalogImagePicker
                variant="hero"
                field="catalog.category.image"
                defaultImageId={category.imageId}
                defaultImageUrl={defaultImageUrl}
                fallbackText={fallbackText}
              />
            </div>

            <div className="flex flex-col gap-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  {category.tag.en && (
                    <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {category.tag.en}
                    </p>
                  )}
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                    {displayName}
                  </h1>
                  <p
                    className="truncate font-mono text-xs text-muted-foreground"
                    title={category.slug}
                  >
                    {category.slug}
                  </p>
                </div>

                <Button
                  form="cat-delete"
                  type="submit"
                  variant="outline"
                  size="sm"
                  disabled={delPending}
                  aria-disabled={delPending}
                  aria-label="Delete category"
                  title={delState.error ?? "Delete this category"}
                  className="shrink-0 gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  {delPending ? (
                    <Loader2 className="animate-spin" aria-hidden />
                  ) : (
                    <Trash2 aria-hidden />
                  )}
                  <span className="hidden sm:inline">Delete</span>
                </Button>
              </div>

              <dl className="mt-auto grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border bg-border">
                <Stat
                  icon={Boxes}
                  value={productCount}
                  label="In catalog"
                  hint="Products actually managed in this category"
                />
                <Stat
                  icon={Package}
                  value={category.productCount}
                  label="Listed"
                  hint="Product count shown on the storefront"
                />
                <Stat
                  icon={Ruler}
                  value={category.materialCount}
                  label="Materials"
                  hint="Material count shown on the storefront"
                />
              </dl>
            </div>
          </div>
        </section>

        {/* ── Details ───────────────────────────────────────────────────── */}
        <section
          className="rounded-xl border border-border bg-card"
          aria-labelledby="category-details-heading"
        >
          <header className="border-b border-border px-5 py-4">
            <h2
              id="category-details-heading"
              className="text-sm font-semibold text-foreground"
            >
              Category details
            </h2>
            <p className="text-xs text-muted-foreground">
              Edits publish to the live site immediately.
            </p>
          </header>

          <div className="flex flex-col gap-4 p-5">
            <ActionFeedback state={state} />

            <Field label="Slug" htmlFor={`${idBase}-slug`} required>
              <Input
                id={`${idBase}-slug`}
                name="slug"
                required
                defaultValue={category.slug}
                placeholder="e.g. plastic-logos-emblems"
                autoComplete="off"
                spellCheck={false}
                className="font-mono tabular-nums text-sm"
              />
            </Field>

            <LocalizedField base="title" label="Title" value={category.title} />
            <LocalizedField base="tag" label="Tag" value={category.tag} />
            <LocalizedField
              base="intro"
              label="Intro"
              value={category.intro}
              multiline
            />

            <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Shown on the site
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Products listed" htmlFor={`${idBase}-prod`}>
                  <Input
                    id={`${idBase}-prod`}
                    type="number"
                    name="productCount"
                    min={0}
                    defaultValue={category.productCount}
                    className="font-mono tabular-nums text-sm"
                  />
                </Field>
                <Field label="Materials" htmlFor={`${idBase}-mat`}>
                  <Input
                    id={`${idBase}-mat`}
                    type="number"
                    name="materialCount"
                    min={0}
                    defaultValue={category.materialCount}
                    className="font-mono tabular-nums text-sm"
                  />
                </Field>
              </div>
            </div>
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
            {state.success ? (
              <p
                role="status"
                className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success"
              >
                <Check className="size-3.5" aria-hidden />
                Saved — live now
              </p>
            ) : (
              <span className="text-xs text-muted-foreground">
                Changes go live the moment you save.
              </span>
            )}
            <Button type="submit" disabled={pending} aria-disabled={pending}>
              {pending ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Check aria-hidden />
              )}
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </footer>
        </section>
      </form>

      {/* Delete form — targeted by the hero's Delete button via form="cat-delete"
          (kept a sibling of the update form; forms cannot nest). */}
      <form
        id="cat-delete"
        action={delAction}
        onSubmit={(e) => {
          const msg =
            productCount > 0
              ? `Delete category "${category.slug}" and its ${productCount} product${productCount === 1 ? "" : "s"}? This cannot be undone.`
              : `Delete category "${category.slug}"? This cannot be undone.`;
          if (!window.confirm(msg)) e.preventDefault();
        }}
      >
        <input type="hidden" name="id" value={category.id} />
      </form>
    </div>
  );
}
