"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/app/lib/session";
import { apiServer } from "@/app/lib/api";

export interface SettingsActionState {
  error?: string;
  success?: boolean;
}

/**
 * Save the global site config (currently just GA4). ADMIN-only — GA4 is site-wide
 * infrastructure, independent of the published theme. PATCHes /api/site-config; the API
 * is the hard validator (400 on a bad GA4 id), mapped here to a friendly message.
 */
export async function updateSiteConfigAction(
  _prevState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  await requireRole("ADMIN");

  const ga4Id = String(formData.get("ga4Id") ?? "").trim();

  const res = await apiServer("/api/site-config", {
    method: "PATCH",
    body: { ga4Id },
  });

  if (!res.ok) {
    if (res.status === 400 || res.status === 422) {
      return {
        error:
          "That doesn't look like a GA4 measurement ID — it should look like G-XXXXXXXXXX (or leave it empty to disable analytics).",
      };
    }
    return { error: res.error ?? `Error ${res.status}` };
  }

  revalidatePath("/settings");
  return { success: true };
}
