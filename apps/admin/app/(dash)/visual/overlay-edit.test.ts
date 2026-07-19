// app/(dash)/visual/overlay-edit.test.ts
//
// Pure-reducer tests for the "Lớp phủ" (overlay) editor state. No DOM, no React — just
// Overlay | undefined in, Overlay | undefined out. See overlay-edit.ts for the helpers'
// contracts (kind switch, add/remove stop, clamped 2-4).
import { describe, it, expect } from "vitest";
import type { Overlay } from "@signex/shared";
import { setKind, addStop, removeStop, emptyStop } from "./overlay-edit";

// Exactly setKind(undefined, "gradient")'s default — reused both as that assertion's expected
// value and as a generic 2-stop fixture for the addStop/removeStop clamp tests below.
const TWO_STOP_GRADIENT: Overlay = {
  kind: "gradient",
  angle: 0,
  stops: [
    { color: "#000000", opacity: 100, pos: 0 },
    { color: "#000000", opacity: 0, pos: 100 },
  ],
};

const THREE_STOP_GRADIENT: Overlay = {
  kind: "gradient",
  angle: 45,
  stops: [
    { color: "#000000", opacity: 100, pos: 0 },
    { color: "#111111", opacity: 90, pos: 50 },
    { color: "#222222", opacity: 0, pos: 100 },
  ],
};

const FOUR_STOP_GRADIENT: Overlay = {
  kind: "gradient",
  angle: 0,
  stops: [
    { color: "#000000", opacity: 100, pos: 0 },
    { color: "#111111", opacity: 90, pos: 25 },
    { color: "#222222", opacity: 80, pos: 60 },
    { color: "#333333", opacity: 70, pos: 100 },
  ],
};

describe("emptyStop", () => {
  it("returns a default stop", () => {
    expect(emptyStop()).toEqual({ color: "#000000", opacity: 100, pos: 0 });
  });
});

describe("setKind", () => {
  it('undefined -> "solid" yields a solid with a default fill', () => {
    expect(setKind(undefined, "solid")).toEqual({
      kind: "solid",
      fill: { color: "#000000", opacity: 40 },
    });
  });

  it('any overlay -> "none" yields undefined', () => {
    const solid: Overlay = { kind: "solid", fill: { color: "#ff0000", opacity: 80 } };
    expect(setKind(solid, "none")).toBeUndefined();
    expect(setKind(TWO_STOP_GRADIENT, "none")).toBeUndefined();
  });

  it('undefined -> "gradient" yields a 2-stop gradient', () => {
    const result = setKind(undefined, "gradient");
    expect(result).toEqual(TWO_STOP_GRADIENT);
  });
});

describe("addStop", () => {
  it("is a no-op on a 4-stop gradient (clamped at max 4)", () => {
    const result = addStop(FOUR_STOP_GRADIENT);
    expect(result).toEqual(FOUR_STOP_GRADIENT);
  });

  it("appends emptyStop() below the 4-stop max, without mutating the input", () => {
    const result = addStop(TWO_STOP_GRADIENT);
    expect(result).not.toBe(TWO_STOP_GRADIENT);
    expect(TWO_STOP_GRADIENT.kind === "gradient" && TWO_STOP_GRADIENT.stops).toHaveLength(2); // input untouched
    expect(result).toEqual({
      ...TWO_STOP_GRADIENT,
      stops: [...TWO_STOP_GRADIENT.stops, emptyStop()],
    });
  });

  it("leaves a non-gradient overlay unchanged", () => {
    const solid: Overlay = { kind: "solid", fill: { color: "#ff0000", opacity: 80 } };
    expect(addStop(solid)).toEqual(solid);
    expect(addStop(undefined)).toBeUndefined();
  });
});

describe("removeStop", () => {
  it("is a no-op on a 2-stop gradient (clamped at min 2)", () => {
    const result = removeStop(TWO_STOP_GRADIENT, 0);
    expect(result).toEqual(TWO_STOP_GRADIENT);
  });

  it("removes the given index from a 3-stop gradient, without mutating the input", () => {
    const result = removeStop(THREE_STOP_GRADIENT, 1);
    expect(THREE_STOP_GRADIENT.kind === "gradient" && THREE_STOP_GRADIENT.stops).toHaveLength(3); // input untouched
    expect(result).toEqual({
      kind: "gradient",
      angle: 45,
      stops: [
        { color: "#000000", opacity: 100, pos: 0 },
        { color: "#222222", opacity: 0, pos: 100 },
      ],
    });
  });

  it("leaves a non-gradient overlay unchanged", () => {
    const solid: Overlay = { kind: "solid", fill: { color: "#ff0000", opacity: 80 } };
    expect(removeStop(solid, 0)).toEqual(solid);
    expect(removeStop(undefined, 0)).toBeUndefined();
  });
});
