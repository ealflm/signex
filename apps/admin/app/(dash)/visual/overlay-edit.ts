// app/(dash)/visual/overlay-edit.ts
//
// Pure state helpers for the "Lớp phủ" (overlay) editor UI in media-picker-dialog.tsx's
// FlexibleBody. Every helper takes the current working Overlay | undefined and returns a NEW
// Overlay | undefined — never mutates its input, so `setOverlay(setKind(overlay, next))` and
// `setOverlay(addStop(overlay))` are safe, and React's referential-equality bailout still works
// (a no-op clamp returns the SAME object, not an equal-but-new one, so it never triggers a
// pointless re-render). See @signex/shared's Overlay for the storage shape and its 2–4 stop
// bound; this file only edits the working value — it never validates or persists it (Task 6
// owns the save path).
import type { Overlay } from "@signex/shared";

// @signex/shared exports OverlayStop only as a zod schema (a runtime const), not as a standalone
// TS type — unlike OverlayFill, which has both. Rather than hand-duplicate the shape (and risk it
// drifting from the real one), it's projected off Overlay's own gradient branch: structurally
// identical to what OverlayStop's schema validates, and it tracks Overlay automatically if that
// ever changes.
export type OverlayStop = Extract<Overlay, { kind: "gradient" }>["stops"][number];

/** A default stop for a freshly-added gradient point: opaque black at the left edge. */
export function emptyStop(): OverlayStop {
  return { color: "#000000", opacity: 100, pos: 0 };
}

/**
 * Switches the overlay's kind. "none" is `undefined` — absence IS the "no overlay" case (see
 * Overlay's doc comment in primitives.ts), so there's no empty-but-present state to model. "solid"
 * and "gradient" each reset to THAT kind's default rather than trying to carry a colour across
 * shapes that don't share one (a solid's single fill has no natural angle/stop-list to become) —
 * so switching solid↔gradient (or re-picking the kind already active) always yields the same
 * default, and the previous value is intentionally unused.
 */
export function setKind(
  _o: Overlay | undefined,
  kind: "none" | "solid" | "gradient",
): Overlay | undefined {
  if (kind === "none") return undefined;
  if (kind === "solid") return { kind: "solid", fill: { color: "#000000", opacity: 40 } };
  return {
    kind: "gradient",
    angle: 0,
    stops: [
      { color: "#000000", opacity: 100, pos: 0 },
      { color: "#000000", opacity: 0, pos: 100 },
    ],
  };
}

/**
 * Appends `emptyStop()`, clamped at 4 — Overlay's schema max (`OverlayStop.max(4)`), so a value
 * this returns is always a valid Overlay on its own. A no-op at the clamp returns `o` itself
 * (same reference). Non-gradient overlays (incl. `undefined`) pass through unchanged: there's no
 * stop list to append to.
 */
export function addStop(o: Overlay | undefined): Overlay | undefined {
  if (!o || o.kind !== "gradient") return o;
  if (o.stops.length >= 4) return o;
  return { ...o, stops: [...o.stops, emptyStop()] };
}

/**
 * Removes the stop at index `i`, clamped at 2 — Overlay's schema min (`OverlayStop.min(2)`). A
 * no-op at the floor returns `o` itself (same reference). Non-gradient overlays (incl.
 * `undefined`) pass through unchanged.
 */
export function removeStop(o: Overlay | undefined, i: number): Overlay | undefined {
  if (!o || o.kind !== "gradient") return o;
  if (o.stops.length <= 2) return o;
  return { ...o, stops: o.stops.filter((_, idx) => idx !== i) };
}
