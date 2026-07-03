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
