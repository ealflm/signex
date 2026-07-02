"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/app/lib/session";
import { apiServer } from "@/app/lib/api";

// ── types ─────────────────────────────────────────────────────────────────────

export interface CatalogActionState {
  error?: string;
  success?: boolean;
}

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Fetch the current GLOBAL catalog draftRevision (the optimistic lock). The
 * catalog is a single global entity now — no theme. On a failed read we return 0;
 * the API returns 409 STALE_DRAFT if that is stale, which is surfaced to the user.
 */
async function catalogRevision(): Promise<number> {
  const res = await apiServer<{ draftRevision: number }>("/api/catalog");
  return res.ok ? res.data.draftRevision : 0;
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

  const res = await apiServer(`/api/catalog/categories`, {
    method: "POST",
    body: {
      expectedDraftRevision: await catalogRevision(),
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

  const id = String(fd.get("id") ?? "");

  const res = await apiServer(`/api/catalog/categories/${id}`, {
    method: "PATCH",
    body: {
      expectedDraftRevision: await catalogRevision(),
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

  const id = String(fd.get("id") ?? "");

  const res = await apiServer(`/api/catalog/categories/${id}`, {
    method: "DELETE",
    body: { expectedDraftRevision: await catalogRevision() },
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

  // categoryId is the PATH param — not included in the request body
  const categoryId = String(fd.get("categoryId") ?? "");

  const res = await apiServer(
    `/api/catalog/categories/${categoryId}/products`,
    {
      method: "POST",
      body: {
        expectedDraftRevision: await catalogRevision(),
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

  // categoryId + pid are PATH params — categoryId is NOT in the body
  const categoryId = String(fd.get("categoryId") ?? "");
  const pid = String(fd.get("id") ?? "");

  const res = await apiServer(
    `/api/catalog/categories/${categoryId}/products/${pid}`,
    {
      method: "PATCH",
      body: {
        expectedDraftRevision: await catalogRevision(),
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

  // categoryId + pid are PATH params
  const categoryId = String(fd.get("categoryId") ?? "");
  const pid = String(fd.get("id") ?? "");

  const res = await apiServer(
    `/api/catalog/categories/${categoryId}/products/${pid}`,
    {
      method: "DELETE",
      body: { expectedDraftRevision: await catalogRevision() },
    },
  );

  if (!res.ok) return { error: apiError(res.status, res.error) };

  revalidatePath("/catalog");
  return { success: true };
}

// ── Release actions (publish / rollback) ────────────────────────────────────────

/**
 * Publish the global catalog draft as a new CatalogRelease.
 * Requires PUBLISHER+; POST /api/catalog/releases/publish {expectedDraftRevision, note?}.
 */
export async function publishCatalog(
  _prevState: CatalogActionState,
  fd: FormData,
): Promise<CatalogActionState> {
  await requireRole("PUBLISHER");

  const expectedDraftRevision = Number(fd.get("expectedDraftRevision") ?? 0);
  const noteRaw = String(fd.get("note") ?? "").trim();
  const note = noteRaw || undefined;

  const res = await apiServer("/api/catalog/releases/publish", {
    method: "POST",
    body: { expectedDraftRevision, note },
  });

  if (!res.ok) {
    const msg = res.error ?? `Error ${res.status}`;
    if (res.status === 409 && msg.includes("STALE_DRAFT")) {
      return { error: "Catalog changed since page loaded — refresh and retry." };
    }
    return { error: msg };
  }

  revalidatePath("/catalog");
  revalidatePath("/");
  return { success: true };
}

/**
 * Roll the live catalog back to an earlier version (mints a new release from it).
 * Requires PUBLISHER+; POST /api/catalog/releases/rollback {toVersion}.
 */
export async function rollbackCatalog(
  _prevState: CatalogActionState,
  fd: FormData,
): Promise<CatalogActionState> {
  await requireRole("PUBLISHER");

  const toVersion = Number(fd.get("toVersion") ?? 0);
  if (!toVersion) return { error: "Missing target version." };

  const res = await apiServer("/api/catalog/releases/rollback", {
    method: "POST",
    body: { toVersion },
  });

  if (!res.ok) return { error: res.error ?? `Error ${res.status}` };

  revalidatePath("/catalog");
  revalidatePath("/");
  return { success: true };
}
