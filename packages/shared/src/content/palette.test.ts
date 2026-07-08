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
      overrides: { "hero.cta": { bg: "#ff0000", text: "#fff" } },
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
      overrides: { "hero.cta": { glow: "#fff" } },
    });
    expect(r.success).toBe(false);
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

  it("maps accentAqua to the exact template variable", () => {
    expect(PALETTE_VARS.accentAqua.cssVar).toBe(
      "--_🎨-color--base---accent--aqua",
    );
  });

  it("maps inkBase to the ink token variable", () => {
    expect(TOKEN_VARS.inkBase.cssVar).toBe("--_🎨-color--tokens---ink--base");
  });
});
