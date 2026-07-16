import { describe, it, expect } from "vitest";
import { isSafeSelector, CssSelectorSchema, SELECTOR_MAX_LEN, SELECTOR_RE } from "./selector";
import { paletteStyle } from "./palette-style";

describe("selector grammar", () => {
  const ACCEPT = [
    '[data-sx-c="nav.cta.color"]',
    '[data-sx-block="hero"] .btn-bg',
    '[data-sx-block="nav"] > .nav_wrap .btn-bg',
    '[data-sx-block="footer"] .row:nth-of-type(2) > .cell',
    '[data-sx-c="nav.cta.color"] .btn-bg',
    ".btn-bg",
    // ── the type-selector production ──
    // The user's element. NOTE the `h2:nth-of-type(1)`: the hand-written proof-of-concept for this
    // change was `[data-sx-block="features"] h2 span:nth-of-type(1)`, with a BARE h2, and that is
    // deliberately NOT in the grammar (see selector.ts). The generator has no use for a bare tag —
    // `h2:nth-of-type(1)` selects a subset of what `h2` selects and target always satisfies it, so
    // the indexed form is never worse for the document-wide uniqueness buildSelector must prove.
    '[data-sx-block="features"] h2:nth-of-type(1) span:nth-of-type(1)',
    '[data-sx-block="features"] div.card:nth-of-type(2)',
    '[data-sx-block="hero"] div.card', // rung 2 — tag-qualified class, no index
    '[data-sx-block="nav"] > a:nth-of-type(3)',
    '[data-sx-block="hero"] sup:nth-of-type(1)',
    "h1:nth-of-type(1)", // digits are inside the tag charset
    'linearGradient:nth-of-type(1)', // foreign content keeps its authored case
  ];
  const REJECT = [
    "</style><script>alert(1)</script>", // the F1 stored-XSS shape
    '[data-sx-block="hero"] .a[onclick="x"]',
    ".a{color:red}",
    "*",
    ".a  .b", // double space
    ".a:hover", // state selectors are out of scope
    ".a:nth-of-type(0)", // n starts at 1
    ".a:nth-of-type(100)", // capped at 99
    ".a,.b", // selector lists
    '[data-sx-block="hero"] .a; }',
    "." + "a".repeat(400), // over length
    "",
    // ── the type production must widen the grammar and nothing else ──
    "span{}</style><script>alert(1)</script>", // break out of the raw-text element
    "span[onload=x]", // an attribute selector is not a tag
    "span:hover", // only :nth-of-type may follow a tag
    "span::before",
    "span span", // a bare tag is not a segment, in any position…
    "span", // …including alone
    '[data-sx-block="features"] h2 span:nth-of-type(1)', // …including the hand-written proof
    "body",
    "html",
    "div.card:nth-of-type(1) *", // `*` is outside the charset wherever it sits
    "my-widget:nth-of-type(1)", // no `-` in a tag
    "svg\\:a:nth-of-type(1)", // no CSS escapes — the whole point is REJECT, not escape
    "1div:nth-of-type(1)", // a tag starts with a letter
    "span :nth-of-type(1)", // a bare nth with no tag/class
    ":nth-of-type(1)",
    "span.a.b", // one class per segment is all the generator emits
    "span.card:nth-of-type(1):nth-of-type(2)",
    "SPAN:nth-of-type(1) span{}", // a valid prefix must not drag a hostile tail in
  ];

  it("accepts every selector the generator can emit", () => {
    for (const s of ACCEPT) expect(isSafeSelector(s), s).toBe(true);
  });

  it("rejects everything else", () => {
    for (const s of REJECT) expect(isSafeSelector(s), s).toBe(false);
  });

  it("CssSelectorSchema mirrors isSafeSelector", () => {
    for (const s of ACCEPT) expect(CssSelectorSchema.safeParse(s).success, s).toBe(true);
    for (const s of REJECT) expect(CssSelectorSchema.safeParse(s).success, s).toBe(false);
  });

  // The two ends stay anchored, and length still bounds the <style>. Both are load-bearing: an
  // unanchored SELECTOR_RE would accept any hostile string with a legal substring anywhere in it,
  // which is how a "valid prefix" attack lands.
  it("stays anchored at both ends", () => {
    expect(SELECTOR_RE.source.startsWith("^")).toBe(true);
    expect(SELECTOR_RE.source.endsWith("$")).toBe(true);
    // …and prove the anchors BITE, not merely that the characters are present: a legal selector
    // with a hostile prefix/suffix must fail. This is the check that would catch someone "fixing"
    // a false negative by dropping an anchor.
    expect(isSafeSelector('x</style><script>x</script>[data-sx-block="hero"] .a')).toBe(false);
    expect(isSafeSelector('[data-sx-block="hero"] .a</style><script>x</script>')).toBe(false);
  });

  it("applies SELECTOR_MAX_LEN to a grammar-legal selector", () => {
    // Legal by grammar, over budget by length — so the length check, not the shape check, is what
    // must reject it. Built from the type production, which is the cheapest way to make a long
    // legal selector and therefore the one that would exercise a missing cap.
    const long = Array.from({ length: 40 }, () => "span:nth-of-type(1)").join(" ");
    expect(long.length).toBeGreaterThan(SELECTOR_MAX_LEN);
    expect(isSafeSelector(long)).toBe(false);
    expect(CssSelectorSchema.safeParse(long).success).toBe(false);
    const short = Array.from({ length: 5 }, () => "span:nth-of-type(1)").join(" ");
    expect(short.length).toBeLessThanOrEqual(SELECTOR_MAX_LEN);
    expect(isSafeSelector(short)).toBe(true);
  });

  // ENFORCEMENT POINT TWO. The stored snapshot is never trusted: a hostile selector that somehow
  // reached the DB (a bypassed save path, a hand-edited row, a schema that once allowed it) must
  // still not reach the <style>. paletteStyle re-checks, and this proves the emitter itself drops it
  // rather than escaping it — escaping cannot work in HTML raw text (7061210).
  it("the emitter drops a hostile selector from a stored palette", () => {
    for (const s of REJECT) {
      const css = paletteStyle({ overrides: [{ selector: s, text: "#ff0000" }] });
      // Nothing at all should be emitted for it — no rule, and above all no fragment of `s`.
      expect(css, s).toBeNull();
    }
  });

  it("the emitter keeps a legal type-anchored selector, verbatim", () => {
    // The positive control the check above needs: without it, an emitter that dropped EVERYTHING
    // would pass the rejection test and nobody would notice the feature was dead.
    const sel = '[data-sx-block="features"] h2:nth-of-type(1) span:nth-of-type(1)';
    expect(paletteStyle({ overrides: [{ selector: sel, text: "#ff0000" }] })).toBe(
      `${sel}{color:#ff0000}`,
    );
  });

  it("a hostile selector does not take its neighbours down with it", () => {
    const good = '[data-sx-block="hero"] div.card:nth-of-type(2)';
    const css = paletteStyle({
      overrides: [
        { selector: "span{}</style><script>alert(1)</script>", bg: "#000000" },
        { selector: good, bg: "#ffffff" },
      ],
    });
    expect(css).toBe(`${good}{background-color:#ffffff}`);
    expect(css).not.toContain("script");
    expect(css).not.toContain("</style");
  });
});
