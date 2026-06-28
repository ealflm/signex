import { describe, it, expect } from "vitest";
import { FrozenCategory, FrozenProduct } from "./catalog";

const CUID = "clr1abcd0000xyz1234567890"; // 25-char cuid-shaped

const L = (s: string) => ({ en: s, vi: s });

const MIN_PRODUCT = {
  slug: "alu-001",
  sortOrder: 1,
  title: L("Product 1"),
  tag: L("P1"),
  desc: L("Description"),
};

const MIN_CATEGORY = {
  slug: "signs",
  sortOrder: 1,
  title: L("Signs"),
  tag: L("SG"),
  intro: L("Intro"),
  productCount: 18,
  materialCount: 4,
  items: [],
};

describe("FrozenProduct", () => {
  it("parses without id (back-compat)", () => {
    expect(FrozenProduct.safeParse(MIN_PRODUCT).success).toBe(true);
  });

  it("accepts an optional cuid id on product", () => {
    const result = FrozenProduct.safeParse({ ...MIN_PRODUCT, id: CUID });
    expect(result.success).toBe(true);
  });

  it("rejects a non-cuid id on product", () => {
    const result = FrozenProduct.safeParse({ ...MIN_PRODUCT, id: "not-a-cuid" });
    expect(result.success).toBe(false);
  });
});

describe("FrozenCategory", () => {
  it("parses without id (back-compat)", () => {
    expect(FrozenCategory.safeParse(MIN_CATEGORY).success).toBe(true);
  });

  it("accepts an optional cuid id on category", () => {
    const result = FrozenCategory.safeParse({ ...MIN_CATEGORY, id: CUID });
    expect(result.success).toBe(true);
  });

  it("rejects a non-cuid id on category", () => {
    const result = FrozenCategory.safeParse({ ...MIN_CATEGORY, id: "not-a-cuid" });
    expect(result.success).toBe(false);
  });
});
