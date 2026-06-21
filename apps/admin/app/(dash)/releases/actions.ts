"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/app/lib/session";
import { apiServer } from "@/app/lib/api";

export interface ActionState {
  error?: string;
  success?: boolean;
}

/**
 * Publish the current working state as a new release.
 *
 * Security: re-validates PUBLISHER role server-side on every call.
 * The UI hiding the button is affordance only — this is the real gate (spec §8/§12).
 *
 * Optimistic-lock: reads `expectedRevision` from the form (set to the current
 * working revision from /api/releases/diff at render time). If another publish
 * raced us the api returns 409 and we surface it instead of swallowing it.
 */
export async function publishAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // Hard re-check — redirects to / if the caller is under-ranked.
  await requireRole("PUBLISHER");

  const note = String(formData.get("note") ?? "");
  const expectedRevision = Number(formData.get("expectedRevision"));

  const res = await apiServer("/api/releases/publish", {
    method: "POST",
    body: { note, expectedRevision },
  });

  if (!res.ok) {
    // Surface the error (409 = stale optimistic lock; 403 = server RBAC re-check; etc.)
    return { error: res.error };
  }

  revalidatePath("/releases");
  revalidatePath("/");

  return { success: true };
}

/**
 * Rollback to a previously published version.
 *
 * Security: re-validates PUBLISHER role server-side on every call.
 */
export async function rollbackAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // Hard re-check.
  await requireRole("PUBLISHER");

  const toVersion = Number(formData.get("toVersion"));
  const restoreWorkingState = formData.get("restoreWorkingState") === "on";

  const res = await apiServer("/api/releases/rollback", {
    method: "POST",
    body: { toVersion, restoreWorkingState },
  });

  if (!res.ok) {
    return { error: res.error };
  }

  revalidatePath("/releases");
  revalidatePath("/");

  return { success: true };
}
