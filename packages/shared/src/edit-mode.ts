// The editor MODE vocabulary — the one place the four mode words are spelled.
//
// Mode decides which of an element's declared capabilities a canvas click invokes. It is admin-side
// UI state: the toolbar owns it and pushes it into the preview iframe over the postMessage bridge
// (`setMode`). It is never persisted and never reaches the public render.
//
// ⚠️ WHY THIS LIVES IN packages/shared RATHER THAN IN EITHER APP
// The vocabulary is a CONTRACT between two workspaces that cannot see each other's types:
// apps/admin sends a mode, apps/web's overlay receives it. The receiving side validates with
// isEditMode and IGNORES anything it does not recognise rather than throwing, so a drifted spelling
// on either side fails SILENTLY — the canvas simply keeps the mode it already had, with no error
// anywhere. A comment saying "keep these in step" is not a mechanism; one exported union is.
// Both apps import from here, so `tsc` now rejects the drift on both sides instead of a reviewer
// having to notice it.
//
// Naming follows the repo convention: identifiers use American "color", prose uses British
// "colour".

/** Canvas order: the three direct-manipulation modes first, then the form. */
export const EDIT_MODES = ["media", "text", "color", "content"] as const;

/** The single axis that decides what the canvas exposes and what the right panel shows. */
export type EditMode = (typeof EDIT_MODES)[number];

/**
 * `setMode` crosses the postMessage bridge, so `typeof mode === "string"` is not validation: an
 * unrecognised value would be written to body.dataset.sxMode, match none of the overlay's mode
 * gates, and leave every affordance off with dispatch in a state no branch owns. Narrow to the
 * four, or ignore.
 */
export const isEditMode = (v: unknown): v is EditMode =>
  typeof v === "string" && (EDIT_MODES as readonly string[]).includes(v);

/**
 * Content = today's section form, so the editor opens exactly as it did before modes existed.
 *
 * Shared because the AGREEMENT is what matters, not the value: the admin toolbar boots in this
 * mode and the overlay independently boots in it too, so a preview that never receives a `setMode`
 * still agrees with the toolbar rather than showing affordances the toolbar is not claiming. Two
 * independent literals spelling the same default is the same silent-drift shape as the vocabulary.
 */
export const DEFAULT_EDIT_MODE: EditMode = "content";
