"use client";

import { useActionState } from "react";
import {
  createProduct,
  updateProduct,
  deleteProduct,
  type CatalogActionState,
} from "./actions";

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

function AssetSelect({
  assets,
  defaultValue,
}: {
  assets: AssetRow[];
  defaultValue: string | null;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-xs font-medium text-gray-500">Image</label>
      <select
        name="imageId"
        defaultValue={defaultValue ?? ""}
        className="rounded-md border border-gray-300 px-2 py-1 text-sm
                   focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
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
  const cls =
    "rounded-md border border-gray-300 px-2 py-1 text-sm placeholder-gray-400 shadow-sm " +
    "focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900";

  return (
    <fieldset className="flex flex-col gap-0.5">
      <legend className="text-xs font-medium text-gray-500">{label}</legend>
      <div className="flex gap-1">
        {multiline ? (
          <>
            <textarea
              name={`${base}.en`}
              rows={2}
              defaultValue={defaultEn ?? ""}
              placeholder={`${placeholder ?? label} (en)`}
              className={cls + " w-44 resize-y"}
            />
            <textarea
              name={`${base}.vi`}
              rows={2}
              defaultValue={defaultVi ?? ""}
              placeholder={`${placeholder ?? label} (vi)`}
              className={cls + " w-44 resize-y"}
            />
          </>
        ) : (
          <>
            <input
              type="text"
              name={`${base}.en`}
              defaultValue={defaultEn ?? ""}
              placeholder={`${placeholder ?? label} (en)`}
              className={cls + " w-40"}
            />
            <input
              type="text"
              name={`${base}.vi`}
              defaultValue={defaultVi ?? ""}
              placeholder={`${placeholder ?? label} (vi)`}
              className={cls + " w-40"}
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
        className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
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
        className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700"
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
    <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">Add product</h3>
      <ActionFeedback state={state} />
      <form action={formAction} className="mt-2 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-0.5">
          <label
            htmlFor="prod-create-cat"
            className="text-xs font-medium text-gray-500"
          >
            Category *
          </label>
          <select
            id="prod-create-cat"
            name="categoryId"
            required
            className="rounded-md border border-gray-300 px-2 py-1 text-sm
                       focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
          >
            <option value="">— select —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.slug}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-0.5">
          <label
            htmlFor="prod-create-slug"
            className="text-xs font-medium text-gray-500"
          >
            Slug *
          </label>
          <input
            id="prod-create-slug"
            type="text"
            name="slug"
            required
            placeholder="e.g. granite-dark"
            className="w-40 rounded-md border border-gray-300 px-2 py-1 text-sm
                       placeholder-gray-400 shadow-sm
                       focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
          />
        </div>

        <div className="flex flex-col gap-0.5">
          <label
            htmlFor="prod-create-sort"
            className="text-xs font-medium text-gray-500"
          >
            Sort order
          </label>
          <input
            id="prod-create-sort"
            type="number"
            name="sortOrder"
            defaultValue={0}
            className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm
                       shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
          />
        </div>

        <LocalizedPair base="title" label="Title" />
        <LocalizedPair base="tag" label="Tag" />
        <LocalizedPair base="desc" label="Description" multiline />

        <AssetSelect assets={assets} defaultValue={null} />

        <button
          type="submit"
          disabled={pending}
          aria-disabled={pending}
          className="rounded-md bg-gray-900 px-4 py-1.5 text-sm font-medium text-white shadow-sm
                     transition-colors hover:bg-gray-700
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2
                     disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add product"}
        </button>
      </form>
    </div>
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
        <div className="flex flex-col gap-0.5">
          <label className="text-xs font-medium text-gray-500">Category</label>
          <select
            name="categoryId"
            defaultValue={product.categoryId}
            className="rounded-md border border-gray-300 px-1 py-0.5 text-xs
                       focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.slug}
              </option>
            ))}
          </select>
        </div>

        <input
          type="number"
          name="sortOrder"
          defaultValue={product.sortOrder}
          aria-label="Sort order"
          className="w-16 rounded-md border border-gray-300 px-1 py-0.5 text-sm
                     focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
        />

        <AssetSelect assets={assets} defaultValue={product.imageId} />

        <button
          type="submit"
          disabled={pending}
          aria-disabled={pending}
          className="rounded-md border border-gray-300 px-2 py-0.5 text-xs font-medium text-gray-700
                     hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900
                     disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
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
        <p role="alert" className="text-xs text-red-600">
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
        <button
          type="submit"
          disabled={pending}
          aria-disabled={pending}
          className="rounded px-2 py-0.5 text-xs font-medium text-red-600
                     hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600
                     disabled:opacity-50"
        >
          {pending ? "Deleting…" : "Delete"}
        </button>
      </form>
    </>
  );
}
