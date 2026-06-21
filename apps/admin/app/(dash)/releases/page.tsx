import { requireSession } from "@/app/lib/session";
import { apiServer } from "@/app/lib/api";
import { atLeast } from "@signex/shared";
import { PublishForm } from "./publish-form";
import { RollbackForm } from "./rollback-form";

interface ReleaseRow {
  id: string;
  version: number;
  status: "PUBLISHED" | "ARCHIVED";
  label: string | null;
  note: string | null;
  publishedAt: string | null;
  rolledBackFromVersion: number | null;
}

/** Returned by GET /api/releases */
type ReleaseList = ReleaseRow[];

/** Returned by GET /api/releases/live */
interface LiveStatus {
  version: number;
  checksum: string;
  publishedAt: string;
}

/** Returned by GET /api/releases/diff */
interface DiffStatus {
  dirty: boolean;
  revision: number;
  lastPublishedRevision: number;
}

export default async function ReleasesPage() {
  const user = await requireSession();
  const canPublish = atLeast(user.role, "PUBLISHER");

  // Fetch all three in parallel — no-store inherited from apiServer
  const [listRes, liveRes, diffRes] = await Promise.all([
    apiServer<ReleaseList>("/api/releases"),
    apiServer<LiveStatus>("/api/releases/live"),
    apiServer<DiffStatus>("/api/releases/diff"),
  ]);

  const releases = listRes.ok ? listRes.data : [];
  const live = liveRes.ok ? liveRes.data : null;
  const diff = diffRes.ok ? diffRes.data : null;

  // dirty flag from /api/releases/diff (source of truth matching the dashboard)
  const dirty = diff?.dirty ?? false;
  // expectedRevision for the optimistic-lock: MUST be the current working revision
  const currentRevision = diff?.revision ?? 0;

  const apiError = !listRes.ok || !diffRes.ok;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-gray-900">Releases</h1>
        <p className="text-sm text-gray-500">
          Publish working-state changes and manage release history.
        </p>
      </div>

      {/* API error banner */}
      {apiError && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          Could not load release data. The API may be unavailable.
        </p>
      )}

      {/* Status + Publish card */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <dl className="grid max-w-md grid-cols-[1fr_auto] gap-x-6 gap-y-3 text-sm">
          <dt className="text-gray-500">Live version</dt>
          <dd className="text-right font-mono font-medium text-gray-900">
            {live?.version != null ? live.version : "—"}
          </dd>

          <dt className="text-gray-500">Working revision</dt>
          <dd className="text-right font-mono font-medium text-gray-900">
            {diff?.revision ?? "—"}
          </dd>

          <dt className="text-gray-500">Last published revision</dt>
          <dd className="text-right font-mono font-medium text-gray-900">
            {diff?.lastPublishedRevision ?? "—"}
          </dd>

          <dt className="text-gray-500">Status</dt>
          <dd className="text-right">
            {dirty ? (
              <span className="inline-flex items-center gap-1.5 font-semibold text-amber-600">
                <span
                  aria-hidden="true"
                  className="inline-block h-2 w-2 rounded-full bg-amber-400"
                />
                Unpublished changes
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 font-semibold text-green-700">
                <span
                  aria-hidden="true"
                  className="inline-block h-2 w-2 rounded-full bg-green-500"
                />
                Up to date
              </span>
            )}
          </dd>
        </dl>

        {/* Publish form — affordance: only shown to Publisher+ */}
        {canPublish ? (
          <>
            <hr className="my-4 border-gray-100" />
            <PublishForm
              expectedRevision={currentRevision}
              dirty={dirty}
            />
          </>
        ) : (
          <p className="mt-4 text-sm text-gray-500">
            Publishing requires the <strong>Publisher</strong> role.
          </p>
        )}
      </div>

      {/* Release history table */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-gray-900">
            Release history
          </h2>
        </div>

        {releases.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-gray-400">
            No releases yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  <th className="px-6 py-3">Version</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Note</th>
                  <th className="px-6 py-3">Published at</th>
                  <th className="px-6 py-3">From version</th>
                  {canPublish && <th className="px-6 py-3">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {releases.map((r) => (
                  <tr
                    key={r.id}
                    className="transition-colors hover:bg-gray-50"
                  >
                    <td className="px-6 py-3 font-mono font-medium text-gray-900">
                      {r.version}
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={
                          r.status === "PUBLISHED"
                            ? "inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20"
                            : "inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600"
                        }
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-600">
                      {r.note ?? <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-6 py-3 text-gray-600">
                      {r.publishedAt
                        ? new Date(r.publishedAt).toLocaleString()
                        : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-6 py-3 font-mono text-gray-600">
                      {r.rolledBackFromVersion ?? (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    {canPublish && (
                      <td className="px-6 py-3">
                        {/* Only ARCHIVED versions can be rolled back; live version has no rollback */}
                        {r.status === "ARCHIVED" ? (
                          <RollbackForm toVersion={r.version} />
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
