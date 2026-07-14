// The editor MODE: which of an element's capabilities a canvas click invokes.
//
// Mode is admin-side UI state — the toolbar owns it and pushes it into the preview iframe over the
// postMessage bridge (`setMode`). It is never persisted and never reaches the public render.
//
// The mode VOCABULARY is not declared here. It is a contract with the preview overlay in
// apps/web, which validates the incoming mode (isEditMode) and IGNORES anything it does not
// recognise rather than defaulting — so a typo on either side fails silently, the canvas simply
// keeping the mode it already had, with no error anywhere. `tsc` cannot see across workspaces, so
// the two spellings used to be held together by a comment. They now come from ONE declaration in
// @signex/shared, which both apps compile against; see packages/shared/src/edit-mode.ts.
// What IS ours alone: the labels, the icons, and the canvas order below.

import { ImageIcon, TypeIcon, PaletteIcon, ListIcon } from "lucide-react";
import { EDIT_MODES as EDIT_MODE_KEYS, DEFAULT_EDIT_MODE, type EditMode } from "@signex/shared";

export type { EditMode };

/** Canvas order: the three direct-manipulation modes first, then the form. */
export const EDIT_MODES = [
  { key: "media", label: "Media", Icon: ImageIcon },
  { key: "text", label: "Chữ", Icon: TypeIcon },
  { key: "color", label: "Màu", Icon: PaletteIcon },
  { key: "content", label: "Nội dung", Icon: ListIcon },
] as const satisfies readonly { key: EditMode; label: string; Icon: unknown }[];

/** Content = today's section form, so the editor opens exactly as it did before modes existed.
 *  The overlay boots from this same shared constant, so a preview that never receives a `setMode`
 *  still agrees with the toolbar rather than showing affordances the toolbar isn't claiming. */
export const DEFAULT_MODE: EditMode = DEFAULT_EDIT_MODE;

/** The shared vocabulary, re-exported for the drift test.
 *
 *  `satisfies` above proves every key IS a mode; it does NOT prove every mode HAS a button — an
 *  omission would silently drop a mode from the toolbar while still typechecking. modes.test.ts
 *  closes that half by comparing the two lists. */
export { EDIT_MODE_KEYS };
