"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/app/lib/session";
import { apiServer } from "@/app/lib/api";

export interface ActionState {
  error?: string;
  success?: boolean;
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

  const res = await apiServer("/api/releases/rollback", {
    method: "POST",
    body: { toVersion },
  });

  if (!res.ok) {
    return { error: res.error };
  }

  revalidatePath("/releases");
  revalidatePath("/");

  return { success: true };
}
