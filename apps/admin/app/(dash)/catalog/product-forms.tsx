"use client";

import { useActionState } from "react";
import {
  createProduct,
  updateProduct,
  deleteProduct,
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
interface CategoryRow { id: string; slug: string }
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

// ── Shared sub-components ─────────────────────────────────────────────────────

// Native <select> kept intentionally: name="imageId" / name="categoryId" posts to a server action.
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

// ── Create product form ───────────────────────────────────────────────────────

const emptyState: CatalogActionState = {};

export function CreateProductForm({
  categories,
  assets,
}: {
  categories: CategoryRow[];
  assets: AssetRow[];
}) {
  const [state, formAction, pending] = useActionState(
    createProduct,
    emptyState,
  );

  return (
    <SectionCard title="Add product">
      <ActionFeedback state={state} />
      <form action={formAction} className="mt-2 flex flex-wrap items-end gap-3">
        <Field label="Category" htmlFor="prod-create-cat" required>
          {/* Native select: name="categoryId" posts to createProduct server action */}
          <select
            id="prod-create-cat"
            name="categoryId"
            required
            className={nativeSelectCls + " w-40"}
          >
            <option value="">— select —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.slug}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Slug" htmlFor="prod-create-slug" required>
          <Input
            id="prod-create-slug"
            type="text"
            name="slug"
            required
            placeholder="e.g. granite-dark"
            className="w-40 font-mono tabular-nums text-sm"
          />
        </Field>

        <Field label="Sort order" htmlFor="prod-create-sort">
          <Input
            id="prod-create-sort"
            type="number"
            name="sortOrder"
            defaultValue={0}
            className="w-20 font-mono tabular-nums text-sm"
          />
        </Field>

        <LocalizedPair base="title" label="Title" />
        <LocalizedPair base="tag" label="Tag" />
        <LocalizedPair base="desc" label="Description" multiline />

        <AssetSelect assets={assets} defaultValue={null} id="prod-create-image" />

        <Button
          type="submit"
          disabled={pending}
          aria-disabled={pending}
        >
          {pending ? "Adding…" : "Add product"}
        </Button>
      </form>
    </SectionCard>
  );
}

// ── Edit product form (inline in table row) ───────────────────────────────────

export function EditProductForm({
  product,
  categories,
  assets,
}: {
  product: ProductRow;
  categories: CategoryRow[];
  assets: AssetRow[];
}) {
  const [state, formAction, pending] = useActionState(
    updateProduct,
    emptyState,
  );

  return (
    <>
      <ActionFeedback state={state} />
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="id" value={product.id} />
        <input type="hidden" name="slug" value={product.slug} />
        <input type="hidden" name="title.en" value={product.title.en} />
        <input type="hidden" name="title.vi" value={product.title.vi} />
        <input type="hidden" name="tag.en" value={product.tag.en} />
        <input type="hidden" name="tag.vi" value={product.tag.vi} />
        <input type="hidden" name="desc.en" value={product.desc.en} />
        <input type="hidden" name="desc.vi" value={product.desc.vi} />

        {/* categoryId — allow reassignment inline */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`prod-edit-cat-${product.id}`} className="text-xs font-medium text-muted-foreground">
            Category
          </Label>
          {/* Native select: name="categoryId" posts to updateProduct server action */}
          <select
            id={`prod-edit-cat-${product.id}`}
            name="categoryId"
            defaultValue={product.categoryId}
            className={nativeSelectCls + " w-32 text-xs"}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.slug}
              </option>
            ))}
          </select>
        </div>

        <Input
          type="number"
          name="sortOrder"
          defaultValue={product.sortOrder}
          aria-label="Sort order"
          className="w-16 font-mono tabular-nums text-sm"
        />

        <AssetSelect assets={assets} defaultValue={product.imageId} id={`prod-edit-image-${product.id}`} />

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

// ── Delete product form ───────────────────────────────────────────────────────

export function DeleteProductForm({
  productId,
  slug,
}: {
  productId: string;
  slug: string;
}) {
  const [state, formAction, pending] = useActionState(
    deleteProduct,
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
            !window.confirm(`Delete product "${slug}"? This cannot be undone.`)
          ) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="id" value={productId} />
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
