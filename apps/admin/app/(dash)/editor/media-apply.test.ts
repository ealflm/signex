import { describe, it, expect } from "vitest";
import { buildMediaValue } from "./media-apply";

describe("buildMediaValue — clean-replace, never hybridise", () => {
  it("image → image keeps alt, sets assetId, no video keys", () => {
    const v = buildMediaValue({ type: "image", assetId: "A2" }, { assetId: "A1", alt: { en: "e", vi: "v" } });
    expect(v).toEqual({ alt: { en: "e", vi: "v" }, assetId: "A2" });
  });

  it("image → video drops assetId AND alt, sets only video keys", () => {
    const v = buildMediaValue(
      { type: "video", posterAssetId: "P", mp4AssetId: "M" },
      { assetId: "A1", alt: { en: "e", vi: "v" } },
    );
    expect(v).toEqual({ posterAssetId: "P", mp4AssetId: "M" });
    expect("assetId" in v).toBe(false);
    expect("alt" in v).toBe(false);
  });

  it("video → image drops poster/mp4/webm, sets only assetId (no stale alt to keep)", () => {
    const v = buildMediaValue({ type: "image", assetId: "A1" }, { posterAssetId: "P", mp4AssetId: "M", webmAssetId: "W" });
    expect(v).toEqual({ assetId: "A1" });
  });

  it("video → video sets poster+mp4, includes webm only when present", () => {
    expect(buildMediaValue({ type: "video", posterAssetId: "P", mp4AssetId: "M" }, { posterAssetId: "x", mp4AssetId: "y", webmAssetId: "z" }))
      .toEqual({ posterAssetId: "P", mp4AssetId: "M" });
    expect(buildMediaValue({ type: "video", posterAssetId: "P", mp4AssetId: "M", webmAssetId: "W" }, {}))
      .toEqual({ posterAssetId: "P", mp4AssetId: "M", webmAssetId: "W" });
  });
});
