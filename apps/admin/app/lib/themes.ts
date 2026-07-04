// Server-only helpers for the themes feature.
// Must only be imported from server components / server actions (apiServer forwards the session).

import { apiServer } from "./api";

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
