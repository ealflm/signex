// apps/web/app/lib/site-config.ts
// Global GA4 read-path. GA4 is site-wide INFRASTRUCTURE (the SiteConfig singleton), NOT per-theme
// content — it must NOT change when a different theme is published. Read straight from Postgres via
// @signex/db (one indexed singleton row), cached + tagged 'release' so BOTH a publish AND a
// site-config PATCH refresh it (the api fires /api/revalidate → revalidateTag('release')). Any
// Prisma error → "" so the public shell never 500s on data (mirrors content.ts).
import "server-only";
import { cacheTag } from "next/cache";
import { prisma } from "@signex/db";

/** The configured GA4 measurement id, or "" when unset/unavailable (→ no analytics injected). */
export async function getGa4Id(): Promise<string> {
  "use cache";
  cacheTag("release"); // same site-wide invalidation handle as the published snapshot
  try {
    const cfg = await prisma.siteConfig.findUnique({ where: { id: "singleton" } });
    return cfg?.ga4Id?.trim() ?? "";
  } catch {
    return "";
  }
}
