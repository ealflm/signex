import { apiServer } from "@/app/lib/api";

interface DiffStatus {
  dirty: boolean;
  revision: number;
  lastPublishedRevision: number;
}

interface LiveStatus {
  version: number;
  checksum: string;
  publishedAt: string;
}

export default async function DashboardPage() {
  const [diffRes, liveRes] = await Promise.all([
    apiServer<DiffStatus>("/api/releases/diff"),
    apiServer<LiveStatus>("/api/releases/live"),
  ]);

  const diff = diffRes.ok ? diffRes.data : null;
  const live = liveRes.ok ? liveRes.data : null;
  const dirty = diff?.dirty ?? false;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500">Working-state status and live release summary.</p>
      </div>

      {!diff || !live && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load release status. The API may be unavailable.
        </p>
      )}

      {diff && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <dl className="grid max-w-md grid-cols-[1fr_auto] gap-x-6 gap-y-3 text-sm">
            <dt className="text-gray-500">Working revision</dt>
            <dd className="font-mono font-medium text-gray-900 text-right">{diff.revision}</dd>

            <dt className="text-gray-500">Last published revision</dt>
            <dd className="font-mono font-medium text-gray-900 text-right">{diff.lastPublishedRevision}</dd>

            <dt className="text-gray-500">Live version</dt>
            <dd className="font-mono font-medium text-gray-900 text-right">
              {live?.version != null ? live.version : "—"}
            </dd>

            <dt className="text-gray-500">Status</dt>
            <dd className="text-right">
              {dirty ? (
                <span className="inline-flex items-center gap-1.5 font-semibold text-amber-600">
                  <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-amber-400" />
                  Unpublished changes
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 font-semibold text-green-700">
                  <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-green-500" />
                  Up to date
                </span>
              )}
            </dd>
          </dl>
        </div>
      )}
    </section>
  );
}
