import { describe, it, expect } from "vitest";
import { floatingButtonsBlock } from "./floatingButtons";

describe("floatingButtonsBlock", () => {
  it("defaults the whole block when the key is absent (undefined)", () => {
    expect(floatingButtonsBlock.parse(undefined)).toEqual({ callHref: "", zaloHref: "" });
  });

  it("fills both leaves from a partial object", () => {
    expect(floatingButtonsBlock.parse({})).toEqual({ callHref: "", zaloHref: "" });
    expect(floatingButtonsBlock.parse({ callHref: "tel:+84979700072" })).toEqual({
      callHref: "tel:+84979700072",
      zaloHref: "",
    });
  });

  it("keeps provided values verbatim (no URL validation)", () => {
    expect(floatingButtonsBlock.parse({ callHref: "0979700072", zaloHref: "https://zalo.me/g/abc" })).toEqual({
      callHref: "0979700072",
      zaloHref: "https://zalo.me/g/abc",
    });
  });
});

describe("floatingButtons ring colours", () => {
  it("defaults href fields and leaves ring colours absent", () => {
    expect(floatingButtonsBlock.parse(undefined)).toEqual({ callHref: "", zaloHref: "" });
  });
  it("accepts optional HexA ring colours", () => {
    const b = floatingButtonsBlock.parse({ callHref: "", zaloHref: "", zaloRingColor: "#0068ff", callRingColor: "#0b1f33" });
    expect(b.zaloRingColor).toBe("#0068ff");
    expect(b.callRingColor).toBe("#0b1f33");
  });
  it("rejects a non-hex ring colour", () => {
    expect(() => floatingButtonsBlock.parse({ callHref: "", zaloHref: "", zaloRingColor: "blue" })).toThrow();
  });
  it("marks the ring fields for the admin colour picker", () => {
    // floatingButtonsBlock is `.default(...)`-wrapped at the top level (unlike heroBlock, which is a
    // plain z.object) — so .shape lives on the inner ZodObject, reached via removeDefault().
    // Verified against the compiled schema: floatingButtonsBlock.shape is undefined at runtime.
    expect(floatingButtonsBlock.removeDefault().shape.zaloRingColor.unwrap().description).toBe("color");
  });
});
