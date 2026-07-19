import test from "node:test";
import assert from "node:assert/strict";
import { resolveMedia } from "./media-ref.ts";

const assetUrl = (id) => (id ? `https://cdn/${id}` : "");
const altOf = (loc) => loc?.vi ?? "";

test("null when the slot is empty", () => {
  assert.equal(resolveMedia(undefined, "vi", assetUrl, altOf), null);
});

test("resolves an AssetRef to an image with url + alt", () => {
  const r = resolveMedia({ assetId: "a1", alt: { en: "E", vi: "V" } }, "vi", assetUrl, altOf);
  assert.deepEqual(r, { kind: "image", url: "https://cdn/a1", alt: "V" });
});

test("resolves a VideoRef to a video with poster/mp4/webm urls", () => {
  const r = resolveMedia({ posterAssetId: "p", mp4AssetId: "m", webmAssetId: "w" }, "vi", assetUrl, altOf);
  assert.deepEqual(r, { kind: "video", posterUrl: "https://cdn/p", mp4Url: "https://cdn/m", webmUrl: "https://cdn/w" });
});

test("a video without webm yields an empty webmUrl", () => {
  const r = resolveMedia({ posterAssetId: "p", mp4AssetId: "m" }, "vi", assetUrl, altOf);
  assert.equal(r.kind, "video");
  assert.equal(r.webmUrl, "");
});
