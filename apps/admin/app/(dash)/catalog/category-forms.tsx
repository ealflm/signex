"use client";

import { useActionState } from "react";
import {
  createCategory,
  updateCategory,
  deleteCategory,
  type CatalogActionState,
} from "./actions";

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

// ── Create category form ──────────────────────────────────────────────────────

const emptyState: CatalogActionState = {};

export function CreateCategoryForm({ assets }: { assets: AssetRow[] }) {
  const [state, formAction, pending] = useActionState(
    createCategory,
    emptyState,
  );

  return (
    <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">
        Add category
      </h3>
      <ActionFeedback state={state} />
      <form action={formAction} className="mt-2 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-0.5">
          <label
            htmlFor="cat-create-slug"
            className="text-xs font-medium text-gray-500"
          >
            Slug *
          </label>
          <input
            id="cat-create-slug"
            type="text"
            name="slug"
            required
            placeholder="e.g. stone"
            className="w-36 rounded-md border border-gray-300 px-2 py-1 text-sm
                       placeholder-gray-400 shadow-sm
                       focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
          />
        </div>

        <div className="flex flex-col gap-0.5">
          <label
            htmlFor="cat-create-sort"
            className="text-xs font-medium text-gray-500"
          >
            Sort order
          </label>
          <input
            id="cat-create-sort"
            type="number"
            name="sortOrder"
            defaultValue={0}
            className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm
                       shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
          />
        </div>

        <LocalizedPair base="title" label="Title" />
        <LocalizedPair base="tag" label="Tag" />
        <LocalizedPair base="intro" label="Intro" multiline />

        <div className="flex flex-col gap-0.5">
          <label
            htmlFor="cat-create-prod-count"
            className="text-xs font-medium text-gray-500"
          >
            Product count
          </label>
          <input
            id="cat-create-prod-count"
            type="number"
            name="productCount"
            defaultValue={0}
            min={0}
            className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm
                       shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
          />
        </div>

        <div className="flex flex-col gap-0.5">
          <label
            htmlFor="cat-create-mat-count"
            className="text-xs font-medium text-gray-500"
          >
            Material count
          </label>
          <input
            id="cat-create-mat-count"
            type="number"
            name="materialCount"
            defaultValue={0}
            min={0}
            className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm
                       shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
          />
        </div>

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
          {pending ? "Adding…" : "Add category"}
        </button>
      </form>
    </div>
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

        <input
          type="number"
          name="sortOrder"
          defaultValue={category.sortOrder}
          aria-label="Sort order"
          className="w-16 rounded-md border border-gray-300 px-1 py-0.5 text-sm
                     focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
        />

        <AssetSelect assets={assets} defaultValue={category.imageId} />

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

// ── Delete category form ──────────────────────────────────────────────────────

export function DeleteCategoryForm({ categoryId, slug }: { categoryId: string; slug: string }) {
  const [state, formAction, pending] = useActionState(
    deleteCategory,
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
            !window.confirm(
              `Delete category "${slug}"? This cannot be undone.`,
            )
          ) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="id" value={categoryId} />
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
