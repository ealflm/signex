"use client";

import { useActionState } from "react";
import { Check, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/admin/field";
import { deleteCategory, updateCategory } from "./actions";
import {
  ActionFeedback,
  AssetImageField,
  emptyState,
  LocalizedField,
  type AssetOption,
} from "./catalog-fields";
import type { CategoryData } from "./category-dialog";

/**
 * Inline editor for a category's own fields, rendered on the category detail
 * page (not a dialog). One explicit Save = one write + one revision bump +
 * one cache revalidation (catalog is live-on-save). updateCategory replaces the
 * WHOLE category, so every field is posted or it would be wiped.
 *
 * Delete lives here too (header), guarded by a confirm; on success the action
 * redirects back to /catalog.
 */
export function CategoryDetailsForm({
  category,
  assets,
  productCount,
}: {
  category: CategoryData;
  assets: AssetOption[];
  /** Number of products in this category, for the delete confirmation copy. */
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

  return (
    <section
      className="rounded-xl border border-border bg-card"
      aria-labelledby="category-details-heading"
    >
      <header className="flex items-center justify-between gap-3 border-b border-border p-5">
        <h2
          id="category-details-heading"
          className="text-sm font-semibold text-foreground"
        >
          Category details
        </h2>
        <form
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
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={delPending}
            aria-disabled={delPending}
            title={delState.error ?? "Delete this category"}
            className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            {delPending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Trash2 aria-hidden />
            )}
            Delete category
          </Button>
        </form>
      </header>

      <form action={formAction} className="flex flex-col gap-4 p-5">
        <input type="hidden" name="id" value={category.id} />

        <ActionFeedback state={state} />
        {state.success && (
          <p
            role="status"
            className="inline-flex w-fit items-center gap-1.5 rounded-md border border-success/30 bg-success/10 px-2.5 py-1 text-xs font-medium text-success"
          >
            <Check className="size-3.5" aria-hidden />
            Saved — live now
          </p>
        )}

        <Field label="Slug" htmlFor={`${idBase}-slug`} required>
          <Input
            id={`${idBase}-slug`}
            name="slug"
            required
            defaultValue={category.slug}
            placeholder="e.g. plastic-logos-emblems"
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

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Products"
            htmlFor={`${idBase}-prod`}
            hint="Shown on the site"
          >
            <Input
              id={`${idBase}-prod`}
              type="number"
              name="productCount"
              min={0}
              defaultValue={category.productCount}
              className="font-mono tabular-nums text-sm"
            />
          </Field>
          <Field
            label="Materials"
            htmlFor={`${idBase}-mat`}
            hint="Shown on the site"
          >
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

        <AssetImageField
          assets={assets}
          defaultValue={category.imageId}
          id={`${idBase}-image`}
        />

        <div className="flex justify-end pt-1">
          <Button type="submit" disabled={pending} aria-disabled={pending}>
            {pending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Check aria-hidden />
            )}
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </section>
  );
}
