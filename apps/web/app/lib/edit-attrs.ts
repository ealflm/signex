// app/lib/edit-attrs.ts
// Visual-editor annotation helper. Shared section components (Navbar, Footer, Hero, …) are
// rendered BOTH on the public cached/SSG pages AND inside the /preview editor route. The
// public render must stay byte-identical (no editor attributes leaking into the static HTML),
// so each media zone calls `editAttrs(editable, "<block>.<field>", "image"|"video")` and spreads
// the result onto the element. When `editable` is false (the public default) it returns an empty
// object — nothing is emitted. When true (preview route only) it stamps the data-* hooks the
// client overlay (app/components/editor/edit-overlay.tsx) scans for.
//
// The field string is "<blockKey>.<path>" (e.g. "hero.image", "features.video.media"); the admin
// controller maps the blockKey → BlockKind via BLOCK_KIND_BY_KEY and walks the nested path.

export type EditMediaKind = "image" | "video";

export interface EditAttrs {
  "data-edit-field"?: string;
  "data-edit-kind"?: EditMediaKind;
}

export function editAttrs(
  editable: boolean | undefined,
  field: string,
  kind: EditMediaKind,
): EditAttrs {
  if (!editable) return {};
  return { "data-edit-field": field, "data-edit-kind": kind };
}
