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
