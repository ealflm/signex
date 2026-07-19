// Pure value-builder for a media slot: given the picker's resolved ref and the field's existing
// value, return EXACTLY the target-kind shape. Never merge across kinds — a hybrid
// {assetId, mp4AssetId} would be read back as an image by MediaRef (AssetRef wins), silently
// dropping the video. `alt` survives only an image→image replace.
export type PickerMediaRef =
  | { type: "image"; assetId: string }
  | { type: "video"; posterAssetId: string; mp4AssetId: string; webmAssetId?: string };

export function buildMediaValue(
  ref: PickerMediaRef,
  existing: Record<string, unknown>,
): Record<string, unknown> {
  if (ref.type === "image") {
    const wasImage = "assetId" in existing;
    return { ...(wasImage && existing.alt ? { alt: existing.alt } : {}), assetId: ref.assetId };
  }
  return {
    posterAssetId: ref.posterAssetId,
    mp4AssetId: ref.mp4AssetId,
    ...(ref.webmAssetId ? { webmAssetId: ref.webmAssetId } : {}),
  };
}
