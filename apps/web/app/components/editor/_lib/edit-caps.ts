// The two `data-edit-caps` matchers — one CSS, one JS — that MUST select the same elements: the
// selector paints the affordance (cursor/outline), the predicate dispatches the click, and any
// disagreement between them is silent. Extracted from edit-overlay.tsx so they can be unit tested
// (the overlay is "use client" and these were module-private); same reason as selector-path.ts.
// DOM-free apart from hasCap's single getAttribute — apps/web has no jsdom, and the `closest` walk
// that consumes hasCap stays in the overlay.

import type { EditCap } from "@/app/lib/edit-attrs";

export type { EditCap };

/**
 * `data-edit-caps` is COMMA-joined ("text,color"), so CSS's `~=` (space-separated word match) does
 * not apply and `*=` would be a substring match — it happens not to false-positive on today's four
 * cap names, but it silently would the day a cap contains another as a substring. These four
 * matchers pin the value's boundaries, so they match a whole cap and nothing else: exact, first,
 * last, middle.
 */
export const capSel = (cap: EditCap, suffix = ""): string =>
  [`="${cap}"`, `^="${cap},"`, `$=",${cap}"`, `*=",${cap},"`]
    .map((m) => `[data-edit-caps${m}]${suffix}`)
    .join(",");

/** JS-side equivalent: split on "," and compare whole values (never `includes()` on the string). */
export const hasCap = (el: Element, cap: EditCap): boolean =>
  (el.getAttribute("data-edit-caps") ?? "").split(",").includes(cap);
