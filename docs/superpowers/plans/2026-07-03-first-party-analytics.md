# First-Party Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a first-party web-analytics pipeline (browser tracker → `POST /api/collect` → Postgres → admin `/analytics` dashboard) that tracks GA4-style actions and attributes leads to their source, running in parallel with the already-live GA4 embed.

**Architecture:** A tiny browser tracker fires fire-and-forget `sendBeacon` events to a same-origin BFF route that forwards to a NestJS ingest endpoint; the API enriches (channel/device/geo) and stores raw `AnalyticsEvent` rows + an upserted `AnalyticsSession`. Raw events are the source of truth; the admin dashboard reads seven aggregation endpoints (query-on-read, no rollup tables) and renders with the existing admin design system + Recharts. Leads join to sessions via `FormSubmission.sessionId`.

**Tech Stack:** Prisma 6 / Postgres 16 (`@signex/db`), zod 3.23 (`@signex/shared`), NestJS 11 (`apps/api`), Next 16 App Router (`apps/web`, `apps/admin`), Recharts 3.8.

Design spec: `docs/superpowers/specs/2026-07-03-first-party-analytics-design.md`.

## Global Constraints

- **Workspace build order (load-bearing):** after editing `packages/db` or `packages/shared`, they MUST be rebuilt to `dist/` before apps see the change: `npm run -w @signex/db generate && npm run -w @signex/db build`, and `npm run -w @signex/shared build`. Migrations: `npm run -w @signex/db migrate -- --name <snake_name>` (= `prisma migrate dev`, applies to the dev DB on host port 3059).
- **Prisma ids** are `String @id @default(cuid())`; timestamps `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`; enums SCREAMING_CASE above their model; `@@index(...)` grouped at model bottom; fields column-aligned.
- **zod is v3** — `z.record(valueSchema)` (single arg), `z.enum([...] as const)`; every schema followed by `export type X = z.infer<typeof X>`; import `z` from `@signex/shared` (do NOT add a zod dep).
- **API:** global prefix `api` (routes are `/api/...`). Guard order Throttler→Origin→SessionAuth→Roles. `@Public()` exempts origin+authn+authz but **NOT** the throttler — add `@Throttle({ default: { limit, ttl } })` explicitly. `@Roles('EDITOR')` for read endpoints. Services inject `PrismaService` and use `this.prisma.client.<model>`. Register new modules in `apps/api/src/app.module.ts` `imports`.
- **Roles** are `EDITOR | PUBLISHER | ADMIN` (no VIEWER). Read pages/endpoints gate on `EDITOR`.
- **Web → API from the browser** goes through same-origin BFF route handlers under `apps/web/app/api/...` that forward server-side to `process.env.API_URL` (`http://api:3060`). Client code never calls the API cross-origin.
- **Admin design tokens:** oklch CSS-var tokens (`--chart-1`, `--border`, `--muted-foreground`, `--card`, `--primary`, `--success`, `--warning`, `--destructive`); charts pass tokens as strings (`"var(--chart-1)"`), never hex. Cards `rounded-xl border border-border bg-card`; numbers `font-mono tabular-nums`; `shadow-elevated`. Reuse `components/admin/*` + `components/ui/*`; no new palette/fonts. `success`/`warning` have no `-foreground` pair (use as tinted pills `bg-success/10 text-success`).
- **Analytics never breaks the page**: every tracker call is wrapped so a failure is swallowed; beacons are never awaited.
- **No secrets** committed. Never `git add -A` (it sweeps `.agents/`, `.claude/`, `skills-lock.json`) — add explicit paths only.
- Commit message trailer on every commit:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01W43GcnR1BXH9qm8TLt4DJ6
  ```

---

## File Structure

**`packages/db`** — `prisma/schema.prisma` (+2 models, +2 columns), one new migration folder.
**`packages/shared`** — `src/analytics.ts` (zod collect schema + response DTO types), re-export from `src/index.ts`, `src/analytics.test.ts`.
**`apps/api/src/analytics/`** — `analytics.module.ts`, `collect.controller.ts`, `ingest.service.ts`, `enrich.ts`, `analytics.controller.ts`, `query.service.ts`, plus `*.spec.ts` beside each. `app.module.ts` gains the module.
**`apps/api/src/forms/`** — `dto/forms.dto.ts` (+2 optional fields), `forms.service.ts` + `forms.controller.ts` (persist + attribute), specs updated.
**`apps/web/app/`** — `lib/analytics/tracker.ts`, `components/analytics.tsx`, `components/analytics-view.tsx`, `api/collect/route.ts`; edits to `[lang]/layout.tsx`, the two catalog pages, `api/forms/[formKey]/submit/route.ts`, `components/static-webflow-form.tsx`, `components/home/hero-quote-form.tsx`; `lib/analytics/tracker.test.mjs`.
**`apps/admin/`** — `app/(dash)/analytics/page.tsx` + `loading.tsx`, `app/lib/analytics.ts` (+ `.test.ts`), `components/analytics/*` (kpi-strip, range-tabs, traffic-chart, bars, funnel, realtime, tables, skeletons), edit `components/shell/app-sidebar.tsx`.

---

## Task 1: DB models + FormSubmission attribution columns

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (after the `FormSubmission` model, ~line 167)
- Create: `packages/db/prisma/migrations/<ts>_analytics_first_party/migration.sql` (generated)

**Interfaces:**
- Produces: Prisma models `AnalyticsEvent`, `AnalyticsSession`; `FormSubmission` gains `sessionId String?`, `visitorId String?`. Consumed by Tasks 3–5 as `this.prisma.client.analyticsEvent` / `.analyticsSession` / `.formSubmission`.

- [ ] **Step 1: Add the two models + FormSubmission columns to the schema**

In `packages/db/prisma/schema.prisma`, add `sessionId String?` and `visitorId String?` to `FormSubmission` (nullable → no backfill), an index on `sessionId`, then append the analytics section:

```prisma
model FormSubmission {
  id            String           @id @default(cuid())
  formKey       String // "quote" | "contact"
  payload       Json // zod-validated against the form's submit schema
  uploadAssetId String? // the form's "upload" field -> R2 Asset
  status        SubmissionStatus @default(NEW)
  flagged       Boolean          @default(false) // spam/duplicate marker — hidden from the inbox, bulk-clearable
  ip            String?
  userAgent     String?
  sessionId     String? // analytics session that produced this lead (attribution join)
  visitorId     String? // analytics visitor (cross-session attribution)
  createdAt     DateTime         @default(now())

  @@index([formKey, status])
  @@index([createdAt])
  @@index([flagged, createdAt])
  @@index([sessionId])
}

// ===== ANALYTICS (first-party; operational-only, NOT in snapshots) =====
// Raw events are the source of truth for all metrics; AnalyticsSession is a
// denormalized convenience for channel/entry attribution + bounce/duration.
model AnalyticsEvent {
  id          String   @id @default(cuid())
  occurredAt  DateTime @default(now())
  visitorId   String // sx_vid cookie, sent in the beacon payload
  sessionId   String // 30-min inactivity window
  kind        String // page_view|scroll|cta_click|outbound_click|category_view|product_view
  path        String
  title       String?
  referrer    String?
  utmSource   String?
  utmMedium   String?
  utmCampaign String?
  utmTerm     String?
  utmContent  String?
  channel     String // direct|organic|social|referral|paid|email (server-derived)
  country     String? // ISO-2, derived from IP; raw IP is never stored
  device      String // mobile|tablet|desktop (UA-derived)
  browser     String?
  os          String?
  lang        String?
  catalogSlug String? // category slug for category_view
  productSlug String? // product slug for product_view
  meta        Json? // {depth}|{ctaId}|{href}

  @@index([occurredAt])
  @@index([kind, occurredAt])
  @@index([sessionId])
  @@index([visitorId])
  @@index([catalogSlug])
  @@index([productSlug])
}

model AnalyticsSession {
  id          String   @id // the client sessionId
  visitorId   String
  startedAt   DateTime @default(now())
  lastSeenAt  DateTime @updatedAt
  entryPath   String
  exitPath    String?
  referrer    String?
  channel     String
  utmSource   String?
  utmMedium   String?
  utmCampaign String?
  country     String?
  device      String
  browser     String?
  os          String?
  lang        String?
  pageviews   Int      @default(0)
  eventsCount Int      @default(0)
  bounced     Boolean  @default(true)
  durationSec Int      @default(0)
  converted   Boolean  @default(false) // a lead linked this session

  @@index([startedAt])
  @@index([visitorId])
  @@index([channel])
  @@index([converted])
}
```

- [ ] **Step 2: Create + apply the migration**

Run: `npm run -w @signex/db migrate -- --name analytics_first_party`
Expected: Prisma prints `Applying migration ...analytics_first_party`, creates the folder + `migration.sql`, and regenerates the client. (Dev DB is up on host port 3059 via docker compose.)

- [ ] **Step 3: Verify the schema + regenerate the client into dist**

Run: `npx -w @signex/db prisma validate && npm run -w @signex/db generate && npm run -w @signex/db build`
Expected: `The schema at prisma/schema.prisma is valid`, client generated, `tsc` exits 0. Confirm the migration SQL contains `CREATE TABLE "AnalyticsEvent"`, `CREATE TABLE "AnalyticsSession"`, and `ALTER TABLE "FormSubmission" ADD COLUMN "sessionId"`.

- [ ] **Step 4: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations
git commit -m "$(printf 'feat(db): AnalyticsEvent + AnalyticsSession + FormSubmission attribution cols\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01W43GcnR1BXH9qm8TLt4DJ6')"
```

---

## Task 2: Shared zod collect schema + response DTOs

**Files:**
- Create: `packages/shared/src/analytics.ts`
- Create: `packages/shared/src/analytics.test.ts`
- Modify: `packages/shared/src/index.ts` (add `export * from "./analytics";`)

**Interfaces:**
- Produces: `EVENT_KINDS`, `CHANNELS`, types `EventKind`, `Channel`; `collectEventSchema` + `CollectEvent`; response interfaces `OverviewKpis`, `OverviewResponse`, `TimeseriesPoint`, `TopPage`, `ChannelStat`, `CampaignStat`, `ReferrerStat`, `SourcesResponse`, `CatalogStat`, `CatalogInsightsResponse`, `FunnelStage`, `AttributionRow`, `FunnelResponse`, `RealtimeEvent`, `RealtimeResponse`. Consumed by Tasks 3, 4, 7.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/analytics.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { collectEventSchema, EVENT_KINDS, CHANNELS } from "./analytics";

describe("collectEventSchema", () => {
  const base = { visitorId: "v1", sessionId: "s1", kind: "page_view", path: "/en" };

  it("accepts a minimal valid page_view", () => {
    expect(collectEventSchema.safeParse(base).success).toBe(true);
  });
  it("accepts optional utm + meta", () => {
    const r = collectEventSchema.safeParse({ ...base, kind: "cta_click", utmSource: "fb", meta: { ctaId: "quote" } });
    expect(r.success).toBe(true);
  });
  it("rejects an unknown kind", () => {
    expect(collectEventSchema.safeParse({ ...base, kind: "rage_click" }).success).toBe(false);
  });
  it("rejects a missing sessionId", () => {
    expect(collectEventSchema.safeParse({ visitorId: "v1", kind: "page_view", path: "/en" }).success).toBe(false);
  });
  it("rejects an over-long path (>512)", () => {
    expect(collectEventSchema.safeParse({ ...base, path: "/" + "a".repeat(600) }).success).toBe(false);
  });
  it("exposes the six kinds and six channels", () => {
    expect(EVENT_KINDS).toHaveLength(6);
    expect(CHANNELS).toContain("organic");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test -w @signex/shared -- analytics`
Expected: FAIL — `Cannot find module "./analytics"`.

- [ ] **Step 3: Implement `analytics.ts`**

Create `packages/shared/src/analytics.ts`:

```ts
// packages/shared/src/analytics.ts
// First-party analytics contract: the ingest payload (validated) + the read-model
// response shapes shared by apps/api (producer) and apps/admin (consumer).
import { z } from "zod";

export const EVENT_KINDS = [
  "page_view",
  "scroll",
  "cta_click",
  "outbound_click",
  "category_view",
  "product_view",
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const CHANNELS = ["direct", "organic", "social", "referral", "paid", "email"] as const;
export type Channel = (typeof CHANNELS)[number];

/** The beacon payload the browser sends to POST /api/collect. Server derives
 *  channel/country/device/browser/os — the client never sends those. */
export const collectEventSchema = z.object({
  visitorId: z.string().min(1).max(64),
  sessionId: z.string().min(1).max(64),
  kind: z.enum(EVENT_KINDS),
  path: z.string().min(1).max(512),
  title: z.string().max(512).optional(),
  referrer: z.string().max(1024).optional(),
  utmSource: z.string().max(256).optional(),
  utmMedium: z.string().max(256).optional(),
  utmCampaign: z.string().max(256).optional(),
  utmTerm: z.string().max(256).optional(),
  utmContent: z.string().max(256).optional(),
  lang: z.string().max(8).optional(),
  catalogSlug: z.string().max(256).optional(),
  productSlug: z.string().max(256).optional(),
  meta: z.record(z.unknown()).optional(),
});
export type CollectEvent = z.infer<typeof collectEventSchema>;

// ===== Read-model response DTOs (server-generated; typed as interfaces) =====
export interface OverviewKpis {
  visitors: number;
  sessions: number;
  pageviews: number;
  avgSessionSec: number;
  bounceRate: number; // 0..1
  leads: number;
  conversionRate: number; // 0..1
}
export interface OverviewResponse {
  current: OverviewKpis;
  previous: OverviewKpis; // same-length window immediately before `from`
}
export interface TimeseriesPoint {
  bucket: string; // ISO day or hour
  value: number;
}
export interface TopPage {
  path: string;
  pageviews: number;
  visitors: number;
}
export interface ChannelStat {
  channel: Channel;
  sessions: number;
  leads: number;
}
export interface CampaignStat {
  campaign: string;
  sessions: number;
  leads: number;
}
export interface ReferrerStat {
  referrer: string;
  sessions: number;
}
export interface SourcesResponse {
  channels: ChannelStat[];
  campaigns: CampaignStat[];
  referrers: ReferrerStat[];
}
export interface CatalogStat {
  slug: string;
  views: number;
  visitors: number;
}
export interface CatalogInsightsResponse {
  categories: CatalogStat[];
  products: CatalogStat[];
  ctaClicks: number;
}
export interface FunnelStage {
  stage: string;
  count: number;
  pct: number; // 0..1 of the first stage
}
export interface AttributionRow {
  key: string; // channel or entry path
  leads: number;
}
export interface FunnelResponse {
  stages: FunnelStage[];
  attribution: AttributionRow[];
}
export interface RealtimeEvent {
  kind: EventKind | "lead";
  path: string;
  occurredAt: string;
}
export interface RealtimeResponse {
  activeVisitors: number;
  perMinute: TimeseriesPoint[]; // last 30 one-minute buckets
  topPages: TopPage[];
  recent: RealtimeEvent[];
}
```

- [ ] **Step 4: Re-export from the package barrel**

In `packages/shared/src/index.ts`, add alongside the other `export * from "./content/..."` lines:

```ts
export * from "./analytics";
```

- [ ] **Step 5: Run the test + build**

Run: `npm run test -w @signex/shared -- analytics && npm run build -w @signex/shared`
Expected: the 6 tests PASS; `tsc` exits 0.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/analytics.ts packages/shared/src/analytics.test.ts packages/shared/src/index.ts
git commit -m "$(printf 'feat(shared): analytics collect schema + read-model DTOs\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01W43GcnR1BXH9qm8TLt4DJ6')"
```

---

## Task 3: API ingestion — enrichment + `POST /api/collect` + sessionization

**Files:**
- Create: `apps/api/src/analytics/enrich.ts`
- Create: `apps/api/src/analytics/enrich.spec.ts`
- Create: `apps/api/src/analytics/ingest.service.ts`
- Create: `apps/api/src/analytics/ingest.service.spec.ts`
- Create: `apps/api/src/analytics/collect.controller.ts`
- Create: `apps/api/src/analytics/collect.controller.spec.ts`
- Create: `apps/api/src/analytics/analytics.module.ts`
- Modify: `apps/api/src/app.module.ts` (register `AnalyticsModule`)

**Interfaces:**
- Consumes: `CollectEvent`, `Channel` from `@signex/shared`; `PrismaService` (`this.prisma.client`).
- Produces: `classifyChannel(referrer, utm)`, `parseDevice/parseBrowser/parseOs(ua)` (`enrich.ts`); `IngestService.ingest(input, ctx)`; `AnalyticsModule`. `QueryService` (Task 4) joins the same module.

- [ ] **Step 1: Write the failing enrichment test**

Create `apps/api/src/analytics/enrich.spec.ts`:

```ts
import { classifyChannel, parseDevice, parseBrowser, parseOs } from "./enrich";

describe("classifyChannel", () => {
  it("paid from utm_medium cpc", () => {
    expect(classifyChannel(undefined, { utmMedium: "cpc" })).toBe("paid");
  });
  it("email from utm_medium email", () => {
    expect(classifyChannel(undefined, { utmMedium: "email" })).toBe("email");
  });
  it("social from a facebook referrer", () => {
    expect(classifyChannel("https://m.facebook.com/", {})).toBe("social");
  });
  it("organic from a google referrer", () => {
    expect(classifyChannel("https://www.google.com/search?q=x", {})).toBe("organic");
  });
  it("referral from any other referrer", () => {
    expect(classifyChannel("https://someblog.example/post", {})).toBe("referral");
  });
  it("direct when there is no referrer and no utm", () => {
    expect(classifyChannel(undefined, {})).toBe("direct");
  });
});

describe("UA parsing", () => {
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 Version/17.0 Mobile Safari/604";
  const win = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537 Chrome/120 Safari/537";
  it("device", () => {
    expect(parseDevice(iphone)).toBe("mobile");
    expect(parseDevice(win)).toBe("desktop");
    expect(parseDevice(undefined)).toBe("desktop");
  });
  it("browser + os", () => {
    expect(parseBrowser(win)).toBe("Chrome");
    expect(parseOs(win)).toBe("Windows");
    expect(parseOs(iphone)).toBe("iOS");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test -w @signex/api -- enrich`
Expected: FAIL — `Cannot find module "./enrich"`.

- [ ] **Step 3: Implement `enrich.ts`**

Create `apps/api/src/analytics/enrich.ts`:

```ts
// apps/api/src/analytics/enrich.ts
// Pure server-side enrichment: referrer/utm -> channel, UA -> device/browser/os.
import type { Channel } from "@signex/shared";

const SEARCH_HOSTS = ["google.", "bing.", "duckduckgo.", "coccoc.", "yahoo.", "yandex."];
const SOCIAL_HOSTS = [
  "facebook.", "instagram.", "zalo.", "tiktok.", "youtube.",
  "linkedin.", "twitter.", "x.com", "t.co", "threads.",
];

function refHost(referrer?: string): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).host.toLowerCase();
  } catch {
    return null;
  }
}

export function classifyChannel(
  referrer: string | undefined,
  utm: { utmSource?: string; utmMedium?: string },
): Channel {
  const medium = (utm.utmMedium ?? "").toLowerCase();
  const source = (utm.utmSource ?? "").toLowerCase();
  if (/(^|[-_])(cpc|ppc|paid)/.test(medium) || medium === "paidsearch") return "paid";
  if (medium === "email" || source === "newsletter" || source === "email") return "email";
  const host = refHost(referrer);
  if (medium === "social" || (host !== null && SOCIAL_HOSTS.some((h) => host.includes(h)))) return "social";
  if (host !== null && SEARCH_HOSTS.some((h) => host.includes(h))) return "organic";
  if (host !== null) return "referral";
  return "direct";
}

export type Device = "mobile" | "tablet" | "desktop";

export function parseDevice(ua: string | undefined): Device {
  const s = (ua ?? "").toLowerCase();
  if (/ipad|tablet|playbook|silk/.test(s) || (/android/.test(s) && !/mobile/.test(s))) return "tablet";
  if (/mobi|iphone|ipod|android|blackberry|iemobile|opera mini/.test(s)) return "mobile";
  return "desktop";
}

export function parseBrowser(ua: string | undefined): string | undefined {
  const s = ua ?? "";
  if (/Edg\//.test(s)) return "Edge";
  if (/OPR\/|Opera/.test(s)) return "Opera";
  if (/Chrome\//.test(s) && !/Chromium/.test(s)) return "Chrome";
  if (/Firefox\//.test(s)) return "Firefox";
  if (/Version\/.*Safari\//.test(s)) return "Safari";
  return undefined;
}

export function parseOs(ua: string | undefined): string | undefined {
  const s = ua ?? "";
  if (/Windows NT/.test(s)) return "Windows";
  if (/iPhone|iPad|iPod|iOS/.test(s)) return "iOS";
  if (/Mac OS X/.test(s)) return "macOS";
  if (/Android/.test(s)) return "Android";
  if (/Linux/.test(s)) return "Linux";
  return undefined;
}
```

- [ ] **Step 4: Run the enrich test to confirm it passes**

Run: `npm run test -w @signex/api -- enrich`
Expected: PASS (both describe blocks).

- [ ] **Step 5: Write the failing ingest-service test**

Create `apps/api/src/analytics/ingest.service.spec.ts`:

```ts
import { Test } from "@nestjs/testing";
import { IngestService } from "./ingest.service";
import { PrismaService } from "../prisma/prisma.service";
import type { CollectEvent } from "@signex/shared";

function makePrisma() {
  const session = {
    findUnique: jest.fn(),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
  };
  const event = { create: jest.fn().mockResolvedValue({}) };
  return { client: { analyticsSession: session, analyticsEvent: event } };
}

async function makeService(prisma: ReturnType<typeof makePrisma>) {
  const mod = await Test.createTestingModule({
    providers: [IngestService, { provide: PrismaService, useValue: prisma }],
  }).compile();
  return mod.get(IngestService);
}

const ev = (over: Partial<CollectEvent> = {}): CollectEvent => ({
  visitorId: "v1", sessionId: "s1", kind: "page_view", path: "/en", ...over,
});
const ctx = { ip: "1.2.3.4", ua: "Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537", country: "VN" };

describe("IngestService.ingest", () => {
  it("creates a session on the first event and always inserts the event", async () => {
    const prisma = makePrisma();
    prisma.client.analyticsSession.findUnique.mockResolvedValue(null);
    const svc = await makeService(prisma);

    await svc.ingest(ev({ referrer: "https://www.google.com/" }), ctx);

    expect(prisma.client.analyticsSession.create).toHaveBeenCalledTimes(1);
    const created = prisma.client.analyticsSession.create.mock.calls[0][0].data;
    expect(created).toMatchObject({ id: "s1", channel: "organic", device: "desktop", country: "VN", pageviews: 1, bounced: true });
    expect(prisma.client.analyticsEvent.create).toHaveBeenCalledTimes(1);
    expect(prisma.client.analyticsEvent.create.mock.calls[0][0].data).toMatchObject({ kind: "page_view", channel: "organic" });
  });

  it("updates counters + un-bounces on a second pageview of an existing session", async () => {
    const prisma = makePrisma();
    prisma.client.analyticsSession.findUnique.mockResolvedValue({
      id: "s1", startedAt: new Date(Date.now() - 20_000), pageviews: 1, eventsCount: 1,
    });
    const svc = await makeService(prisma);

    await svc.ingest(ev({ kind: "page_view", path: "/en/products" }), ctx);

    const upd = prisma.client.analyticsSession.update.mock.calls[0][0];
    expect(upd.where).toEqual({ id: "s1" });
    expect(upd.data).toMatchObject({ pageviews: 2, eventsCount: 2, exitPath: "/en/products", bounced: false });
    expect(upd.data.durationSec).toBeGreaterThanOrEqual(19);
  });

  it("never throws when a prisma write rejects (fire-and-forget)", async () => {
    const prisma = makePrisma();
    prisma.client.analyticsSession.findUnique.mockRejectedValue(new Error("db down"));
    const svc = await makeService(prisma);
    await expect(svc.ingest(ev(), ctx)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 6: Implement `ingest.service.ts`**

Create `apps/api/src/analytics/ingest.service.ts`:

```ts
// apps/api/src/analytics/ingest.service.ts
import { Injectable } from "@nestjs/common";
import type { CollectEvent } from "@signex/shared";
import { PrismaService } from "../prisma/prisma.service";
import { classifyChannel, parseDevice, parseBrowser, parseOs } from "./enrich";

export interface IngestCtx {
  ip: string | null;
  ua: string | undefined;
  country: string | null;
}

@Injectable()
export class IngestService {
  constructor(private readonly prisma: PrismaService) {}

  /** Enrich, sessionize (upsert), and store one event. Never throws — the ingest
   *  endpoint is fire-and-forget and must not surface DB errors to the beacon. */
  async ingest(input: CollectEvent, ctx: IngestCtx): Promise<void> {
    try {
      const channel = classifyChannel(input.referrer, input);
      const device = parseDevice(ctx.ua);
      const browser = parseBrowser(ctx.ua) ?? null;
      const os = parseOs(ctx.ua) ?? null;
      const now = new Date();

      const existing = await this.prisma.client.analyticsSession.findUnique({
        where: { id: input.sessionId },
      });

      if (!existing) {
        await this.prisma.client.analyticsSession.create({
          data: {
            id: input.sessionId,
            visitorId: input.visitorId,
            startedAt: now,
            lastSeenAt: now,
            entryPath: input.path,
            exitPath: input.path,
            referrer: input.referrer ?? null,
            channel,
            utmSource: input.utmSource ?? null,
            utmMedium: input.utmMedium ?? null,
            utmCampaign: input.utmCampaign ?? null,
            country: ctx.country,
            device,
            browser,
            os,
            lang: input.lang ?? null,
            pageviews: input.kind === "page_view" ? 1 : 0,
            eventsCount: 1,
            bounced: true,
            durationSec: 0,
          },
        });
      } else {
        const durationSec = Math.max(0, Math.floor((now.getTime() - existing.startedAt.getTime()) / 1000));
        const pageviews = existing.pageviews + (input.kind === "page_view" ? 1 : 0);
        // engaged (not bounced) = 2+ pageviews OR a CTA click OR >=10s on site
        const bounced = !(pageviews > 1 || input.kind === "cta_click" || durationSec >= 10);
        await this.prisma.client.analyticsSession.update({
          where: { id: input.sessionId },
          data: {
            lastSeenAt: now,
            exitPath: input.path,
            pageviews,
            eventsCount: existing.eventsCount + 1,
            durationSec,
            bounced,
          },
        });
      }

      await this.prisma.client.analyticsEvent.create({
        data: {
          occurredAt: now,
          visitorId: input.visitorId,
          sessionId: input.sessionId,
          kind: input.kind,
          path: input.path,
          title: input.title ?? null,
          referrer: input.referrer ?? null,
          utmSource: input.utmSource ?? null,
          utmMedium: input.utmMedium ?? null,
          utmCampaign: input.utmCampaign ?? null,
          utmTerm: input.utmTerm ?? null,
          utmContent: input.utmContent ?? null,
          channel,
          country: ctx.country,
          device,
          browser,
          os,
          lang: input.lang ?? null,
          catalogSlug: input.catalogSlug ?? null,
          productSlug: input.productSlug ?? null,
          meta: (input.meta ?? undefined) as object | undefined,
        },
      });
    } catch {
      // fire-and-forget: swallow (a dropped analytics write must not 500 the beacon)
    }
  }
}
```

- [ ] **Step 7: Run the ingest test to confirm it passes**

Run: `npm run test -w @signex/api -- ingest.service`
Expected: PASS (3 tests).

- [ ] **Step 8: Write the failing controller test**

Create `apps/api/src/analytics/collect.controller.spec.ts`:

```ts
import { CollectController } from "./collect.controller";
import type { CollectEvent } from "@signex/shared";

describe("CollectController", () => {
  it("extracts ip (first x-forwarded-for), ua and country header, delegates to ingest, returns 204", async () => {
    const ingest = { ingest: jest.fn().mockResolvedValue(undefined) };
    const ctrl = new CollectController(ingest as never);
    const body: CollectEvent = { visitorId: "v1", sessionId: "s1", kind: "page_view", path: "/en" };
    const req = {
      headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1", "user-agent": "jest-ua", "x-country": "VN" },
      ip: "127.0.0.1",
    };
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };

    await ctrl.collect(body, req as never, res as never);

    expect(ingest.ingest).toHaveBeenCalledWith(body, { ip: "9.9.9.9", ua: "jest-ua", country: "VN" });
    expect(res.status).toHaveBeenCalledWith(204);
  });
});
```

- [ ] **Step 9: Implement `collect.controller.ts`**

Create `apps/api/src/analytics/collect.controller.ts`:

```ts
// apps/api/src/analytics/collect.controller.ts
import { Body, Controller, Post, Req, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { collectEventSchema, type CollectEvent } from "@signex/shared";
import { Public } from "../common/decorators";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { IngestService } from "./ingest.service";

@Controller("collect")
export class CollectController {
  constructor(private readonly ingest: IngestService) {}

  // Public ingest. @Public() exempts origin/authn/authz but NOT the throttler,
  // so set a generous per-IP limit for a chatty beacon endpoint.
  @Post()
  @Public()
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  async collect(
    @Body(new ZodValidationPipe(collectEventSchema)) body: CollectEvent,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const xff = req.headers["x-forwarded-for"] as string | undefined;
    const ip = xff?.split(",")[0]?.trim() ?? req.ip ?? null;
    const ua = req.headers["user-agent"] as string | undefined;
    // Country hint set by the web BFF from cf-ipcountry (prod behind Cloudflare); null in dev.
    const countryHeader = (req.headers["x-country"] as string | undefined)?.trim();
    const country = countryHeader && countryHeader !== "XX" ? countryHeader.toUpperCase() : null;
    await this.ingest.ingest(body, { ip, ua, country });
    res.status(204).send();
  }
}
```

- [ ] **Step 10: Create the module + register it**

Create `apps/api/src/analytics/analytics.module.ts`:

```ts
// apps/api/src/analytics/analytics.module.ts
import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { CollectController } from "./collect.controller";
import { IngestService } from "./ingest.service";

@Module({
  imports: [PrismaModule],
  controllers: [CollectController],
  providers: [IngestService],
  exports: [IngestService],
})
export class AnalyticsModule {}
```

In `apps/api/src/app.module.ts`, import it and add `AnalyticsModule` to the `imports` array (next to `SiteConfigModule`):

```ts
import { AnalyticsModule } from "./analytics/analytics.module";
// ...
imports: [
  // ...existing modules...
  SiteConfigModule,
  AnalyticsModule,
],
```

- [ ] **Step 11: Run all analytics API tests + build**

Run: `npm run test -w @signex/api -- analytics && npm run build -w @signex/api`
Expected: enrich, ingest.service, collect.controller specs PASS; `nest build` exits 0.

- [ ] **Step 12: Commit**

```bash
git add apps/api/src/analytics/enrich.ts apps/api/src/analytics/enrich.spec.ts apps/api/src/analytics/ingest.service.ts apps/api/src/analytics/ingest.service.spec.ts apps/api/src/analytics/collect.controller.ts apps/api/src/analytics/collect.controller.spec.ts apps/api/src/analytics/analytics.module.ts apps/api/src/app.module.ts
git commit -m "$(printf 'feat(api): analytics ingest — POST /api/collect + enrichment + sessionization\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01W43GcnR1BXH9qm8TLt4DJ6')"
```

---

## Task 4: API query endpoints — `GET /api/analytics/*`

**Files:**
- Create: `apps/api/src/analytics/query.service.ts`
- Create: `apps/api/src/analytics/query.service.spec.ts`
- Create: `apps/api/src/analytics/analytics.controller.ts`
- Modify: `apps/api/src/analytics/analytics.module.ts` (add controller + service)

**Interfaces:**
- Consumes: `PrismaService`; DTO types from `@signex/shared`.
- Produces: `QueryService` methods `overview/timeseries/topPages/sources/catalog/funnel/realtime`; routes `GET /api/analytics/{overview,timeseries,top-pages,sources,catalog,funnel,realtime}`. Consumed by Task 7 (`apps/admin/app/lib/analytics.ts`).

Range parsing: every list endpoint takes `?from=<ISO>&to=<ISO>`. A helper clamps/parses them.

- [ ] **Step 1: Write the failing query-service test**

Create `apps/api/src/analytics/query.service.spec.ts`. It mocks `prisma.client` methods used by `overview` and asserts the KPI math (visitors/pageviews from events, bounce/duration from sessions, leads from formSubmission, conversionRate):

```ts
import { Test } from "@nestjs/testing";
import { QueryService } from "./query.service";
import { PrismaService } from "../prisma/prisma.service";

function prismaFor(overview: {
  visitors: number; sessions: number; pageviews: number;
  sessionAgg: { _avg: { durationSec: number | null }; _count: number };
  bounced: number; leads: number;
}) {
  return {
    client: {
      analyticsEvent: {
        findMany: jest.fn().mockResolvedValue(
          Array.from({ length: overview.visitors }, (_, i) => ({ visitorId: `v${i}` })),
        ),
        count: jest.fn().mockResolvedValue(overview.pageviews),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      analyticsSession: {
        // order-independent: overview() runs kpis(current)+kpis(previous) concurrently,
        // so key the count on the `where` arg (bounced vs total) rather than call order.
        count: jest.fn().mockImplementation((args: { where?: { bounced?: boolean } }) =>
          Promise.resolve(args?.where?.bounced === true ? overview.bounced : overview.sessions),
        ),
        aggregate: jest.fn().mockResolvedValue(overview.sessionAgg),
      },
      formSubmission: { count: jest.fn().mockResolvedValue(overview.leads) },
    },
  };
}

async function make(prisma: unknown) {
  const mod = await Test.createTestingModule({
    providers: [QueryService, { provide: PrismaService, useValue: prisma }],
  }).compile();
  return mod.get(QueryService);
}

describe("QueryService.overview", () => {
  it("computes KPIs from events + sessions + leads", async () => {
    const prisma = prismaFor({
      visitors: 8, sessions: 10, pageviews: 25,
      sessionAgg: { _avg: { durationSec: 42 }, _count: 10 },
      bounced: 4, leads: 2,
    });
    // previous-period call reuses the same mocks (returns the same numbers); we assert `current`.
    const svc = await make(prisma);
    const res = await svc.overview({ from: "2026-06-01T00:00:00.000Z", to: "2026-06-08T00:00:00.000Z" });
    expect(res.current.visitors).toBe(8);
    expect(res.current.pageviews).toBe(25);
    expect(res.current.sessions).toBe(10);
    expect(res.current.avgSessionSec).toBe(42);
    expect(res.current.bounceRate).toBeCloseTo(0.4, 5);
    expect(res.current.leads).toBe(2);
    expect(res.current.conversionRate).toBeCloseTo(0.2, 5);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test -w @signex/api -- query.service`
Expected: FAIL — `Cannot find module "./query.service"`.

- [ ] **Step 3: Implement `query.service.ts`**

Create `apps/api/src/analytics/query.service.ts`. Uses `groupBy`/`count`/`aggregate` for portability (the spec's "query-on-read"); the per-minute realtime buckets are built in JS from a small `findMany`:

```ts
// apps/api/src/analytics/query.service.ts
import { Injectable } from "@nestjs/common";
import type {
  OverviewResponse, OverviewKpis, TimeseriesPoint, TopPage,
  SourcesResponse, CatalogInsightsResponse, FunnelResponse, RealtimeResponse,
  Channel, ChannelStat, CampaignStat, CatalogStat,
} from "@signex/shared";
import { PrismaService } from "../prisma/prisma.service";

export interface Range { from: string; to: string; }

function bounds(r: Range): { gte: Date; lt: Date } {
  return { gte: new Date(r.from), lt: new Date(r.to) };
}
function prevRange(r: Range): Range {
  const from = new Date(r.from).getTime();
  const to = new Date(r.to).getTime();
  const span = to - from;
  return { from: new Date(from - span).toISOString(), to: new Date(from).toISOString() };
}

@Injectable()
export class QueryService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(r: Range): Promise<OverviewResponse> {
    const [current, previous] = await Promise.all([this.kpis(r), this.kpis(prevRange(r))]);
    return { current, previous };
  }

  private async kpis(r: Range): Promise<OverviewKpis> {
    const occurredAt = bounds(r);
    const startedAt = bounds(r);
    const c = this.prisma.client;
    const [visitorRows, pageviews, sessions, bounced, agg, leads] = await Promise.all([
      c.analyticsEvent.findMany({ where: { occurredAt }, distinct: ["visitorId"], select: { visitorId: true } }),
      c.analyticsEvent.count({ where: { occurredAt, kind: "page_view" } }),
      c.analyticsSession.count({ where: { startedAt } }),
      c.analyticsSession.count({ where: { startedAt, bounced: true } }),
      c.analyticsSession.aggregate({ where: { startedAt }, _avg: { durationSec: true } }),
      c.formSubmission.count({ where: { createdAt: startedAt } }),
    ]);
    const visitors = visitorRows.length;
    return {
      visitors,
      sessions,
      pageviews,
      avgSessionSec: Math.round(agg._avg.durationSec ?? 0),
      bounceRate: sessions ? bounced / sessions : 0,
      leads,
      conversionRate: sessions ? leads / sessions : 0,
    };
  }

  async timeseries(r: Range, metric: "sessions" | "visitors" | "pageviews", interval: "day" | "hour"): Promise<TimeseriesPoint[]> {
    // Pull the minimal columns and bucket in JS (portable, no raw SQL / tz surprises).
    const occurredAt = bounds(r);
    const rows = await this.prisma.client.analyticsEvent.findMany({
      where: metric === "pageviews" ? { occurredAt, kind: "page_view" } : { occurredAt },
      select: { occurredAt: true, visitorId: true, sessionId: true },
      orderBy: { occurredAt: "asc" },
    });
    const buckets = new Map<string, Set<string> | number>();
    const keyFor = (d: Date) =>
      interval === "hour" ? d.toISOString().slice(0, 13) + ":00:00.000Z" : d.toISOString().slice(0, 10);
    for (const row of rows) {
      const k = keyFor(row.occurredAt);
      if (metric === "pageviews") {
        buckets.set(k, ((buckets.get(k) as number) ?? 0) + 1);
      } else {
        const set = (buckets.get(k) as Set<string>) ?? new Set<string>();
        set.add(metric === "visitors" ? row.visitorId : row.sessionId);
        buckets.set(k, set);
      }
    }
    return [...buckets.entries()]
      .map(([bucket, v]) => ({ bucket, value: typeof v === "number" ? v : v.size }))
      .sort((a, b) => a.bucket.localeCompare(b.bucket));
  }

  async topPages(r: Range, limit = 10): Promise<TopPage[]> {
    const occurredAt = bounds(r);
    const rows = await this.prisma.client.analyticsEvent.findMany({
      where: { occurredAt, kind: "page_view" },
      select: { path: true, visitorId: true },
    });
    const map = new Map<string, { pageviews: number; visitors: Set<string> }>();
    for (const row of rows) {
      const e = map.get(row.path) ?? { pageviews: 0, visitors: new Set<string>() };
      e.pageviews += 1;
      e.visitors.add(row.visitorId);
      map.set(row.path, e);
    }
    return [...map.entries()]
      .map(([path, e]) => ({ path, pageviews: e.pageviews, visitors: e.visitors.size }))
      .sort((a, b) => b.pageviews - a.pageviews)
      .slice(0, limit);
  }

  async sources(r: Range): Promise<SourcesResponse> {
    const startedAt = bounds(r);
    const sessions = await this.prisma.client.analyticsSession.findMany({
      where: { startedAt },
      select: { channel: true, utmCampaign: true, referrer: true, converted: true },
    });
    const chan = new Map<string, ChannelStat>();
    const camp = new Map<string, CampaignStat>();
    const ref = new Map<string, number>();
    for (const s of sessions) {
      const ch = chan.get(s.channel) ?? { channel: s.channel as Channel, sessions: 0, leads: 0 };
      ch.sessions += 1;
      if (s.converted) ch.leads += 1;
      chan.set(s.channel, ch);
      if (s.utmCampaign) {
        const cm = camp.get(s.utmCampaign) ?? { campaign: s.utmCampaign, sessions: 0, leads: 0 };
        cm.sessions += 1;
        if (s.converted) cm.leads += 1;
        camp.set(s.utmCampaign, cm);
      }
      if (s.referrer) {
        try {
          const host = new URL(s.referrer).host;
          ref.set(host, (ref.get(host) ?? 0) + 1);
        } catch { /* ignore unparseable referrer */ }
      }
    }
    return {
      channels: [...chan.values()].sort((a, b) => b.sessions - a.sessions),
      campaigns: [...camp.values()].sort((a, b) => b.sessions - a.sessions).slice(0, 20),
      referrers: [...ref.entries()].map(([referrer, sessions]) => ({ referrer, sessions }))
        .sort((a, b) => b.sessions - a.sessions).slice(0, 10),
    };
  }

  async catalog(r: Range): Promise<CatalogInsightsResponse> {
    const occurredAt = bounds(r);
    const [rows, ctaClicks] = await Promise.all([
      this.prisma.client.analyticsEvent.findMany({
        where: { occurredAt, kind: { in: ["category_view", "product_view"] } },
        select: { kind: true, catalogSlug: true, productSlug: true, visitorId: true },
      }),
      this.prisma.client.analyticsEvent.count({ where: { occurredAt, kind: "cta_click" } }),
    ]);
    const roll = (pick: (row: (typeof rows)[number]) => string | null) => {
      const m = new Map<string, { views: number; visitors: Set<string> }>();
      for (const row of rows) {
        const slug = pick(row);
        if (!slug) continue;
        const e = m.get(slug) ?? { views: 0, visitors: new Set<string>() };
        e.views += 1;
        e.visitors.add(row.visitorId);
        m.set(slug, e);
      }
      return [...m.entries()].map(([slug, e]): CatalogStat => ({ slug, views: e.views, visitors: e.visitors.size }))
        .sort((a, b) => b.views - a.views).slice(0, 10);
    };
    return {
      categories: roll((row) => (row.kind === "category_view" ? row.catalogSlug : null)),
      products: roll((row) => (row.kind === "product_view" ? row.productSlug : null)),
      ctaClicks,
    };
  }

  async funnel(r: Range): Promise<FunnelResponse> {
    const occurredAt = bounds(r);
    const startedAt = bounds(r);
    const c = this.prisma.client;
    const [visits, productViewers, ctaSessions, leadRows] = await Promise.all([
      c.analyticsSession.count({ where: { startedAt } }),
      c.analyticsEvent.findMany({ where: { occurredAt, kind: "product_view" }, distinct: ["sessionId"], select: { sessionId: true } }),
      c.analyticsEvent.findMany({ where: { occurredAt, kind: "cta_click" }, distinct: ["sessionId"], select: { sessionId: true } }),
      c.formSubmission.findMany({ where: { createdAt: startedAt }, select: { sessionId: true } }),
    ]);
    const leads = leadRows.length;
    const first = visits || 1;
    const stages = [
      { stage: "Visit", count: visits },
      { stage: "Product view", count: productViewers.length },
      { stage: "Quote CTA", count: ctaSessions.length },
      { stage: "Lead", count: leads },
    ].map((s) => ({ ...s, pct: s.count / first }));

    // attribution: leads by the channel of their session
    const leadSessionIds = leadRows.map((l) => l.sessionId).filter((x): x is string => !!x);
    const leadSessions = leadSessionIds.length
      ? await c.analyticsSession.findMany({ where: { id: { in: leadSessionIds } }, select: { channel: true } })
      : [];
    const byChannel = new Map<string, number>();
    for (const s of leadSessions) byChannel.set(s.channel, (byChannel.get(s.channel) ?? 0) + 1);
    const attribution = [...byChannel.entries()].map(([key, leads]) => ({ key, leads }))
      .sort((a, b) => b.leads - a.leads);
    return { stages, attribution };
  }

  async realtime(): Promise<RealtimeResponse> {
    const now = Date.now();
    const c = this.prisma.client;
    const [events, leads] = await Promise.all([
      c.analyticsEvent.findMany({
        where: { occurredAt: { gte: new Date(now - 30 * 60_000) } },
        select: { kind: true, path: true, occurredAt: true, visitorId: true },
        orderBy: { occurredAt: "desc" },
      }),
      c.formSubmission.findMany({
        where: { createdAt: { gte: new Date(now - 30 * 60_000) } },
        select: { createdAt: true, formKey: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    const active = new Set(events.filter((e) => e.occurredAt.getTime() >= now - 5 * 60_000).map((e) => e.visitorId));
    // per-minute pageview buckets for the last 30 minutes
    const perMinute: TimeseriesPoint[] = [];
    for (let i = 29; i >= 0; i--) {
      const lo = now - (i + 1) * 60_000;
      const hi = now - i * 60_000;
      const count = events.filter((e) => e.kind === "page_view" && e.occurredAt.getTime() >= lo && e.occurredAt.getTime() < hi).length;
      perMinute.push({ bucket: new Date(hi).toISOString().slice(11, 16), value: count });
    }
    const pageTop = new Map<string, { pageviews: number; visitors: Set<string> }>();
    for (const e of events) {
      if (e.kind !== "page_view") continue;
      const x = pageTop.get(e.path) ?? { pageviews: 0, visitors: new Set<string>() };
      x.pageviews += 1;
      x.visitors.add(e.visitorId);
      pageTop.set(e.path, x);
    }
    const topPages: TopPage[] = [...pageTop.entries()]
      .map(([path, x]) => ({ path, pageviews: x.pageviews, visitors: x.visitors.size }))
      .sort((a, b) => b.pageviews - a.pageviews).slice(0, 8);
    const recent = [
      ...events.slice(0, 20).map((e) => ({ kind: e.kind as never, path: e.path, occurredAt: e.occurredAt.toISOString() })),
      ...leads.map((l) => ({ kind: "lead" as const, path: `/${l.formKey}`, occurredAt: l.createdAt.toISOString() })),
    ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 20);
    return { activeVisitors: active.size, perMinute, topPages, recent };
  }
}
```

- [ ] **Step 4: Run the query-service test to confirm it passes**

Run: `npm run test -w @signex/api -- query.service`
Expected: PASS.

- [ ] **Step 5: Implement `analytics.controller.ts`**

Create `apps/api/src/analytics/analytics.controller.ts`. A tiny helper turns `?from&to` into a validated `Range`, defaulting to the last 30 days:

```ts
// apps/api/src/analytics/analytics.controller.ts
import { Controller, Get, Query } from "@nestjs/common";
import { Roles } from "../common/decorators";
import { QueryService, type Range } from "./query.service";

function parseRange(from?: string, to?: string): Range {
  const now = Date.now();
  const toMs = to ? Date.parse(to) : now;
  const fromMs = from ? Date.parse(from) : now - 30 * 24 * 60 * 60 * 1000;
  const safeTo = Number.isFinite(toMs) ? toMs : now;
  const safeFrom = Number.isFinite(fromMs) && fromMs < safeTo ? fromMs : safeTo - 30 * 24 * 60 * 60 * 1000;
  return { from: new Date(safeFrom).toISOString(), to: new Date(safeTo).toISOString() };
}

@Controller("analytics")
export class AnalyticsController {
  constructor(private readonly query: QueryService) {}

  @Get("overview")
  @Roles("EDITOR")
  overview(@Query("from") from?: string, @Query("to") to?: string) {
    return this.query.overview(parseRange(from, to));
  }

  @Get("timeseries")
  @Roles("EDITOR")
  timeseries(
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("metric") metric?: string,
    @Query("interval") interval?: string,
  ) {
    const m = metric === "visitors" || metric === "pageviews" ? metric : "sessions";
    const iv = interval === "hour" ? "hour" : "day";
    return this.query.timeseries(parseRange(from, to), m, iv);
  }

  @Get("top-pages")
  @Roles("EDITOR")
  topPages(@Query("from") from?: string, @Query("to") to?: string, @Query("limit") limit?: string) {
    return this.query.topPages(parseRange(from, to), limit ? Math.min(50, Math.max(1, parseInt(limit, 10) || 10)) : 10);
  }

  @Get("sources")
  @Roles("EDITOR")
  sources(@Query("from") from?: string, @Query("to") to?: string) {
    return this.query.sources(parseRange(from, to));
  }

  @Get("catalog")
  @Roles("EDITOR")
  catalog(@Query("from") from?: string, @Query("to") to?: string) {
    return this.query.catalog(parseRange(from, to));
  }

  @Get("funnel")
  @Roles("EDITOR")
  funnel(@Query("from") from?: string, @Query("to") to?: string) {
    return this.query.funnel(parseRange(from, to));
  }

  @Get("realtime")
  @Roles("EDITOR")
  realtime() {
    return this.query.realtime();
  }
}
```

- [ ] **Step 6: Wire the controller + service into the module**

In `apps/api/src/analytics/analytics.module.ts`, add the query controller + service:

```ts
import { AnalyticsController } from "./analytics.controller";
import { QueryService } from "./query.service";
// ...
@Module({
  imports: [PrismaModule],
  controllers: [CollectController, AnalyticsController],
  providers: [IngestService, QueryService],
  exports: [IngestService],
})
export class AnalyticsModule {}
```

- [ ] **Step 7: Run the analytics tests + build**

Run: `npm run test -w @signex/api -- analytics && npm run build -w @signex/api`
Expected: all analytics specs PASS; `nest build` exits 0.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/analytics/query.service.ts apps/api/src/analytics/query.service.spec.ts apps/api/src/analytics/analytics.controller.ts apps/api/src/analytics/analytics.module.ts
git commit -m "$(printf 'feat(api): analytics query endpoints (overview/timeseries/sources/catalog/funnel/realtime)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01W43GcnR1BXH9qm8TLt4DJ6')"
```

---

## Task 5: API — lead attribution (persist sessionId/visitorId on submit)

**Files:**
- Modify: `apps/api/src/forms/dto/forms.dto.ts` (add 2 optional fields to `submitSchema`)
- Modify: `apps/api/src/forms/forms.service.ts` (persist + flip session.converted)
- Modify: `apps/api/src/forms/forms.service.spec.ts` (or add) — assert persistence + converted flip

**Interfaces:**
- Consumes: `FormSubmission.sessionId/visitorId` (Task 1), `AnalyticsSession` (Task 1).
- Produces: submitted leads carry `sessionId`/`visitorId`; the matching `AnalyticsSession.converted` is set true. Consumed by Task 4's `sources`/`funnel`/`kpis(leads)` and Task 7.

- [ ] **Step 1: Extend the submit schema**

In `apps/api/src/forms/dto/forms.dto.ts`, add to the `submitSchema` object (they arrive from the web form; unknown extra keys are stripped by zod so they MUST be declared here to survive):

```ts
export const submitSchema = z.object({
  // ...existing fields (name, email, phone?, message?, ...)...
  visitorId: z.string().max(64).optional(),
  sessionId: z.string().max(64).optional(),
});
```

- [ ] **Step 2: Write the failing service test**

Add to `apps/api/src/forms/forms.service.spec.ts` (create the file if absent, mirroring the site-config spec's mocked-prisma pattern). The prisma mock needs `formSubmission.create` and `analyticsSession.updateMany`:

```ts
import { Test } from "@nestjs/testing";
import { FormsService } from "./forms.service";
import { PrismaService } from "../prisma/prisma.service";

function makePrisma() {
  return {
    client: {
      formSubmission: { create: jest.fn().mockResolvedValue({ id: "lead1" }), count: jest.fn().mockResolvedValue(0) },
      analyticsSession: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    },
  };
}

async function make(prisma: ReturnType<typeof makePrisma>) {
  // AssetsService (if injected) can be a no-op mock; include only if FormsService requires it.
  const mod = await Test.createTestingModule({
    providers: [FormsService, { provide: PrismaService, useValue: prisma }],
  }).compile();
  return mod.get(FormsService);
}

describe("FormsService.submit — attribution", () => {
  it("persists sessionId/visitorId and flips the session to converted", async () => {
    const prisma = makePrisma();
    const svc = await make(prisma);
    await svc.submit("contact", { name: "A", email: "a@b.co", sessionId: "s1", visitorId: "v1" } as never, null, "1.2.3.4", "ua");
    const data = prisma.client.formSubmission.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ sessionId: "s1", visitorId: "v1" });
    expect(prisma.client.analyticsSession.updateMany).toHaveBeenCalledWith({ where: { id: "s1" }, data: { converted: true } });
  });

  it("omits the converted flip when no sessionId is provided", async () => {
    const prisma = makePrisma();
    const svc = await make(prisma);
    await svc.submit("contact", { name: "A", email: "a@b.co" } as never, null, null, null);
    expect(prisma.client.analyticsSession.updateMany).not.toHaveBeenCalled();
  });
});
```

> Note: if `FormsService`'s real constructor injects additional providers (e.g. an assets service), add matching `useValue` mocks — inspect `forms.service.ts` and mirror the existing `forms.service.spec.ts` provider list if one exists.

- [ ] **Step 3: Run it to confirm it fails**

Run: `npm run test -w @signex/api -- forms.service`
Expected: FAIL — `sessionId`/`visitorId` not on the created row / `updateMany` not called.

- [ ] **Step 4: Persist + attribute in the service**

In `apps/api/src/forms/forms.service.ts`, destructure the two attribution ids out of the parsed body so they land in their own columns (not duplicated inside the `payload` JSON blob), then after a successful create flip the session (use `updateMany` so a missing session row is a no-op, never a throw):

```ts
const { sessionId, visitorId, ...rest } = payload; // payload is the zod-parsed SubmitInput
const created = await this.prisma.client.formSubmission.create({
  data: {
    formKey: formKey as FormKey,
    payload: rest as object,
    uploadAssetId,
    ip,
    userAgent,
    flagged,
    sessionId: sessionId ?? null,
    visitorId: visitorId ?? null,
  },
});
if (sessionId) {
  await this.prisma.client.analyticsSession
    .updateMany({ where: { id: sessionId }, data: { converted: true } })
    .catch(() => undefined);
}
return { ok: true };
```

> Integrate this into the existing `submit()` body: keep the current `flagged` computation and `uploadAssetId` resolution (they run before this create), and only the `create({ data })` call + the post-create session flip change. If `flagged` is derived from `payload` fields (name/email), those remain in `rest`, so its logic is unaffected.

- [ ] **Step 5: Run the test to confirm it passes**

Run: `npm run test -w @signex/api -- forms.service`
Expected: PASS (both cases).

- [ ] **Step 6: Full API test + build**

Run: `npm run test -w @signex/api && npm run build -w @signex/api`
Expected: all specs PASS; build exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/forms/dto/forms.dto.ts apps/api/src/forms/forms.service.ts apps/api/src/forms/forms.service.spec.ts
git commit -m "$(printf 'feat(api): attribute leads — persist sessionId/visitorId + mark session converted\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01W43GcnR1BXH9qm8TLt4DJ6')"
```

---

## Task 6: Web — tracker, BFF route, layout mount, catalog + form instrumentation

**Files:**
- Create: `apps/web/app/lib/analytics/tracker.ts`
- Create: `apps/web/app/lib/analytics/tracker.test.mjs`
- Create: `apps/web/app/components/analytics.tsx`
- Create: `apps/web/app/components/analytics-view.tsx`
- Create: `apps/web/app/api/collect/route.ts`
- Modify: `apps/web/app/[lang]/layout.tsx` (mount `<Analytics/>`)
- Modify: `apps/web/app/[lang]/products/[slug]/page.tsx` (mount `category_view`)
- Modify: `apps/web/app/[lang]/products/[slug]/[product]/page.tsx` (mount `product_view`)
- Modify: `apps/web/app/api/forms/[formKey]/submit/route.ts` (preserve `sessionId`/`visitorId` casing)
- Modify: `apps/web/app/components/static-webflow-form.tsx` (hidden attribution fields)
- Modify: `apps/web/app/components/home/hero-quote-form.tsx` (hidden attribution fields)
- Append: the new test to the `apps/web` `test` script chain (`apps/web/package.json`)

**Interfaces:**
- Consumes: `POST /api/collect` (BFF → `${API_URL}/api/collect`, Task 3); `/api/forms/:formKey/submit` (Task 5).
- Produces: `track(kind, opts)`, `getAnalyticsIds()` (`tracker.ts`); `<Analytics/>`, `<AnalyticsView/>` components.

> Per `apps/web/AGENTS.md`: this Next.js (16.2) diverges from training data — before editing route handlers / server components, skim `node_modules/next/dist/docs/`. `DEFAULT_LOCALE` is **vi**. Client `fetch`es hit same-origin `/api/...`.

- [ ] **Step 1: Implement the tracker module**

Create `apps/web/app/lib/analytics/tracker.ts`:

```ts
// apps/web/app/lib/analytics/tracker.ts
// First-party analytics tracker (browser-only). Fire-and-forget beacons to the
// same-origin BFF route /api/collect. Never throws into the page.
import type { EventKind } from "@signex/shared";

const VID_COOKIE = "sx_vid";
const SID_KEY = "sx_sid";
const SID_TS_KEY = "sx_sid_ts";
const SESSION_GAP_MS = 30 * 60 * 1000;
const COLLECT_URL = "/api/collect";

function uuid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  }
}

function readCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function getVisitorId(): string {
  let vid = readCookie(VID_COOKIE);
  if (!vid) {
    vid = uuid();
    const oneYear = 60 * 60 * 24 * 365;
    document.cookie = `${VID_COOKIE}=${encodeURIComponent(vid)}; Max-Age=${oneYear}; Path=/; SameSite=Lax`;
  }
  return vid;
}

function getSessionId(): string {
  const now = Date.now();
  const last = Number(sessionStorage.getItem(SID_TS_KEY) ?? 0);
  let sid = sessionStorage.getItem(SID_KEY);
  if (!sid || now - last > SESSION_GAP_MS) {
    sid = uuid();
    sessionStorage.setItem(SID_KEY, sid);
  }
  sessionStorage.setItem(SID_TS_KEY, String(now));
  return sid;
}

/** Attribution ids for the lead forms (safe to call in the browser). */
export function getAnalyticsIds(): { visitorId: string; sessionId: string } | null {
  try {
    if (typeof window === "undefined") return null;
    return { visitorId: getVisitorId(), sessionId: getSessionId() };
  } catch {
    return null;
  }
}

function parseUtm(): Record<string, string> {
  const p = new URLSearchParams(window.location.search);
  const out: Record<string, string> = {};
  for (const [key, field] of [
    ["utm_source", "utmSource"], ["utm_medium", "utmMedium"], ["utm_campaign", "utmCampaign"],
    ["utm_term", "utmTerm"], ["utm_content", "utmContent"],
  ] as const) {
    const v = p.get(key);
    if (v) out[field] = v;
  }
  return out;
}

export interface TrackOpts {
  catalogSlug?: string;
  productSlug?: string;
  meta?: Record<string, unknown>;
}

export function track(kind: EventKind, opts: TrackOpts = {}): void {
  try {
    if (typeof window === "undefined") return;
    if (navigator.doNotTrack === "1") return; // honor DNT
    const payload = {
      visitorId: getVisitorId(),
      sessionId: getSessionId(),
      kind,
      path: window.location.pathname,
      title: document.title || undefined,
      referrer: document.referrer || undefined,
      ...parseUtm(),
      lang: document.documentElement.lang || undefined,
      ...opts,
    };
    const blob = new Blob([JSON.stringify(payload)], { type: "text/plain" }); // same-origin; text/plain avoids any preflight
    if (typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(COLLECT_URL, blob);
    } else {
      void fetch(COLLECT_URL, { method: "POST", body: blob, keepalive: true }).catch(() => undefined);
    }
  } catch {
    // analytics must never break the page
  }
}
```

- [ ] **Step 2: Write the static-source test (matches the web test convention)**

Create `apps/web/app/lib/analytics/tracker.test.mjs` (the repo's tests are `node --test` static-source assertions, not renders):

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, "tracker.ts"), "utf8");

test("tracker beacons same-origin and is fire-and-forget", () => {
  assert.match(src, /COLLECT_URL = "\/api\/collect"/, "must post to same-origin /api/collect");
  assert.match(src, /sendBeacon/, "must use navigator.sendBeacon");
  assert.match(src, /doNotTrack === "1"/, "must honor DNT");
  assert.match(src, /catch\s*{[^}]*}/, "track() must swallow errors");
});

test("tracker persists identity in cookie + sessionStorage", () => {
  assert.match(src, /sx_vid/, "visitor cookie");
  assert.match(src, /sessionStorage/, "session id in sessionStorage");
  assert.match(src, /SESSION_GAP_MS = 30 \* 60 \* 1000/, "30-min session window");
});
```

In `apps/web/package.json`, append to the `test` script chain (before the closing quote):

```
 && node --test app/lib/analytics/tracker.test.mjs
```

- [ ] **Step 3: Run the test to confirm it passes**

Run: `cd apps/web && node --test app/lib/analytics/tracker.test.mjs`
Expected: 2 tests PASS. (Then `cd -`.)

- [ ] **Step 4: Implement the `<Analytics/>` component**

Create `apps/web/app/components/analytics.tsx`:

```tsx
// app/components/analytics.tsx
"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { track } from "@/app/lib/analytics/tracker";

/** Mounts once in the root layout. Fires page_view on load + every soft nav,
 *  plus delegated scroll-depth / CTA / outbound-click events. */
export function Analytics() {
  const pathname = usePathname();

  useEffect(() => {
    track("page_view");

    let scrolled = false;
    const onScroll = () => {
      if (scrolled) return;
      const doc = document.documentElement;
      const denom = doc.scrollHeight - window.innerHeight;
      if (denom <= 0) return;
      if ((window.scrollY / denom) >= 0.9) {
        scrolled = true;
        track("scroll", { meta: { depth: 90 } });
      }
    };
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest("a,[data-cta]") as HTMLElement | null;
      if (!el) return;
      if (el.hasAttribute("data-cta")) {
        track("cta_click", { meta: { ctaId: el.getAttribute("data-cta") ?? undefined } });
        return;
      }
      if (el instanceof HTMLAnchorElement && el.href) {
        try {
          const u = new URL(el.href);
          if (u.host && u.host !== window.location.host) track("outbound_click", { meta: { href: u.href } });
        } catch {
          /* ignore non-URL href */
        }
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("click", onClick, true);
    };
  }, [pathname]);

  return null;
}
```

- [ ] **Step 5: Implement the catalog-view child + the BFF route**

Create `apps/web/app/components/analytics-view.tsx`:

```tsx
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
```

Create `apps/web/app/api/collect/route.ts`:

```ts
// app/api/collect/route.ts
// Same-origin ingest → forwards to the API server-side (BFF), so the browser
// never talks cross-origin. Always 204; never blocks on the forward.
import type { NextRequest } from "next/server";

const API_URL = process.env.API_URL ?? "http://api:3060";

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const bodyText = await req.text();
    const headers: Record<string, string> = { "content-type": "application/json" };
    const country = req.headers.get("cf-ipcountry");
    if (country) headers["x-country"] = country;
    const xff = req.headers.get("x-forwarded-for");
    if (xff) headers["x-forwarded-for"] = xff;
    const ua = req.headers.get("user-agent");
    if (ua) headers["user-agent"] = ua;
    await fetch(`${API_URL}/api/collect`, { method: "POST", body: bodyText, headers }).catch(() => undefined);
  } catch {
    /* ignore */
  }
  return new Response(null, { status: 204 });
}
```

- [ ] **Step 6: Mount `<Analytics/>` in the layout**

In `apps/web/app/[lang]/layout.tsx`, add the import and mount it next to `<GoogleAnalytics>` (near line 105). Guard it off in the editor preview tree (the preview island renders inert links):

```tsx
import { Analytics } from "@/app/components/analytics";
```

```tsx
        <OrgJsonLd dict={dict} />
        {/* Google Analytics is injected ONLY when a GA4 id is configured (admin → Settings). */}
        {ga4Id ? <GoogleAnalytics gaId={ga4Id} debugMode={gaDebug} /> : null}
        {/* First-party analytics — parallel to GA4; reads its own /api/collect. */}
        <Analytics />
        <PreviewBar />
```

- [ ] **Step 7: Instrument the catalog pages**

In `apps/web/app/[lang]/products/[slug]/page.tsx`, after `const cat = ...; if (!cat) notFound();`, render the view event (import at top). Add near the existing JSX return (any position — it renders nothing):

```tsx
import { AnalyticsView } from "@/app/components/analytics-view";
// ...inside the returned JSX, e.g. right after the opening fragment/element:
<AnalyticsView kind="category_view" catalogSlug={slug} />
```

In `apps/web/app/[lang]/products/[slug]/[product]/page.tsx`, after `const { cat, item } = found;`:

```tsx
import { AnalyticsView } from "@/app/components/analytics-view";
// ...inside the returned JSX:
<AnalyticsView kind="product_view" catalogSlug={slug} productSlug={product} />
```

- [ ] **Step 8: Preserve attribution field casing in the forms BFF route**

In `apps/web/app/api/forms/[formKey]/submit/route.ts`, the handler lowercases every text key (`body.append(key.toLowerCase(), trimmed)`). Keep `sessionId`/`visitorId` verbatim so the API schema (which expects those exact keys) receives them. Change the append to:

```ts
const PRESERVE = new Set(["sessionId", "visitorId"]);
// ...in the entry loop, replacing `body.append(key.toLowerCase(), trimmed)`:
body.append(PRESERVE.has(key) ? key : key.toLowerCase(), trimmed);
```

- [ ] **Step 9: Add hidden attribution fields to both lead forms**

Both are client components. Add ids read on mount and rendered as hidden inputs.

In `apps/web/app/components/static-webflow-form.tsx` (add the import + state, and render the inputs inside the `<form>` before `{children}`):

```tsx
import { getAnalyticsIds } from "@/app/lib/analytics/tracker";
import { useEffect, useState } from "react";
// ...inside the component:
const [ids, setIds] = useState<{ visitorId: string; sessionId: string } | null>(null);
useEffect(() => { setIds(getAnalyticsIds()); }, []);
// ...inside <form ...> before {children}:
{ids && (
  <>
    <input type="hidden" name="visitorId" value={ids.visitorId} />
    <input type="hidden" name="sessionId" value={ids.sessionId} />
  </>
)}
```

In `apps/web/app/components/home/hero-quote-form.tsx`, do the same inside its `<fieldset>` (it already imports `useState`; add `useEffect` + `getAnalyticsIds`).

- [ ] **Step 10: Run web tests + build**

Run: `npm run test -w @signex/web && npm run build -w @signex/web`
Expected: the whole `node --test`/verify chain (incl. the new tracker test) passes; `next build` exits 0.

- [ ] **Step 11: Commit**

```bash
git add apps/web/app/lib/analytics apps/web/app/components/analytics.tsx apps/web/app/components/analytics-view.tsx apps/web/app/api/collect apps/web/app/[lang]/layout.tsx "apps/web/app/[lang]/products/[slug]/page.tsx" "apps/web/app/[lang]/products/[slug]/[product]/page.tsx" "apps/web/app/api/forms/[formKey]/submit/route.ts" apps/web/app/components/static-webflow-form.tsx apps/web/app/components/home/hero-quote-form.tsx apps/web/package.json
git commit -m "$(printf 'feat(web): first-party analytics tracker + BFF collect + catalog/form instrumentation\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01W43GcnR1BXH9qm8TLt4DJ6')"
```

---

## Task 7: Admin — `/analytics` dashboard

**Files:**
- Create: `apps/admin/app/lib/analytics.ts`
- Create: `apps/admin/app/lib/analytics.test.ts`
- Create: `apps/admin/app/(dash)/analytics/page.tsx`
- Create: `apps/admin/app/(dash)/analytics/loading.tsx`
- Create: `apps/admin/components/analytics/range-tabs.tsx`
- Create: `apps/admin/components/analytics/kpi-strip.tsx`
- Create: `apps/admin/components/analytics/traffic-chart.tsx`
- Create: `apps/admin/components/analytics/realtime-card.tsx`
- Create: `apps/admin/components/analytics/bars.tsx`
- Create: `apps/admin/components/analytics/funnel.tsx`
- Create: `apps/admin/components/analytics/tables.tsx`
- Modify: `apps/admin/components/shell/app-sidebar.tsx` (nav entry)

**Interfaces:**
- Consumes: `apiServer` (`app/lib/api.ts`, returns `{ ok, status, data } | { ok:false, ... }`), `requireRole` (`app/lib/session.ts`), the DTO types from `@signex/shared`, formatters from `app/lib/format.ts`, `SectionCard`/`PageHeader`/`EmptyState`/`StatusBadge`/table + `Tabs` primitives, and the Recharts recipe in `components/overview/leads-chart.tsx`.
- Produces: the `/analytics` route + nav item.

- [ ] **Step 1: Write the failing aggregator test**

Create `apps/admin/app/lib/analytics.test.ts` (vitest, node env — mirrors `app/lib/api.test.ts`; mocks `apiServer`):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const apiServer = vi.fn();
vi.mock("./api", () => ({ apiServer: (...a: unknown[]) => apiServer(...a) }));

beforeEach(() => apiServer.mockReset());

describe("getAnalyticsData", () => {
  it("fans out to every endpoint with the from/to range and returns the composed model", async () => {
    apiServer.mockImplementation(async (path: string) => {
      if (path.startsWith("/api/analytics/overview")) return { ok: true, status: 200, data: { current: { visitors: 5, sessions: 6, pageviews: 9, avgSessionSec: 30, bounceRate: 0.5, leads: 1, conversionRate: 0.16 }, previous: { visitors: 4, sessions: 5, pageviews: 7, avgSessionSec: 20, bounceRate: 0.6, leads: 0, conversionRate: 0 } } };
      if (path.startsWith("/api/analytics/timeseries")) return { ok: true, status: 200, data: [{ bucket: "2026-06-01", value: 3 }] };
      if (path.startsWith("/api/analytics/top-pages")) return { ok: true, status: 200, data: [{ path: "/en", pageviews: 9, visitors: 5 }] };
      if (path.startsWith("/api/analytics/sources")) return { ok: true, status: 200, data: { channels: [], campaigns: [], referrers: [] } };
      if (path.startsWith("/api/analytics/catalog")) return { ok: true, status: 200, data: { categories: [], products: [], ctaClicks: 2 } };
      if (path.startsWith("/api/analytics/funnel")) return { ok: true, status: 200, data: { stages: [], attribution: [] } };
      return { ok: false, status: 500, error: "unexpected" };
    });

    const { getAnalyticsData } = await import("./analytics");
    const data = await getAnalyticsData({ from: "2026-06-01T00:00:00.000Z", to: "2026-06-08T00:00:00.000Z" });

    expect(data.overview.current.visitors).toBe(5);
    expect(data.timeseries[0].value).toBe(3);
    expect(data.topPages[0].path).toBe("/en");
    expect(data.catalog.ctaClicks).toBe(2);
    expect(apiServer).toHaveBeenCalledWith(expect.stringContaining("from=2026-06-01T00%3A00%3A00.000Z"));
  });

  it("degrades each surface to a zeroed fallback when its call fails (never throws)", async () => {
    apiServer.mockResolvedValue({ ok: false, status: 0, error: "down" });
    const { getAnalyticsData } = await import("./analytics");
    const data = await getAnalyticsData({ from: "2026-06-01T00:00:00.000Z", to: "2026-06-08T00:00:00.000Z" });
    expect(data.overview.current.visitors).toBe(0);
    expect(data.timeseries).toEqual([]);
    expect(data.sources.channels).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd apps/admin && npx vitest run app/lib/analytics.test.ts`
Expected: FAIL — `Cannot find module "./analytics"`. (Then `cd -`.)

- [ ] **Step 3: Implement the aggregator**

Create `apps/admin/app/lib/analytics.ts` (server-only; `Promise.all`, each `.ok`-gated fallback — mirrors `app/lib/overview.ts`):

```ts
// apps/admin/app/lib/analytics.ts
import "server-only";
import { apiServer } from "./api";
import type {
  OverviewResponse, TimeseriesPoint, TopPage, SourcesResponse,
  CatalogInsightsResponse, FunnelResponse,
} from "@signex/shared";

export interface AnalyticsRange { from: string; to: string; }

export interface AnalyticsData {
  overview: OverviewResponse;
  timeseries: TimeseriesPoint[];
  topPages: TopPage[];
  sources: SourcesResponse;
  catalog: CatalogInsightsResponse;
  funnel: FunnelResponse;
}

const ZERO_KPIS = { visitors: 0, sessions: 0, pageviews: 0, avgSessionSec: 0, bounceRate: 0, leads: 0, conversionRate: 0 };
const EMPTY_OVERVIEW: OverviewResponse = { current: ZERO_KPIS, previous: ZERO_KPIS };

/** Resolve a `?range=7|30|90` day preset to an explicit from/to window (UTC). */
export function rangeFromPreset(days: number): AnalyticsRange {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

export async function getAnalyticsData(range: AnalyticsRange): Promise<AnalyticsData> {
  const qs = `from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;
  const [overview, timeseries, topPages, sources, catalog, funnel] = await Promise.all([
    apiServer<OverviewResponse>(`/api/analytics/overview?${qs}`),
    apiServer<TimeseriesPoint[]>(`/api/analytics/timeseries?${qs}&metric=sessions&interval=day`),
    apiServer<TopPage[]>(`/api/analytics/top-pages?${qs}&limit=10`),
    apiServer<SourcesResponse>(`/api/analytics/sources?${qs}`),
    apiServer<CatalogInsightsResponse>(`/api/analytics/catalog?${qs}`),
    apiServer<FunnelResponse>(`/api/analytics/funnel?${qs}`),
  ]);
  return {
    overview: overview.ok ? overview.data : EMPTY_OVERVIEW,
    timeseries: timeseries.ok ? timeseries.data : [],
    topPages: topPages.ok ? topPages.data : [],
    sources: sources.ok ? sources.data : { channels: [], campaigns: [], referrers: [] },
    catalog: catalog.ok ? catalog.data : { categories: [], products: [], ctaClicks: 0 },
    funnel: funnel.ok ? funnel.data : { stages: [], attribution: [] },
  };
}
```

- [ ] **Step 4: Run the aggregator test to confirm it passes**

Run: `cd apps/admin && npx vitest run app/lib/analytics.test.ts && cd -`
Expected: PASS (2 tests).

- [ ] **Step 5: Add the sidebar nav entry**

In `apps/admin/components/shell/app-sidebar.tsx`, import a lucide icon (alias to avoid Recharts name clashes) and insert an entry in `NAV_ITEMS` after Overview:

```tsx
import { ChartColumn as AnalyticsIcon } from "lucide-react";
// ...in NAV_ITEMS, after the Overview item:
{ href: "/analytics", label: "Analytics", icon: AnalyticsIcon, match: "/analytics" },
```

- [ ] **Step 6: Build the client sub-components**

Create `apps/admin/components/analytics/range-tabs.tsx` (URL-driven `?range` switch — the `setQuery` idiom):

```tsx
// components/analytics/range-tabs.tsx
"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const PRESETS = [
  { value: "7", label: "7d" },
  { value: "30", label: "30d" },
  { value: "90", label: "90d" },
];

export function RangeTabs({ current }: { current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const setRange = (value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("range", value);
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };
  return (
    <Tabs value={current} onValueChange={setRange}>
      <TabsList className="h-8 bg-muted/60">
        {PRESETS.map((p) => (
          <TabsTrigger key={p.value} value={p.value} className="data-[state=active]:text-primary">
            {p.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
```

Create `apps/admin/components/analytics/kpi-strip.tsx` — the hairline `grid gap-px bg-border` strip (idiom copied from `components/forms/leads-kpi-strip.tsx`), one cell per KPI with a delta chip vs `previous`:

```tsx
// components/analytics/kpi-strip.tsx
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/app/lib/format";
import type { OverviewResponse } from "@signex/shared";

function pct(cur: number, prev: number): number | null {
  if (!prev) return null;
  return (cur - prev) / prev;
}
function Delta({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value === null) return <span className="text-[11px] text-muted-foreground">—</span>;
  const up = value >= 0;
  const good = invert ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-medium", good ? "text-success" : "text-destructive")}>
      <Icon className="size-3" aria-hidden />
      {Math.abs(value * 100).toFixed(0)}%
    </span>
  );
}

export function KpiStrip({ overview }: { overview: OverviewResponse }) {
  const c = overview.current;
  const p = overview.previous;
  const cells: { label: string; value: string; delta: number | null; invert?: boolean }[] = [
    { label: "Visitors", value: formatNumber(c.visitors), delta: pct(c.visitors, p.visitors) },
    { label: "Sessions", value: formatNumber(c.sessions), delta: pct(c.sessions, p.sessions) },
    { label: "Pageviews", value: formatNumber(c.pageviews), delta: pct(c.pageviews, p.pageviews) },
    { label: "Avg session", value: `${c.avgSessionSec}s`, delta: pct(c.avgSessionSec, p.avgSessionSec) },
    { label: "Bounce", value: `${Math.round(c.bounceRate * 100)}%`, delta: pct(c.bounceRate, p.bounceRate), invert: true },
    { label: "Leads", value: formatNumber(c.leads), delta: pct(c.leads, p.leads) },
    { label: "Conversion", value: `${(c.conversionRate * 100).toFixed(1)}%`, delta: pct(c.conversionRate, p.conversionRate) },
  ];
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4 xl:grid-cols-7">
      {cells.map((s) => (
        <div key={s.label} className="bg-card p-4">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{s.label}</dt>
          <dd className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-foreground">{s.value}</dd>
          <div className="mt-1"><Delta value={s.delta} invert={s.invert} /></div>
        </div>
      ))}
    </dl>
  );
}
```

Create `apps/admin/components/analytics/traffic-chart.tsx` — a `"use client"` Recharts `AreaChart`. **Copy the axis/tooltip/gradient recipe verbatim from `components/overview/leads-chart.tsx`**, changing `dataKey="count"` → `dataKey="value"`, `dataKey="date"` → `dataKey="bucket"`, the gradient id to `trafficFill`, and the series prop type to `TimeseriesPoint[]`. Render an `EmptyState` (icon `Activity`) when `series.length < 2`.

Create `apps/admin/components/analytics/bars.tsx` — a token-styled horizontal bar list (no Recharts needed; a div-based bar keeps it accessible + light) used by Sources channels and Catalog:

```tsx
// components/analytics/bars.tsx
import { cn } from "@/lib/utils";
import { formatNumber } from "@/app/lib/format";

export interface BarRow { label: string; value: number; href?: string; }

export function BarList({ rows, unit = "" }: { rows: BarRow[]; unit?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted-foreground">Chưa có dữ liệu</p>;
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.label} className="relative flex items-center justify-between gap-3 rounded-md px-2 py-1.5">
          <span className="absolute inset-y-0 left-0 rounded-md bg-primary/8" style={{ width: `${(r.value / max) * 100}%` }} aria-hidden />
          <span className={cn("relative truncate text-sm text-foreground")}>{r.label}</span>
          <span className="relative shrink-0 font-mono text-sm tabular-nums text-muted-foreground">{formatNumber(r.value)}{unit}</span>
        </li>
      ))}
    </ul>
  );
}
```

Create `apps/admin/components/analytics/funnel.tsx` — the accessible funnel as a labeled linear list (count + drop-off % per stage), plus the attribution list:

```tsx
// components/analytics/funnel.tsx
import { formatNumber } from "@/app/lib/format";
import type { FunnelResponse } from "@signex/shared";

export function Funnel({ data }: { data: FunnelResponse }) {
  if (!data.stages.length) return <p className="py-6 text-center text-sm text-muted-foreground">Chưa có dữ liệu</p>;
  return (
    <ol className="flex flex-col gap-2">
      {data.stages.map((s, i) => (
        <li key={s.stage} className="rounded-md border border-border bg-card px-3 py-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-foreground">{s.stage}</span>
            <span className="font-mono tabular-nums text-muted-foreground">
              {formatNumber(s.count)} · {(s.pct * 100).toFixed(0)}%
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, s.pct * 100)}%` }} aria-hidden />
          </div>
          {i > 0 && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {(((data.stages[i - 1].count - s.count) / (data.stages[i - 1].count || 1)) * 100).toFixed(0)}% drop-off
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
```

Create `apps/admin/components/analytics/realtime-card.tsx` — `"use client"`, polls `/analytics/realtime` every 15s **via a same-origin admin BFF** (see note) and shows the active count + per-minute sparkline + top pages + recent feed. Since the admin also uses `apiServer` server-side only, add a small route handler `apps/admin/app/api/analytics/realtime/route.ts` that calls `apiServer("/api/analytics/realtime")` and returns JSON, and have the client `fetch("/api/analytics/realtime")` on an interval:

```tsx
// components/analytics/realtime-card.tsx
"use client";

import { useEffect, useState } from "react";
import type { RealtimeResponse } from "@signex/shared";

export function RealtimeCard() {
  const [data, setData] = useState<RealtimeResponse | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/analytics/realtime", { cache: "no-store" });
        if (alive && res.ok) setData(await res.json());
      } catch { /* keep last */ }
    };
    load();
    const id = setInterval(load, 15_000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  const active = data?.activeVisitors ?? 0;
  const max = Math.max(1, ...(data?.perMinute ?? []).map((p) => p.value));
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Active now (5 min)</p>
        <p className="font-mono text-3xl font-semibold tabular-nums text-foreground">{active}</p>
      </div>
      <div className="flex h-12 items-end gap-0.5" aria-hidden>
        {(data?.perMinute ?? []).map((p, i) => (
          <div key={i} className="flex-1 rounded-sm bg-primary/70" style={{ height: `${(p.value / max) * 100}%`, minHeight: 2 }} />
        ))}
      </div>
      <ul className="flex flex-col gap-1 text-sm">
        {(data?.topPages ?? []).slice(0, 5).map((pg) => (
          <li key={pg.path} className="flex justify-between gap-2">
            <span className="truncate text-foreground">{pg.path}</span>
            <span className="shrink-0 font-mono tabular-nums text-muted-foreground">{pg.pageviews}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

Also create `apps/admin/app/api/analytics/realtime/route.ts`:

```ts
// app/api/analytics/realtime/route.ts
import { NextResponse } from "next/server";
import { requireRole } from "@/app/lib/session";
import { apiServer } from "@/app/lib/api";
import type { RealtimeResponse } from "@signex/shared";

export async function GET() {
  await requireRole("EDITOR");
  const res = await apiServer<RealtimeResponse>("/api/analytics/realtime");
  return NextResponse.json(res.ok ? res.data : { activeVisitors: 0, perMinute: [], topPages: [], recent: [] });
}
```

Create `apps/admin/components/analytics/tables.tsx` — plain (non-tanstack) tables for Campaigns and Lead attribution using the `components/ui/table` primitives (sortable is out of scope for v1; the lists are pre-sorted server-side). Provide `CampaignsTable({ rows }: { rows: CampaignStat[] })` and `AttributionTable({ rows }: { rows: AttributionRow[] })`, each rendering `Table/TableHeader/TableBody/TableRow/TableHead/TableCell` with `font-mono tabular-nums` numeric cells and an empty-row fallback ("Chưa có dữ liệu").

- [ ] **Step 7: Compose the page + loading skeleton**

Create `apps/admin/app/(dash)/analytics/page.tsx` (server component; `requireRole('EDITOR')`; reads `?range`; `Suspense` around the fetch, matching the Overview idiom):

```tsx
// app/(dash)/analytics/page.tsx
import { Suspense } from "react";
import { requireRole } from "@/app/lib/session";
import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { getAnalyticsData, rangeFromPreset } from "@/app/lib/analytics";
import { RangeTabs } from "@/components/analytics/range-tabs";
import { KpiStrip } from "@/components/analytics/kpi-strip";
import { TrafficChart } from "@/components/analytics/traffic-chart";
import { RealtimeCard } from "@/components/analytics/realtime-card";
import { BarList } from "@/components/analytics/bars";
import { Funnel } from "@/components/analytics/funnel";
import { CampaignsTable, AttributionTable } from "@/components/analytics/tables";
import { AnalyticsSkeleton } from "./loading";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  await requireRole("EDITOR");
  const sp = await searchParams;
  const preset = sp.range === "7" || sp.range === "90" ? sp.range : "30";
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Analytics"
        subtitle="First-party traffic, sources, catalog behavior and lead conversion."
        actions={<RangeTabs current={preset} />}
      />
      <Suspense key={preset} fallback={<AnalyticsSkeleton />}>
        <AnalyticsBody preset={Number(preset)} />
      </Suspense>
    </div>
  );
}

async function AnalyticsBody({ preset }: { preset: number }) {
  const data = await getAnalyticsData(rangeFromPreset(preset));
  return (
    <div className="flex flex-col gap-6">
      <KpiStrip overview={data.overview} />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <SectionCard title="Traffic" description="Sessions over time">
          <TrafficChart series={data.timeseries} />
        </SectionCard>
        <SectionCard title="Realtime">
          <RealtimeCard />
        </SectionCard>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Top pages">
          <BarList rows={data.topPages.map((p) => ({ label: p.path, value: p.pageviews }))} />
        </SectionCard>
        <SectionCard title="Channels">
          <BarList rows={data.sources.channels.map((c) => ({ label: c.channel, value: c.sessions }))} />
        </SectionCard>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Categories viewed">
          <BarList rows={data.catalog.categories.map((c) => ({ label: c.slug, value: c.views }))} />
        </SectionCard>
        <SectionCard title="Products viewed" description={`Quote CTA clicks: ${data.catalog.ctaClicks}`}>
          <BarList rows={data.catalog.products.map((c) => ({ label: c.slug, value: c.views }))} />
        </SectionCard>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Conversion funnel">
          <Funnel data={data.funnel} />
        </SectionCard>
        <SectionCard title="Lead attribution" description="Leads by channel">
          <AttributionTable rows={data.funnel.attribution} />
        </SectionCard>
      </div>
      <SectionCard title="Campaigns">
        <CampaignsTable rows={data.sources.campaigns} />
      </SectionCard>
    </div>
  );
}
```

Create `apps/admin/app/(dash)/analytics/loading.tsx` exporting both a default route skeleton and the named `AnalyticsSkeleton` used above (built from `@/components/ui/skeleton` inside `rounded-xl border border-border bg-card` shells, mirroring `components/overview/skeletons.tsx`):

```tsx
// app/(dash)/analytics/loading.tsx
import { Skeleton } from "@/components/ui/skeleton";

export function AnalyticsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Skeleton className="h-72 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-56 w-full rounded-xl" />
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
    </div>
  );
}

export default function AnalyticsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-9 w-40" />
      <AnalyticsSkeleton />
    </div>
  );
}
```

- [ ] **Step 8: Typecheck, test, build**

Run: `cd apps/admin && npx vitest run app/lib/analytics.test.ts && cd - && npm run build -w @signex/admin`
Expected: aggregator test PASS; `next build` compiles the `/analytics` route with no type errors.

- [ ] **Step 9: Commit**

```bash
git add apps/admin/app/lib/analytics.ts apps/admin/app/lib/analytics.test.ts "apps/admin/app/(dash)/analytics" apps/admin/app/api/analytics apps/admin/components/analytics apps/admin/components/shell/app-sidebar.tsx
git commit -m "$(printf 'feat(admin): /analytics dashboard — KPIs, traffic, sources, catalog, funnel, realtime\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01W43GcnR1BXH9qm8TLt4DJ6')"
```

---

## Task 8: End-to-end wire-up + seed/demo + verification

**Files:**
- Create: `apps/api/src/analytics/seed-analytics.ts` (CLI seed, mirrors `forms/seed-samples.ts`)
- Modify: `apps/api/package.json` (add a `seed:analytics` script)

**Interfaces:**
- Consumes: everything from Tasks 1–7.
- Produces: demo data + a verified end-to-end path.

- [ ] **Step 1: Write a seed generator**

Create `apps/api/src/analytics/seed-analytics.ts` — a standalone script (mirrors the `runSeed()`/`seed-samples.ts` CLI pattern) that bootstraps `AppModule` as an application context, resolves `IngestService`, and feeds ~200 synthetic events across a handful of visitors/sessions over the last 14 days (varied channels via referrer/utm, some product_view + cta_click, and a couple of `FormSubmission`s with a `sessionId` so attribution has data). Keep it deterministic (seeded PRNG, no `Math.random` reliance for reproducibility is optional). End by printing a summary line and `process.exit(0)`.

Add to `apps/api/package.json` scripts:

```json
"seed:analytics": "node dist/analytics/seed-analytics"
```

- [ ] **Step 2: Build the whole repo**

Run: `npm run build`
Expected: turbo builds db → shared → api → web → admin in order, all green.

- [ ] **Step 3: Bring the stack up + seed**

Run:
```bash
docker compose up -d --build
docker exec signex-api node dist/analytics/seed-analytics
```
Expected: containers healthy; the seed prints e.g. `seeded 200 events / 12 sessions / 3 leads`.

- [ ] **Step 4: Verify the ingest path live (browser-independent)**

Run:
```bash
curl -s -X POST http://localhost:3060/api/collect -H 'content-type: application/json' \
  -d '{"visitorId":"vtest","sessionId":"stest","kind":"page_view","path":"/en","referrer":"https://www.google.com/"}' -o /dev/null -w '%{http_code}\n'
docker exec signex-postgres psql -U signex -d signex -c \
  "select kind, channel, device from \"AnalyticsEvent\" where \"sessionId\"='stest';"
```
Expected: `204`; the row shows `page_view | organic | desktop`.

- [ ] **Step 5: Verify the query path with the editor cookie**

Run (reuse the API login to get an EDITOR `sx_session` cookie, then hit overview):
```bash
COOKIE=$(curl -s -i -X POST http://localhost:3060/api/auth/login -H 'content-type: application/json' -H 'Origin: http://localhost:3061' \
  -d '{"email":"admin@signex.local","password":"change-me-please-now"}' | grep -i '^set-cookie:' | sed 's/set-cookie: //I;s/;.*//' | tr -d '\r')
curl -s "http://localhost:3060/api/analytics/overview" -H "Cookie: $COOKIE" | head -c 400; echo
```
Expected: a JSON `{ "current": { "visitors": N, ... }, "previous": {...} }` with non-zero counts from the seed.

- [ ] **Step 6: Browser-verify the dashboard**

Load `http://localhost:3061/analytics` (admin, already-authenticated session) and confirm: the KPI strip shows seeded numbers, the traffic area chart renders, channels/catalog bars populate, the funnel shows Visit→…→Lead with drop-offs, and the Realtime card ticks (generate a hit by loading `http://localhost:3062/en` in another tab). Switch the `7d/30d/90d` tabs and confirm the URL `?range=` changes and numbers update. *(Do not enter the admin password into a login form — the session cookie/route verification above stands in for auth.)*

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/analytics/seed-analytics.ts apps/api/package.json
git commit -m "$(printf 'feat(api): analytics seed generator + e2e wire-up\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01W43GcnR1BXH9qm8TLt4DJ6')"
```

---

## Self-Review notes (addressed inline)

- **Spec coverage:** all four report areas (traffic/realtime → Task 4+7; sources → 4+7; catalog → 4+7; conversion/lead → 4+5+7), first-party cookie identity (Task 6 tracker), query-on-read (Task 4, no rollup), polling realtime (Task 7), attribution via `FormSubmission.sessionId` (Tasks 1+5), privacy (no raw IP stored — Task 3 stores only derived `country`; DNT honored — Task 6). Covered.
- **Type consistency:** `CollectEvent`/`EventKind`/`Channel` + all response DTOs are defined once in Task 2 and consumed by name in Tasks 3, 4, 7. `IngestService.ingest(input, ctx)`, `QueryService` method names, `getAnalyticsData`/`rangeFromPreset`, `track`/`getAnalyticsIds` are referenced consistently across tasks.
- **YAGNI trims:** no rollup tables, no calendar/custom-range picker (preset tabs only — no such component exists in admin), no sortable tables v1, no websockets (poll), no GDPR consent gating (documented follow-up).
- **Known follow-ups (out of scope):** custom date range, rollup aggregation when volume grows, consent gating, GA4 Data API. Listed in the spec §11.
