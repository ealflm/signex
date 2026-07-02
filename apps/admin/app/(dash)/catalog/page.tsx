import { requireRole } from "@/app/lib/session";
import { apiServer } from "@/app/lib/api";
import { getActiveThemeId } from "@/app/lib/themes";
import type { ReleaseSnapshot, FrozenCategory } from "@signex/shared";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { Layers } from "lucide-react";
import { CategoriesPanel, type CategoryCardData } from "./categories-panel";
import { ProductsPanel, type ProductRowData } from "./products-panel";
import type { CategoryOption } from "./product-dialog";
import type { AssetOption } from "./catalog-fields";

// GET /api/assets returns the full AssetDto; the catalog page needs id/status/
// originalName plus the precomputed public `url` (= MEDIA_PUBLIC_BASE/r2Key) for
// thumbnails. Other AssetDto fields exist on the payload but are unused here.
interface AssetListItem {
  id: string;
  status: string;
  originalName: string;
  url: string;
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function CatalogPage() {
  // Hard role gate — redirects to / if under-ranked
  await requireRole("EDITOR");

  // Catalog data is read from the active theme's draft snapshot.
  // There are no standalone catalog GET routes in this API version.
  const themeId = await getActiveThemeId();
  if (!themeId) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Catalog"
          subtitle="Manage categories and products. Changes stay unpublished until you publish a release."
        />
        <div className="rounded-xl border border-dashed border-border">
          <EmptyState
            icon={Layers}
            title="No active theme selected"
            description="Pick an active theme in the header to manage its catalog."
          />
        </div>
      </div>
    );
  }

  const [themeRes, assetsRes] = await Promise.all([
    apiServer<{ draftSnapshot: ReleaseSnapshot }>(`/api/themes/${themeId}`),
    apiServer<AssetListItem[]>("/api/assets"),
  ]);

  // assetId → public URL, keyed off the READY assets the API already resolved.
  const readyAssets = (assetsRes.ok ? assetsRes.data : []).filter(
    (a) => a.status === "READY",
  );
  const assetUrlById = new Map(readyAssets.map((a) => [a.id, a.url] as const));
  const thumbSrc = (imageId: string | null): string | null =>
    imageId ? (assetUrlById.get(imageId) ?? null) : null;

  // Build rows from the snapshot catalog (each image carries { assetId }).
  // apiServer does no runtime validation, so guard against a 200 with an
  // unexpected/empty body rather than crashing the whole route.
  const cats = (
    themeRes.ok
      ? (themeRes.data.draftSnapshot?.catalog?.categories ?? [])
      : []
  ) as FrozenCategory[];

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

  // KPI numbers
  const totalItems = categories.length + products.length;
  const withImage =
    categories.filter((c) => c.imageSrc).length +
    products.filter((p) => p.imageSrc).length;

  const apiError = !themeRes.ok;
  // Assets drive thumbnails + the image picker. If that call fails while the
  // theme loads, warn — saving still preserves existing images (the picker
  // keeps a "Current image (keep)" option), but new images can't be chosen.
  const assetsError = themeRes.ok && !assetsRes.ok;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Catalog"
        subtitle="Manage categories and products. Changes stay unpublished until you publish a release."
      />

      {apiError && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          Could not load catalog data. The API may be unavailable.
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
    </div>
  );
}
