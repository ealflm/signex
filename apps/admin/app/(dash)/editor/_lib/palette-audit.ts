// app/(dash)/editor/_lib/palette-audit.ts
// WHEN to ask the preview which stored override selectors are dead. The asking itself is the
// bridge's (postAuditSelectors); the answer's display is the panel's ("Màu không còn áp dụng").
//
// This exists because the question had exactly ONE asker — the `ready` handler — which made the
// audit a property of the DOCUMENT when it is really a property of the WORKING SET. Clearing a
// broken override therefore left its row on screen until the next iframe reload, and the button
// stayed clickable: each click re-dirtied the palette to remove a selector that was already gone.
//
// The audit is a QUESTION, not an assertion — unlike the palette css, asking costs the preview
// nothing and can never overwrite anything it renders — so the only thing worth being careful about
// is not asking the same question twice for nothing. Hence the dedupe, and hence `force` for the one
// case where the same question genuinely has a new answer: a fresh document.

import type { PaletteWorkingSet } from "./palette-working-set";

/** Selectors cannot contain a NUL (the grammar in @signex/shared's selector.ts is far narrower than
 *  that), so joining on one is a faithful identity for "the same set, in the same order". */
const keyOf = (selectors: string[]) => selectors.join("\u0000");

export interface PaletteAuditor {
  /** Ask about `palette`'s override targets, unless that exact question is already outstanding.
   *  `force` re-asks regardless — for a (re)loaded preview, where the DOM the selectors must match
   *  is a different DOM. */
  (palette: PaletteWorkingSet, opts?: { force?: boolean }): void;
}

/**
 * An auditor over `post`. Stateful by design: it remembers the last question so a seed pick — which
 * changes the palette on every frame of a colour-picker drag but changes no selector — does not
 * re-ask it, while any change to the set of anchored selectors does.
 */
export function createPaletteAuditor(post: (selectors: string[]) => void): PaletteAuditor {
  let last: string | null = null;
  return (palette, opts) => {
    const selectors = (palette.overrides ?? []).map((o) => o.selector);
    const key = keyOf(selectors);
    if (!opts?.force && key === last) return;
    last = key;
    // An audit of NOTHING is still an answer: clear the last override and this posts [], the overlay
    // replies with an empty `broken`, and the panel's section empties. Skipping the empty case would
    // leave the last non-empty reply standing — still listing selectors the palette no longer has.
    post(selectors);
  };
}
