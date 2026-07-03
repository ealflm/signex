import { describe, it, expect, vi, beforeEach } from "vitest";

const apiServer = vi.fn();
vi.mock("./api", () => ({ apiServer: (...a: unknown[]) => apiServer(...a) }));

beforeEach(() => {
  apiServer.mockReset();
});

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
