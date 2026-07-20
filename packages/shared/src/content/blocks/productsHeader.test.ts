import { describe, expect, it } from "vitest";
import { productsHeaderBlock } from "./productsHeader";

const slim = productsHeaderBlock.pick({
  homeCardOverlay: true,
  categoryImageOverlay: true,
  productImageOverlay: true,
});

describe("productsHeaderBlock r3 overlay fields", () => {
  it("all three are optional (absent = transparent)", () => {
    expect(slim.parse({})).toEqual({});
  });
  it("accepts a solid wash per area", () => {
    const wash = { kind: "solid", fill: { color: "#112233", opacity: 40 } } as const;
    expect(slim.parse({ homeCardOverlay: wash }).homeCardOverlay).toEqual(wash);
  });
  it("rejects a malformed overlay", () => {
    expect(() => slim.parse({ productImageOverlay: { kind: "solid" } })).toThrow();
  });
});
