import { describe, it, expect } from "vitest";
import { slugify, slugSchema, SLUG_PATTERN } from "./slug";

describe("slugify", () => {
  it("lowercases, hyphenates spaces, trims", () => {
    expect(slugify("Plastic Logos Emblems")).toBe("plastic-logos-emblems");
  });

  it("strips Vietnamese diacritics and đ/Đ", () => {
    expect(slugify("Lô go ngành may")).toBe("lo-go-nganh-may");
    expect(slugify("Ảnh Sản Phẩm")).toBe("anh-san-pham");
    expect(slugify("Đồng phục")).toBe("dong-phuc");
  });

  it("collapses runs of punctuation/space into a single hyphen", () => {
    expect(slugify("Hero  Image  (Final)")).toBe("hero-image-final");
    expect(slugify("a___b---c")).toBe("a-b-c");
  });

  it("returns empty string when nothing usable remains (no fallback)", () => {
    expect(slugify("")).toBe("");
    expect(slugify("   ___ ")).toBe("");
  });

  it("is idempotent — an already-valid slug is unchanged", () => {
    expect(slugify("logo-nganh-may")).toBe("logo-nganh-may");
  });

  it("always produces output matching SLUG_PATTERN (or empty)", () => {
    for (const raw of ["Lô go ngành may", "A B  C!!", "--x--", "Ảnh 123"]) {
      const s = slugify(raw);
      if (s) expect(SLUG_PATTERN.test(s)).toBe(true);
    }
  });
});

describe("slugSchema", () => {
  it("accepts a valid slug", () => {
    expect(slugSchema.safeParse("plastic-logos-emblems").success).toBe(true);
    expect(slugSchema.safeParse("logo-nganh-may").success).toBe(true);
    expect(slugSchema.safeParse("abc123").success).toBe(true);
  });

  it("rejects spaces, accents, uppercase, and empty", () => {
    for (const bad of [
      "Lô go ngành may",
      "logo nganh may",
      "Logo-Nganh",
      "logo_nganh",
      "-logo",
      "logo-",
      "logo--may",
      "",
    ]) {
      expect(slugSchema.safeParse(bad).success).toBe(false);
    }
  });
});
