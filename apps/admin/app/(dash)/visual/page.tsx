import { TriangleAlert } from "lucide-react";
import { requireRole } from "@/app/lib/session";
import { apiServer } from "@/app/lib/api";
import { env } from "@/app/lib/env";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { VisualEditor } from "./visual-editor";

// ---------------------------------------------------------------------------
// Visual editor — Phase 1 (MEDIA): embeds the live WORKING-state preview in an iframe and lets an
// editor click an image/video zone to open an edit drawer (pick/upload → save → live refresh →
// publish). Text editing is Phase 2.
//
// Auth: EDITOR (the same gate as the content block editor). The publish action re-checks PUBLISHER
// server-side in the releases action it reuses.
//
// SECRET HANDLING: the web /preview route is token-gated by PREVIEW_SECRET (a SERVER env). We build
// the iframe src on the SERVER and hand the controller the web origin + the secret so it can swap
// the locale/path. Putting the raw secret in this internal-tool iframe URL is acceptable; NO other
// server secret reaches the client. PROD follow-up: mint a short-lived signed token here instead of
// forwarding the raw PREVIEW_SECRET (the web route would verify the signature rather than ==).
// ---------------------------------------------------------------------------

/** GET /api/releases/diff → DiffStatus (for the optimistic-lock revision + dirty flag). */
interface DiffStatus {
  dirty: boolean;
  revision: number;
  lastPublishedRevision: number;
}

export default async function VisualEditorPage() {
  await requireRole("EDITOR");

  const { NEXT_PUBLIC_WEB_URL, PREVIEW_SECRET } = env();

  // PREVIEW_SECRET gates the web /preview route; without it the iframe would 404 (a silently-broken
  // editor). Fail CLEAR with a configured-message instead — scoped to this page, so a missing
  // feature-only secret never breaks the whole admin boot.
  if (!PREVIEW_SECRET) {
    return (
      <section className="flex flex-col gap-4">
        <PageHeader title="Visual editor" subtitle="Live click-to-edit preview" />
        <EmptyState
          icon={TriangleAlert}
          title="Visual editor unavailable"
          description="PREVIEW_SECRET is not configured. Set the same PREVIEW_SECRET on the admin and web services to enable the live preview."
        />
      </section>
    );
  }

  // Browser-reachable web origin (the iframe is loaded by the user's browser, not the admin server),
  // e.g. http://localhost:3062. Falls back to the dev host port.
  const webOrigin = (NEXT_PUBLIC_WEB_URL || "http://localhost:3062").replace(/\/+$/, "");

  // Initial working revision for the optimistic lock (save + publish). The controller also re-reads
  // it from /admin-api/releases/diff right before each write so a stale page never clobbers.
  const diffRes = await apiServer<DiffStatus>("/api/releases/diff");
  const initialRevision = diffRes.ok ? diffRes.data.revision : 0;
  const initialDirty = diffRes.ok ? diffRes.data.dirty : false;

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        title="Visual editor"
        subtitle={
          <span className="text-xs text-muted-foreground">
            Click an image or video in the live preview to replace it. Changes save to the working
            state and update the preview instantly. Publish when ready.
          </span>
        }
      />
      <VisualEditor
        webOrigin={webOrigin}
        previewSecret={PREVIEW_SECRET}
        initialRevision={initialRevision}
        initialDirty={initialDirty}
      />
    </section>
  );
}
