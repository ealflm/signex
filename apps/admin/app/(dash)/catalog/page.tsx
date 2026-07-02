import { requireRole } from "@/app/lib/session";
import { apiServer } from "@/app/lib/api";
import { atLeast, type FrozenCategory } from "@signex/shared";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { CategoriesPanel, type CategoryCardData } from "./categories-panel";
import { ProductsPanel, type ProductRowData } from "./products-panel";
import {
  PublishCatalogButton,
  RollbackCatalogButton,
} from "./catalog-release-controls";
import type { CategoryOption } from "./product-dialog";
import type { AssetOption } from "./catalog-fields";

// GET /api/assets returns the full AssetDto; the catalog page needs id/status/
// originalName plus the precomputed public `url` for thumbnails.
interface AssetListItem {
  id: string;
  status: string;
  originalName: string;
  url: string;
}

// GET /api/catalog — the global catalog draft.
interface CatalogDraftResponse {
  draftRevision: number;
  lastPublishedRevision: number;
  dirty: boolean;
  categories: FrozenCategory[];
}

// GET /api/catalog/releases — catalog release history (version desc).
interface CatalogReleaseRow {
  id: string;
  version: number;
  status: "PUBLISHED" | "ARCHIVED";
  note: string | null;
  publishedAt: string | null;
  rolledBackFromVersion: number | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ── KPI stat cell (divided-bar strip, mirrors the leads KPI strip) ────────────

function Stat({
  label,
  value,
  hero,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hero?: boolean;
  hint?: string;
}) {
  return (
    <div className="bg-card p-4 sm:p-5">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1.5 font-mono text-2xl font-semibold tabular-nums",
          hero ? "text-primary" : "text-foreground",
        )}
      >
        {value}
      </dd>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ── Release history (with rollback) ───────────────────────────────────────────

function ReleaseHistory({
  releases,
  liveVersion,
  canPublish,
}: {
  releases: CatalogReleaseRow[];
  liveVersion: number | null;
  canPublish: boolean;
}) {
  if (releases.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-foreground">Release history</h2>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="h-10 px-5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Version
              </th>
              <th className="h-10 px-5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Status
              </th>
              <th className="h-10 px-5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Published
              </th>
              <th className="h-10 px-5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Note
              </th>
              <th className="h-10 px-5" />
            </tr>
          </thead>
          <tbody>
            {releases.map((r) => {
              const isLive = r.version === liveVersion;
              return (
                <tr
                  key={r.id}
                  className="border-b border-border last:border-0 hover:bg-muted/50"
                >
                  <td className="px-5 py-3 font-mono tabular-nums text-foreground">
                    v{r.version}
                  </td>
                  <td className="px-5 py-3">
                    {isLive ? (
                      <StatusBadge tone="success">Live</StatusBadge>
                    ) : (
                      <StatusBadge tone="neutral">Archived</StatusBadge>
                    )}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {formatDate(r.publishedAt)}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {r.note ??
                      (r.rolledBackFromVersion
                        ? `Rollback to v${r.rolledBackFromVersion}`
                        : "—")}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {canPublish && !isLive && (
                      <RollbackCatalogButton toVersion={r.version} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function CatalogPage() {
  // Hard role gate — redirects to / if under-ranked. Returns the session user.
  const user = await requireRole("EDITOR");
  const canPublish = atLeast(user.role, "PUBLISHER");

  const [catalogRes, assetsRes, releasesRes] = await Promise.all([
    apiServer<CatalogDraftResponse>("/api/catalog"),
    apiServer<AssetListItem[]>("/api/assets"),
    apiServer<CatalogReleaseRow[]>("/api/catalog/releases"),
  ]);

  // assetId → public URL, keyed off the READY assets the API already resolved.
  const readyAssets = (assetsRes.ok ? assetsRes.data : []).filter(
    (a) => a.status === "READY",
  );
  const assetUrlById = new Map(readyAssets.map((a) => [a.id, a.url] as const));
  const thumbSrc = (imageId: string | null): string | null =>
    imageId ? (assetUrlById.get(imageId) ?? null) : null;

  const draft = catalogRes.ok ? catalogRes.data : null;
  const cats = (draft?.categories ?? []) as FrozenCategory[];

  const categories: CategoryCardData[] = cats.map((c) => {
    const imageId = c.image?.assetId ?? null;
    return {
      id: c.id ?? "",
      slug: c.slug,
      title: c.title,
      tag: c.tag,
      intro: c.intro,
      productCount: c.productCount,
      materialCount: c.materialCount,
      imageId,
      imageSrc: thumbSrc(imageId),
    };
  });

  const products: ProductRowData[] = cats.flatMap((c) =>
    c.items.map((p) => {
      const imageId = p.image?.assetId ?? null;
      return {
        id: p.id ?? "",
        categoryId: c.id ?? "",
        slug: p.slug,
        title: p.title,
        tag: p.tag,
        desc: p.desc,
        imageId,
        imageSrc: thumbSrc(imageId),
        categorySlug: c.slug,
      };
    }),
  );

  // Slim shapes for the client forms/selects
  const assetOptions: AssetOption[] = readyAssets.map(
    ({ id, originalName, url }) => ({ id, originalName, url }),
  );
  const categoryOptions: CategoryOption[] = categories.map(({ id, slug }) => ({
    id,
    slug,
  }));

  const dirty = draft?.dirty ?? false;
  const draftRevision = draft?.draftRevision ?? 0;
  const releases = releasesRes.ok ? releasesRes.data : [];
  const liveVersion =
    releases.find((r) => r.status === "PUBLISHED")?.version ?? null;

  // KPI numbers
  const totalItems = categories.length + products.length;
  const withImage =
    categories.filter((c) => c.imageSrc).length +
    products.filter((p) => p.imageSrc).length;

  const apiError = !catalogRes.ok;
  // Assets drive thumbnails + the image picker. If that call fails while the
  // catalog loads, warn — saving still preserves existing images.
  const assetsError = catalogRes.ok && !assetsRes.ok;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Catalog"
        subtitle="One global catalog for the whole site. Edit here, then publish it independently of themes."
        actions={
          <div className="flex items-center gap-2">
            {dirty ? (
              <StatusBadge tone="warning">Unpublished changes</StatusBadge>
            ) : (
              <StatusBadge tone="success">
                {liveVersion ? `Published · v${liveVersion}` : "Published"}
              </StatusBadge>
            )}
            {canPublish && (
              <PublishCatalogButton
                draftRevision={draftRevision}
                dirty={dirty}
              />
            )}
          </div>
        }
      />

      {apiError && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          Could not load the catalog. The API may be unavailable.
        </p>
      )}

      {assetsError && (
        <p
          role="alert"
          className="rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning"
        >
          Media library unavailable — thumbnails and the image picker are
          disabled. Existing images are preserved when you save.
        </p>
      )}

      <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border bg-border">
        <Stat label="Categories" value={categories.length} />
        <Stat label="Products" value={products.length} hero />
        <Stat
          label="With image"
          value={`${withImage}/${totalItems}`}
          hint={
            totalItems === 0
              ? undefined
              : withImage === totalItems
                ? "all set"
                : `${totalItems - withImage} missing`
          }
        />
      </dl>

      <CategoriesPanel categories={categories} assets={assetOptions} />

      <ProductsPanel
        products={products}
        categories={categoryOptions}
        assets={assetOptions}
      />

      <ReleaseHistory
        releases={releases}
        liveVersion={liveVersion}
        canPublish={canPublish}
      />
    </div>
  );
}
