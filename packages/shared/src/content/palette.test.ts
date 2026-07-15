import { describe, it, expect } from "vitest";
import {
  PaletteSchema,
  PaletteSeedsSchema,
  PaletteTokensSchema,
  PALETTE_VARS,
  TOKEN_VARS,
  TOKEN_KEYS,
  SEED_KEYS,
  INERT_SEED_KEYS,
  isInertSeed,
  Hex,
  HexA,
  splitHexAlpha,
  joinHexAlpha,
} from "./palette";
import { paletteStyle } from "./palette-style";

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

// ---------------------------------------------------------------------------------------------
//  ALPHA. Two value types, and WHICH slice gets which is the whole design:
//    • seeds  → Hex  (opaque). They are every color-mix's operand, so their alpha would be
//               multiplied into each derived shade rather than rendered.
//    • tokens + overrides → HexA (#rrggbbaa). Terminal: no color-mix takes one.
// ---------------------------------------------------------------------------------------------

describe("Hex vs HexA", () => {
  it("Hex accepts the opaque forms and REJECTS alpha — seeds must not carry it", () => {
    expect(Hex.safeParse("#fff").success).toBe(true);
    expect(Hex.safeParse("#ffffff").success).toBe(true);
    expect(Hex.safeParse("#ffffff80").success).toBe(false);
    expect(Hex.safeParse("#ffff").success).toBe(false);
  });

  it("HexA accepts alpha AND every opaque form Hex did (backward compatible)", () => {
    for (const v of ["#fff", "#ffffff", "#0b1f33", "#ABCDEF"]) {
      expect(Hex.safeParse(v).success).toBe(true);
      expect(HexA.safeParse(v).success).toBe(true); // nothing that parsed before may 422 now
    }
    expect(HexA.safeParse("#ffffff80").success).toBe(true);
    expect(HexA.safeParse("#fff8").success).toBe(true);
  });

  it("HexA rejects everything that is not a hex colour, anchored at BOTH ends", () => {
    for (const v of [
      "#ffffff8", // 7 digits — not a CSS hex length
      "#fffff", // 5
      "#ffffff800", // 9
      "rgba(0,0,0,0.5)", // the format we deliberately did NOT choose
      "red",
      "",
      "#",
      "ffffff",
      "#gggggg",
      " #ffffff", // leading whitespace — ^ must bite
      "#ffffff ", // trailing whitespace — $ must bite
      "#ffffff\n#000000", // a newline is not "end of string" to a sloppy $
    ]) {
      expect(HexA.safeParse(v).success, `HexA must reject ${JSON.stringify(v)}`).toBe(false);
    }
  });
});

describe("splitHexAlpha / joinHexAlpha", () => {
  it("splits the four hex lengths, expanding the short forms", () => {
    expect(splitHexAlpha("#ffffff")).toEqual({ rgb: "#ffffff", alpha: 1 });
    expect(splitHexAlpha("#fff")).toEqual({ rgb: "#ffffff", alpha: 1 });
    expect(splitHexAlpha("#0b1f3300")).toEqual({ rgb: "#0b1f33", alpha: 0 });
    const half = splitHexAlpha("#0b1f3380")!;
    expect(half.rgb).toBe("#0b1f33");
    expect(half.alpha).toBeCloseTo(128 / 255, 5);
  });

  it("refuses what HexA refuses rather than guessing", () => {
    expect(splitHexAlpha("rgba(0,0,0,.5)")).toBeUndefined();
    expect(splitHexAlpha("#ffffff8")).toBeUndefined();
  });

  it("joins to 6 digits when opaque — an untouched colour must not churn to #rrggbbff", () => {
    expect(joinHexAlpha("#0b1f33", 1)).toBe("#0b1f33");
    expect(joinHexAlpha("#fff", 1)).toBe("#ffffff");
  });

  it("joins to 8 digits when translucent, and clamps out-of-range alpha", () => {
    expect(joinHexAlpha("#0b1f33", 0)).toBe("#0b1f3300");
    expect(joinHexAlpha("#0b1f33", 0.5)).toBe("#0b1f3380");
    expect(joinHexAlpha("#0b1f33", 2)).toBe("#0b1f33"); // clamped to opaque
    expect(joinHexAlpha("#0b1f33", -1)).toBe("#0b1f3300");
  });

  it("round-trips through split → join for every alpha byte", () => {
    for (let byte = 0; byte <= 255; byte++) {
      const src = `#0b1f33${byte.toString(16).padStart(2, "0")}`;
      const { rgb, alpha } = splitHexAlpha(src)!;
      // 255 joins back to the 6-digit form by design; every other byte must survive exactly.
      expect(joinHexAlpha(rgb, alpha)).toBe(byte === 255 ? "#0b1f33" : src);
    }
  });

  it("every joined value is storable — the picker cannot mint a value the schema 422s", () => {
    for (let byte = 0; byte <= 255; byte++) {
      expect(HexA.safeParse(joinHexAlpha("#0b1f33", byte / 255)).success).toBe(true);
    }
  });
});

describe("alpha reaches the right slices, and only those", () => {
  it("tokens accept alpha", () => {
    expect(PaletteTokensSchema.safeParse({ toneMedium: "#ffffffa3" }).success).toBe(true);
    expect(PaletteSchema.safeParse({ tokens: { toneMedium: "#ffffffa3" } }).success).toBe(true);
  });

  it("overrides accept alpha on every role", () => {
    const r = PaletteSchema.safeParse({
      overrides: [{ selector: ".a", bg: "#ff000080", text: "#00ff0040", border: "#0000ff20" }],
    });
    expect(r.success).toBe(true);
  });

  it("SEEDS still reject alpha — they are the color-mix input and would compound it", () => {
    expect(PaletteSeedsSchema.safeParse({ baseDark: "#0b1f3380" }).success).toBe(false);
    expect(PaletteSchema.safeParse({ seeds: { baseDark: "#0b1f3380" } }).success).toBe(false);
    // …and still accept the opaque forms.
    expect(PaletteSchema.safeParse({ seeds: { baseDark: "#0b1f33" } }).success).toBe(true);
  });

  it("BACKWARD COMPAT: a palette written before alpha existed still parses unchanged", () => {
    const legacy = {
      seeds: { baseDark: "#0b1f33", baseLight: "#fff" },
      tokens: { inkBase: "#ffffff" },
      overrides: [{ selector: '[data-sx-c="hero.cta"]', bg: "#ff0000", text: "#fff" }],
    };
    const r = PaletteSchema.safeParse(legacy);
    expect(r.success).toBe(true);
    expect(r.data).toEqual(legacy); // values kept byte-for-byte, not normalised
  });
});

// ---------------------------------------------------------------------------------------------
//  SECURITY. Widening the value format is a new injection surface: these strings are emitted into
//  a <style>, which is HTML RAW TEXT — the parser ignores CSS escapes, so escaping is not a
//  defence and the rule is REJECT. Enforced at TWO layers, and both are tested, because a stored
//  snapshot is never trusted: zod on save (here) and the emitter on render (palette-style.test.ts).
// ---------------------------------------------------------------------------------------------

describe("stored-XSS guard on palette VALUES (both layers — schema half)", () => {
  const HOSTILE = [
    "#fff;}</style><script>alert(1)</script>{x:", // the canonical break-out
    "#ffffff;}</style><script>alert(1)</script>{x:",
    "#ffffffaa;}</style><script>alert(1)</script>{x:", // via the NEW 8-digit form
    "</style><script>alert(1)</script>",
    "#fff</style>",
    "red;background:url(javascript:alert(1))",
    "#fff;background-image:url(//evil)",
    "expression(alert(1))",
    "javascript:alert(1)",
  ];

  it("the schema rejects a hostile value in a SEED", () => {
    for (const v of HOSTILE) {
      expect(PaletteSchema.safeParse({ seeds: { baseDark: v } }).success, v).toBe(false);
    }
  });

  it("the schema rejects a hostile value in a TOKEN (the newly-widened slice)", () => {
    for (const v of HOSTILE) {
      expect(PaletteSchema.safeParse({ tokens: { toneMedium: v } }).success, v).toBe(false);
    }
  });

  it("the schema rejects a hostile value in an OVERRIDE role (the other widened slice)", () => {
    for (const v of HOSTILE) {
      for (const role of ["bg", "text", "border"]) {
        expect(
          PaletteSchema.safeParse({ overrides: [{ selector: ".a", [role]: v }] }).success,
          `${role}=${v}`,
        ).toBe(false);
      }
    }
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

  it("has a cssVar+label for every token key, and no duplicate cssVar across the registry", () => {
    for (const k of TOKEN_KEYS) {
      expect(TOKEN_VARS[k].cssVar.startsWith("--_")).toBe(true);
      expect(TOKEN_VARS[k].label.length).toBeGreaterThan(0);
    }
    // Two keys pointing at one property would make the panel offer the same colour twice under
    // different names, and make the LAST one written silently win in the emitter.
    const all = [
      ...SEED_KEYS.map((k) => PALETTE_VARS[k].cssVar),
      ...TOKEN_KEYS.map((k) => TOKEN_VARS[k].cssVar),
    ];
    expect(new Set(all).size).toBe(all.length);
  });

  // The tone ladder is the registry's newest tier-B family and the reason a real user hit a dead
  // end: the template reads these 58 times between them and NONE was listed, so detectToken
  // resolved nothing for any element they paint. WHETHER the names match the stylesheet is asserted
  // against the stylesheet by apps/web/app/lib/palette-template.test.mjs — this package cannot see
  // it. What is pinned here is only that the five keys EXIST and are wired as tier-B tokens.
  it("registers all five tone tokens", () => {
    for (const k of ["toneStrong", "toneGood", "toneMedium", "toneSubtle", "toneFaint"]) {
      expect(TOKEN_KEYS).toContain(k);
      expect(PaletteTokensSchema.safeParse({ [k]: "#123456" }).success).toBe(true);
    }
  });
});

describe("INERT_SEED_KEYS", () => {
  // WHICH set is inert is a fact about the template, and is asserted against the template by
  // apps/web/app/lib/palette-template.test.mjs (this package cannot see it). What is pinned HERE is
  // the invariant that survives whatever that set turns out to be: marking a seed inert changes
  // what the UI OFFERS and NOTHING about what the system ACCEPTS. Existing snapshots already carry
  // accentAqua values; if these ever fail, stored palettes are being dropped or 422'd.

  it("only ever names real seeds", () => {
    expect(INERT_SEED_KEYS.length).toBeGreaterThan(0); // else the tests below assert nothing
    for (const k of INERT_SEED_KEYS) expect(SEED_KEYS).toContain(k);
  });

  it("does not mark every seed inert — the panel must still offer the working ones", () => {
    expect(INERT_SEED_KEYS.length).toBeLessThan(SEED_KEYS.length);
  });

  it("isInertSeed agrees with the list, and is false for a live seed", () => {
    for (const k of SEED_KEYS) expect(isInertSeed(k)).toBe(INERT_SEED_KEYS.includes(k));
    expect(isInertSeed("baseLight")).toBe(false);
  });

  it("an inert seed is STILL a valid, storable key — zod accepts it exactly as before", () => {
    for (const k of INERT_SEED_KEYS) {
      expect(PaletteSeedsSchema.safeParse({ [k]: "#123456" }).success).toBe(true);
      expect(PaletteSchema.safeParse({ seeds: { [k]: "#123456" } }).success).toBe(true);
    }
  });

  it("an inert seed survives a parse round-trip — the value is kept, not stripped", () => {
    for (const k of INERT_SEED_KEYS) {
      expect(PaletteSchema.parse({ seeds: { [k]: "#123456" } })).toEqual({
        seeds: { [k]: "#123456" },
      });
    }
  });

  it("the emitter still emits an inert seed's declaration, unchanged", () => {
    // It paints nothing — that is the template's doing, not ours — but the emitter must not start
    // filtering these out: dropping a declaration would be a behaviour change on the public render.
    for (const k of INERT_SEED_KEYS) {
      expect(paletteStyle({ seeds: { [k]: "#123456" } })).toContain(
        `${PALETTE_VARS[k].cssVar}:#123456`,
      );
    }
  });
});
