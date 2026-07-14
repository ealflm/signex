// The classes the overlay STAMPS ONTO PAGE ELEMENTS — and the one rule that keeps them from
// poisoning the selectors colour mode generates.
//
// ---------------------------------------------------------------------------------------------
//  THE RULE: every class the overlay adds to an element it does not own MUST be declared here and
//  MUST carry OVERLAY_CLASS_PREFIX. asSegment (color-engine.ts) drops every class matching that
//  prefix before a selector segment is built. The overlay must likewise never insert, remove, or
//  reorder the children of a page element: buildSelector reads child structure too, so mutating it
//  would poison a selector by the same route a stray class does — and nothing filters that.
// ---------------------------------------------------------------------------------------------
//
// Why this is not a style preference. Colour mode turns a click into a CSS selector for the clicked
// element, stores it in the theme, and emits it into a <style> tag on the PUBLIC site — where the
// overlay does not exist. The overlay marks the hovered element (and flashes a jumped-to one), so an
// overlay class is on the element AT CLICK TIME. pickSegment prefers the first sibling-unique class,
// and an overlay mark is ALWAYS sibling-unique — only the hovered element carries it. Two results,
// both silent:
//
//   * two sibling .card elements  → `.sx-color-hover`, not `.card:nth-of-type(1)`
//   * an UNCLASSED element        → `.sx-color-hover`, where the honest answer is null. A correct
//                                   refusal-to-anchor becomes a confident bogus selector.
//
// verify() cannot catch either: on the preview page the class really is present and really is
// unique, so the selector resolves to exactly one element and passes. It only dies on the public
// site, as a no-op. The preview appears to work precisely BECAUSE whatever you hover acquires the
// class — uniqueness proven against an artifact of the measurement itself. This is the same hazard
// STATE_PSEUDO_RE (color-engine.ts) reasons about for `:hover` rules; that filter was written for
// CSS state and missed the overlay's own classes.
//
// Why a PREFIX and not a list of the two names: a third mark added later must not silently
// reintroduce the bug. Filtering by prefix means a new constant declared here is filtered the day it
// is added, with no second edit anywhere else to forget.
//
// Why the prefix is `sx-ov-` and NOT plain `sx-`: the overlay does NOT own the `sx-` namespace. The
// public site ships real, anchorable `sx-` classes of its own — `.sx-notice__close`, `.sx-upload__btn`
// (see globals.css, lead-form-notice.tsx, lead-upload-field.tsx). Filtering all of `sx-` would strip
// legitimate anchors off real page elements and turn this fix into the opposite bug. `sx-ov-` is
// reserved for the overlay and unused by the page; overlay-classes.test.mjs holds that reservation.
//
// Classes on elements the overlay CREATES (.sx-edit-layer and its hotspots/badges) are out of scope
// and unprefixed: they live inside .sx-edit-layer, which resolveMeaningfulBlock excludes from the
// paint stack, so they can never reach asSegment.

/** Reserved for classes the overlay writes onto page elements. Nothing else on the page may use it. */
export const OVERLAY_CLASS_PREFIX = "sx-ov-";

/** Marks the element a colour-mode click would act on, for as long as the pointer rests on it. */
export const CLASS_COLOR_HOVER = "sx-ov-color-hover";

/** Briefly (~900ms) marks an element the admin jumped to from the sidebar. */
export const CLASS_FLASH = "sx-ov-flash";

/** Every page-stamped overlay class, so tests can hold the prefix rule over all of them at once. */
export const OVERLAY_PAGE_CLASSES = [CLASS_COLOR_HOVER, CLASS_FLASH] as const;

/**
 * Is `cls` an overlay mark rather than one of the page's own classes? Selector generation drops
 * these: they describe the editing session, not the document, and mean nothing on the public site.
 */
export const isOverlayClass = (cls: string): boolean => cls.startsWith(OVERLAY_CLASS_PREFIX);
