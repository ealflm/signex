"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { slugify } from "@signex/shared";
import { requireRole } from "@/app/lib/session";
import { apiServer } from "@/app/lib/api";

/** Detail-page path for a category. */
function detailPath(categoryId: string): string {
  return `/catalog/categories/${categoryId}`;
}

// ── types ─────────────────────────────────────────────────────────────────────

export interface CatalogActionState {
  error?: string;
  success?: boolean;
}

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Fetch the current GLOBAL catalog `revision` (the optimistic lock). The catalog
 * is a single live entity — every write is immediately live. On a failed read we
 * return 0; the API returns 409 STALE_CATALOG if that is stale, surfaced to the
 * user.
 */
async function catalogRevision(): Promise<number> {
  const res = await apiServer<{ revision: number }>("/api/catalog");
  return res.ok ? res.data.revision : 0;
}

/** Build a LocalizedText pair from two formData keys: `base.en` / `base.vi`. */
function localized(fd: FormData, base: string) {
  return {
    en: String(fd.get(`${base}.en`) ?? ""),
    vi: String(fd.get(`${base}.vi`) ?? ""),
  };
}

/** Extract a nullable imageId string from formData (empty string → null). */
function imageId(fd: FormData): string | null {
  const v = fd.get("imageId");
  return v && String(v) !== "" ? String(v) : null;
}

/** Map API failure status to a user-friendly error string. */
function apiError(status: number, message: string): string {
  if (status === 409) return "Catalog changed elsewhere — refresh and retry.";
  return message;
}

// ── Category actions ──────────────────────────────────────────────────────────

export async function createCategory(
  _prevState: CatalogActionState,
  fd: FormData,
): Promise<CatalogActionState> {
  // Hard role re-check (affordance from UI is not the gate)
  await requireRole("EDITOR");

  const res = await apiServer<{ id: string; revision: number }>(
    `/api/catalog/categories`,
    {
      method: "POST",
      body: {
        expectedRevision: await catalogRevision(),
        slug: slugify(String(fd.get("slug") ?? "")),
        title: localized(fd, "title"),
        tag: localized(fd, "tag"),
        intro: localized(fd, "intro"),
        productCount: Number(fd.get("productCount") ?? 0),
        materialCount: Number(fd.get("materialCount") ?? 0),
        imageId: imageId(fd),
      },
    },
  );

  if (!res.ok) return { error: apiError(res.status, res.error) };

  revalidatePath("/catalog");
  // Jump straight into the new category's detail page to add products.
  redirect(detailPath(res.data.id));
}

export async function updateCategory(
  _prevState: CatalogActionState,
  fd: FormData,
): Promise<CatalogActionState> {
  await requireRole("EDITOR");

  const id = String(fd.get("id") ?? "");

  const res = await apiServer(`/api/catalog/categories/${id}`, {
    method: "PATCH",
    body: {
      expectedRevision: await catalogRevision(),
      slug: slugify(String(fd.get("slug") ?? "")),
      title: localized(fd, "title"),
      tag: localized(fd, "tag"),
      intro: localized(fd, "intro"),
      productCount: Number(fd.get("productCount") ?? 0),
      materialCount: Number(fd.get("materialCount") ?? 0),
      imageId: imageId(fd),
    },
  });

  if (!res.ok) return { error: apiError(res.status, res.error) };

  revalidatePath("/catalog");
  revalidatePath(detailPath(id));
  return { success: true };
}

export async function deleteCategory(
  _prevState: CatalogActionState,
  fd: FormData,
): Promise<CatalogActionState> {
  await requireRole("EDITOR");

  const id = String(fd.get("id") ?? "");

  const res = await apiServer(`/api/catalog/categories/${id}`, {
    method: "DELETE",
    body: { expectedRevision: await catalogRevision() },
  });

  if (!res.ok) return { error: apiError(res.status, res.error) };

  revalidatePath("/catalog");
  // The category is gone — return to the list.
  redirect("/catalog");
}

// ── Product actions ───────────────────────────────────────────────────────────

export async function createProduct(
  _prevState: CatalogActionState,
  fd: FormData,
): Promise<CatalogActionState> {
  await requireRole("EDITOR");

  // categoryId is the PATH param — not included in the request body
  const categoryId = String(fd.get("categoryId") ?? "");

  const res = await apiServer(
    `/api/catalog/categories/${categoryId}/products`,
    {
      method: "POST",
      body: {
        expectedRevision: await catalogRevision(),
        slug: slugify(String(fd.get("slug") ?? "")),
        title: localized(fd, "title"),
        tag: localized(fd, "tag"),
        desc: localized(fd, "desc"),
        imageId: imageId(fd),
      },
    },
  );

  if (!res.ok) return { error: apiError(res.status, res.error) };

  revalidatePath("/catalog");
  revalidatePath(detailPath(categoryId));
  return { success: true };
}

export async function updateProduct(
  _prevState: CatalogActionState,
  fd: FormData,
): Promise<CatalogActionState> {
  await requireRole("EDITOR");

  // categoryId + pid are PATH params — categoryId is NOT in the body
  const categoryId = String(fd.get("categoryId") ?? "");
  const pid = String(fd.get("id") ?? "");

  const res = await apiServer(
    `/api/catalog/categories/${categoryId}/products/${pid}`,
    {
      method: "PATCH",
      body: {
        expectedRevision: await catalogRevision(),
        slug: slugify(String(fd.get("slug") ?? "")),
        title: localized(fd, "title"),
        tag: localized(fd, "tag"),
        desc: localized(fd, "desc"),
        imageId: imageId(fd),
      },
    },
  );

  if (!res.ok) return { error: apiError(res.status, res.error) };

  revalidatePath("/catalog");
  revalidatePath(detailPath(categoryId));
  return { success: true };
}

export async function deleteProduct(
  _prevState: CatalogActionState,
  fd: FormData,
): Promise<CatalogActionState> {
  await requireRole("EDITOR");

  // categoryId + pid are PATH params
  const categoryId = String(fd.get("categoryId") ?? "");
  const pid = String(fd.get("id") ?? "");

  const res = await apiServer(
    `/api/catalog/categories/${categoryId}/products/${pid}`,
    {
      method: "DELETE",
      body: { expectedRevision: await catalogRevision() },
    },
  );

  if (!res.ok) return { error: apiError(res.status, res.error) };

  revalidatePath("/catalog");
  revalidatePath(detailPath(categoryId));
  return { success: true };
}
