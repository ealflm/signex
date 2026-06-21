import { describe, it, expect } from "vitest";
import {
  Id,
  localized,
  LocalizedText,
  LocalizedTextArray,
  TwoToneTitle,
  AssetRef,
  VideoRef,
} from "./primitives";
import { z } from "zod";

const CUID = "clr1abcd0000xyz1234567890"; // 25-char cuid-shaped

describe("Id", () => {
  it("accepts a cuid and rejects a non-cuid", () => {
    expect(Id.safeParse(CUID).success).toBe(true);
    expect(Id.safeParse("not-a-cuid").success).toBe(false);
    expect(Id.safeParse("123").success).toBe(false);
  });
});

describe("localized", () => {
  it("builds an {en,vi} object of the inner schema", () => {
    const num = localized(z.number());
    expect(num.safeParse({ en: 1, vi: 2 }).success).toBe(true);
    expect(num.safeParse({ en: 1 }).success).toBe(false); // vi required
    expect(num.safeParse({ en: "x", vi: 2 }).success).toBe(false);
  });
});

describe("LocalizedText", () => {
  it("requires both en and vi strings", () => {
    expect(LocalizedText.safeParse({ en: "Hello", vi: "Xin chào" }).success).toBe(true);
    expect(LocalizedText.safeParse({ en: "Hello" }).success).toBe(false);
  });
});

describe("LocalizedTextArray", () => {
  it("requires en and vi string arrays", () => {
    expect(LocalizedTextArray.safeParse({ en: ["a", "b"], vi: ["x", "y"] }).success).toBe(true);
    expect(LocalizedTextArray.safeParse({ en: "a", vi: ["x"] }).success).toBe(false);
  });
});

describe("TwoToneTitle", () => {
  it("requires lead + accent LocalizedText", () => {
    expect(
      TwoToneTitle.safeParse({
        lead: { en: "About ", vi: "Về " },
        accent: { en: "SIGNEX", vi: "SIGNEX" },
      }).success,
    ).toBe(true);
    expect(TwoToneTitle.safeParse({ lead: { en: "About ", vi: "Về " } }).success).toBe(false);
  });
});

describe("AssetRef", () => {
  it("requires a cuid assetId; alt is optional LocalizedText", () => {
    expect(AssetRef.safeParse({ assetId: CUID }).success).toBe(true);
    expect(
      AssetRef.safeParse({ assetId: CUID, alt: { en: "a", vi: "b" } }).success,
    ).toBe(true);
    expect(AssetRef.safeParse({ assetId: "x" }).success).toBe(false);
    expect(AssetRef.safeParse({ assetId: CUID, alt: { en: "a" } }).success).toBe(false);
  });
});

describe("VideoRef", () => {
  it("requires poster + mp4 cuids; webm optional", () => {
    expect(
      VideoRef.safeParse({ posterAssetId: CUID, mp4AssetId: CUID }).success,
    ).toBe(true);
    expect(
      VideoRef.safeParse({ posterAssetId: CUID, mp4AssetId: CUID, webmAssetId: CUID }).success,
    ).toBe(true);
    expect(VideoRef.safeParse({ posterAssetId: CUID }).success).toBe(false);
  });
});
