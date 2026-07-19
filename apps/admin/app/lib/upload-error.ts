// Pure helper: turn a failed asset-upload response into a human, Vietnamese, actionable message.
// Split out of upload-asset.ts so upload-asset.test.ts can drive it — apps/admin runs vitest in a
// node env with NO resolve.alias, so a test importing upload-asset.ts fails on its "@/" base-path
// import. This file imports nothing, so it is directly testable.

// Video size cap, mirrored from the api's presignSchema (video/* maxBytes) purely for the message
// when the server detail carries no explicit cap number. Not an enforcement point — the api is.
const VIDEO_MB_CAP = 200;

const asMb = (bytes: number): number => Math.round(bytes / (1024 * 1024));

/**
 * Turn a failed presign response into a human, Vietnamese, actionable message.
 *
 * WHY THIS EXISTS. A customer replacing a video saw only `Presign failed (422):
 * {"ok":false,"error":"Validation failed"}` — no field, no limit, nothing to do about it. The api
 * DID report the reason (zod issues), api.ts now folds it into `error`; this reads that reason and
 * says, in the editor's language, what to fix. It classifies from the SERVER's own reason string,
 * not by re-guessing the file, so it stays correct if the caps or the allowlist change server-side.
 *
 * Pure and exported for upload-asset.test.ts (apps/admin runs vitest in a node env, no DOM).
 */
export function presignErrorMessage(
  status: number,
  bodyText: string,
  file: { type: string; size: number },
): string {
  // The admin-api proxy wraps the api error as { ok:false, error }. Unwrap to the reason string.
  let serverError = bodyText;
  try {
    const parsed = JSON.parse(bodyText) as { error?: unknown };
    if (parsed && typeof parsed.error === "string") serverError = parsed.error;
  } catch {
    /* non-JSON (gateway/network) — keep the raw text */
  }

  if (status === 422 && /allowlist|mime/i.test(serverError)) {
    // uploadAsset serves images AND video, so tailor the guidance to what they actually picked —
    // telling an image upload to "use MP4" (or vice-versa) would be worse than no guidance.
    const named = file.type ? ` (${file.type})` : "";
    const advice = file.type.startsWith("video")
      ? "Hãy dùng video MP4 hoặc WebM"
      : file.type.startsWith("image")
        ? "Hãy dùng ảnh PNG, JPG, WebP, AVIF, GIF hoặc SVG"
        : "Hãy dùng định dạng được hỗ trợ";
    return `Định dạng không được hỗ trợ${named}. ${advice} rồi tải lại.`;
  }
  if (status === 422 && /size cap|exceeds|too large|quá lớn/i.test(serverError)) {
    const capMatch = /size cap (\d+)/.exec(serverError);
    const capMb = capMatch ? asMb(Number(capMatch[1])) : VIDEO_MB_CAP;
    return `File quá lớn: ${asMb(file.size)}MB (tối đa ${capMb}MB). Hãy nén nhỏ lại rồi tải lại.`;
  }
  // Never swallow the reason: an unrecognised failure still shows the server's own words.
  return `Tải lên thất bại (${status}). ${serverError}`;
}
