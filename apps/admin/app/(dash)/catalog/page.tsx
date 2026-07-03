import { requireRole } from "@/app/lib/session";
import { apiServer } from "@/app/lib/api";
import type { FrozenCategory } from "@signex/shared";
import { PageHeader } from "@/components/admin/page-header";
import { CategoriesPanel, type CategoryCardData } from "./categories-panel";
import type { AssetOption } from "./catalog-fields";

// GET /api/assets returns the full AssetDto; the catalog page needs id/status/
// originalName plus the precomputed public `url` for thumbnails.
interface AssetListItem {
  id: string;
  status: string;
  originalName: string;
  url: string;
}

// GET /api/catalog — the single live global catalog.
interface CatalogResponse {
  revision: number;
  categories: FrozenCategory[];
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function CatalogPage() {
  // Hard role gate — redirects to / if under-ranked.
  await requireRole("EDITOR");

  const [catalogRes, assetsRes] = await Promise.all([
    apiServer<CatalogResponse>("/api/catalog"),
    apiServer<AssetListItem[]>("/api/assets"),
  ]);

  // assetId → public URL, keyed off the READY assets the API already resolved.
  const readyAssets = (assetsRes.ok ? assetsRes.data : []).filter(
    (a) => a.status === "READY",
  );
  const assetUrlById = new Map(readyAssets.map((a) => [a.id, a.url] as const));
  const thumbSrc = (imageId: string | null): string | null =>
    imageId ? (assetUrlById.get(imageId) ?? null) : null;

  const cats = (catalogRes.ok ? catalogRes.data.categories : []) as FrozenCategory[];

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

  // Slim shape for the create-category dialog's image picker.
  const assetOptions: AssetOption[] = readyAssets.map(
    ({ id, originalName, url }) => ({ id, originalName, url }),
  );

  const apiError = !catalogRes.ok;
  // Assets drive thumbnails + the image picker. If that call fails while the
  // catalog loads, warn — saving still preserves existing images.
  const assetsError = catalogRes.ok && !assetsRes.ok;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Catalog"
        subtitle="One global catalog for the whole site. Open a category to manage its products. Edits go live immediately."
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

      <CategoriesPanel categories={categories} assets={assetOptions} />
    </div>
  );
}
