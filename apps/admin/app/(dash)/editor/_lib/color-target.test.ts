import { describe, it, expect } from "vitest";
import { readColorTarget, tokenLabel, ROLE_LABEL } from "./color-target";

// The wire shape apps/web's edit-overlay.tsx actually posts on a colour-mode click:
//   { source, type:"colorTarget", blockKey, label, roles: resolveRoles(block) }
// `roles` is color-engine's RoleInfo[] — { role, hex?, tokenKey?, selector? }.
const msg = (over: Record<string, unknown> = {}) => ({
  source: "signex-editor",
  type: "colorTarget",
  blockKey: "nav",
  label: "nav.cta.color",
  roles: [
    { role: "bg", hex: "#0b1f33", tokenKey: "btnPrimaryBg", selector: '[data-sx-c="nav.cta.color"] .btn-bg' },
  ],
  ...over,
});

describe("readColorTarget", () => {
  it("reads the overlay's colorTarget message", () => {
    expect(readColorTarget(msg())).toEqual({
      blockKey: "nav",
      label: "nav.cta.color",
      roles: [
        {
          role: "bg",
          hex: "#0b1f33",
          tokenKey: "btnPrimaryBg",
          selector: '[data-sx-c="nav.cta.color"] .btn-bg',
        },
      ],
    });
  });

  it("returns null for anything that is not a colorTarget", () => {
    // The bridge gate proves origin + source and nothing else, so this is the only thing standing
    // between another message type and the colour panel.
    for (const type of ["ready", "textEdit", "colorEdit", undefined, 7]) {
      expect(readColorTarget(msg({ type }))).toBeNull();
    }
  });

  it("keeps a role that resolved NO token — the per-element path is the normal case there", () => {
    // NB: this used to cite `--_🎨-color--tokens---tone--medium` as the example of "a var in neither
    // registry". It is in TOKEN_VARS now (as `toneMedium`) — the tone ladder was the registry's
    // largest hole and its absence is what left .tone-medium elements with no site-wide route at
    // all. The CASE this test covers is unchanged and still normal: a winning rule that reads a
    // literal colour, or any var still outside both registries, resolves no token. That role must
    // stay editable via its selector; dropping it (or treating it as an error) is what the old
    // popover did with token === "" and it is why hero.titleBottom was uneditable.
    const t = readColorTarget(
      msg({
        roles: [{ role: "text", hex: "#ffffff", selector: '[data-sx-block="hero"] .heading' }],
      }),
    );
    expect(t?.roles).toEqual([
      { role: "text", hex: "#ffffff", tokenKey: undefined, selector: '[data-sx-block="hero"] .heading' },
    ]);
  });

  it("keeps an 8-digit hex — the template's color-mix colours arrive with alpha", () => {
    // THE regression that would rebuild the user's dead end one layer out. rgbToHex reports
    // `#ffffffa3` for the .tone-medium span (color-mix(… 64%) → color(srgb 1 1 1 / 0.64)); if this
    // parse still gated on the seeds' opaque `Hex`, it would drop that value back to undefined and
    // the panel would be back to having no colour to show for exactly the elements this fixed.
    for (const hex of ["#ffffffa3", "#0d2b4480", "#fff8", "#00000000"]) {
      const t = readColorTarget(msg({ roles: [{ role: "text", hex }] }));
      expect(t?.roles[0].hex, hex).toBe(hex);
    }
  });

  it("still drops a value that is not a hex at all — this one is emitted into a <style>", () => {
    for (const hex of ["rgba(0,0,0,0.5)", "#ffffff8", "red", "#fff;}</style><script>alert(1)</script>{x:"]) {
      const t = readColorTarget(msg({ roles: [{ role: "text", hex }] }));
      expect(t?.roles[0].hex, hex).toBeUndefined();
    }
  });

  it("reads tokenReaches, and treats only a literal false as 'shadowed'", () => {
    // The panel suppresses the site-wide route on `=== false`. A preview that predates the field
    // sends nothing, and absence is not evidence of shadowing — it must read as undefined so the
    // panel behaves exactly as it did before the field existed.
    const read = (tokenReaches: unknown) =>
      readColorTarget(msg({ roles: [{ role: "bg", hex: "#ffffff", tokenKey: "toneMedium", tokenReaches }] }))
        ?.roles[0].tokenReaches;
    expect(read(false)).toBe(false);
    expect(read(true)).toBe(true);
    for (const junk of [undefined, null, 0, 1, "false", "true", {}]) {
      expect(read(junk), String(junk)).toBeUndefined();
    }
  });

  it("accepts the tone keys as real tokens — they are in TOKEN_VARS now", () => {
    for (const tokenKey of ["toneStrong", "toneGood", "toneMedium", "toneSubtle", "toneFaint"]) {
      const t = readColorTarget(msg({ roles: [{ role: "text", hex: "#ffffffa3", tokenKey }] }));
      expect(t?.roles[0].tokenKey, tokenKey).toBe(tokenKey);
      // and the panel's label lookup must resolve them, or the site-wide row reads as a raw key
      expect(tokenLabel(tokenKey)).not.toBe(tokenKey);
    }
  });

  it("drops a tokenKey that is not a known seed/token key", () => {
    // detectToken only ever returns a PALETTE_VARS/TOKEN_VARS key — but this crosses a window
    // boundary, and an unknown key would be written into palette.tokens, which PaletteSchema
    // rejects: a 422 on save-draft that fails the WHOLE batch, including unrelated block edits.
    for (const tokenKey of ["nope", "", 7, null, "--_🎨-color--tokens---tone--medium"]) {
      const t = readColorTarget(msg({ roles: [{ role: "bg", hex: "#ffffff", tokenKey }] }));
      expect(t?.roles[0].tokenKey).toBeUndefined();
    }
  });

  it("drops an INHERITED-property tokenKey — Object.hasOwn, not `in`", () => {
    // `"toString" in PALETTE_VARS` is true. A truthy `in` test would send tokenKey:"toString" to
    // setSeed and 422 the save; worse, it would read a Function as a token.
    for (const tokenKey of ["toString", "constructor", "__proto__", "hasOwnProperty"]) {
      const t = readColorTarget(msg({ roles: [{ role: "bg", hex: "#ffffff", tokenKey }] }));
      expect(t?.roles[0].tokenKey).toBeUndefined();
    }
  });

  it("drops a selector outside the grammar — reject, never escape", () => {
    // Second layer of the same rule zod enforces on save and paletteStyle enforces on render. An
    // override selector is emitted into a <style>, which is HTML raw text: escaping is not a
    // defence, so a selector that isn't provably in the grammar simply never becomes an override.
    for (const selector of [
      '</style><script>alert(1)</script>',
      '[data-sx-c="a"]{} body{display:none}',
      "*",
      "div",
      "#id",
      '[data-sx-c="a"]  .b', // double space — outside the grammar
      "." + "x".repeat(400), // over SELECTOR_MAX_LEN
      "",
      42,
      null,
    ]) {
      const t = readColorTarget(msg({ roles: [{ role: "bg", hex: "#ffffff", selector }] }));
      expect(t?.roles[0].selector).toBeUndefined();
    }
  });

  it("drops a hex that is not a #rgb/#rrggbb — an unrepresentable colour stays absent", () => {
    // color-engine returns hex ONLY for a fully-opaque rgb(); a role with alpha or a gradient
    // arrives with no hex at all, and the panel renders that as a read-only row rather than lying.
    for (const hex of ["rgba(0,0,0,.5)", "red", "#12", "#1234567", "", 0, null, undefined]) {
      const t = readColorTarget(msg({ roles: [{ role: "text", hex }] }));
      expect(t?.roles[0].hex).toBeUndefined();
    }
  });

  it("drops entries that are not a known role", () => {
    const t = readColorTarget(
      msg({
        roles: [
          { role: "shadow", hex: "#ffffff" },
          null,
          "bg",
          { hex: "#ffffff" },
          { role: "border", hex: "#ffffff" },
        ],
      }),
    );
    expect(t?.roles.map((r) => r.role)).toEqual(["border"]);
  });

  it("tolerates a missing/!array roles and missing strings rather than dropping the click", () => {
    for (const roles of [undefined, null, "bg", {}]) {
      expect(readColorTarget(msg({ roles }))?.roles).toEqual([]);
    }
    const bare = readColorTarget({ type: "colorTarget" });
    expect(bare).toEqual({ blockKey: "", label: "Phần tử", roles: [] });
  });
});

describe("tokenLabel / ROLE_LABEL", () => {
  it("labels seeds and tokens from the shared registry, and falls back to the key", () => {
    expect(tokenLabel("accentAqua")).toBe("Màu nhấn (aqua)");
    expect(tokenLabel("btnPrimaryBg")).toBe("Nút chính — nền");
    expect(tokenLabel("mystery")).toBe("mystery");
    expect(tokenLabel("toString")).toBe("toString"); // no inherited-property leak
  });

  it("names every role in Vietnamese", () => {
    expect(ROLE_LABEL).toEqual({ bg: "Nền", text: "Chữ", border: "Viền" });
  });
});
