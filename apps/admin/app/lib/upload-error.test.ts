import { describe, it, expect } from "vitest";
import { presignErrorMessage } from "./upload-error";

// The customer's bug: uploading a video produced the raw, untranslatable
//   Presign failed (422): {"ok":false,"error":"Validation failed"}
// These hold the two real causes to human, Vietnamese, actionable messages — driven by the server's
// own reason (surfaced now that api.ts folds the zod detail through), not by guessing from the file.

describe("presignErrorMessage", () => {
  const mov = { type: "video/quicktime", size: 5 * 1024 * 1024 };
  const big = { type: "video/mp4", size: 262_144_000 }; // 250MB

  it("maps a mime-allowlist rejection to a 'use MP4' message naming the format", () => {
    const body = JSON.stringify({ ok: false, error: "Validation failed: mime not in allowlist" });
    const msg = presignErrorMessage(422, body, mov);
    expect(msg).toMatch(/MP4/);
    expect(msg).toContain("video/quicktime"); // tells them WHAT they gave
    expect(msg).not.toContain("allowlist"); // no engineer jargon
    expect(msg).not.toContain("{"); // no raw JSON
  });

  it("tailors the format advice to an IMAGE upload (never tells an image to 'use MP4')", () => {
    // uploadAsset serves the image picker too; a video-only message there would be actively wrong.
    const body = JSON.stringify({ ok: false, error: "Validation failed: mime not in allowlist" });
    const msg = presignErrorMessage(422, body, { type: "image/tiff", size: 1024 });
    expect(msg).toContain("image/tiff");
    expect(msg).toMatch(/PNG|JPG/);
    expect(msg).not.toMatch(/MP4/); // the video advice must NOT leak into an image error
  });

  it("maps a size-cap rejection to a 'too large' message with both the file size and the cap in MB", () => {
    const body = JSON.stringify({
      ok: false,
      error: "Validation failed: file size 262144000 exceeds size cap 209715200 for video/mp4",
    });
    const msg = presignErrorMessage(422, body, big);
    expect(msg).toContain("250MB"); // the file
    expect(msg).toContain("200MB"); // the cap, pulled from the server detail (not hard-coded)
    expect(msg).not.toContain("209715200"); // bytes are for machines
  });

  it("falls back to the server error text for an unrecognised 422 (never swallows the reason)", () => {
    const body = JSON.stringify({ ok: false, error: "Validation failed: sha256 must be 64 hex chars" });
    const msg = presignErrorMessage(422, body, big);
    expect(msg).toContain("sha256 must be 64 hex chars");
  });

  it("survives a non-JSON body without throwing, showing the raw text", () => {
    const msg = presignErrorMessage(502, "Bad Gateway", big);
    expect(msg).toContain("502");
    expect(msg).toContain("Bad Gateway");
  });

  it("uses the video cap when the server detail carries no explicit cap number", () => {
    // e.g. a generic size rejection — still communicate a concrete limit rather than a vague one.
    const body = JSON.stringify({ ok: false, error: "Validation failed: file too large (exceeds)" });
    const msg = presignErrorMessage(422, body, big);
    expect(msg).toContain("250MB");
    expect(msg).toContain("200MB");
  });
});
