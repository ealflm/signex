import { describe, it, expect } from "vitest";
import { paletteStyle } from "./palette-style";

describe("paletteStyle", () => {
  it("returns null for absent/empty palette", () => {
    expect(paletteStyle(undefined)).toBeNull();
    expect(paletteStyle(null)).toBeNull();
    expect(paletteStyle({})).toBeNull();
    expect(paletteStyle({ seeds: {}, tokens: {}, overrides: [] })).toBeNull();
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

  it("skips invalid hex defensively (never trusts caller)", () => {
    expect(paletteStyle({ seeds: { accentAqua: "javascript:alert(1)" } as never })).toBeNull();
  });

  it("emits one rule per override, roles grouped", () => {
    const css = paletteStyle({
      overrides: [{ selector: '[data-sx-c="hero.cta"]', bg: "#ff0000", text: "#ffffff" }],
    })!;
    expect(css).toContain('[data-sx-c="hero.cta"]{background-color:#ff0000;color:#ffffff}');
  });

  it("emits the selector verbatim, including a descendant path", () => {
    const css = paletteStyle({
      overrides: [{ selector: '[data-sx-block="nav"] .btn-bg', bg: "#ff0000" }],
    })!;
    expect(css).toContain('[data-sx-block="nav"] .btn-bg{background-color:#ff0000}');
  });

  // Defence in depth: the schema rejects these on save, but a snapshot written before this rule
  // (or straight to the DB) must still be rejected here — never escaped. <style> is raw text.
  it("drops an override whose stored selector is not in the grammar", () => {
    const css = paletteStyle({
      overrides: [
        { selector: "</style><script>alert(1)</script>", bg: "#000000" },
        { selector: ".ok", bg: "#111111" },
      ] as never,
    })!;
    expect(css).not.toContain("<script>");
    expect(css).toContain(".ok{background-color:#111111}");
  });

  it("skips invalid hex defensively (never trusts caller)", () => {
    expect(
      paletteStyle({ overrides: [{ selector: ".a", bg: "javascript:alert(1)" }] as never }),
    ).toBeNull();
  });
});
