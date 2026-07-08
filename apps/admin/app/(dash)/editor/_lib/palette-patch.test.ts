import { describe, it, expect } from "vitest";
import { setSeed, setToken, setOverride, resetAll, isEmptyPalette } from "./palette-patch";

describe("palette-patch reducers", () => {
  it("setSeed adds/updates a seed immutably", () => {
    const a = setSeed({}, "accentAqua", "#111111");
    expect(a.seeds).toEqual({ accentAqua: "#111111" });
    const b = setSeed(a, "accentOcean", "#222222");
    expect(b.seeds).toEqual({ accentAqua: "#111111", accentOcean: "#222222" });
    expect(a.seeds).toEqual({ accentAqua: "#111111" }); // original untouched
  });

  it("setToken and setOverride nest correctly", () => {
    const a = setToken({}, "inkBase", "#333333");
    expect(a.tokens).toEqual({ inkBase: "#333333" });
    const b = setOverride(a, "hero.cta", "bg", "#444444");
    expect(b.overrides).toEqual({ "hero.cta": { bg: "#444444" } });
  });

  it("resetAll clears everything and isEmptyPalette detects it", () => {
    expect(isEmptyPalette(resetAll())).toBe(true);
    expect(isEmptyPalette({ seeds: { accentAqua: "#000000" } })).toBe(false);
    expect(isEmptyPalette({ seeds: {}, tokens: {}, overrides: {} })).toBe(true);
  });
});
