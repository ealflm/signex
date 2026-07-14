// app/lib/edit-attrs.ts
// Visual-editor annotation helper. Shared section components (Navbar, Footer, Hero, …) are
// rendered BOTH on the public cached/SSG pages AND inside the /preview editor route. The
// public render must stay byte-identical (no editor attributes leaking into the static HTML),
// so each zone calls `editable(flag, "<block>.<field>", { image: true } | { text: … } | …)` and
// spreads the result onto the element. When the flag is false (the public default) it returns an
// empty object — nothing is emitted. When true (preview route only) it stamps the data-* hooks the
// client overlay (app/components/editor/edit-overlay.tsx) scans for.
//
// The one exception is `data-sx-c` (colour anchors), which is returned on BOTH renders: it is the
// per-element override's CSS target, so it has to match on the live site. See editable() below.
//
// The field string is "<blockKey>.<path>" (e.g. "hero.image", "features.video.media"); the admin
// controller maps the blockKey → BlockKind via BLOCK_KIND_BY_KEY and walks the nested path.
//
// TEXT EDITING (Plan 4) — inline scope v1:
//   `editable(flag, "<snapshot.path>", { text: {} })` declares the "text" capability on any
//   in-scope leaf. The <span> itself is rendered UNCONDITIONALLY by the component; this helper only
//   adds the conditional data-edit-* hooks (same contract as the media capability).
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

export type EditCap = "image" | "video" | "text" | "color";

/** Options for inline text editing (client-side UX only — no schema .max() churn). */
export interface EditTextOpts {
  /** Client-side max character count; trimmed on `input` in the overlay. */
  maxLength?: number;
  /** If true, Ctrl/Cmd+Enter commits instead of bare Enter. */
  multiline?: boolean;
  /** Signals the field is required; the overlay can enforce non-empty on commit. */
  required?: boolean;
}

export type EditColorRole = "bg" | "text" | "border";

export interface EditColorSpec {
  /** Palette token key (from @signex/shared TOKEN_VARS/PALETTE_VARS) this element paints from.
   *  Declare one only when it has been verified against the CSS that actually paints the role — a
   *  hand-declared token that disagrees with the stylesheet is worse than none, because nothing
   *  downstream can tell it is lying. Omit rather than guess: colour-engine.ts's detectToken() is
   *  written to resolve the driving var() from the winning CSS rule at click time, and once the
   *  colour panel wires it in it will answer for the elements that declare nothing here. */
  token?: string;
  /** Which CSS roles on this element are overridable (drives the popover's role chooser). */
  roles: EditColorRole[];
}

export interface EditableOpts {
  image?: true;
  video?: true;
  text?: EditTextOpts;
  color?: EditColorSpec;
}

/**
 * Stamp an element with the edit CAPABILITIES it supports. The active editor mode decides which
 * one a click invokes.
 *
 * This replaces the single-valued `data-edit-kind`, which could not express an element that is
 * both text- and colour-editable — that limitation is why hero.titleBottom needed two nested spans
 * (an inner editText span inside an outer editColor wrapper) and why only 3 elements had colour.
 *
 * `data-sx-c` is returned even when not editable: it is the per-element override's target and the
 * override CSS has to match on the public site. Every `data-edit-*` is preview-only.
 */
export function editable(
  flag: boolean | undefined,
  field: string,
  opts: EditableOpts,
): Record<string, string> {
  // Annotated, not inferred: the ternary would otherwise widen to
  // `{ "data-sx-c": string } | { "data-sx-c"?: undefined }`, and that `undefined` is not assignable
  // to this function's Record<string, string> index signature.
  const anchor: Record<string, string> = opts.color ? { "data-sx-c": field } : {};
  if (!flag) return anchor;

  const caps: EditCap[] = [];
  if (opts.image) caps.push("image");
  if (opts.video) caps.push("video");
  if (opts.text) caps.push("text");
  if (opts.color) caps.push("color");

  return {
    ...anchor,
    "data-edit-field": field,
    "data-edit-caps": caps.join(","),
    ...(opts.text?.maxLength != null && { "data-edit-maxlength": String(opts.text.maxLength) }),
    ...(opts.text?.multiline && { "data-edit-multiline": "true" }),
    ...(opts.text?.required && { "data-edit-required": "true" }),
    ...(opts.color?.token && { "data-edit-color-token": opts.color.token }),
    ...(opts.color && { "data-edit-color-roles": opts.color.roles.join(",") }),
  };
}
