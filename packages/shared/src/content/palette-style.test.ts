import { describe, it, expect } from "vitest";
import { paletteStyle } from "./palette-style";

describe("paletteStyle", () => {
  it("returns null for absent/empty palette", () => {
    expect(paletteStyle(undefined)).toBeNull();
    expect(paletteStyle(null)).toBeNull();
    expect(paletteStyle({})).toBeNull();
    expect(paletteStyle({ seeds: {}, tokens: {}, overrides: {} })).toBeNull();
  });

  it("emits only present seed vars at :root", () => {
    const css = paletteStyle({ seeds: { accentAqua: "#123456" } })!;
    expect(css).toMatch(/:root\{/);
    expect(css).toContain("--_🎨-color--base---accent--aqua:#123456");
    expect(css).not.toMatch(/ocean/);
  });

  it("emits token vars at :root", () => {
    const css = paletteStyle({ tokens: { inkBase: "#abcdef" } })!;
    expect(css).toContain("--_🎨-color--tokens---ink--base:#abcdef");
  });

  it("emits per-anchor override rules", () => {
    const css = paletteStyle({ overrides: { "hero.cta": { bg: "#ff0000", text: "#ffffff" } } })!;
    expect(css).toContain('[data-sx-c="hero.cta"]{background-color:#ff0000;color:#ffffff}');
  });

  it("skips invalid hex defensively (never trusts caller)", () => {
    expect(paletteStyle({ seeds: { accentAqua: "javascript:alert(1)" } as never })).toBeNull();
  });

  it("escapes anchorId to prevent selector breakout", () => {
    const css = paletteStyle({ overrides: { 'a"]{}': { bg: "#000000" } } })!;
    expect(css).not.toMatch(/\]\{\}/);
  });

  it("escapes newline/CR in anchorId", () => {
    const css = paletteStyle({ overrides: { "a\nb": { bg: "#000000" } } })!;
    // the newline must be backslash-escaped (valid CSS line-continuation), never left raw…
    expect(css).toContain('data-sx-c="a\\\nb"');
    // …and no newline may appear unescaped (i.e. not preceded by a backslash).
    expect(css).not.toMatch(/[^\\]\n/);
  });
});
