// Pure resolver: a stored MediaRef (image or video) → a discriminated view-model the render
// components switch on. DOM-free so node --test can drive it (apps/web has no jsdom). The
// image/video discrimination is `isVideoRef` from @signex/shared — the same test both sides use.
import { isVideoRef, type MediaRef } from "@signex/shared";

export type ResolvedMedia =
  | { kind: "image"; url: string; alt: string }
  | { kind: "video"; posterUrl: string; mp4Url: string; webmUrl: string };

export function resolveMedia(
  ref: MediaRef | undefined | null,
  _lang: "en" | "vi",
  assetUrl: (assetId: string) => string,
  altOf: (loc?: { en: string; vi: string }) => string,
): ResolvedMedia | null {
  if (!ref) return null;
  if (isVideoRef(ref)) {
    return {
      kind: "video",
      posterUrl: assetUrl(ref.posterAssetId),
      mp4Url: assetUrl(ref.mp4AssetId),
      webmUrl: ref.webmAssetId ? assetUrl(ref.webmAssetId) : "",
    };
  }
  return { kind: "image", url: assetUrl(ref.assetId), alt: altOf(ref.alt) };
}
