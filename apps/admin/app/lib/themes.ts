// Server-only helpers for the themes feature.
// Must only be imported from server components / server actions (uses next/headers).

import { cookies } from "next/headers";
import { apiServer } from "./api";

export const ACTIVE_THEME_COOKIE = "active_theme_id";

/** Shape returned by GET /api/themes (Plan 1 API). */
export interface ThemeListItem {
  id: string;
  name: string;
  draftRevision: number;
  lastPublishedRevision: number;
  dirty: boolean;
  isLive: boolean;
  updatedAt: string;
  /** Public URL of the theme's hero image (for the card thumbnail); absent if none. */
  heroImageUrl?: string;
}

/** Fetch all themes from the API. Returns [] on error. */
export async function listThemes(): Promise<ThemeListItem[]> {
  const res = await apiServer<ThemeListItem[]>("/api/themes");
  return res.ok ? res.data : [];
}

/**
 * Read the active_theme_id cookie.
 * Awaited explicitly — Next 16.2.x `cookies()` returns a Promise.
 */
export async function getActiveThemeId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(ACTIVE_THEME_COOKIE)?.value ?? null;
}
