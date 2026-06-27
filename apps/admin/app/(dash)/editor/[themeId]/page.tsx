import { notFound } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { atLeast, type ReleaseSnapshot } from "@signex/shared";

import { requireRole } from "@/app/lib/session";
import { apiServer } from "@/app/lib/api";
import { env } from "@/app/lib/env";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { EditorShell } from "../editor-shell";
import type { FieldAssetRow } from "../_fields/field-editor";

// ---------------------------------------------------------------------------
// Unified Editor route loader. Fetches the theme's draft snapshot + revisions + asset library on the
// SERVER (apiServer forwards the session as Bearer) and hands them to the client controller.
//
// Auth: EDITOR may open + Save draft; PUBLISHER+ may also publish (the shell hides Publish for
// EDITORs; the API re-checks @Roles independently).
//
// SECRET HANDLING: the web /preview route is token-gated by PREVIEW_SECRET (a SERVER env). We build
// the iframe origin on the SERVER and hand the controller the web origin + the secret so it can swap
// locale / surface client-side. Forwarding the raw secret into this internal-tool iframe URL is
// acceptable; no other server secret reaches the client.
// ---------------------------------------------------------------------------

export default async function EditorPage({
  params,
}: {
  params: Promise<{ themeId: string }>;
}) {
  const session = await requireRole("EDITOR");
  const { themeId } = await params;
  const { NEXT_PUBLIC_WEB_URL, PREVIEW_SECRET } = env();

  // PREVIEW_SECRET gates the web /preview route; without it the iframe would 404 (a silently-broken
  // editor). Fail CLEAR, scoped to this page, so a missing feature secret never breaks admin boot.
  if (!PREVIEW_SECRET) {
    return (
      <section className="flex flex-col gap-4">
        <PageHeader title="Editor" subtitle="Theme editor + live preview" />
        <EmptyState
          icon={TriangleAlert}
          title="Editor unavailable"
          description="PREVIEW_SECRET is not configured. Set the same PREVIEW_SECRET on the admin and web services to enable the live preview."
        />
      </section>
    );
  }

  // Browser-reachable web origin (the iframe loads in the user's browser, not the admin server).
  const webOrigin = (NEXT_PUBLIC_WEB_URL || "http://localhost:3062").replace(/\/+$/, "");

  const [themeRes, assetsRes] = await Promise.all([
    apiServer<{
      id: string;
      name: string;
      draftSnapshot: ReleaseSnapshot;
      draftRevision: number;
      lastPublishedRevision: number;
    }>(`/api/themes/${themeId}`),
    apiServer<FieldAssetRow[]>("/api/assets"),
  ]);
  if (!themeRes.ok) notFound();
  const theme = themeRes.data;
  const assets = assetsRes.ok && Array.isArray(assetsRes.data) ? assetsRes.data : [];
  const canPublish = atLeast(session.role, "PUBLISHER");

  return (
    <EditorShell
      webOrigin={webOrigin}
      previewSecret={PREVIEW_SECRET}
      themeId={theme.id}
      themeName={theme.name}
      initialSnapshot={theme.draftSnapshot}
      initialDraftRevision={theme.draftRevision}
      initialPublishedRevision={theme.lastPublishedRevision}
      canPublish={canPublish}
      assets={assets}
    />
  );
}
