import { describe, it, expect } from "vitest";
import { paletteStyle } from "./palette-style";

describe("paletteStyle", () => {
  it("returns null for absent/empty palette", () => {
    expect(paletteStyle(undefined)).toBeNull();
    expect(paletteStyle(null)).toBeNull();
    expect(paletteStyle({})).toBeNull();
    expect(paletteStyle({ seeds: {}, tokens: {}, overrides: [] })).toBeNull();
  });

  it("emits only present seed vars", () => {
    const css = paletteStyle({ seeds: { accentAqua: "#123456" } })!;
    expect(css).toMatch(/:root, html body\{/);
    expect(css).toContain("--_🎨-color--base---accent--aqua:#123456");
    expect(css).not.toMatch(/ocean/);
  });

  // REGRESSION: the template declares every tier-B token on `body` as well as `:root`, so a
  // `:root`-only rule lost to it page-wide and "change the whole site" did nothing. `html body`
  // (0,0,2) out-specifies the template's `body` (0,0,1) irrespective of source order.
  it("targets body too, so a token override is not shadowed by the template's body rule", () => {
    const css = paletteStyle({ tokens: { inkBase: "#abcdef" } })!;
    expect(css).toContain("--_🎨-color--tokens---ink--base:#abcdef");
    expect(css.startsWith(":root, html body{")).toBe(true);
  });

  it("emits seeds and tokens in one rule", () => {
    const css = paletteStyle({ seeds: { accentAqua: "#123456" }, tokens: { inkBase: "#abcdef" } })!;
    expect(css).toBe(
      ":root, html body{--_🎨-color--base---accent--aqua:#123456;" +
        "--_🎨-color--tokens---ink--base:#abcdef}",
    );
  });

  // The var rule must not swallow per-element override rules that follow it.
  it("keeps override rules separate from the var rule", () => {
    const css = paletteStyle({
      tokens: { inkBase: "#abcdef" },
      overrides: [{ selector: ".a", bg: "#111111" }],
    })!;
    expect(css).toBe(
      ":root, html body{--_🎨-color--tokens---ink--base:#abcdef}.a{background-color:#111111}",
    );
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
