// app/lib/upload-asset.ts
// Client helper: upload a File to R2/MinIO via the SAME presign → PUT → confirm flow as the Media
// page uploader (apps/admin/app/(dash)/media/uploader.tsx), but RESOLVING the resulting asset id
// (and its kind/url) instead of just refreshing a list. Used by the visual-editor drawer so an
// uploaded file can be wired straight into a content block's AssetRef/VideoRef.

import { adminApi } from "@/app/lib/base-path";

export interface UploadedAsset {
  id: string;
  kind: string; // IMAGE | VIDEO | SVG
  url: string;
  originalName: string;
}

interface AssetDto {
  id: string;
  kind: string;
  url: string;
  originalName: string;
}

type PresignResult =
  | { deduped: true; asset: AssetDto }
  | {
      deduped: false;
      assetId: string;
      r2Key: string;
      upload: { url: string; headers: Record<string, string>; expiresIn: number };
    };

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type UploadPhase =
  | "hashing"
  | "presigning"
  | "uploading"
  | "confirming"
  | "done";

// PUT bytes to the presigned URL via XHR so we can report real upload progress (fetch can't observe
// upload bytes). All signed headers MUST be echoed. Resolves on 2xx, rejects otherwise.
function putWithProgress(
  url: string,
  file: File | Blob,
  headers: Record<string, string>,
  onProgress?: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`R2 upload failed (${xhr.status}).`));
    xhr.onerror = () => reject(new Error("R2 upload failed (network error)."));
    xhr.send(file);
  });
}

/**
 * Upload a single file and resolve the created (or deduped) asset. `onPhase` reports the current step;
 * `onProgress` reports 0–100% of the R2 PUT. Throws on any failure (caller surfaces the message).
 */
export async function uploadAsset(
  file: File,
  onPhase?: (phase: UploadPhase) => void,
  onProgress?: (pct: number) => void,
): Promise<UploadedAsset> {
  onPhase?.("hashing");
  const buf = await file.arrayBuffer();
  const sha256 = await sha256Hex(buf);

  onPhase?.("presigning");
  const presignRes = await fetch(adminApi("/admin-api/assets/presign"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sha256,
      mime: file.type,
      bytes: file.size,
      originalName: file.name,
    }),
  });
  if (!presignRes.ok) {
    throw new Error(`Presign failed (${presignRes.status}): ${await presignRes.text().catch(() => "")}`);
  }
  const presign = (await presignRes.json()) as PresignResult;

  // Dedup: identical bytes already uploaded — reuse the existing asset.
  if (presign.deduped) {
    return {
      id: presign.asset.id,
      kind: presign.asset.kind,
      url: presign.asset.url,
      originalName: presign.asset.originalName,
    };
  }

  // PUT bytes straight to R2, echoing ALL signed headers (Content-Type, Cache-Control,
  // x-amz-checksum-sha256 are signed and MUST be echoed). ⚠️ In local dev with placeholder R2
  // this PUT fails with a network error — expected; the flow is correct against real R2/MinIO.
  onPhase?.("uploading");
  onProgress?.(0);
  await putWithProgress(presign.upload.url, file, presign.upload.headers, onProgress);

  onPhase?.("confirming");
  const confirmRes = await fetch(adminApi(`/admin-api/assets/${presign.assetId}/confirm`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!confirmRes.ok) {
    throw new Error(`Confirm failed (${confirmRes.status}): ${await confirmRes.text().catch(() => "")}`);
  }
  const asset = (await confirmRes.json()) as AssetDto;

  onPhase?.("done");
  return {
    id: asset.id,
    kind: asset.kind,
    url: asset.url,
    originalName: asset.originalName,
  };
}
