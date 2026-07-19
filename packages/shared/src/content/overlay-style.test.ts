import { describe, it, expect } from "vitest";
import { overlayCss } from "./overlay-style";
describe("overlayCss", () => {
  it("undefined → empty (transparent)", () => expect(overlayCss(undefined)).toEqual({}));
  it("solid → rgba backgroundColor", () =>
    expect(overlayCss({ kind: "solid", fill: { color: "#112233", opacity: 50 } })).toEqual({ backgroundColor: "rgba(17, 34, 51, 0.5)" }));
  it("gradient → linear-gradient backgroundImage", () =>
    expect(overlayCss({ kind: "gradient", angle: 0, stops: [{ color: "#000000", opacity: 100, pos: 0 }, { color: "#000000", opacity: 0, pos: 60 }] }))
      .toEqual({ backgroundImage: "linear-gradient(0deg, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0) 60%)" }));
});
