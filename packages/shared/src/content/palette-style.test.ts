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

  // NOTE (F1 security fix): anchorId is now charset-constrained (schema regex + emitter reject) —
  // a valid anchorId can never contain selector metacharacters or newlines, so the previous
  // "escape it" behaviour was superseded by "reject it entirely" (defense in depth: never trust an
  // already-persisted snapshot). These two tests were adapted from asserting escaped output to
  // asserting the hostile anchor is dropped — see the F1 stored-XSS test below for the core case.
  it("drops an anchorId with selector metacharacters (outside the allowed charset)", () => {
    const css = paletteStyle({ overrides: { 'a"]{}': { bg: "#000000" } } });
    expect(css).toBeNull();
  });

  it("drops an anchorId containing a newline/CR (outside the allowed charset)", () => {
    const css = paletteStyle({ overrides: { "a\nb": { bg: "#000000" } } });
    expect(css).toBeNull();
  });

  it("drops a hostile anchorId that would break out of the <style> element (stored XSS)", () => {
    const css = paletteStyle({
      overrides: { "</style><script>alert(1)</script>": { bg: "#000000" } },
    });
    // Escaping is not enough — the HTML parser ignores CSS escapes inside a raw-text element, so a
    // hostile anchorId must be REJECTED entirely, never merely escaped into the output.
    expect(css === null || !css.includes("<")).toBe(true);
  });
});
