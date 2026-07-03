import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { requireRole } from "@/app/lib/session";
import { apiServer } from "@/app/lib/api";
import type { FrozenCategory } from "@signex/shared";
import { PageHeader } from "@/components/admin/page-header";
import { CategoryDetailsForm } from "../../category-details-form";
import { ProductsPanel, type ProductRowData } from "../../products-panel";
import type { CategoryData } from "../../category-dialog";

interface AssetListItem {
  id: string;
  status: string;
  originalName: string;
  url: string;
}

interface CatalogResponse {
  revision: number;
  categories: FrozenCategory[];
}

// ── Breadcrumb ────────────────────────────────────────────────────────────────

function Breadcrumb({ current }: { current: string }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <li className="text-muted-foreground/70">Catalog</li>
        <li aria-hidden>
          <ChevronRight className="size-3.5 text-muted-foreground/40" />
        </li>
        <li>
          <Link
            href="/catalog"
            className="rounded-sm underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            Categories
          </Link>
        </li>
        <li aria-hidden>
          <ChevronRight className="size-3.5 text-muted-foreground/40" />
        </li>
        <li aria-current="page" className="truncate font-medium text-foreground">
          {current}
        </li>
      </ol>
    </nav>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function CategoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("EDITOR");
  const { id } = await params;

  const [catalogRes, assetsRes] = await Promise.all([
    apiServer<CatalogResponse>("/api/catalog"),
    apiServer<AssetListItem[]>("/api/assets"),
  ]);

  // API down → can't resolve the category; show an error with a way back.
  if (!catalogRes.ok) {
    return (
      <div className="flex flex-col gap-6">
        <Breadcrumb current="—" />
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          Could not load the catalog. The API may be unavailable.{" "}
          <Link href="/catalog" className="font-medium underline">
            Back to categories
          </Link>
        </p>
      </div>
    );
  }

  const category = catalogRes.data.categories.find((c) => c.id === id);
  if (!category) notFound();

  // assetId → public URL, keyed off the READY assets the API already resolved.
  const readyAssets = (assetsRes.ok ? assetsRes.data : []).filter(
    (a) => a.status === "READY",
  );
  const assetUrlById = new Map(readyAssets.map((a) => [a.id, a.url] as const));
  const thumbSrc = (imageId: string | null): string | null =>
    imageId ? (assetUrlById.get(imageId) ?? null) : null;

  const categoryData: CategoryData = {
    id: category.id ?? "",
    slug: category.slug,
    title: category.title,
    tag: category.tag,
    intro: category.intro,
    productCount: category.productCount,
    materialCount: category.materialCount,
    imageId: category.image?.assetId ?? null,
  };

  const products: ProductRowData[] = category.items.map((p) => {
    const imageId = p.image?.assetId ?? null;
    return {
      id: p.id ?? "",
      categoryId: category.id ?? "",
      slug: p.slug,
      title: p.title,
      tag: p.tag,
      desc: p.desc,
      imageId,
      imageUrl: thumbSrc(imageId),
      categorySlug: category.slug,
    };
  });

  const displayName = category.title.en || category.slug;
  const assetsError = !assetsRes.ok;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Breadcrumb current={displayName} />
        <PageHeader title={displayName} subtitle={category.slug} />
      </div>

      {assetsError && (
        <p
          role="alert"
          className="rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning"
        >
          Media library unavailable — thumbnails can’t load. Existing images are
          preserved when you save.
        </p>
      )}

      <CategoryDetailsForm
        category={categoryData}
        defaultImageUrl={thumbSrc(categoryData.imageId)}
        productCount={products.length}
      />

      <ProductsPanel
        category={{ id: categoryData.id, slug: categoryData.slug }}
        products={products}
      />
    </div>
  );
}
