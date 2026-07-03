// app/components/analytics-view.tsx
"use client";

import { useEffect } from "react";
import { track } from "@/app/lib/analytics/tracker";

/** Fires a catalog semantic event with the real slug from a server page. */
export function AnalyticsView({
  kind,
  catalogSlug,
  productSlug,
}: {
  kind: "category_view" | "product_view";
  catalogSlug?: string;
  productSlug?: string;
}) {
  useEffect(() => {
    track(kind, { catalogSlug, productSlug });
  }, [kind, catalogSlug, productSlug]);
  return null;
}
