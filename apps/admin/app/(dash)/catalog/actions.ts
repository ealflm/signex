"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/app/lib/session";
import { apiServer } from "@/app/lib/api";

// ── types ─────────────────────────────────────────────────────────────────────

export interface CatalogActionState {
  error?: string;
  success?: boolean;
}

// Returned by GET /api/releases/diff (source of truth for the working revision)
interface DiffStatus {
  dirty: boolean;
  revision: number;
  lastPublishedRevision: number;
}

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns the current *working* revision from /api/releases/diff.
 * This is the correct optimistic-lock source: /api/releases/live returns
 * {version,checksum,publishedAt} with NO `revision` field.
 */
async function currentRevision(): Promise<number> {
  const res = await apiServer<DiffStatus>("/api/releases/diff");
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

// ── Category actions ──────────────────────────────────────────────────────────

export async function createCategory(
  _prevState: CatalogActionState,
  fd: FormData,
): Promise<CatalogActionState> {
  // Hard role re-check (affordance from UI is not the gate)
  await requireRole("EDITOR");

  const res = await apiServer("/api/catalog/categories", {
    method: "POST",
    body: {
      input: {
        slug: String(fd.get("slug") ?? ""),
        sortOrder: Number(fd.get("sortOrder") ?? 0),
        title: localized(fd, "title"),
        tag: localized(fd, "tag"),
        intro: localized(fd, "intro"),
        productCount: Number(fd.get("productCount") ?? 0),
        materialCount: Number(fd.get("materialCount") ?? 0),
        imageId: imageId(fd),
      },
      expectedRevision: await currentRevision(),
    },
  });

  if (!res.ok) return { error: res.error };

  revalidatePath("/catalog");
  return { success: true };
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
      input: {
        slug: String(fd.get("slug") ?? ""),
        sortOrder: Number(fd.get("sortOrder") ?? 0),
        title: localized(fd, "title"),
        tag: localized(fd, "tag"),
        intro: localized(fd, "intro"),
        productCount: Number(fd.get("productCount") ?? 0),
        materialCount: Number(fd.get("materialCount") ?? 0),
        imageId: imageId(fd),
      },
      expectedRevision: await currentRevision(),
    },
  });

  if (!res.ok) return { error: res.error };

  revalidatePath("/catalog");
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
    body: { expectedRevision: await currentRevision() },
  });

  if (!res.ok) return { error: res.error };

  revalidatePath("/catalog");
  return { success: true };
}

// ── Product actions ───────────────────────────────────────────────────────────

export async function createProduct(
  _prevState: CatalogActionState,
  fd: FormData,
): Promise<CatalogActionState> {
  await requireRole("EDITOR");

  const res = await apiServer("/api/catalog/products", {
    method: "POST",
    body: {
      input: {
        categoryId: String(fd.get("categoryId") ?? ""),
        slug: String(fd.get("slug") ?? ""),
        sortOrder: Number(fd.get("sortOrder") ?? 0),
        title: localized(fd, "title"),
        tag: localized(fd, "tag"),
        desc: localized(fd, "desc"),
        imageId: imageId(fd),
      },
      expectedRevision: await currentRevision(),
    },
  });

  if (!res.ok) return { error: res.error };

  revalidatePath("/catalog");
  return { success: true };
}

export async function updateProduct(
  _prevState: CatalogActionState,
  fd: FormData,
): Promise<CatalogActionState> {
  await requireRole("EDITOR");

  const id = String(fd.get("id") ?? "");

  const res = await apiServer(`/api/catalog/products/${id}`, {
    method: "PATCH",
    body: {
      input: {
        categoryId: String(fd.get("categoryId") ?? ""),
        slug: String(fd.get("slug") ?? ""),
        sortOrder: Number(fd.get("sortOrder") ?? 0),
        title: localized(fd, "title"),
        tag: localized(fd, "tag"),
        desc: localized(fd, "desc"),
        imageId: imageId(fd),
      },
      expectedRevision: await currentRevision(),
    },
  });

  if (!res.ok) return { error: res.error };

  revalidatePath("/catalog");
  return { success: true };
}

export async function deleteProduct(
  _prevState: CatalogActionState,
  fd: FormData,
): Promise<CatalogActionState> {
  await requireRole("EDITOR");

  const id = String(fd.get("id") ?? "");

  const res = await apiServer(`/api/catalog/products/${id}`, {
    method: "DELETE",
    body: { expectedRevision: await currentRevision() },
  });

  if (!res.ok) return { error: res.error };

  revalidatePath("/catalog");
  return { success: true };
}
