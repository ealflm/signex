import { notFound } from "next/navigation";
import { requireRole } from "@/app/lib/session";
import { apiServer } from "@/app/lib/api";
import { BLOCK_REGISTRY, type BlockKey } from "@signex/shared";
import { deriveFields } from "@/app/lib/zodform-fields";
import { ZodForm } from "./zod-form";
import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";

// ---------------------------------------------------------------------------
// (kind, key) resolution
// ---------------------------------------------------------------------------
//
// The URL param `blockKey` is the full DB composite key (e.g. "home.hero",
// "businessContact", "nav.primary"). The api route is:
//   GET/PUT /api/content/blocks/:kind/:key
// where :kind is the BlockKind enum (PAGE|SETTINGS|NAV|SEO) and :key is the
// full DB key (e.g. "home.hero").
//
// The registry key (used to look up BLOCK_REGISTRY) is the LAST dot-segment
// of the DB key (e.g. "home.hero" → "hero", "businessContact" → "businessContact").
//
// This map mirrors `BLOCK_KIND_BY_KEY` in apps/api/src/importer/block-builder.ts.
// We cannot import from apps/api (cross-app import is forbidden), so we replicate it.
const BLOCK_KIND_MAP: Record<BlockKey, string> = {
  hero: "PAGE",
  features: "PAGE",
  about: "PAGE",
  productsHeader: "PAGE",
  aboutPage: "PAGE",
  contactPage: "PAGE",
  notFound: "PAGE",
  footer: "SETTINGS",
  businessContact: "SETTINGS",
  formConfig: "SETTINGS",
  nav: "NAV",
  meta: "SEO",
};

/** Derive the registry key from a DB composite key (last dot-segment). */
function registryKeyFrom(dbKey: string): string {
  return dbKey.includes(".") ? dbKey.split(".").pop()! : dbKey;
}

// ---------------------------------------------------------------------------
// Shared types for API responses
// ---------------------------------------------------------------------------

interface AssetRow {
  id: string;
  originalName: string;
}

/** GET /api/releases/diff → DiffStatus */
interface DiffStatus {
  dirty: boolean;
  revision: number;
  lastPublishedRevision: number;
}

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

  // Derive the registry key (last dot-segment of DB key).
  const registryKey = registryKeyFrom(blockKey);

  // Guard: registry key must exist in BLOCK_REGISTRY.
  if (!(registryKey in BLOCK_REGISTRY)) {
    notFound();
  }

  const typedRegistryKey = registryKey as BlockKey;
  const schema = BLOCK_REGISTRY[typedRegistryKey];
  const kind = BLOCK_KIND_MAP[typedRegistryKey];

  // Fetch block data + diff (for revision) + assets in parallel.
  const [blockRes, diffRes, assetsRes] = await Promise.all([
    apiServer<unknown>(`/api/content/blocks/${kind}/${blockKey}`),
    apiServer<DiffStatus>("/api/releases/diff"),
    apiServer<AssetRow[]>("/api/assets"),
  ]);

  // getBlock returns raw data (or null if not seeded yet).
  const rawData = blockRes.ok ? blockRes.data : null;
  const initialData = rawData && typeof rawData === "object" && !Array.isArray(rawData)
    ? (rawData as Record<string, unknown>)
    : {};

  // Optimistic-lock revision comes from /api/releases/diff.
  const expectedRevision = diffRes.ok ? diffRes.data.revision : 0;

  const assets = assetsRes.ok && Array.isArray(assetsRes.data) ? assetsRes.data : [];

  // Derive the field plan from the registry schema.
  const fields = deriveFields(schema);

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
            <span className="font-medium text-foreground">{registryKey}</span>
            {" · "}
            Working revision:{" "}
            <span className="font-mono tabular-nums font-medium text-foreground">
              {expectedRevision}
            </span>
          </span>
        }
      />

      {/* Block navigator */}
      <nav aria-label="Content blocks" className="flex flex-wrap gap-1.5">
        {allKeys.map((k) => {
          // Link uses the registry key directly (same-page pattern: URL is the registry key)
          const isActive = k === typedRegistryKey;
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

      {/* API error banners */}
      {!blockRes.ok && blockRes.status !== 404 && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          Could not load block data ({blockRes.status}): {blockRes.error}
        </p>
      )}
      {!diffRes.ok && (
        <p
          role="alert"
          className="rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning"
        >
          Could not read working revision from /api/releases/diff — optimistic lock will use revision 0.
        </p>
      )}

      {/* Editor */}
      <SectionCard title="Edit block">
        <ZodForm
          kind={kind}
          blockKey={blockKey}
          fields={fields}
          initialData={initialData}
          expectedRevision={expectedRevision}
          assets={assets}
        />
      </SectionCard>
    </section>
  );
}
