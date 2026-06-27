import { notFound } from "next/navigation";
import { LayoutTemplate } from "lucide-react";
import { requireRole } from "@/app/lib/session";
import { apiServer } from "@/app/lib/api";
import { getActiveThemeId } from "@/app/lib/themes";
import { BLOCK_REGISTRY, BLOCK_KIND_BY_KEY, type BlockKey, type ReleaseSnapshot } from "@signex/shared";
import { deriveFields } from "@/app/lib/zodform-fields";
import { ZodForm } from "./zod-form";
import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { EmptyState } from "@/components/admin/empty-state";
import type { FieldAssetRow } from "@/app/(dash)/editor/_fields/field-editor";

// ---------------------------------------------------------------------------
// Page (server component)
// ---------------------------------------------------------------------------

export default async function ContentBlockPage({
  params,
}: {
  params: Promise<{ blockKey: string }>;
}) {
  await requireRole("EDITOR");
  const { blockKey } = await params;

  // blockKey is already the registry key (link pattern: /content/${k}).
  if (!(blockKey in BLOCK_REGISTRY)) {
    notFound();
  }

  const key = blockKey as BlockKey;
  const kind = BLOCK_KIND_BY_KEY[key];

  // Resolve the active theme.
  const themeId = await getActiveThemeId();
  if (!themeId) {
    return (
      <section className="flex flex-col gap-6">
        <PageHeader
          title={
            <>
              Content block:{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-lg text-foreground">
                {blockKey}
              </code>
            </>
          }
        />
        <EmptyState
          icon={LayoutTemplate}
          title="No active theme"
          description="Pick an active theme in the header to edit content."
        />
      </section>
    );
  }

  // Fetch theme draft (for block data + revision) and assets in parallel.
  const [themeRes, assetsRes] = await Promise.all([
    apiServer<{ draftSnapshot: ReleaseSnapshot; draftRevision: number }>(`/api/themes/${themeId}`),
    apiServer<FieldAssetRow[]>("/api/assets"),
  ]);

  const snapshot = themeRes.ok ? themeRes.data.draftSnapshot : null;
  const initialData = (snapshot?.blocks as Record<string, Record<string, unknown>> | undefined)?.[key] ?? {};
  const expectedDraftRevision = themeRes.ok ? themeRes.data.draftRevision : 0;

  const assets = assetsRes.ok && Array.isArray(assetsRes.data) ? assetsRes.data : [];

  // Derive the field plan from the registry schema.
  const fields = deriveFields(BLOCK_REGISTRY[key]);

  // Sidebar: all registry keys (link to each block editor).
  const allKeys = Object.keys(BLOCK_REGISTRY) as BlockKey[];

  return (
    <section className="flex flex-col gap-6">
      {/* Page header */}
      <PageHeader
        title={
          <>
            Content block:{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-lg text-foreground">
              {blockKey}
            </code>
          </>
        }
        subtitle={
          <span className="text-xs text-muted-foreground">
            Kind:{" "}
            <span className="font-medium text-foreground">{kind}</span>
            {" · "}
            Registry key:{" "}
            <span className="font-medium text-foreground">{key}</span>
            {" · "}
            Draft revision:{" "}
            <span className="font-mono tabular-nums font-medium text-foreground">
              {expectedDraftRevision}
            </span>
          </span>
        }
      />

      {/* Block navigator */}
      <nav aria-label="Content blocks" className="flex flex-wrap gap-1.5">
        {allKeys.map((k) => {
          const isActive = k === key;
          return (
            <a
              key={k}
              href={`/content/${k}`}
              className={[
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                isActive
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground",
              ].join(" ")}
              aria-current={isActive ? "page" : undefined}
            >
              {k}
            </a>
          );
        })}
      </nav>

      {/* API error banner */}
      {!themeRes.ok && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          Could not load theme data ({themeRes.status}): {themeRes.error}
        </p>
      )}

      {/* Editor */}
      <SectionCard title="Edit block">
        <ZodForm
          blockKey={key}
          themeId={themeId}
          fields={fields}
          initialData={initialData}
          initialExpectedDraftRevision={expectedDraftRevision}
          assets={assets}
        />
      </SectionCard>
    </section>
  );
}
