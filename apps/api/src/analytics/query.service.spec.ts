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
