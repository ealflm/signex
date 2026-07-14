// The editor MODE: which of an element's capabilities a canvas click invokes.
//
// Mode is admin-side UI state — the toolbar owns it and pushes it into the preview iframe over the
// postMessage bridge (`setMode`). It is never persisted and never reaches the public render.
//
// ⚠️ The `key`s below are a CONTRACT with the preview overlay: they must match
// `apps/web/app/components/editor/_lib/edit-mode.ts` exactly. The overlay validates the incoming
// mode (isEditMode) and IGNORES anything it doesn't recognise rather than defaulting, so a typo here
// fails silently — the canvas simply keeps the mode it already had, with no error on either side.
// The labels are ours alone; only the keys cross the bridge.

import { ImageIcon, TypeIcon, PaletteIcon, ListIcon } from "lucide-react";

/** The single axis that decides what the canvas exposes and what the right panel shows. */
export type EditMode = "media" | "text" | "color" | "content";

/** Canvas order: the three direct-manipulation modes first, then the form. */
export const EDIT_MODES = [
  { key: "media", label: "Media", Icon: ImageIcon },
  { key: "text", label: "Chữ", Icon: TypeIcon },
  { key: "color", label: "Màu", Icon: PaletteIcon },
  { key: "content", label: "Nội dung", Icon: ListIcon },
] as const satisfies readonly { key: EditMode; label: string; Icon: unknown }[];

/** Content = today's section form, so the editor opens exactly as it did before modes existed.
 *  The overlay independently starts in "content" too, so a preview that never receives a `setMode`
 *  still agrees with the toolbar rather than showing affordances the toolbar isn't claiming. */
export const DEFAULT_MODE: EditMode = "content";
