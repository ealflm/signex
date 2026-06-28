"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/app/lib/session";
import { apiServer } from "@/app/lib/api";
import { getActiveThemeId } from "@/app/lib/themes";

// ── types ─────────────────────────────────────────────────────────────────────

export interface CatalogActionState {
  error?: string;
  success?: boolean;
}

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Resolves the active theme id and fetches the current draftRevision.
 * Returns null if no active theme is set.
 * Returns { id, rev: 0 } when the theme fetch fails (safe fallback — API
 * will return 409 STALE_DRAFT if the revision is stale, which is surfaced to
 * the user with a clear message).
 */
async function activeTheme(): Promise<{ id: string; rev: number } | null> {
  const id = await getActiveThemeId();
  if (!id) return null;
  const res = await apiServer<{ draftRevision: number }>(`/api/themes/${id}`);
  return res.ok ? { id, rev: res.data.draftRevision } : { id, rev: 0 };
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
  if (status === 409) return "Draft changed elsewhere — refresh and retry.";
  return message;
}

// ── Category actions ──────────────────────────────────────────────────────────

export async function createCategory(
  _prevState: CatalogActionState,
  fd: FormData,
): Promise<CatalogActionState> {
  // Hard role re-check (affordance from UI is not the gate)
  await requireRole("EDITOR");

  const t = await activeTheme();
  if (!t) return { error: "No active theme selected." };

  const res = await apiServer(`/api/themes/${t.id}/catalog/categories`, {
    method: "POST",
    body: {
      expectedDraftRevision: t.rev,
      slug: String(fd.get("slug") ?? ""),
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
  return { success: true };
}

export async function updateCategory(
  _prevState: CatalogActionState,
  fd: FormData,
): Promise<CatalogActionState> {
  await requireRole("EDITOR");

  const t = await activeTheme();
  if (!t) return { error: "No active theme selected." };

  const id = String(fd.get("id") ?? "");

  const res = await apiServer(`/api/themes/${t.id}/catalog/categories/${id}`, {
    method: "PATCH",
    body: {
      expectedDraftRevision: t.rev,
      slug: String(fd.get("slug") ?? ""),
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
  return { success: true };
}

export async function deleteCategory(
  _prevState: CatalogActionState,
  fd: FormData,
): Promise<CatalogActionState> {
  await requireRole("EDITOR");

  const t = await activeTheme();
  if (!t) return { error: "No active theme selected." };

  const id = String(fd.get("id") ?? "");

  const res = await apiServer(`/api/themes/${t.id}/catalog/categories/${id}`, {
    method: "DELETE",
    body: { expectedDraftRevision: t.rev },
  });

  if (!res.ok) return { error: apiError(res.status, res.error) };

  revalidatePath("/catalog");
  return { success: true };
}

// ── Product actions ───────────────────────────────────────────────────────────

export async function createProduct(
  _prevState: CatalogActionState,
  fd: FormData,
): Promise<CatalogActionState> {
  await requireRole("EDITOR");

  const t = await activeTheme();
  if (!t) return { error: "No active theme selected." };

  // categoryId is the PATH param — not included in the request body
  const categoryId = String(fd.get("categoryId") ?? "");

  const res = await apiServer(
    `/api/themes/${t.id}/catalog/categories/${categoryId}/products`,
    {
      method: "POST",
      body: {
        expectedDraftRevision: t.rev,
        slug: String(fd.get("slug") ?? ""),
        title: localized(fd, "title"),
        tag: localized(fd, "tag"),
        desc: localized(fd, "desc"),
        imageId: imageId(fd),
      },
    },
  );

  if (!res.ok) return { error: apiError(res.status, res.error) };

  revalidatePath("/catalog");
  return { success: true };
}

export async function updateProduct(
  _prevState: CatalogActionState,
  fd: FormData,
): Promise<CatalogActionState> {
  await requireRole("EDITOR");

  const t = await activeTheme();
  if (!t) return { error: "No active theme selected." };

  // categoryId + pid are PATH params — categoryId is NOT in the body
  const categoryId = String(fd.get("categoryId") ?? "");
  const pid = String(fd.get("id") ?? "");

  const res = await apiServer(
    `/api/themes/${t.id}/catalog/categories/${categoryId}/products/${pid}`,
    {
      method: "PATCH",
      body: {
        expectedDraftRevision: t.rev,
        slug: String(fd.get("slug") ?? ""),
        title: localized(fd, "title"),
        tag: localized(fd, "tag"),
        desc: localized(fd, "desc"),
        imageId: imageId(fd),
      },
    },
  );

  if (!res.ok) return { error: apiError(res.status, res.error) };

  revalidatePath("/catalog");
  return { success: true };
}

export async function deleteProduct(
  _prevState: CatalogActionState,
  fd: FormData,
): Promise<CatalogActionState> {
  await requireRole("EDITOR");

  const t = await activeTheme();
  if (!t) return { error: "No active theme selected." };

  // categoryId + pid are PATH params
  const categoryId = String(fd.get("categoryId") ?? "");
  const pid = String(fd.get("id") ?? "");

  const res = await apiServer(
    `/api/themes/${t.id}/catalog/categories/${categoryId}/products/${pid}`,
    {
      method: "DELETE",
      body: { expectedDraftRevision: t.rev },
    },
  );

  if (!res.ok) return { error: apiError(res.status, res.error) };

  revalidatePath("/catalog");
  return { success: true };
}
