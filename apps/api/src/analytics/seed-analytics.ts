/**
 * Dev seed: backdated first-party analytics demo data (sessions, events, leads)
 * so the admin `/analytics` dashboard has history across the 7d/30d/90d ranges.
 *
 * Bootstraps `AppModule` as a standalone Nest application context (mirrors
 * `importer/importer.command.ts`) and resolves `PrismaService` to write rows
 * DIRECTLY — deliberately NOT via `IngestService.ingest()`, which always stamps
 * `occurredAt = new Date()` (today). Routing through it would make every row
 * land "today", leaving the 7/30/90-day dashboard ranges looking empty for the
 * past. Every row here instead carries an explicit, backdated timestamp.
 *
 * Idempotent: skips (no-op) if seed session ids are already present.
 *
 * Run after building:
 *   npm run seed:analytics -w @signex/api
 *   (= node dist/analytics/seed-analytics)
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import type { EventKind } from '@signex/shared';
import type { Prisma } from '@signex/db';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { classifyChannel, parseDevice } from './enrich';

// ── seeded RNG (mulberry32) — deterministic, reproducible runs ─────────────
function makeRng(seed: number) {
  let s = seed;
  return function rng(): number {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = makeRng(0xa1a1ce5e);
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}
function randInt(min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

// ── synthetic UAs fed through parseDevice ───────────────────────────────────
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

// ── synthetic referrer/UTM profiles fed through classifyChannel ────────────
interface ReferrerProfile {
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}
const DIRECT: ReferrerProfile = {};
const ORGANIC: ReferrerProfile = {
  referrer: 'https://www.google.com/search?q=custom+signage+vietnam',
};
const SOCIAL_FB: ReferrerProfile = {
  referrer: 'https://www.facebook.com/groups/signmakers/',
};
const SOCIAL_X: ReferrerProfile = {
  referrer: 'https://x.com/signexvn/status/1234567890',
};
const REFERRAL: ReferrerProfile = {
  referrer: 'https://vnbizblog.example.com/top-sign-suppliers-2026',
};
const PAID: ReferrerProfile = {
  referrer: 'https://www.google.com/',
  utmSource: 'google',
  utmMedium: 'cpc',
  utmCampaign: 'signage-search-q3',
};

const CATALOG_SLUGS = [
  'plastic-logos-emblems',
  'metal-signs',
  'acrylic-displays',
  'led-signage',
];
const PRODUCT_SLUGS = [
  'pvc-emblem-50mm',
  'stainless-steel-plaque',
  'acrylic-light-box',
  'vinyl-banner-3x6',
  'led-channel-letter',
];
const ENTRY_PATHS = [
  '/en',
  '/en/catalog',
  '/en/catalog/plastic-logos-emblems',
  '/en/catalog/metal-signs',
  '/en/about',
  '/en/contact',
  '/vi',
  '/vi/catalog/metal-signs',
];
const LEAD_PAYLOADS = [
  {
    name: 'Nguyen Van An',
    message: 'Please send a quote for 5,000 acrylic signs.',
  },
  {
    name: 'Tran Thi Bich',
    message: 'Interested in bulk pricing for metal plaques.',
  },
  {
    name: 'Le Hoang Nam',
    message: 'Need a sample of your LED channel letters.',
  },
];

type Profile = 'bounce' | 'browse' | 'lead';

interface SessionPlan {
  dayOffset: number; // 0..13 days ago
  hour: number;
  profile: Profile;
  referrer: ReferrerProfile;
  ua: string;
  entryPath: string;
  lang: 'en' | 'vi';
}

// 12 sessions spread across the last 14 days: mix of channel/device/profile so
// the traffic chart, channel breakdown, catalog insights and funnel all have
// varied data to render.
const SESSION_PLANS: SessionPlan[] = [
  {
    dayOffset: 13,
    hour: 9,
    profile: 'browse',
    referrer: DIRECT,
    ua: DESKTOP_UA,
    entryPath: '/en',
    lang: 'en',
  },
  {
    dayOffset: 12,
    hour: 14,
    profile: 'bounce',
    referrer: ORGANIC,
    ua: IPHONE_UA,
    entryPath: '/en/catalog/metal-signs',
    lang: 'en',
  },
  {
    dayOffset: 11,
    hour: 20,
    profile: 'lead',
    referrer: PAID,
    ua: DESKTOP_UA,
    entryPath: '/en/catalog/plastic-logos-emblems',
    lang: 'en',
  },
  {
    dayOffset: 9,
    hour: 11,
    profile: 'browse',
    referrer: SOCIAL_FB,
    ua: IPHONE_UA,
    entryPath: '/vi',
    lang: 'vi',
  },
  {
    dayOffset: 8,
    hour: 16,
    profile: 'bounce',
    referrer: DIRECT,
    ua: DESKTOP_UA,
    entryPath: '/en/contact',
    lang: 'en',
  },
  {
    dayOffset: 7,
    hour: 10,
    profile: 'lead',
    referrer: ORGANIC,
    ua: DESKTOP_UA,
    entryPath: '/en/catalog/metal-signs',
    lang: 'en',
  },
  {
    dayOffset: 6,
    hour: 19,
    profile: 'browse',
    referrer: SOCIAL_X,
    ua: DESKTOP_UA,
    entryPath: '/en/catalog',
    lang: 'en',
  },
  {
    dayOffset: 5,
    hour: 13,
    profile: 'browse',
    referrer: REFERRAL,
    ua: IPHONE_UA,
    entryPath: '/vi/catalog/metal-signs',
    lang: 'vi',
  },
  {
    dayOffset: 4,
    hour: 21,
    profile: 'bounce',
    referrer: SOCIAL_FB,
    ua: IPHONE_UA,
    entryPath: '/en',
    lang: 'en',
  },
  {
    dayOffset: 3,
    hour: 15,
    profile: 'lead',
    referrer: PAID,
    ua: DESKTOP_UA,
    entryPath: '/en/catalog/plastic-logos-emblems',
    lang: 'en',
  },
  {
    dayOffset: 1,
    hour: 17,
    profile: 'browse',
    referrer: ORGANIC,
    ua: DESKTOP_UA,
    entryPath: '/en/about',
    lang: 'en',
  },
  {
    dayOffset: 0,
    hour: 9,
    profile: 'browse',
    referrer: DIRECT,
    ua: IPHONE_UA,
    entryPath: '/en',
    lang: 'en',
  },
];

/** `dayOffset` days before `base`, at `hour:minute` local time. */
function backdated(
  base: Date,
  dayOffset: number,
  hour: number,
  minute: number,
): Date {
  const d = new Date(base);
  d.setDate(d.getDate() - dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
}

interface PlannedEvent {
  kind: EventKind;
  offsetSec: number;
  path: string;
  catalogSlug?: string;
  productSlug?: string;
  meta?: Record<string, unknown>;
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });

  try {
    const prisma = app.get(PrismaService).client;

    // Idempotency guard — re-running the seed should not pile up duplicate data.
    const already = await prisma.analyticsSession.count({
      where: { id: { startsWith: 'seed-sess-' } },
    });
    if (already > 0) {
      console.log(
        `seed:analytics — skipping: ${already} seeded sessions already present`,
      );
      return;
    }

    const now = new Date();
    const sessionRows: Prisma.AnalyticsSessionCreateInput[] = [];
    const eventRows: Prisma.AnalyticsEventCreateManyInput[] = [];
    const leadRows: Prisma.FormSubmissionCreateInput[] = [];

    SESSION_PLANS.forEach((plan, i) => {
      const sessionId = `seed-sess-${i + 1}`;
      const visitorId = `seed-visitor-${i + 1}`;
      const channel = classifyChannel(plan.referrer.referrer, {
        utmSource: plan.referrer.utmSource,
        utmMedium: plan.referrer.utmMedium,
      });
      const device = parseDevice(plan.ua);
      const startedAt = backdated(
        now,
        plan.dayOffset,
        plan.hour,
        randInt(0, 59),
      );

      // ── build this session's event timeline ──────────────────────────────
      const events: PlannedEvent[] = [];
      let t = 0; // seconds since startedAt

      const pageviewCount = plan.profile === 'bounce' ? 1 : randInt(8, 18);
      const pagePaths = [plan.entryPath];
      for (let p = 1; p < pageviewCount; p++) pagePaths.push(pick(ENTRY_PATHS));
      for (const path of pagePaths) {
        events.push({ kind: 'page_view', offsetSec: t, path });
        t += randInt(15, 90);
      }

      if (plan.profile !== 'bounce') {
        if (rng() < 0.8) {
          const catalogSlug = pick(CATALOG_SLUGS);
          events.push({
            kind: 'category_view',
            offsetSec: t,
            path: `/en/catalog/${catalogSlug}`,
            catalogSlug,
          });
          t += randInt(10, 60);
        }
        const productCount = randInt(0, 4);
        for (let p = 0; p < productCount; p++) {
          const productSlug = pick(PRODUCT_SLUGS);
          events.push({
            kind: 'product_view',
            offsetSec: t,
            path: `/en/products/${productSlug}`,
            productSlug,
          });
          t += randInt(10, 60);
        }
        if (rng() < 0.7) {
          events.push({
            kind: 'scroll',
            offsetSec: t,
            path: pick(pagePaths),
            meta: { depth: pick([25, 50, 75, 100]) },
          });
          t += randInt(5, 30);
        }
        if (plan.profile === 'lead' || rng() < 0.35) {
          events.push({
            kind: 'cta_click',
            offsetSec: t,
            path: pick(pagePaths),
            meta: { ctaId: 'get-quote' },
          });
          t += randInt(5, 20);
        }
      }

      const hasCta = events.some((e) => e.kind === 'cta_click');
      const durationSec =
        plan.profile === 'bounce'
          ? randInt(3, 9)
          : Math.max(t, randInt(30, 600));
      const bounced = !(pageviewCount > 1 || hasCta || durationSec >= 10);
      const lastSeenAt = new Date(startedAt.getTime() + durationSec * 1000);
      const isLead = plan.profile === 'lead';

      sessionRows.push({
        id: sessionId,
        visitorId,
        startedAt,
        lastSeenAt,
        entryPath: plan.entryPath,
        exitPath: pagePaths[pagePaths.length - 1],
        referrer: plan.referrer.referrer ?? null,
        channel,
        utmSource: plan.referrer.utmSource ?? null,
        utmMedium: plan.referrer.utmMedium ?? null,
        utmCampaign: plan.referrer.utmCampaign ?? null,
        country: 'VN',
        device,
        browser: null,
        os: null,
        lang: plan.lang,
        pageviews: pageviewCount,
        eventsCount: events.length,
        bounced,
        durationSec,
        converted: isLead,
      });

      for (const e of events) {
        eventRows.push({
          occurredAt: new Date(startedAt.getTime() + e.offsetSec * 1000),
          visitorId,
          sessionId,
          kind: e.kind,
          path: e.path,
          title: null,
          referrer: plan.referrer.referrer ?? null,
          utmSource: plan.referrer.utmSource ?? null,
          utmMedium: plan.referrer.utmMedium ?? null,
          utmCampaign: plan.referrer.utmCampaign ?? null,
          utmTerm: null,
          utmContent: null,
          channel,
          country: 'VN',
          device,
          browser: null,
          os: null,
          lang: plan.lang,
          catalogSlug: e.catalogSlug ?? null,
          productSlug: e.productSlug ?? null,
          meta: (e.meta ?? undefined) as object | undefined,
        });
      }

      if (isLead) {
        const payload = LEAD_PAYLOADS[leadRows.length % LEAD_PAYLOADS.length];
        leadRows.push({
          formKey: 'contact',
          payload: {
            name: payload.name,
            email: `${sessionId}@example.com`,
            message: payload.message,
          },
          status: 'NEW',
          ip: null,
          userAgent: plan.ua,
          sessionId,
          visitorId,
          createdAt: new Date(lastSeenAt.getTime() - 5_000),
        });
      }
    });

    for (const s of sessionRows) {
      await prisma.analyticsSession.create({ data: s });
    }
    if (eventRows.length) {
      await prisma.analyticsEvent.createMany({ data: eventRows });
    }
    for (const l of leadRows) {
      await prisma.formSubmission.create({ data: l });
    }

    console.log(
      `seeded ${eventRows.length} events / ${sessionRows.length} sessions / ${leadRows.length} leads`,
    );
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    Logger.error(`seed:analytics FAILED — ${message}`, stack, 'seed-analytics');
    process.exit(1);
  });
