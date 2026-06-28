"use client";

import { useActionState } from "react";
import {
  createCategory,
  updateCategory,
  deleteCategory,
  type CatalogActionState,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/admin/section-card";
import { Field } from "@/components/admin/field";

interface Loc { en: string; vi: string }
interface AssetRow { id: string; originalName: string }
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

// ── Shared sub-components ─────────────────────────────────────────────────────

// Native <select> kept intentionally: name="imageId" posts to a server action.
// Restyled with token classes only.
const nativeSelectCls =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs " +
  "outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 " +
  "transition-[border-color,box-shadow] duration-150";

function AssetSelect({
  assets,
  defaultValue,
  id,
}: {
  assets: AssetRow[];
  defaultValue: string | null;
  id?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id ?? "asset-select"} className="text-xs font-medium text-muted-foreground">
        Image
      </Label>
      <select
        id={id ?? "asset-select"}
        name="imageId"
        defaultValue={defaultValue ?? ""}
        className={nativeSelectCls}
      >
        <option value="">— none —</option>
        {assets.map((a) => (
          <option key={a.id} value={a.id}>
            {a.originalName}
          </option>
        ))}
      </select>
    </div>
  );
}

function LocalizedPair({
  base,
  label,
  defaultEn,
  defaultVi,
  placeholder,
  multiline,
}: {
  base: string;
  label: string;
  defaultEn?: string;
  defaultVi?: string;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-xs font-medium text-muted-foreground">{label}</legend>
      <div className="flex gap-1">
        {multiline ? (
          <>
            <Textarea
              name={`${base}.en`}
              rows={2}
              defaultValue={defaultEn ?? ""}
              placeholder={`${placeholder ?? label} (en)`}
              className="w-44 resize-y text-sm"
            />
            <Textarea
              name={`${base}.vi`}
              rows={2}
              defaultValue={defaultVi ?? ""}
              placeholder={`${placeholder ?? label} (vi)`}
              className="w-44 resize-y text-sm"
            />
          </>
        ) : (
          <>
            <Input
              type="text"
              name={`${base}.en`}
              defaultValue={defaultEn ?? ""}
              placeholder={`${placeholder ?? label} (en)`}
              className="w-40 text-sm"
            />
            <Input
              type="text"
              name={`${base}.vi`}
              defaultValue={defaultVi ?? ""}
              placeholder={`${placeholder ?? label} (vi)`}
              className="w-40 text-sm"
            />
          </>
        )}
      </div>
    </fieldset>
  );
}

function ActionFeedback({ state }: { state: CatalogActionState }) {
  if (state.error) {
    const is409 =
      state.error.includes("409") ||
      state.error.toLowerCase().includes("conflict");
    const is422 =
      state.error.includes("422") ||
      state.error.toLowerCase().includes("validation");
    return (
      <p
        role="alert"
        aria-live="assertive"
        className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
      >
        {is409
          ? "Stale lock: the catalog was changed elsewhere. Refresh and retry."
          : is422
            ? `Validation error: ${state.error}`
            : `Error: ${state.error}`}
      </p>
    );
  }
  if (state.success) {
    return (
      <p
        role="status"
        aria-live="polite"
        className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success"
      >
        Saved.
      </p>
    );
  }
  return null;
}

// ── Create category form ──────────────────────────────────────────────────────

const emptyState: CatalogActionState = {};

export function CreateCategoryForm({ assets }: { assets: AssetRow[] }) {
  const [state, formAction, pending] = useActionState(
    createCategory,
    emptyState,
  );

  return (
    <SectionCard title="Add category">
      <ActionFeedback state={state} />
      <form action={formAction} className="mt-2 flex flex-wrap items-end gap-3">
        <Field label="Slug" htmlFor="cat-create-slug" required>
          <Input
            id="cat-create-slug"
            type="text"
            name="slug"
            required
            placeholder="e.g. stone"
            className="w-36 font-mono tabular-nums text-sm"
          />
        </Field>

        <LocalizedPair base="title" label="Title" />
        <LocalizedPair base="tag" label="Tag" />
        <LocalizedPair base="intro" label="Intro" multiline />

        <Field label="Product count" htmlFor="cat-create-prod-count">
          <Input
            id="cat-create-prod-count"
            type="number"
            name="productCount"
            defaultValue={0}
            min={0}
            className="w-24 font-mono tabular-nums text-sm"
          />
        </Field>

        <Field label="Material count" htmlFor="cat-create-mat-count">
          <Input
            id="cat-create-mat-count"
            type="number"
            name="materialCount"
            defaultValue={0}
            min={0}
            className="w-24 font-mono tabular-nums text-sm"
          />
        </Field>

        <AssetSelect assets={assets} defaultValue={null} id="cat-create-image" />

        <Button
          type="submit"
          disabled={pending}
          aria-disabled={pending}
        >
          {pending ? "Adding…" : "Add category"}
        </Button>
      </form>
    </SectionCard>
  );
}

// ── Edit category form ────────────────────────────────────────────────────────

export function EditCategoryForm({
  category,
  assets,
}: {
  category: CategoryRow;
  assets: AssetRow[];
}) {
  const [state, formAction, pending] = useActionState(
    updateCategory,
    emptyState,
  );

  return (
    <>
      <ActionFeedback state={state} />
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="id" value={category.id} />
        <input type="hidden" name="slug" value={category.slug} />
        <input
          type="hidden"
          name="title.en"
          value={category.title.en}
        />
        <input
          type="hidden"
          name="title.vi"
          value={category.title.vi}
        />
        <input type="hidden" name="tag.en" value={category.tag.en} />
        <input type="hidden" name="tag.vi" value={category.tag.vi} />
        <input
          type="hidden"
          name="intro.en"
          value={category.intro.en}
        />
        <input
          type="hidden"
          name="intro.vi"
          value={category.intro.vi}
        />
        <input
          type="hidden"
          name="productCount"
          value={String(category.productCount)}
        />
        <input
          type="hidden"
          name="materialCount"
          value={String(category.materialCount)}
        />

        <AssetSelect assets={assets} defaultValue={category.imageId} id={`cat-edit-image-${category.id}`} />

        <Button
          type="submit"
          variant="outline"
          size="sm"
          disabled={pending}
          aria-disabled={pending}
        >
          {pending ? "Saving…" : "Save"}
        </Button>
      </form>
    </>
  );
}

// ── Delete category form ──────────────────────────────────────────────────────

export function DeleteCategoryForm({ categoryId, slug }: { categoryId: string; slug: string }) {
  const [state, formAction, pending] = useActionState(
    deleteCategory,
    emptyState,
  );

  return (
    <>
      {state.error && (
        <p role="alert" className="text-xs text-destructive">
          {state.error}
        </p>
      )}
      <form
        action={formAction}
        onSubmit={(e) => {
          if (
            !window.confirm(
              `Delete category "${slug}"? This cannot be undone.`,
            )
          ) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="id" value={categoryId} />
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          disabled={pending}
          aria-disabled={pending}
          className="text-destructive hover:text-destructive"
        >
          {pending ? "Deleting…" : "Delete"}
        </Button>
      </form>
    </>
  );
}
