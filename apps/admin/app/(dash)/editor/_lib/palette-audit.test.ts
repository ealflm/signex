import { describe, it, expect } from "vitest";
import { createPaletteAuditor } from "./palette-audit";
import { setOverride, clearOverride, clearOverrideRole, setSeed } from "./palette-patch";

/** Records the questions asked, which is the whole observable behaviour. */
function spy() {
  const asked: string[][] = [];
  return { asked, audit: createPaletteAuditor((s) => asked.push(s)) };
}

const A = '[data-sx-c="nav.cta.color"]';
const B = '[data-sx-block="hero"] .btn-bg';

describe("createPaletteAuditor", () => {
  it("re-asks when an override is CLEARED — down to and including the empty set", () => {
    // The defect: the audit only ran on `ready`, so clearing a broken override left its row on
    // screen until the next iframe reload — and the button stayed live, re-dirtying the palette on
    // every click to remove something already gone. preview-bridge.test.ts proves the poster can
    // say []; this is the part that proves anything ever makes it.
    const { asked, audit } = spy();
    const two = setOverride(setOverride({}, A, "bg", "#111111"), B, "bg", "#222222");

    audit(two);
    audit(clearOverride(two, A));
    audit(clearOverride(clearOverride(two, A), B));

    expect(asked).toEqual([[A, B], [B], []]);
  });

  it("re-asks when the last ROLE on a selector goes — that is the entry going too", () => {
    const { asked, audit } = spy();
    const p = setOverride({}, A, "bg", "#111111");
    audit(p);
    audit(clearOverrideRole(p, A, "bg"));
    expect(asked).toEqual([[A], []]);
  });

  it("does NOT re-ask when the selector set is unchanged", () => {
    // A seed pick fires on every frame of a colour-picker drag and anchors nothing; so does clearing
    // one role of several on one selector. Neither changes what the question IS.
    const { asked, audit } = spy();
    const p = setOverride(setOverride({}, A, "bg", "#111111"), A, "text", "#ffffff");

    audit(p);
    audit(setSeed(p, "accentAqua", "#000000"));
    audit(setOverride(p, A, "bg", "#333333")); // same target, new colour
    audit(clearOverrideRole(p, A, "text")); // entry survives on its `bg`

    expect(asked).toEqual([[A]]);
  });

  it("force re-asks the identical question — a fresh document is a new answer", () => {
    // The `ready` case: same selectors, different DOM. Whether each still matches exactly one
    // element is precisely what changed, so the dedupe must not swallow this.
    const { asked, audit } = spy();
    const p = setOverride({}, A, "bg", "#111111");
    audit(p);
    audit(p, { force: true });
    expect(asked).toEqual([[A], [A]]);
  });

  it("asks the first time even for an empty palette when forced, and dedupes after", () => {
    const { asked, audit } = spy();
    audit({}, { force: true });
    audit({});
    expect(asked).toEqual([[]]);
  });
});
