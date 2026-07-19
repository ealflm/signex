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
import type { FieldPlan } from "@/app/lib/zodform-fields";

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

// ─── The field lens ───────────────────────────────────────────────────────────
// Mode also decides what the RIGHT-HAND section form lists. Media/Text narrow it to the fields
// they can actually edit; Content is the whole form, exactly as it was before modes existed.
//
// Both predicates are keyed off `FieldPlan.kind` — the same discriminant FieldEditor already
// switches on to choose a renderer. A second, parallel notion of "what kind of field is this"
// would be free to drift from the thing doing the rendering; this one cannot.
//
// They are LEAF predicates. Containers are not their business; `lensFields` below owns those.

/**
 * Media = the two structural media shapes: AssetRef ({assetId, alt?}) and VideoRef
 * ({posterAssetId, mp4AssetId, webmAssetId?}). Both open the media picker, and nothing else does.
 */
export function isMediaField(f: FieldPlan): boolean {
  return f.kind === "assetRef" || f.kind === "videoRef";
}

/**
 * Text = every kind that renders as a typed string: a bare string/enum, a {en,vi} LocalizedText,
 * its array twin, and a plain string list. Deliberately NOT `json` — a raw-JSON textarea is the
 * fallback for shapes with no editor, not a text field, and listing it in Text mode would put an
 * unvalidated blob of structure in the one lens that exists for typing prose.
 */
export function isTextField(f: FieldPlan): boolean {
  return (
    f.kind === "string" ||
    f.kind === "localized" ||
    f.kind === "localizedArray" ||
    f.kind === "stringArray"
  );
}

// ─── Containers ───────────────────────────────────────────────────────────────
// `array` / `object` are CONTAINERS, and both predicates above answer `false` for them — because
// they are leaf predicates and a container is no kind of leaf, not because a container has nothing
// to offer a lens. The distinction is load-bearing: most of this site's media lives INSIDE a
// container (`features.video.media`, `features.featured.image`, `aboutPage.hero.video`,
// `contactPage.hero.image`, `meta.favicons.asset`), so a lens that dropped containers would list
// NOTHING in Media mode for three of the site's sections.
//
// It would also defeat its own rationale. Array items and slider-internal media are deliberately
// NOT click-editable on the canvas, so this panel's list is their ONLY route — which is precisely
// why the spec has the Media/Text panel "list the whole section" (decision 6,
// docs/superpowers/specs/2026-07-14-editor-modes-design.md).
//
// So the lens RECURSES, and the "smuggling" worry is answered by pruning rather than by exclusion:
// `lensFields` rebuilds each container with only its surviving descendants, so a container in the
// Media lens carries its media and nothing else.

/**
 * Narrow a field-plan tree to one lens: keep the leaves `keepLeaf` claims, keep a container only
 * when a descendant survived, and prune everything else.
 *
 * Pure, and bounded by the plan tree rather than by a depth limit of its own: it recurses as far as
 * `deriveFields` built (which caps itself at MAX_OBJECT_DEPTH), so it handles the two-level nesting
 * the registry has today — `features.video.media` — and anything deeper a future schema adds,
 * with no second limit here to drift from that one.
 *
 * A surviving container keeps its `name` untouched, so a nested field's dotted path — the identity
 * that the canvas highlight, the value read and the value write ALL key off — is byte-identical to
 * the one Content mode builds. This lens decides what is RENDERED; it never touches how a value is
 * addressed, which is what keeps a filtered view from changing what a save produces.
 */
export function lensFields(
  fields: FieldPlan[],
  keepLeaf: (f: FieldPlan) => boolean,
): FieldPlan[] {
  const out: FieldPlan[] = [];
  for (const f of fields) {
    if (f.kind === "array" || f.kind === "object") {
      const children = lensFields(f.children ?? [], keepLeaf);
      // An empty container is dropped, not rendered: a header with nothing under it reads as a
      // broken section rather than as an absence.
      if (children.length > 0) out.push({ ...f, children });
    } else if (keepLeaf(f)) {
      out.push(f);
    }
  }
  return out;
}

/** What one mode does to the section form. */
export interface ModeLens {
  /**
   * Which LEAVES it lists. Not an `Array.prototype.filter` callback — containers are never asked;
   * `lensFields` keeps one iff this claims some descendant of it.
   */
  keepLeaf: (f: FieldPlan) => boolean;
  /** What to call the list — replaces the block label in the panel header. */
  title: string;
}

/**
 * The lens per mode; `null` = no lens, list every field.
 *
 * A TOTAL Record, not a Partial: a new mode must say what its form lists rather than inheriting
 * "everything" by omission — the same exhaustiveness the toolbar drift test exists to enforce one
 * level up. `color` is null because colour mode does not filter this panel, it REPLACES it
 * (ColorPanel owns that zone); the value is never read.
 */
export const MODE_LENS: Record<EditMode, ModeLens | null> = {
  media: { keepLeaf: isMediaField, title: "Hình ảnh & video" },
  text: { keepLeaf: isTextField, title: "Nội dung chữ" },
  color: null,
  content: null,
};

/** The shared vocabulary, re-exported for the drift test.
 *
 *  `satisfies` above proves every key IS a mode; it does NOT prove every mode HAS a button — an
 *  omission would silently drop a mode from the toolbar while still typechecking. modes.test.ts
 *  closes that half by comparing the two lists. */
export { EDIT_MODE_KEYS };
