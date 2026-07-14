import { describe, it, expect } from "vitest";
import {
  setSeed,
  setToken,
  setOverride,
  clearOverride,
  resetAll,
  isEmptyPalette,
} from "./palette-patch";

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
    const b = setOverride(a, '[data-sx-c="hero.cta"]', "bg", "#444444");
    expect(b.overrides).toEqual([{ selector: '[data-sx-c="hero.cta"]', bg: "#444444" }]);
  });

  it("upserts a role onto an existing selector instead of replacing the entry", () => {
    const a = setOverride({}, '[data-sx-c="nav.cta.color"]', "bg", "#ff0000");
    const b = setOverride(a, '[data-sx-c="nav.cta.color"]', "text", "#ffffff");
    expect(b.overrides).toEqual([
      { selector: '[data-sx-c="nav.cta.color"]', bg: "#ff0000", text: "#ffffff" },
    ]);
  });

  it("keeps distinct selectors as separate entries and clearOverride removes only one", () => {
    const a = setOverride({}, '[data-sx-c="a"]', "bg", "#111111");
    const b = setOverride(a, '[data-sx-c="b"]', "bg", "#222222");
    expect(b.overrides).toHaveLength(2);
    expect(clearOverride(b, '[data-sx-c="a"]').overrides).toEqual([
      { selector: '[data-sx-c="b"]', bg: "#222222" },
    ]);
  });

  it("resetAll clears everything and isEmptyPalette detects it", () => {
    expect(isEmptyPalette(resetAll())).toBe(true);
    expect(isEmptyPalette({ seeds: { accentAqua: "#000000" } })).toBe(false);
    expect(isEmptyPalette({ seeds: {}, tokens: {}, overrides: [] })).toBe(true);
    expect(isEmptyPalette({ overrides: [{ selector: ".a", bg: "#000000" }] })).toBe(false);
  });
});
