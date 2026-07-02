"use client";

import * as React from "react";
import { useActionState, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/admin/field";
import { createProduct, updateProduct } from "./actions";
import {
  ActionFeedback,
  AssetImageField,
  emptyState,
  LocalizedField,
  nativeSelectCls,
  SubmitButton,
  type AssetOption,
  type Loc,
} from "./catalog-fields";

export interface ProductData {
  id: string;
  categoryId: string;
  slug: string;
  title: Loc;
  tag: Loc;
  desc: Loc;
  imageId: string | null;
}

export interface CategoryOption {
  id: string;
  slug: string;
}

function emptyProduct(categoryId: string): ProductData {
  return {
    id: "",
    categoryId,
    slug: "",
    title: { en: "", vi: "" },
    tag: { en: "", vi: "" },
    desc: { en: "", vi: "" },
    imageId: null,
  };
}

/**
 * Product form body — mounted only while the dialog is open so useActionState
 * resets per open. updateProduct replaces the whole product (no merge): slug /
 * title / tag / desc / image are all posted here, and categoryId is posted as
 * the routing key that can re-parent the product.
 */
function ProductForm({
  mode,
  product,
  categories,
  assets,
  onSuccess,
}: {
  mode: "create" | "edit";
  product: ProductData;
  categories: CategoryOption[];
  assets: AssetOption[];
  onSuccess: () => void;
}) {
  const isEdit = mode === "edit";
  const [state, formAction, pending] = useActionState(
    isEdit ? updateProduct : createProduct,
    emptyState,
  );
  useEffect(() => {
    if (state.success) onSuccess();
  }, [state.success, onSuccess]);

  const idBase = `prod-${mode}-${product.id || "new"}`;

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isEdit ? "Edit product" : "New product"}</DialogTitle>
        <DialogDescription>
          {isEdit
            ? "Update this product. Changes stay unpublished until you publish a release."
            : "Add a product to a category. It stays unpublished until you publish a release."}
        </DialogDescription>
      </DialogHeader>

      <form action={formAction} className="flex flex-col gap-4">
        {isEdit && <input type="hidden" name="id" value={product.id} />}

        <ActionFeedback state={state} />

        <div className="grid grid-cols-2 gap-3">
          <Field label="Category" htmlFor={`${idBase}-cat`} required>
            {/* Native select: name="categoryId" is the routing key posted to the action. */}
            <select
              id={`${idBase}-cat`}
              name="categoryId"
              required
              defaultValue={product.categoryId}
              className={nativeSelectCls}
            >
              <option value="" disabled>
                — select —
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.slug}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Slug" htmlFor={`${idBase}-slug`} required>
            <Input
              id={`${idBase}-slug`}
              name="slug"
              required
              defaultValue={product.slug}
              placeholder="e.g. soft-pvc-logo-patch"
              className="font-mono tabular-nums text-sm"
            />
          </Field>
        </div>

        <LocalizedField base="title" label="Title" value={product.title} />
        <LocalizedField base="tag" label="Tag" value={product.tag} />
        <LocalizedField base="desc" label="Description" value={product.desc} multiline />

        <AssetImageField
          assets={assets}
          defaultValue={product.imageId}
          id={`${idBase}-image`}
        />

        <DialogFooter className="gap-2 pt-2">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <SubmitButton
            pending={pending}
            idleLabel={isEdit ? "Save changes" : "Add product"}
            pendingLabel={isEdit ? "Saving…" : "Adding…"}
          />
        </DialogFooter>
      </form>
    </>
  );
}

function ProductDialog({
  mode,
  product,
  categories,
  assets,
  trigger,
}: {
  mode: "create" | "edit";
  product: ProductData;
  categories: CategoryOption[];
  assets: AssetOption[];
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <ProductForm
          mode={mode}
          product={product}
          categories={categories}
          assets={assets}
          onSuccess={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

export function CreateProductDialog({
  categories,
  assets,
  defaultCategoryId = "",
  disabled = false,
}: {
  categories: CategoryOption[];
  assets: AssetOption[];
  /** Pre-select a category (e.g. the current products filter). */
  defaultCategoryId?: string;
  /** Disabled when there are no categories to add a product to. */
  disabled?: boolean;
}) {
  return (
    <ProductDialog
      mode="create"
      product={emptyProduct(defaultCategoryId)}
      categories={categories}
      assets={assets}
      trigger={
        <Button
          size="sm"
          className="h-8 gap-1.5"
          disabled={disabled}
          title={disabled ? "Add a category first" : undefined}
        >
          <Plus aria-hidden />
          New product
        </Button>
      }
    />
  );
}

export function EditProductDialog({
  product,
  categories,
  assets,
  trigger,
}: {
  product: ProductData;
  categories: CategoryOption[];
  assets: AssetOption[];
  trigger: React.ReactNode;
}) {
  return (
    <ProductDialog
      mode="edit"
      product={product}
      categories={categories}
      assets={assets}
      trigger={trigger}
    />
  );
}
