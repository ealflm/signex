import { notFound } from "next/navigation";
import { requireRole } from "@/app/lib/session";
import { apiServer } from "@/app/lib/api";
import { BLOCK_REGISTRY, type BlockKey } from "@signex/shared";
import { deriveFields } from "@/app/lib/zodform-fields";
import { ZodForm } from "./zod-form";

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
      <header className="flex flex-col gap-1">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold text-gray-900">
            Content block:{" "}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-lg font-mono">{blockKey}</code>
          </h1>
        </div>
        <p className="text-xs text-gray-500">
          Kind:{" "}
          <span className="font-medium text-gray-700">{kind}</span>
          {" · "}
          Registry key:{" "}
          <span className="font-medium text-gray-700">{registryKey}</span>
          {" · "}
          Working revision:{" "}
          <span className="font-mono font-medium text-gray-700">{expectedRevision}</span>
        </p>
      </header>

      {/* Block navigator */}
      <nav aria-label="Content blocks" className="flex flex-wrap gap-1.5">
        {allKeys.map((k) => {
          // Link uses the registry key directly (same-page pattern: URL is the registry key)
          const isActive = k === typedRegistryKey;
          return (
            <a
              key={k}
              href={`/content/${k}`}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-1 ${
                isActive
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-400 hover:text-gray-900"
              }`}
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
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          Could not load block data ({blockRes.status}): {blockRes.error}
        </p>
      )}
      {!diffRes.ok && (
        <p
          role="alert"
          className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700"
        >
          Could not read working revision from /api/releases/diff — optimistic lock will use revision 0.
        </p>
      )}

      {/* Editor */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <ZodForm
          kind={kind}
          blockKey={blockKey}
          fields={fields}
          initialData={initialData}
          expectedRevision={expectedRevision}
          assets={assets}
        />
      </div>
    </section>
  );
}
