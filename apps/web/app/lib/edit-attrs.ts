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
//   footer.shipping.<i>, footer.payments.<i> (the courier + payment badges — locale-invariant
//     brand names; the badge's own text also drives its colour class, see footer.tsx)
//   notFound.title.lead, notFound.title.accent, notFound.body, notFound.cta.label
//
// EXCLUDE (panel-only — do NOT stamp):
//   "Array-item/tile text is panel-only" WAS the first entry here. It is deleted rather than
//   amended: it had become false in every particular. It named features.featured.*,
//   features.cards[].*, productsHeader tiles, about.mission/vision/values.*,
//   aboutPage.testimonial.body[], capability.groups[], process.steps[] and timeline.milestones[] —
//   and ALL of them are stamped today (2ac9fe5 stamped the list text once the inline engine could
//   resolve non-scalar leaf shapes; nobody updated this comment). A rule whose every example
//   contradicts it does not narrow anyone's behaviour, it just misleads the next reader into
//   thinking a real policy is being enforced.
//   The rule that DOES hold for an <i> path: the array must exist in the draft snapshot. An inline
//   edit is resolved against the value already at the path, so an OPTIONAL array that is absent
//   from the draft cannot take a per-item edit — it would be mis-resolved and poison the draft.
//   That is why footer.shipping is seeded by the importer and backfilled by migration rather than
//   left to the web's render-time fallback.
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

export interface EditableOpts {
  image?: true;
  video?: true;
  text?: EditTextOpts;
  /**
   * Declare the element a COLOUR ANCHOR. There is nothing to describe here — no token, no role list
   * — because nothing hand-declared could be trusted: colour-engine.ts's resolveRoles() reads the
   * roles the element actually has and detectToken() resolves the driving custom property from the
   * winning CSS rule, both at click time, from the live CSSOM. A declaration could only agree with
   * the stylesheet or lie about it, and nothing downstream could tell which.
   *
   * What this flag buys is the STABLE ANCHOR: `data-sx-c="<field>"` (emitted on the public render
   * too), which buildSelector prefers as the per-element override's CSS target because a hand-given
   * id survives markup edits that a generated structural path does not.
   */
  color?: true;
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
  };
}
