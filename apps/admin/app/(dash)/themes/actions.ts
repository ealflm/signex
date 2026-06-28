"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/app/lib/session";
import { apiServer } from "@/app/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ThemeActionState {
  error?: string;
  success?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Map a raw API error + status to a friendly message. */
function friendlyError(status: number, error: string | undefined): string {
  return error ?? `Error ${status}`;
}

// ── Actions ───────────────────────────────────────────────────────────────────

/**
 * Duplicate an existing theme.
 * Requires EDITOR+; posts to POST /api/themes/:sourceId/duplicate {name}.
 */
export async function duplicateAction(
  _prevState: ThemeActionState,
  formData: FormData,
): Promise<ThemeActionState> {
  await requireRole("EDITOR");

  const name = String(formData.get("name") ?? "").trim();
  const sourceId = String(formData.get("sourceId") ?? "");

  if (!name) return { error: "Name is required." };
  if (!sourceId) return { error: "Source theme ID is missing." };

  const res = await apiServer(`/api/themes/${sourceId}/duplicate`, {
    method: "POST",
    body: { name },
  });

  if (!res.ok) {
    if (res.status === 409) return { error: "A theme with that name already exists." };
    return { error: friendlyError(res.status, res.error) };
  }

  revalidatePath("/themes");
  return { success: true };
}

/**
 * Rename a theme.
 * Requires EDITOR+; patches PATCH /api/themes/:id {name}.
 * 409 → "Name already taken."
 */
export async function renameAction(
  _prevState: ThemeActionState,
  formData: FormData,
): Promise<ThemeActionState> {
  await requireRole("EDITOR");

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!id) return { error: "Theme ID is missing." };
  if (!name) return { error: "Name is required." };

  const res = await apiServer(`/api/themes/${id}`, {
    method: "PATCH",
    body: { name },
  });

  if (!res.ok) {
    if (res.status === 409) return { error: "Name already taken." };
    return { error: friendlyError(res.status, res.error) };
  }

  revalidatePath("/themes");
  return { success: true };
}

/**
 * Hard-delete a theme (non-live only).
 * Requires PUBLISHER+; sends DELETE /api/themes/:id.
 * 409 LIVE_THEME → "Can't delete the live theme."
 */
export async function deleteAction(
  _prevState: ThemeActionState,
  formData: FormData,
): Promise<ThemeActionState> {
  await requireRole("PUBLISHER");

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Theme ID is missing." };

  const res = await apiServer(`/api/themes/${id}`, { method: "DELETE" });

  if (!res.ok) {
    const msg = res.error ?? `Error ${res.status}`;
    if (res.status === 409 && msg.includes("LIVE_THEME")) {
      return { error: "Can't delete the live theme." };
    }
    return { error: msg };
  }

  revalidatePath("/themes");
  return { success: true };
}

/**
 * Publish a theme, making it live.
 * Requires PUBLISHER+; posts to POST /api/releases/publish
 * with {themeId, expectedDraftRevision, note?}.
 * 409 STALE_DRAFT → optimistic-lock conflict message.
 */
export async function publishThemeAction(
  _prevState: ThemeActionState,
  formData: FormData,
): Promise<ThemeActionState> {
  await requireRole("PUBLISHER");

  const themeId = String(formData.get("themeId") ?? "");
  const expectedDraftRevision = Number(formData.get("expectedDraftRevision") ?? 0);
  const noteRaw = String(formData.get("note") ?? "").trim();
  const note = noteRaw || undefined;

  if (!themeId) return { error: "Theme ID is missing." };

  const res = await apiServer("/api/releases/publish", {
    method: "POST",
    body: { themeId, expectedDraftRevision, note },
  });

  if (!res.ok) {
    const msg = res.error ?? `Error ${res.status}`;
    if (res.status === 409 && msg.includes("STALE_DRAFT")) {
      return { error: "Draft changed since page loaded — refresh and retry." };
    }
    return { error: msg };
  }

  revalidatePath("/themes");
  revalidatePath("/");
  return { success: true };
}
