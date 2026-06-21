import { requireRole } from "@/app/lib/session";
import { apiServer } from "@/app/lib/api";
import { Uploader } from "./uploader";

// Matches AssetDto from apps/api/src/assets/assets.service.ts
interface AssetRow {
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

export default async function MediaPage() {
  await requireRole("EDITOR");

  const res = await apiServer<AssetRow[]>("/api/assets");
  const assets = res.ok ? res.data : [];
  const apiError = !res.ok;

  return (
    <section className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-gray-900">Media</h1>
        <p className="text-sm text-gray-500">
          Upload images and videos. Assets are deduplicated by content hash.
          Use the picker in Catalog/Content to attach them.
        </p>
      </div>

      {/* API error banner */}
      {apiError && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          Could not load assets. The API may be unavailable.
        </p>
      )}

      {/* Uploader widget */}
      <Uploader />

      {/* Asset grid — doubles as picker source */}
      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-gray-900">
          Assets
          {assets.length > 0 && (
            <span className="ml-2 text-sm font-normal text-gray-400">
              ({assets.length})
            </span>
          )}
        </h2>

        {assets.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 px-6 py-12 text-center">
            <p className="text-sm text-gray-400">
              No assets yet. Upload one above.
            </p>
          </div>
        ) : (
          <ul
            role="list"
            aria-label="Asset grid"
            className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6"
          >
            {assets.map((a) => (
              <li key={a.id}>
                <article
                  className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-white p-2 shadow-sm focus-within:ring-2 focus-within:ring-blue-500"
                  tabIndex={0}
                  aria-label={`${a.originalName} — ${a.kind} — ${a.status}`}
                >
                  {/* Thumbnail */}
                  <div className="aspect-square w-full overflow-hidden rounded bg-gray-100">
                    {a.kind === "IMAGE" && a.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={a.url}
                        alt={a.altDefault?.en ?? a.originalName}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div
                        aria-hidden="true"
                        className="flex h-full w-full items-center justify-center text-xs font-medium text-gray-400"
                      >
                        {a.kind}
                      </div>
                    )}
                  </div>

                  {/* Metadata */}
                  <p
                    className="truncate text-xs font-medium text-gray-700"
                    title={a.originalName}
                  >
                    {a.originalName}
                  </p>

                  {/* Dims */}
                  {(a.width != null || a.duration != null) && (
                    <p className="text-[10px] text-gray-400">
                      {a.width != null && a.height != null
                        ? `${a.width}×${a.height}`
                        : null}
                      {a.duration != null
                        ? ` ${Math.round(a.duration)}s`
                        : null}
                    </p>
                  )}

                  {/* Status badge */}
                  <span
                    className={[
                      "self-start rounded px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                      a.status === "READY"
                        ? "bg-green-100 text-green-700"
                        : "bg-amber-100 text-amber-700",
                    ].join(" ")}
                  >
                    {a.status}
                  </span>

                  {/* Asset ID (for picker reference) */}
                  <code
                    className="truncate text-[9px] text-gray-300"
                    title={a.id}
                  >
                    {a.id}
                  </code>
                </article>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
