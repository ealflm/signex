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
    const channel = classifyChannel(input.referrer, input);
    const device = parseDevice(ctx.ua);
    const browser = parseBrowser(ctx.ua) ?? null;
    const os = parseOs(ctx.ua) ?? null;
    const now = new Date();

    // Session upsert — a denormalized convenience; swallow independently so a
    // race/failure here never blocks the event insert.
    try {
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
    } catch {
      // session rollup only; events are the source of truth
    }

    // Event insert — the source of truth; always attempted.
    try {
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
      // fire-and-forget
    }
  }
}
