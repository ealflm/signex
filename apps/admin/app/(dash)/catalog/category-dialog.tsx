"use client";

import * as React from "react";
import { useActionState, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { slugify } from "@signex/shared";
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
import { createCategory, updateCategory } from "./actions";
import {
  ActionFeedback,
  emptyState,
  LocalizedField,
  SubmitButton,
  type Loc,
} from "./catalog-fields";
import { CatalogImagePicker } from "./catalog-image-picker";

export interface CategoryData {
  id: string;
  slug: string;
  title: Loc;
  tag: Loc;
  intro: Loc;
  productCount: number;
  materialCount: number;
  imageId: string | null;
}

const EMPTY_CATEGORY: CategoryData = {
  id: "",
  slug: "",
  title: { en: "", vi: "" },
  tag: { en: "", vi: "" },
  intro: { en: "", vi: "" },
  productCount: 0,
  materialCount: 0,
  imageId: null,
};

/**
 * The form body. Mounted only while the dialog is open (Radix unmounts closed
 * content), so useActionState resets on every open — a fresh {} each time,
 * which lets `state.success` reliably drive close-then-reset.
 *
 * Every field the server action reads is posted here. updateCategory replaces
 * the WHOLE category object (no merge), so slug / title / tag / intro / counts /
 * image must all be present or they would be wiped.
 */
function CategoryForm({
  mode,
  category,
  onSuccess,
}: {
  mode: "create" | "edit";
  category: CategoryData;
  onSuccess: () => void;
}) {
  const isEdit = mode === "edit";
  const [state, formAction, pending] = useActionState(
    isEdit ? updateCategory : createCategory,
    emptyState,
  );
  useEffect(() => {
    if (state.success) onSuccess();
  }, [state.success, onSuccess]);

  // Slug is controlled so we can auto-slugify. On create, derive it from the
  // English title until the user edits the slug themselves; on edit, keep the
  // existing slug (never clobber it from the title). Always normalize on blur.
  const [slug, setSlug] = useState(category.slug);
  const slugEdited = useRef(isEdit);
  const onTitleEn = (v: string) => {
    if (!slugEdited.current) setSlug(slugify(v));
  };

  const idBase = `cat-${mode}-${category.id || "new"}`;

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isEdit ? "Edit category" : "New category"}</DialogTitle>
        <DialogDescription>
          {isEdit
            ? "Update this category. Changes go live immediately."
            : "Add a catalog category. It goes live immediately — you'll land on its page to add products."}
        </DialogDescription>
      </DialogHeader>

      <form action={formAction} className="flex flex-col gap-4">
        {isEdit && <input type="hidden" name="id" value={category.id} />}

        <ActionFeedback state={state} />

        <Field
          label="Slug"
          htmlFor={`${idBase}-slug`}
          required
          hint="Lowercase, numbers and hyphens — used in the page URL."
        >
          <Input
            id={`${idBase}-slug`}
            name="slug"
            required
            value={slug}
            onChange={(e) => {
              slugEdited.current = true;
              setSlug(e.target.value);
            }}
            onBlur={() => setSlug((s) => slugify(s))}
            placeholder="e.g. plastic-logos-emblems"
            className="font-mono tabular-nums text-sm"
          />
        </Field>

        <LocalizedField
          base="title"
          label="Title"
          value={category.title}
          onEnInput={onTitleEn}
        />
        <LocalizedField base="tag" label="Tag" value={category.tag} />
        <LocalizedField base="intro" label="Intro" value={category.intro} multiline />

        <div className="grid grid-cols-2 gap-3">
          <Field label="Products" htmlFor={`${idBase}-prod`} hint="Shown on the site">
            <Input
              id={`${idBase}-prod`}
              type="number"
              name="productCount"
              min={0}
              defaultValue={category.productCount}
              className="font-mono tabular-nums text-sm"
            />
          </Field>
          <Field label="Materials" htmlFor={`${idBase}-mat`} hint="Shown on the site">
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

        <CatalogImagePicker
          field="catalog.category.image"
          defaultImageId={category.imageId}
          defaultImageUrl={null}
        />

        <DialogFooter className="gap-2 pt-2">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <SubmitButton
            pending={pending}
            idleLabel={isEdit ? "Save changes" : "Add category"}
            pendingLabel={isEdit ? "Saving…" : "Adding…"}
          />
        </DialogFooter>
      </form>
    </>
  );
}

function CategoryDialog({
  mode,
  category = EMPTY_CATEGORY,
  trigger,
}: {
  mode: "create" | "edit";
  category?: CategoryData;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <CategoryForm
          mode={mode}
          category={category}
          onSuccess={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

export function CreateCategoryDialog() {
  return (
    <CategoryDialog
      mode="create"
      trigger={
        <Button size="sm" className="h-8 gap-1.5">
          <Plus aria-hidden />
          New category
        </Button>
      }
    />
  );
}

export function EditCategoryDialog({
  category,
  trigger,
}: {
  category: CategoryData;
  trigger: React.ReactNode;
}) {
  return (
    <CategoryDialog mode="edit" category={category} trigger={trigger} />
  );
}
