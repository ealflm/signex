import { describe, it, expect } from "vitest";
import { isSafeSelector, CssSelectorSchema } from "./selector";

describe("selector grammar", () => {
  const ACCEPT = [
    '[data-sx-c="nav.cta.color"]',
    '[data-sx-block="hero"] .btn-bg',
    '[data-sx-block="nav"] > .nav_wrap .btn-bg',
    '[data-sx-block="footer"] .row:nth-of-type(2) > .cell',
    '[data-sx-c="nav.cta.color"] .btn-bg',
    '.btn-bg',
  ];
  const REJECT = [
    '</style><script>alert(1)</script>',   // the F1 stored-XSS shape
    '[data-sx-block="hero"] .a[onclick="x"]',
    '.a{color:red}',
    '*',
    '.a  .b',                               // double space
    '.a:hover',                             // state selectors are out of scope
    '.a:nth-of-type(0)',                    // n starts at 1
    '.a:nth-of-type(100)',                  // capped at 99
    '.a,.b',                                // selector lists
    '[data-sx-block="hero"] .a; }',
    '.' + 'a'.repeat(400),                  // over length
    '',
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
});
