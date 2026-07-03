# First-Party Analytics — Design Spec

**Date:** 2026-07-03
**Status:** Approved for planning
**Branch (current):** `feat/global-catalog-domain`

## 1. Summary

Build a **first-party web-analytics subsystem** that tracks visitor actions on the
public site (`apps/web`), stores them in our own Postgres, and surfaces them in a
detailed **admin dashboard** (`apps/admin` → `/analytics`) that answers GA4-style
questions: traffic & realtime, acquisition sources, catalog behavior, and lead
conversion.

This is the **first-party half of a hybrid** analytics setup. GA4 (measurement id
`G-HTGYKH7Y2T`) is already wired and live (see `apps/web/app/[lang]/layout.tsx` →
`GoogleAnalytics`) and keeps running in parallel for the Google console + pixels.
The first-party pipeline is what powers the in-admin dashboard, ties analytics to
**our real leads and catalog**, and keeps the data under our ownership (no Google
dependency, no sampling).

**Non-goal:** replacing GA4. **Non-goal:** an A/B testing or session-replay platform.

## 2. Goals & success criteria

- Every meaningful public-site action is captured first-party: page views (incl.
  soft navigations), scroll depth, the "Nhận báo giá" CTA, outbound clicks, and
  category/product views tied to the **real catalog slug**.
- Leads (`FormSubmission`) are **attributable** to the session/source that produced
  them — "which page/channel/campaign drives quotes" is answerable.
- The admin `/analytics` page renders the four report areas with correct numbers on
  seeded data, matching the existing admin design system, and stays responsive +
  accessible (data-table fallback, keyboard, reduced-motion).
- The public site takes on **no blocking cost**: collection is fire-and-forget
  (`navigator.sendBeacon`), never awaited, never breaks a page render.

## 3. Architecture (Approach A — "dual-fire" first-party pipeline)

The web already emits events to GA4. We add a thin first-party tracker that emits the
**same events** to our own ingest endpoint. One tracking layer, two sinks (GA4 + our
DB). Four blocks:

```
apps/web (browser)                apps/api (NestJS)              packages/db (Postgres)
┌────────────────────┐  beacon    ┌──────────────────────┐      ┌───────────────────┐
│ tracker.ts         │ ─JSON────▶ │ POST /api/collect    │      │ AnalyticsEvent    │
│  • sx_vid cookie   │ (sendBeacon)│  validate+enrich     │─────▶│ AnalyticsSession  │
│  • sessionId (30m) │            │  sessionize (upsert) │      │ FormSubmission    │
│  • page_view/scroll│            └──────────────────────┘      │  (+sessionId,     │
│    cta/outbound/   │            ┌──────────────────────┐      │   visitorId)      │
│    category/product│            │ GET /api/analytics/* │◀─────│  read-only aggregs│
│  + gtag() → GA4    │            │  (auth: EDITOR+)     │      └───────────────────┘
└────────────────────┘            └──────────┬───────────┘
                                             │ JSON
apps/admin  /analytics  ◀────────────────────┘  (server component + recharts client)
```

Decisions locked during brainstorming:

- **Identity:** first-party cookie `sx_vid` (uuid, 1yr, SameSite=Lax). Distinguishes
  new vs returning + accurate sessions. GA4 already sets cookies, so this is
  consistent. (GDPR consent-gating is a documented follow-up, out of scope — VN does
  not mandate it; see the existing note in `layout.tsx`.)
- **Storage:** indexed **raw events, query-on-read**. No rollup/aggregate tables yet
  (YAGNI — Postgres handles the expected volume; add rollups only when volume demands).
- **Realtime:** the dashboard **polls** a "last 5 minutes" endpoint (~15s). No
  websockets.
- **Lead attribution:** authoritative via `FormSubmission.sessionId` → join to
  `AnalyticsSession`. One source of truth for leads (survives a dropped beacon).

## 4. Data model (`packages/db/prisma/schema.prisma` + migration)

### 4.1 `AnalyticsEvent` (raw, append-only)

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `occurredAt` | `DateTime @default(now())` | server receive time |
| `visitorId` | `String` | from `sx_vid`, sent in payload |
| `sessionId` | `String` | 30-min inactivity window |
| `kind` | `String` | `page_view`\|`scroll`\|`cta_click`\|`outbound_click`\|`category_view`\|`product_view` |
| `path` | `String` | pathname (no query string stored) |
| `title` | `String?` | document title |
| `referrer` | `String?` | full referrer (first event of session) |
| `utmSource/Medium/Campaign/Term/Content` | `String?` | parsed from landing URL |
| `channel` | `String` | `direct`\|`organic`\|`social`\|`referral`\|`paid`\|`email` (derived) |
| `country` | `String?` | ISO-2, derived from IP (never store raw IP) |
| `device` | `String` | `mobile`\|`tablet`\|`desktop` (UA-derived) |
| `browser` | `String?` | UA-derived |
| `os` | `String?` | UA-derived |
| `lang` | `String?` | `en`\|`vi` |
| `catalogSlug` | `String?` | category slug for `category_view` |
| `productSlug` | `String?` | product slug for `product_view` |
| `meta` | `Json?` | event-specific: `{scrollDepth}`, `{ctaId}`, `{href}` (outbound) |

Indexes: `@@index([occurredAt])`, `@@index([kind, occurredAt])`, `@@index([sessionId])`,
`@@index([visitorId])`, `@@index([catalogSlug])`, `@@index([productSlug])`.

### 4.2 `AnalyticsSession` (one row per session, upserted)

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id` | the client `sessionId` |
| `visitorId` | `String` | |
| `startedAt` | `DateTime @default(now())` | |
| `lastSeenAt` | `DateTime @updatedAt` | |
| `entryPath` / `exitPath` | `String` / `String?` | first / most-recent path |
| `referrer` | `String?` | |
| `channel` | `String` | classified once, on session create |
| `utmSource/Medium/Campaign` | `String?` | |
| `country` / `device` / `browser` / `os` / `lang` | `String?`/`String`/… | from first event |
| `pageviews` | `Int @default(0)` | count of `page_view` |
| `eventsCount` | `Int @default(0)` | all events |
| `bounced` | `Boolean @default(true)` | `pageviews<=1 && no cta_click && durationSec<10` |
| `durationSec` | `Int @default(0)` | `lastSeenAt - startedAt` |
| `converted` | `Boolean @default(false)` | set true when a lead links this session |

Indexes: `@@index([startedAt])`, `@@index([visitorId])`, `@@index([channel])`,
`@@index([converted])`.

### 4.3 `FormSubmission` (extend, backward-compatible)

Add two nullable columns — no change to existing rows:

- `sessionId String?` — `@@index([sessionId])`
- `visitorId String?`

Populated from the web form submit (the quote/contact form reads them from the
tracker and posts them). On create, the api also flips the matching
`AnalyticsSession.converted = true`.

## 5. Collection — `apps/web`

> Per `apps/web/AGENTS.md`: Next 16 has breaking changes vs training data — read
> `node_modules/next/dist/docs/` before writing. The tracker is a Client Component.

**New:** `apps/web/app/lib/analytics/tracker.ts` (browser module) + a small
`<Analytics/>` Client Component mounted once in `app/[lang]/layout.tsx` (next to
`<GoogleAnalytics/>`), active whenever `NEXT_PUBLIC_API_URL` is set (the collect
endpoint target) — the same env the app already relies on, so no new flag.

Responsibilities:

- **Identity.** On load, read `sx_vid`; if absent, generate a uuid and set the cookie
  (`sx_vid`, 1yr, `SameSite=Lax`, `path=/`, not httpOnly so the tracker can read it).
  Session id in `sessionStorage` (`sx_sid`) + a `lastActivity` timestamp; start a new
  session id when the gap exceeds **30 min**.
- **UTM/referrer** parsed once per session from the landing URL + `document.referrer`.
- **Emit** (each via `navigator.sendBeacon('<API>/api/collect', Blob<json>)`, never
  awaited):
  - `page_view` — on mount **and** on soft navigation (App Router `usePathname`).
  - `scroll` — once per page when depth crosses 90% (IntersectionObserver on a sentinel).
  - `cta_click` — delegated listener on the "Nhận báo giá" button + any `[data-cta]`.
  - `outbound_click` — delegated listener on `<a>` whose host ≠ current host.
  - `category_view` / `product_view` — fired by the catalog category/product pages
    with the real slug (small prop/effect on those routes).
- Payload: `{visitorId, sessionId, kind, path, title, referrer, utm*, lang, screenW,
  tz, meta?}`. Server derives country/device/browser/os/channel — client never sends
  those.
- Also mirror the same custom events to GA4 via `gtag('event', kind, …)` where it adds
  signal (category/product/cta) — enhanced measurement already covers page_view/scroll.

**Lead attribution hook:** the quote/contact form includes hidden `sessionId` +
`visitorId` (read from the tracker) so the api can persist them on `FormSubmission`.

**CORS/CSRF note:** `/api/collect` is public ingest — exempt from the auth
OriginGuard/CSRF, but add the web origin to the api CORS allow-list and handle the
`OPTIONS` preflight (beacon uses `application/json`). No cookies are used for
identity across origins — `visitorId` travels in the payload, so this works in
production where web + api are different subdomains.

## 6. Ingestion & query — `apps/api` (`AnalyticsModule`)

### 6.1 `POST /api/collect` (public, rate-limited)

1. Validate body against the shared `collectEventSchema` (zod). Reject oversized/
   malformed. Drop obvious bots (UA heuristics + missing fields).
2. Enrich server-side: `country` from IP (prod: `cf-ipcountry` header; dev: skip/`null`),
   `device/browser/os` from a UA parser, `channel` from `classifyChannel(referrer, utm)`.
3. **Sessionize (upsert `AnalyticsSession`):** first event for a `sessionId` → create
   (entry/referrer/utm/channel/device/country from this event). Subsequent → update
   `lastSeenAt`, `exitPath`, `pageviews` (+1 if page_view), `eventsCount` (+1),
   recompute `bounced` + `durationSec`.
4. Insert the `AnalyticsEvent`.
5. Return `204` fast (work must not block; endpoint is fire-and-forget).

`classifyChannel` rules (first match wins): utm_medium `cpc/ppc/paid*` → `paid`;
utm_medium `email`/utm_source `newsletter` → `email`; utm_medium/`social` or referrer
host in {facebook, instagram, zalo, tiktok, youtube, linkedin, twitter/x, threads} →
`social`; referrer host in {google, bing, duckduckgo, coccoc, yahoo} → `organic`;
other non-empty referrer with a different host → `referral`; else → `direct`.

### 6.2 Query endpoints (auth `EDITOR`+, all take `from`/`to` ISO range)

| Endpoint | Returns |
|---|---|
| `GET /api/analytics/overview` | KPI object + `delta` vs previous equal-length period: `visitors, sessions, pageviews, avgSessionSec, bounceRate, leads, conversionRate` |
| `GET /api/analytics/timeseries?metric&interval` | `[{bucket, value}]` via `date_trunc` (day/hour) |
| `GET /api/analytics/top-pages?limit` | `[{path, pageviews, visitors}]` |
| `GET /api/analytics/sources` | `{channels:[{channel,sessions,leads}], referrers:[…], campaigns:[{utmCampaign,sessions,leads}]}` |
| `GET /api/analytics/catalog` | `{categories:[{slug,views,visitors}], products:[…], ctaClicks}` |
| `GET /api/analytics/funnel` | stages `[{stage,count,pct}]` = visit→product_view→cta_click→lead + `attribution:[{channel/entryPath, leads}]` |
| `GET /api/analytics/realtime` | `{activeVisitors, perMinute:[…30], topPages:[…], recent:[…events+leads]}` (last 5–30 min) |

Aggregation via Prisma `groupBy` / `$queryRaw` with `date_trunc`. `visitors` =
distinct `visitorId`. `leads` + attribution = `FormSubmission` (in range) joined to
`AnalyticsSession` by `sessionId`.

**Shared (`packages/shared`):** `collectEventSchema` (ingest payload) and the query
response DTOs (zod) — imported by both api and admin for type-safety.

## 7. Dashboard UX — `apps/admin` `/analytics`

New route `app/(dash)/analytics/page.tsx` + a sidebar nav entry. Server Component
fetches initial data via `apiServer`; charts are client (recharts, already used by the
Overview `LeadsChart`). **Reuses the existing admin design system verbatim** — oklch
tokens in `globals.css`, Geist sans/mono + `tabular-nums`, `SectionCard`, `PageHeader`,
`StatusBadge`, 10px radius, `shadow-elevated`, the `leads-kpi-strip` hairline idiom.
No new palette/fonts.

Sections (top → bottom):

1. **Header + controls** — `PageHeader` + a date-range picker (presets: 7/30/90d,
   custom) with a "compare to previous period" toggle. Range lives in the URL
   (`?from&to`) so it is shareable/deep-linkable and survives back-nav.
2. **KPI strip** — hairline `grid gap-px bg-border` of 7 stats (Visitors, Sessions,
   Pageviews, Avg session, Bounce %, Leads, Conversion %), each with the value in mono
   `tabular-nums` + a delta chip (green/red, arrow + icon, never color-only).
3. **Realtime** — `SectionCard` with a large "active now" number (KPI-as-text per the
   realtime chart guidance), a small per-minute area sparkline (last 30 min), top
   active pages, and a live event feed. Polls `/realtime` every ~15s; respects
   `prefers-reduced-motion` (no flashing; freeze animation).
4. **Traffic** — **Area chart** (Recharts) of sessions/visitors over time (fill 20%,
   series distinguished by style not color alone) + **top pages** table + a small
   device/country breakdown (horizontal bars).
5. **Sources** — channel breakdown (horizontal bars, ≤6 categories so no pie overuse)
   + a sortable **campaigns** table (`utmCampaign` → sessions, leads).
6. **Catalog behavior** — top categories & products viewed (horizontal bars, real
   slugs) + the "Nhận báo giá" CTA-click count. Links each row to its catalog admin page.
7. **Conversion & lead** — a **funnel rendered as a labeled linear list** (visit →
   product view → CTA → lead) with explicit count + drop-off % per stage (the
   accessible funnel fallback), plus a **lead-attribution** table (channel / entry page
   → leads) joined to real `FormSubmission`s.

**Data-viz rules applied (from ui-ux-pro-max chart domain):** every chart has a
tooltip with exact values, a `<caption>`/aria summary, an empty state ("Chưa có dữ
liệu" + hint) instead of a blank axis, a skeleton while loading, numbers in
`tabular-nums`, gridlines low-contrast, and colorblind-safe series (style + label, not
hue alone). Tables are the accessible fallback for every chart and are sortable with
`aria-sort`.

## 8. Privacy, security, edge cases

- **No raw IP stored** — only derived `country`. `sx_vid` is a random uuid, not PII.
- `/api/collect` is **rate-limited** per IP and **bot-filtered**; it never trusts
  client-derived geo/device (server derives those).
- Respect `navigator.doNotTrack === '1'` → tracker no-ops (still lets GA4/consent
  handle its own path). *(Confirm during implementation; low-cost.)*
- Fire-and-forget: a `/api/collect` failure or the api being down must **never** affect
  the public page (beacon is not awaited; tracker wrapped in try/catch).
- GDPR consent-gating (Consent Mode v2) is an explicit **follow-up**, not in scope,
  mirroring the existing note in `layout.tsx`.

## 9. Testing

- **shared:** zod tests for `collectEventSchema` (valid/invalid/oversized) + DTOs.
- **api:** unit — `classifyChannel` truth table, UA parsing, sessionization window
  (new session after 30 min; bounce logic; duration). integration — `POST /collect`
  creates event + upserts session; each `/analytics/*` aggregation against a seeded
  fixture returns expected numbers; lead attribution join. e2e — collect → overview.
- **web:** tracker unit — session-window rollover, payload shape, DNT no-op.
- **admin:** `/analytics` renders KPIs/sections from mocked API data; empty + loading
  states.

## 10. Build order (→ implementation plan tasks)

1. **DB** — `AnalyticsEvent` + `AnalyticsSession` models, `FormSubmission` +
   `sessionId/visitorId`, migration, `db:generate`.
2. **shared** — `collectEventSchema` + query DTOs + tests.
3. **api ingestion** — `AnalyticsModule`, `POST /collect`, enrichment
   (`classifyChannel`/UA), sessionization, rate-limit, CORS; tests.
4. **api query** — the seven `/analytics/*` aggregation endpoints + tests.
5. **web tracker** — `tracker.ts` + `<Analytics/>` mount, catalog/CTA/outbound
   instrumentation, form attribution fields; tests.
6. **admin dashboard** — `/analytics` route + nav, date-range + all sections + charts;
   design-system compliance.
7. **wire-up** — end-to-end verify against the live stack + a small seed/demo generator
   so the dashboard has data to show; browser-verify numbers.

## 11. Out of scope (documented follow-ups)

- Cookie-consent / GDPR Consent Mode gating.
- Rollup/materialized aggregate tables (add when raw-query latency demands).
- Session replay, A/B testing, funnel-builder UI, custom event definitions in-admin.
- Exporting to the GA4 Data API (we chose first-party DB for the dashboard).
