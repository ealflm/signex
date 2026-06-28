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
//
// TEXT EDITING (Plan 4) — inline scope v1:
//   `editText(editable, "<snapshot.path>")` stamps data-edit-kind="text" on any in-scope leaf.
//   The <span> itself is rendered UNCONDITIONALLY by the component; this helper only adds the
//   conditional data-edit-* hooks (same contract as editAttrs for media). Full EditTextOpts and
//   EditKind type formalised in Task 2.
//
// INCLUDE (inline-editable in v1):
//   hero.titleTop, hero.titleBottom, hero.subtitle
//   features.eyebrow, features.title.lead, features.title.accent, features.cta.label
//   about.eyebrow, about.title.lead, about.title.accent, about.body
//   productsHeader.eyebrow, productsHeader.title.lead, productsHeader.title.accent, productsHeader.body
//   contactPage.eyebrow (home contact section), contactPage.cardLabels.email/phone/address (NAP card titles)
//   contactPage.hero.title.lead, contactPage.hero.title.accent, contactPage.hero.subtitle
//   aboutPage.hero.*, aboutPage.testimonial (eyebrow/title trio), aboutPage.intro/capability/process/timeline (per-section eyebrow+title trio+body)
//   nav.links.<i>.label, nav.cta.label
//   footer.contactHeading, footer.quickHeading, footer.links.<i>.label, footer.brandSuffix (brand-line tail only)
//   notFound.title.lead, notFound.title.accent, notFound.body, notFound.cta.label
//
// EXCLUDE (panel-only — do NOT stamp):
//   Array-item/tile text (features.featured.*, features.cards[].*, productsHeader card tiles,
//   about.mission/vision/values.*, aboutPage.testimonial.body[], aboutPage.intro arrays,
//   capability.groups[], closing[], process.steps[], timeline.milestones[]).
//   Inside parallax/sliders (product-category cards, testimonial slider body, image_cover zones).
//   Derived/template-string leaves (footer.brand PREFIX + the whole template, footer contact tuples,
//     contact-card lines — only the editable footer.brandSuffix tail is stamped, not the prefix).
//   [count-up]/[stagger-text] targets (confirmed absent from markup; still excluded by policy).
//   Any leaf whose span fails the 3-layer markup-delta gate (CSS-grep + computed-style + screenshot).

export type EditMediaKind = "image" | "video";
export type EditKind = "image" | "video" | "text";

/** Options for inline text editing (client-side UX only — no schema .max() churn). */
export interface EditTextOpts {
  /** Client-side max character count; trimmed on `input` in the overlay. */
  maxLength?: number;
  /** If true, Ctrl/Cmd+Enter commits instead of bare Enter. */
  multiline?: boolean;
  /** Signals the field is required; the overlay can enforce non-empty on commit. */
  required?: boolean;
}

export interface EditAttrs {
  "data-edit-field"?: string;
  "data-edit-kind"?: EditKind;
  "data-edit-maxlength"?: number;
  "data-edit-multiline"?: "true";
  "data-edit-required"?: "true";
}

export function editAttrs(
  editable: boolean | undefined,
  field: string,
  kind: EditMediaKind,
): EditAttrs {
  if (!editable) return {};
  return { "data-edit-field": field, "data-edit-kind": kind };
}

// The <span> wrapping each leaf is rendered UNCONDITIONALLY by the component; this helper
// only adds the conditional data-edit-* hooks (same contract as editAttrs for media).
// Returns {} when editable is false/undefined — public and preview both render <span>text</span>;
// only the data-* hooks are conditional. This is load-bearing: the public faithful-clone
// appearance must not change.
export function editText(
  editable: boolean | undefined,
  field: string,
  opts?: EditTextOpts,
): EditAttrs {
  if (!editable) return {};
  return {
    "data-edit-field": field,
    "data-edit-kind": "text",
    ...(opts?.maxLength != null && { "data-edit-maxlength": opts.maxLength }),
    ...(opts?.multiline && { "data-edit-multiline": "true" }),
    ...(opts?.required && { "data-edit-required": "true" }),
  };
}
