import { requireRole } from "@/app/lib/session";
import { atLeast } from "@signex/shared";
import { apiServer } from "@/app/lib/api";
import { PageHeader } from "@/components/admin/page-header";
import { MediaManager } from "./media-manager";
import type { AssetRow } from "./types";

export default async function MediaPage() {
  const user = await requireRole("EDITOR");
  const canDelete = atLeast(user.role, "PUBLISHER");

  // Initial list for fast first paint; MediaManager re-fetches client-side after any mutation.
  const res = await apiServer<AssetRow[]>("/api/assets");
  const assets = res.ok ? res.data : [];
  const apiError = !res.ok;

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title="Media"
        subtitle="Upload images and videos. Assets are deduplicated by content hash. Click one to preview, edit alt text, or delete."
      />

      {apiError && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          Could not load assets. The API may be unavailable.
        </p>
      )}

      <MediaManager initialAssets={assets} canDelete={canDelete} />
    </section>
  );
}
