import { describe, it, expect } from "vitest";
import {
  setSeed,
  setToken,
  setTokenColor,
  setOverride,
  clearOverride,
  clearOverrideRole,
  rebasePalette,
} from "./palette-working-set";

describe("palette-working-set reducers", () => {
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

  it("clearOverrideRole clears ONE role and leaves its siblings on the same selector", () => {
    // The defect this pins: a role's × called clearOverride, which drops the whole ENTRY — so
    // clearing `bg` destroyed the `text` and `border` the user set on that same element and never
    // touched. Multi-role-per-selector is first-class (see the upsert test above), and colour mode
    // never removes a colour the user did not point at.
    const sel = '[data-sx-c="nav.cta.color"]';
    let p = setOverride({}, sel, "bg", "#ff0000");
    p = setOverride(p, sel, "text", "#ffffff");
    p = setOverride(p, sel, "border", "#000000");

    const noBg = clearOverrideRole(p, sel, "bg");
    expect(noBg.overrides).toEqual([{ selector: sel, text: "#ffffff", border: "#000000" }]);
    // …and the input is untouched (immutable, like every reducer here).
    expect(p.overrides).toEqual([{ selector: sel, bg: "#ff0000", text: "#ffffff", border: "#000000" }]);
  });

  it("clearOverrideRole drops the entry only when its LAST role goes", () => {
    const sel = '[data-sx-c="hero.cta"]';
    const two = setOverride(setOverride({}, sel, "bg", "#111111"), sel, "text", "#222222");
    const one = clearOverrideRole(two, sel, "bg");
    expect(one.overrides).toEqual([{ selector: sel, text: "#222222" }]);
    // Last role out → no entry: a roleless entry emits no declarations (paletteStyle skips it) and
    // would only sit there auditing as "broken" the day its element moved.
    expect(clearOverrideRole(one, sel, "text").overrides).toEqual([]);
  });

  it("clearOverrideRole touches no other selector, and a role that was never set is a no-op", () => {
    const a = setOverride({}, '[data-sx-c="a"]', "bg", "#111111");
    const b = setOverride(a, '[data-sx-c="b"]', "bg", "#222222");
    expect(clearOverrideRole(b, '[data-sx-c="a"]', "text").overrides).toEqual([
      { selector: '[data-sx-c="a"]', bg: "#111111" },
      { selector: '[data-sx-c="b"]', bg: "#222222" },
    ]);
    expect(clearOverrideRole(b, '[data-sx-c="missing"]', "bg").overrides).toEqual(b.overrides);
  });

  it("keeps distinct selectors as separate entries and clearOverride removes only one", () => {
    const a = setOverride({}, '[data-sx-c="a"]', "bg", "#111111");
    const b = setOverride(a, '[data-sx-c="b"]', "bg", "#222222");
    expect(b.overrides).toHaveLength(2);
    expect(clearOverride(b, '[data-sx-c="a"]').overrides).toEqual([
      { selector: '[data-sx-c="b"]', bg: "#222222" },
    ]);
  });

  it("setTokenColor routes a seed key to seeds and a token key to tokens", () => {
    // The colour panel resolves ONE key per role off the winning CSS rule's var() and cannot know
    // which tier it belongs to; the two tiers are stored under different slices and validated by
    // different zod enums, so the routing has to happen somewhere. Here, once, is that somewhere.
    expect(setTokenColor({}, "accentAqua", "#111111")).toEqual({ seeds: { accentAqua: "#111111" } });
    expect(setTokenColor({}, "btnPrimaryBg", "#222222")).toEqual({
      tokens: { btnPrimaryBg: "#222222" },
    });
  });

  it("setTokenColor ignores a key that is no seed and no token", () => {
    // Writing an unknown key would 422 the whole save-draft batch (PaletteSeeds/TokensSchema are
    // key enums). `Object.hasOwn`, not `in`: "toString" IS in PALETTE_VARS by prototype.
    for (const k of ["mystery", "toString", "constructor", "__proto__"]) {
      expect(setTokenColor({ seeds: { accentAqua: "#000000" } }, k, "#ffffff")).toEqual({
        seeds: { accentAqua: "#000000" },
      });
    }
  });

});

describe("rebasePalette (the 409 retry)", () => {
  // Every touched save sends `replacePalette: true` — the working set is complete and replace is the
  // only verb a DELETION can travel under. So the retry after a 409 must first re-derive that working
  // set against what the other session actually saved, or "replace" means "overwrite them".
  const base = { seeds: { accentAqua: "#000000", baseDark: "#111111" } };

  it("keeps THEIR change to a key this session never touched", () => {
    const ours = setSeed(base, "accentAqua", "#aaaaaa"); // we changed only accentAqua
    const theirs = setSeed(base, "baseDark", "#bbbbbb"); // they changed only baseDark
    expect(rebasePalette(ours, base, theirs).seeds).toEqual({
      accentAqua: "#aaaaaa", // ours — the edit being retried
      baseDark: "#bbbbbb", // theirs — we never looked at it, and they wrote later
    });
  });

  it("lets OUR change win on a key both sessions touched — someone has to, and we are retrying", () => {
    const ours = setSeed(base, "accentAqua", "#aaaaaa");
    const theirs = setSeed(base, "accentAqua", "#bbbbbb");
    expect(rebasePalette(ours, base, theirs).seeds?.accentAqua).toBe("#aaaaaa");
  });

  it("does NOT resurrect a key this session deleted", () => {
    // The case an additive merge could never express, and the reason replace exists at all: a reset.
    // `{}` is what a reset IS on the wire — the shell posts applyPalette({}) (editor-shell.tsx).
    const ours = {};
    const theirs = setSeed(base, "liftDark", "#bbbbbb");
    const out = rebasePalette(ours, base, theirs);
    expect(out.seeds).toEqual({ liftDark: "#bbbbbb" }); // ours cleared what we knew of; theirs is new
  });

  it("adopts a whole slice they added and we never had", () => {
    const theirs = { ...base, tokens: { btnPrimaryBg: "#bbbbbb" } };
    const out = rebasePalette(base, base, theirs);
    expect(out.tokens).toEqual({ btnPrimaryBg: "#bbbbbb" });
    expect(out.seeds).toEqual(base.seeds);
  });

  it("merges overrides ROLE-wise per selector — two people can own two colours on one element", () => {
    const sel = '[data-sx-c="nav.cta.color"]';
    const b = setOverride({}, sel, "bg", "#000000");
    const ours = setOverride(b, sel, "bg", "#aaaaaa"); // we repainted the bg
    const theirs = setOverride(b, sel, "text", "#bbbbbb"); // they added the text
    expect(rebasePalette(ours, b, theirs).overrides).toEqual([
      { selector: sel, bg: "#aaaaaa", text: "#bbbbbb" },
    ]);
  });

  it("keeps a role we cleared cleared, and drops the entry when nothing is left of it", () => {
    const sel = '[data-sx-c="nav.cta.color"]';
    const b = setOverride(setOverride({}, sel, "bg", "#000000"), sel, "text", "#ffffff");
    const ours = clearOverrideRole(b, sel, "bg"); // we cleared the bg
    expect(rebasePalette(ours, b, b).overrides).toEqual([{ selector: sel, text: "#ffffff" }]);

    const gone = clearOverride(b, sel); // we cleared the whole element
    expect(rebasePalette(gone, b, b).overrides).toEqual([]);
  });

  it("keeps an entry alive on a role THEY added to an element we cleared", () => {
    // We deleted the roles we knew about; a role we never saw is not ours to delete.
    const sel = '[data-sx-c="nav.cta.color"]';
    const b = setOverride({}, sel, "bg", "#000000");
    const theirs = setOverride(b, sel, "border", "#bbbbbb");
    expect(rebasePalette(clearOverride(b, sel), b, theirs).overrides).toEqual([
      { selector: sel, border: "#bbbbbb" },
    ]);
  });

  it("is a no-op-shaped identity when this session changed nothing", () => {
    const theirs = { seeds: { accentAqua: "#bbbbbb" }, overrides: [{ selector: ".a", bg: "#cccccc" }] };
    expect(rebasePalette(theirs, theirs, theirs)).toEqual({
      seeds: { accentAqua: "#bbbbbb" },
      tokens: {},
      overrides: [{ selector: ".a", bg: "#cccccc" }],
    });
  });
});

describe("per-element hover roles", () => {
  const SEL = '[data-sx-c="heroForm.cta"] .btn-bg';
  it("setOverride writes hoverBg onto the same selector entry as bg", () => {
    let p = setOverride({}, SEL, "bg", "#0b1f33");
    p = setOverride(p, SEL, "hoverBg", "#16324f");
    const o = p.overrides!.find((x) => x.selector === SEL)!;
    expect(o.bg).toBe("#0b1f33");
    expect(o.hoverBg).toBe("#16324f");
    expect(p.overrides!.length).toBe(1); // one entry, two roles
  });
  it("clearOverrideRole('bg') keeps the entry alive while hoverBg remains", () => {
    let p = setOverride({}, SEL, "bg", "#0b1f33");
    p = setOverride(p, SEL, "hoverBg", "#16324f");
    p = clearOverrideRole(p, SEL, "bg");
    const o = p.overrides!.find((x) => x.selector === SEL);
    expect(o).toBeDefined();
    expect(o!.bg).toBeUndefined();
    expect(o!.hoverBg).toBe("#16324f");
  });
  it("clearing the last remaining role drops the entry", () => {
    let p = setOverride({}, SEL, "hoverBg", "#16324f");
    p = clearOverrideRole(p, SEL, "hoverBg");
    expect((p.overrides ?? []).length).toBe(0);
  });
});
