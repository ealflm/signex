import { describe, it, expect } from "vitest";
import {
  Id,
  localized,
  LocalizedText,
  LocalizedTextArray,
  TwoToneTitle,
  AssetRef,
  VideoRef,
  MediaRef,
  isVideoRef,
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

const IMG = { assetId: "clxxxxxxxxxxxxxxxxxxxxxxx1" };
const VID = { posterAssetId: "clxxxxxxxxxxxxxxxxxxxxxxx2", mp4AssetId: "clxxxxxxxxxxxxxxxxxxxxxxx3" };

describe("MediaRef", () => {
  it("parses a stored AssetRef as an image (union tries AssetRef first)", () => {
    const m = MediaRef.parse(IMG);
    expect(isVideoRef(m)).toBe(false);
    expect((m as { assetId: string }).assetId).toBe(IMG.assetId);
  });

  it("parses a stored VideoRef as a video", () => {
    const m = MediaRef.parse(VID);
    expect(isVideoRef(m)).toBe(true);
    expect((m as { mp4AssetId: string }).mp4AssetId).toBe(VID.mp4AssetId);
  });

  it("accepts a video with an optional webm", () => {
    const m = MediaRef.parse({ ...VID, webmAssetId: "clxxxxxxxxxxxxxxxxxxxxxxx4" });
    expect(isVideoRef(m)).toBe(true);
  });

  it("rejects a value that is neither (no assetId, no mp4AssetId)", () => {
    expect(() => MediaRef.parse({ foo: "bar" })).toThrow();
    expect(() => MediaRef.parse({ posterAssetId: VID.posterAssetId })).toThrow(); // poster without mp4 is not a VideoRef
  });

  it("strips the video keys off a HYBRID and reads it back as an image — the exact hazard the save path must avoid", () => {
    // AssetRef matches first (assetId present) and .object() strips unknown keys, so a hybrid loses
    // its video. This documents WHY editor-shell.applyMediaRef must clean-replace, never merge.
    const hybrid = { ...IMG, ...VID };
    const m = MediaRef.parse(hybrid);
    expect(isVideoRef(m)).toBe(false);
    expect("mp4AssetId" in m).toBe(false);
  });
});
