import { requireSession } from "@/app/lib/session";
import { apiServer } from "@/app/lib/api";
import { atLeast } from "@signex/shared";
import { Rocket } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { EmptyState } from "@/components/admin/empty-state";
import { StatusBadge } from "@/components/admin/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

export default async function ReleasesPage() {
  const user = await requireSession();
  const canPublish = atLeast(user.role, "PUBLISHER");

  // Fetch history + live status in parallel
  const [listRes, liveRes] = await Promise.all([
    apiServer<ReleaseList>("/api/releases"),
    apiServer<LiveStatus>("/api/releases/live"),
  ]);

  const releases = listRes.ok ? listRes.data : [];
  const live = liveRes.ok ? liveRes.data : null;

  const apiError = !listRes.ok;

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title="Releases"
        subtitle="Release history and rollback. Publishing is now per-theme on the Themes page."
      />

      {/* API error banner */}
      {apiError && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          Could not load release data. The API may be unavailable.
        </p>
      )}

      {/* Live version status card */}
      <SectionCard>
        <dl className="grid max-w-md grid-cols-[1fr_auto] gap-x-6 gap-y-3 text-sm">
          <dt className="text-muted-foreground">Live version</dt>
          <dd className="text-right font-mono tabular-nums font-medium text-foreground">
            {live?.version != null ? live.version : <span className="text-muted-foreground">—</span>}
          </dd>

          <dt className="text-muted-foreground">Published at</dt>
          <dd className="text-right font-mono tabular-nums text-xs text-muted-foreground">
            {live?.publishedAt
              ? new Date(live.publishedAt).toLocaleString()
              : <span className="text-muted-foreground">—</span>}
          </dd>
        </dl>

        <p className="mt-4 text-sm text-muted-foreground">
          To publish a new release, go to the{" "}
          <Link href="/themes" className="font-medium text-foreground underline underline-offset-2 hover:text-primary">
            Themes page
          </Link>
          {" "}and publish from there.
        </p>
      </SectionCard>

      {/* Release history table */}
      <SectionCard title="Release history" bodyClassName="p-0">
        {releases.length === 0 ? (
          <EmptyState
            icon={Rocket}
            title="No releases yet."
            description="Publish a theme to create the first release."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="h-10">
                  <TableHead scope="col" className="px-5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Version
                  </TableHead>
                  <TableHead scope="col" className="px-5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Status
                  </TableHead>
                  <TableHead scope="col" className="px-5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Note
                  </TableHead>
                  <TableHead scope="col" className="px-5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Published at
                  </TableHead>
                  <TableHead scope="col" className="px-5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    From version
                  </TableHead>
                  {canPublish && (
                    <TableHead scope="col" className="px-5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Actions
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {releases.map((r) => (
                  <TableRow
                    key={r.id}
                    className="border-b border-border last:border-0 transition-colors duration-150 hover:bg-muted/50"
                  >
                    <TableCell className="px-5 py-3 font-mono tabular-nums font-medium text-foreground">
                      {r.version}
                    </TableCell>
                    <TableCell className="px-5 py-3">
                      {r.status === "PUBLISHED" ? (
                        <StatusBadge tone="success">
                          <span className="size-1.5 rounded-full bg-current" aria-hidden />
                          PUBLISHED
                        </StatusBadge>
                      ) : (
                        <StatusBadge tone="neutral">
                          ARCHIVED
                        </StatusBadge>
                      )}
                    </TableCell>
                    <TableCell className="px-5 py-3 text-muted-foreground">
                      {r.note ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="px-5 py-3 font-mono tabular-nums text-xs text-muted-foreground">
                      {r.publishedAt
                        ? new Date(r.publishedAt).toLocaleString()
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="px-5 py-3 font-mono tabular-nums text-muted-foreground">
                      {r.rolledBackFromVersion ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    {canPublish && (
                      <TableCell className="px-5 py-3">
                        {/* Only ARCHIVED versions can be rolled back; live version has no rollback */}
                        {r.status === "ARCHIVED" ? (
                          <RollbackForm toVersion={r.version} />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
    </section>
  );
}
