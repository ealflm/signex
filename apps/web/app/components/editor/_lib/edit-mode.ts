// The editor MODE: which of an element's capabilities a canvas click invokes.
//
// An element declares what it CAN do (`data-edit-caps`, comma-joined — see edit-caps.ts); the mode
// decides which of those a click actually does. That indirection is the whole point: hero.titleBottom
// is both text- and colour-editable, and without a mode a single click has to guess between them.
// With one, exactly one kind of thing is clickable at a time and a click is never ambiguous.
//
// Mode is UI state, owned by the admin's toolbar and pushed in over the postMessage bridge. It is
// never persisted and never reaches the public render — the overlay mounts only on /preview.
//
// Extracted from edit-overlay.tsx for the reason edit-caps.ts and selector-path.ts were: the overlay
// is "use client" and apps/web has no jsdom, so anything left inside it can only be checked in a
// browser. The two halves of the mode contract — the CSS that PAINTS the affordance and the JS that
// DISPATCHES the click — must agree about which mode does what, and a disagreement is silent. The
// CSS half lives here so a static test can read the cascade it produces (edit-mode.test.mjs); the
// dispatch half stays in the overlay, where it needs the live DOM.

import { EDIT_MODES, isEditMode, DEFAULT_EDIT_MODE, type EditMode } from "@signex/shared";
import { capSel } from "./edit-caps";
import { CLASS_COLOR_HOVER } from "./overlay-classes";

// The vocabulary itself, the `isEditMode` guard over it, and the boot default are NOT declared here:
// they are the contract with apps/admin's toolbar, which spells the same four words on the other
// side of a postMessage bridge that `tsc` cannot see across. They live in @signex/shared so there is
// exactly one declaration for both workspaces to compile against — see the note in
// packages/shared/src/edit-mode.ts for why a comment was not enough. Re-exported so the overlay and
// these tests keep importing modes from one local module.
export { EDIT_MODES, isEditMode, DEFAULT_EDIT_MODE, type EditMode };

/** The ancestor gate for `mode`, as a capSel prefix. capSel pastes a prefix on verbatim, so the
 *  trailing descendant combinator is part of the contract — without it the result is a compound
 *  selector matching only <body>. */
export const modeScope = (mode: EditMode): string => `body[data-sx-mode="${mode}"] `;

const HL = "#4956e3";

/**
 * The mode-gated affordance rules. Outline/box-shadow/cursor ONLY — never border/margin/padding,
 * which would reflow the byte-faithful layout.
 *
 * Each rule is gated on the mode that dispatches what it advertises, so the affordance can never
 * promise an edit the click won't perform. Gating is also what retired the old ordering hazard: the
 * text and colour outline rules carry identical specificity and both match an element declaring both
 * caps, so source order used to decide which one painted and had to be hand-kept in step with the
 * dispatch order. Mutually exclusive gates mean they are never live together, in any order.
 *
 * Order still matters in one place, called out below, and edit-mode.test.mjs holds both properties.
 */
export const MODE_AFFORDANCE_CSS = `
      /* Not text mode ⇒ a text-capable element is not editable, so suppress the I-beam its own text
         would otherwise show: the cursor is the only thing suggesting "click to edit" here. */
      ${capSel("text", "", 'body:not([data-sx-mode="text"]) ')} { cursor: default; }
      /* ORDER IS LOAD-BEARING: the colour target is resolved from the paint stack, so it can BE a
         text-capable element, and then the rule above matches it too — at identical specificity
         ((0,2,1) each). Later wins, so this must stay after it, or a dual-cap element would read
         "not clickable" in the mode where clicking it is the whole interaction. */
      body[data-sx-mode="color"] .${CLASS_COLOR_HOVER} {
        outline: 2px dashed ${HL}; outline-offset: 2px; cursor: pointer;
      }
      ${capSel("text", "", modeScope("text"))} { cursor: text; }
      ${capSel("text", ":hover", modeScope("text"))} {
        outline: 2px solid ${HL}; outline-offset: 2px;
      }
      /* sync() shows a hotspot by writing style.display="block" INLINE; only !important outranks an
         inline declaration. Without it the hotspots stay clickable in every mode — they sit above all
         page content, so they would swallow every text and colour click on the media they cover. */
      body:not([data-sx-mode="media"]) .sx-edit-hotspot { display: none !important; }
`;
