import { describe, it, expect } from "vitest";
import {
  PaletteSchema,
  PALETTE_VARS,
  TOKEN_VARS,
  SEED_KEYS,
} from "./palette";

describe("PaletteSchema", () => {
  it("accepts a full valid palette (seeds + tokens + overrides)", () => {
    const r = PaletteSchema.safeParse({
      seeds: { accentAqua: "#2ec4b6", baseDark: "#0b1f33" },
      tokens: { inkBase: "#ffffff" },
      overrides: [{ selector: '[data-sx-c="hero.cta"]', bg: "#ff0000", text: "#fff" }],
    });
    expect(r.success).toBe(true);
  });

  it("accepts an empty palette object", () => {
    expect(PaletteSchema.safeParse({}).success).toBe(true);
  });

  it("rejects a non-hex seed value", () => {
    const r = PaletteSchema.safeParse({ seeds: { accentAqua: "teal" } });
    expect(r.success).toBe(false);
  });

  it("rejects an unknown token key", () => {
    const r = PaletteSchema.safeParse({ tokens: { notAToken: "#fff" } });
    expect(r.success).toBe(false);
  });

  it("rejects an unknown override role", () => {
    const r = PaletteSchema.safeParse({
      overrides: [{ selector: '[data-sx-c="hero.cta"]', glow: "#fff" }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects an override selector containing HTML metacharacters (stored-XSS guard)", () => {
    const r = PaletteSchema.safeParse({
      overrides: [{ selector: "</style>", bg: "#000000" }],
    });
    expect(r.success).toBe(false);
  });

  it("still accepts an anchor selector of the real convention (dots, letters, digits, hyphen)", () => {
    const r = PaletteSchema.safeParse({
      overrides: [{ selector: '[data-sx-c="nav.cta.color"]', bg: "#000000" }],
    });
    expect(r.success).toBe(true);
  });

  it("caps overrides at 200 and rejects an unsupported selector", () => {
    const one = { selector: ".a", bg: "#000000" };
    expect(PaletteSchema.safeParse({ overrides: Array(200).fill(one) }).success).toBe(true);
    expect(PaletteSchema.safeParse({ overrides: Array(201).fill(one) }).success).toBe(false);
    expect(PaletteSchema.safeParse({ overrides: [{ selector: "*", bg: "#000000" }] }).success).toBe(false);
  });
});

describe("PALETTE_VARS / TOKEN_VARS", () => {
  it("has a cssVar+default+label for every seed key", () => {
    for (const k of SEED_KEYS) {
      expect(PALETTE_VARS[k].cssVar.startsWith("--_")).toBe(true);
      expect(PALETTE_VARS[k].default).toMatch(/^#[0-9a-f]{3,6}$/i);
      expect(PALETTE_VARS[k].label.length).toBeGreaterThan(0);
    }
  });

  // These two PIN the spelling; they do NOT verify it against the template, and cannot: the template
  // lives in apps/web and this package must never depend on an app. Re-typing the implementation's
  // own literal only catches an edit to one side — it is worthless against the risk that matters (a
  // name matching nothing in the stylesheet, i.e. a silent site-wide no-op), which is why renaming a
  // cssVar once left every test here green.
  //
  // THE REAL GUARD IS apps/web/app/lib/palette-template.test.mjs — it reads the stylesheet and
  // asserts all 20 names are declared there. Change a cssVar and that is what will fail. Keep these
  // as change-detectors for the two anchor names, and do not mistake them for the contract.
  it("pins accentAqua's variable name (spelling only — see palette-template.test.mjs)", () => {
    expect(PALETTE_VARS.accentAqua.cssVar).toBe(
      "--_🎨-color--base---accent--aqua",
    );
  });

  it("pins inkBase's variable name (spelling only — see palette-template.test.mjs)", () => {
    expect(TOKEN_VARS.inkBase.cssVar).toBe("--_🎨-color--tokens---ink--base");
  });
});
