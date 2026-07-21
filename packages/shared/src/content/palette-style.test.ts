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

  // ── Alpha ──────────────────────────────────────────────────────────────────────────────────
  // The emitter is the layer that decides what actually reaches the page, so the seed/token split
  // has to hold HERE too and not only in zod — a snapshot can be written straight to the DB.

  it("emits an 8-digit token value verbatim (tokens are terminal — no color-mix takes one)", () => {
    const css = paletteStyle({ tokens: { toneMedium: "#ffffffa3" } })!;
    expect(css).toBe(":root, html body{--_🎨-color--tokens---tone--medium:#ffffffa3}");
  });

  it("emits an 8-digit override value verbatim, per role", () => {
    const css = paletteStyle({
      overrides: [{ selector: ".a", bg: "#ff000080", text: "#00ff0040", border: "#0000ff20" }],
    })!;
    expect(css).toBe(
      ".a{background-color:#ff000080;color:#00ff0040;border-color:#0000ff20}",
    );
  });

  it("DROPS an alpha SEED — seeds feed every color-mix, so their alpha would compound", () => {
    // Not merely "the schema would have caught it": a snapshot written before this rule, or straight
    // to the DB, must not render either. Dropping the seed leaves nothing to emit → null.
    expect(paletteStyle({ seeds: { baseDark: "#0b1f3380" } as never })).toBeNull();
    // …and the opaque seed beside it still emits, so this is a value-level drop, not a slice-level one.
    const css = paletteStyle({
      seeds: { baseDark: "#0b1f3380", baseLight: "#ffffff" } as never,
    })!;
    expect(css).toContain("--_🎨-color--base---base--light-100:#ffffff");
    expect(css).not.toContain("#0b1f3380");
  });

  it("BACKWARD COMPAT: a 6-digit palette emits exactly what it always did", () => {
    const css = paletteStyle({
      seeds: { baseDark: "#0b1f33" },
      tokens: { inkBase: "#ffffff" },
      overrides: [{ selector: ".a", bg: "#ff0000" }],
    })!;
    expect(css).toBe(
      ":root, html body{--_🎨-color--base---base--dark-100:#0b1f33;" +
        "--_🎨-color--tokens---ink--base:#ffffff}.a{background-color:#ff0000}",
    );
  });

  // ── Layer 2 of 2 of the stored-XSS guard ───────────────────────────────────────────────────
  // <style> is HTML raw text: the parser does not honour CSS escapes, so a value that closes the
  // tag executes for every visitor no matter how it is escaped. REJECT, never escape — and reject
  // HERE as well as in zod, because the stored snapshot is never trusted. palette.test.ts holds the
  // schema half against this same list.
  describe("rejects a hostile VALUE at render time, in every slice", () => {
    const HOSTILE = [
      "#fff;}</style><script>alert(1)</script>{x:",
      "#ffffffaa;}</style><script>alert(1)</script>{x:", // via the newly-widened 8-digit form
      "</style><script>alert(1)</script>",
      "#fff;background-image:url(//evil)",
    ];

    it("a hostile seed/token value never reaches the stylesheet", () => {
      for (const v of HOSTILE) {
        expect(paletteStyle({ seeds: { baseDark: v } as never }), v).toBeNull();
        expect(paletteStyle({ tokens: { toneMedium: v } as never }), v).toBeNull();
      }
    });

    it("a hostile override value never reaches the stylesheet", () => {
      for (const v of HOSTILE) {
        for (const role of ["bg", "text", "border"]) {
          expect(
            paletteStyle({ overrides: [{ selector: ".a", [role]: v }] as never }),
            `${role}=${v}`,
          ).toBeNull();
        }
      }
    });

    it("a hostile value is dropped WITHOUT taking its innocent neighbours with it", () => {
      // The anchor that makes the assertions above mean something: prove the emitter is live and
      // producing CSS in the same call where the hostile value vanishes. A blanket `toBeNull()`
      // would also pass if paletteStyle were broken and returned null for everything.
      const css = paletteStyle({
        tokens: { toneMedium: "#fff;}</style><script>alert(1)</script>{x:", inkBase: "#abcdef" },
        overrides: [
          { selector: ".a", bg: "</style><script>alert(1)</script>" },
          { selector: ".b", bg: "#111111" },
        ],
      } as never)!;
      expect(css).not.toContain("<script>");
      expect(css).not.toContain("</style>");
      expect(css).toContain("--_🎨-color--tokens---ink--base:#abcdef");
      expect(css).toContain(".b{background-color:#111111}");
      expect(css).not.toContain(".a{"); // the hostile entry emitted no rule at all
    });
  });
});

describe("paletteStyle hover rule", () => {
  it("emits a selector:hover rule from hoverBg/hoverText", () => {
    const css = paletteStyle({ overrides: [
      { selector: '[data-sx-c="heroForm.cta"] .btn-bg', bg: "#0b1f33", hoverBg: "#16324f" },
    ] });
    expect(css).toContain('[data-sx-c="heroForm.cta"] .btn-bg{background-color:#0b1f33}');
    expect(css).toContain('[data-sx-c="heroForm.cta"] .btn-bg:hover{background-color:#16324f}');
  });
  it("emits no hover rule when no hover field is set", () => {
    const css = paletteStyle({ overrides: [{ selector: '[data-sx-c="x"]', bg: "#0b1f33" }] });
    expect(css).not.toContain(":hover");
  });
  it("drops a non-hex hover value (defense in depth)", () => {
    const css = paletteStyle({ overrides: [{ selector: '[data-sx-c="x"]', hoverBg: "red" as never }] });
    expect(css ?? "").not.toContain(":hover");
  });
});
