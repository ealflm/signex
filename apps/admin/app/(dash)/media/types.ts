// Shape returned by GET /api/assets (apps/api/src/assets/assets.service.ts toAssetDto).
export interface AssetRow {
  id: string;
  status: "PENDING" | "READY";
  kind: "IMAGE" | "VIDEO" | "SVG";
  sha256: string;
  r2Key: string;
  url: string;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  originalName: string;
  altDefault: { en: string; vi: string } | null;
  posterId: string | null;
}
