"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Real PresignResult shapes from apps/api/src/assets/assets.service.ts
interface AssetDto {
  id: string;
  status: string;
  kind: string;
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

type PresignResult =
  | { deduped: true; asset: AssetDto }
  | {
      deduped: false;
      assetId: string;
      r2Key: string;
      upload: {
        url: string;
        headers: Record<string, string>;
        expiresIn: number;
      };
    };

type Phase = "idle" | "hashing" | "presigning" | "uploading" | "confirming" | "done" | "error";

interface UploaderState {
  phase: Phase;
  message: string;
}

const ACCEPT = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/svg+xml",
  "video/mp4",
  "video/webm",
].join(",");

export function Uploader() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploaderState>({
    phase: "idle",
    message: "",
  });

  const busy = state.phase !== "idle" && state.phase !== "done" && state.phase !== "error";

  function setPhase(phase: Phase, message: string) {
    setState({ phase, message });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so the same file can be re-uploaded after an error
    if (inputRef.current) inputRef.current.value = "";

    setPhase("hashing", "Computing checksum…");
    let buf: ArrayBuffer;
    try {
      buf = await file.arrayBuffer();
    } catch {
      setPhase("error", "Could not read file.");
      return;
    }

    const sha256 = await sha256Hex(buf);

    setPhase("presigning", "Requesting upload URL…");
    let presignRes: Response;
    try {
      presignRes = await fetch("/admin-api/assets/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sha256,
          mime: file.type,
          bytes: file.size,
          originalName: file.name,
        }),
      });
    } catch (err) {
      setPhase("error", `Presign network error: ${err instanceof Error ? err.message : "unknown"}`);
      return;
    }

    if (!presignRes.ok) {
      const text = await presignRes.text().catch(() => "");
      setPhase("error", `Presign failed (${presignRes.status}): ${text}`);
      return;
    }

    let presign: PresignResult;
    try {
      presign = (await presignRes.json()) as PresignResult;
    } catch {
      setPhase("error", "Presign returned invalid JSON.");
      return;
    }

    // Dedup path — asset already READY, no upload needed
    if (presign.deduped) {
      setPhase("done", `Already exists — deduped (${presign.asset.originalName}).`);
      router.refresh();
      return;
    }

    // PUT bytes directly to R2, echoing ALL signed headers returned by presign
    // (Content-Type, Cache-Control, x-amz-checksum-sha256 are signed and MUST be echoed)
    setPhase("uploading", "Uploading to R2…");
    let putRes: Response;
    try {
      putRes = await fetch(presign.upload.url, {
        method: "PUT",
        body: file,
        headers: presign.upload.headers,
      });
    } catch (err) {
      // ⚠️ Dev-R2 note: the dev env uses a placeholder R2 config
      // (no real bucket), so this fetch will fail with a network error
      // to e.g. example.r2.cloudflarestorage.com. This is expected in
      // local dev; the flow is correct and works against real Cloudflare R2.
      setPhase(
        "error",
        `R2 PUT failed (network error — expected in local dev with placeholder R2): ${err instanceof Error ? err.message : "unknown"}`,
      );
      return;
    }

    if (!putRes.ok) {
      setPhase("error", `R2 PUT failed (${putRes.status}).`);
      return;
    }

    setPhase("confirming", "Confirming upload…");
    let confirmRes: Response;
    try {
      confirmRes = await fetch(`/admin-api/assets/${presign.assetId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    } catch (err) {
      setPhase("error", `Confirm network error: ${err instanceof Error ? err.message : "unknown"}`);
      return;
    }

    if (!confirmRes.ok) {
      const text = await confirmRes.text().catch(() => "");
      setPhase("error", `Confirm failed (${confirmRes.status}): ${text}`);
      return;
    }

    setPhase("done", `Uploaded: ${file.name}`);
    router.refresh();
  }

  const isError = state.phase === "error";
  const isDone = state.phase === "done";

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-gray-700">Upload asset</h2>

      <label
        htmlFor="media-upload"
        className="mb-2 block text-sm font-medium text-gray-600"
      >
        Choose file
      </label>
      <input
        id="media-upload"
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        disabled={busy}
        onChange={onFile}
        aria-describedby={state.message ? "media-upload-status" : undefined}
        className="block w-full cursor-pointer rounded-md border border-gray-300 text-sm text-gray-700 file:mr-3 file:cursor-pointer file:rounded-l-md file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
      />

      {state.message && (
        <p
          id="media-upload-status"
          role={isError ? "alert" : "status"}
          aria-live={isError ? "assertive" : "polite"}
          className={[
            "mt-2 rounded-md px-3 py-2 text-sm",
            isError
              ? "bg-red-50 text-red-700"
              : isDone
                ? "bg-green-50 text-green-700"
                : "bg-blue-50 text-blue-700",
          ].join(" ")}
        >
          {busy && (
            <span className="mr-1 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent align-middle" />
          )}
          {state.message}
        </p>
      )}

      {(isError || isDone) && (
        <button
          type="button"
          onClick={() => setPhase("idle", "")}
          className="mt-2 text-xs text-gray-500 underline hover:text-gray-700"
        >
          Clear
        </button>
      )}
    </div>
  );
}
