import { Test } from "@nestjs/testing";
import { QueryService } from "./query.service";
import { PrismaService } from "../prisma/prisma.service";

type Where = Record<string, unknown>;
type Row = Record<string, unknown>;

function inDateRange(value: unknown, range: { gte: Date; lt: Date }): boolean {
  return value instanceof Date && value >= range.gte && value < range.lt;
}

/** Minimal Prisma-`where` matcher: supports equality, {gte,lt} ranges, {in}, {not}. */
function matchesWhere(row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, cond]) => {
    const val = row[key];
    if (cond !== null && typeof cond === "object" && !(cond instanceof Date)) {
      const c = cond as { gte?: Date; lt?: Date; in?: unknown[]; not?: unknown };
      if (c.gte !== undefined || c.lt !== undefined) return inDateRange(val, c as { gte: Date; lt: Date });
      if (c.in !== undefined) return c.in.includes(val);
      if ("not" in c) return val !== c.not;
      return false;
    }
    return val === cond;
  });
}

function applySelect(rows: Row[], sel?: Record<string, boolean>): Row[] {
  if (!sel) return rows;
  const keys = Object.keys(sel);
  return rows.map((r) => Object.fromEntries(keys.map((k) => [k, r[k]])));
}

/** In-memory Prisma-table mock: `count`/`findMany` filter the fixture rows by `where`. */
function tableMock(rows: Row[]) {
  return {
    count: jest.fn().mockImplementation(({ where }: { where?: Where } = {}) =>
      Promise.resolve(rows.filter((r) => matchesWhere(r, where ?? {})).length),
    ),
    findMany: jest.fn().mockImplementation(
      ({ where, select }: { where?: Where; select?: Record<string, boolean> } = {}) =>
        Promise.resolve(applySelect(rows.filter((r) => matchesWhere(r, where ?? {})), select)),
    ),
  };
}

async function make(prisma: unknown) {
  const mod = await Test.createTestingModule({
    providers: [QueryService, { provide: PrismaService, useValue: prisma }],
  }).compile();
  return mod.get(QueryService);
}

const RANGE = { from: "2026-06-01T00:00:00.000Z", to: "2026-06-08T00:00:00.000Z" };

describe("QueryService.overview", () => {
  it("headline leads counts only unflagged 'contact' submissions (incl. unattributed); conversionRate is converted-sessions/sessions", async () => {
    const sessions: Row[] = Array.from({ length: 10 }, (_, i) => ({
      id: `s${i}`,
      startedAt: new Date(`2026-06-0${2 + (i % 5)}T00:00:00.000Z`),
      bounced: i < 4, // 4 bounced
      converted: i < 3, // 3 converted
    }));
    const formSubmissions: Row[] = [
      // real, attributed lead -> counted
      { createdAt: new Date("2026-06-02T00:00:00.000Z"), sessionId: "s0", flagged: false, formKey: "contact" },
      // real lead but unattributed (DNT/pre-tracker) -> still counted in headline
      { createdAt: new Date("2026-06-03T00:00:00.000Z"), sessionId: null, flagged: false, formKey: "contact" },
      // flagged as spam -> excluded
      { createdAt: new Date("2026-06-04T00:00:00.000Z"), sessionId: "s1", flagged: true, formKey: "contact" },
      // legacy formKey -> excluded
      { createdAt: new Date("2026-06-05T00:00:00.000Z"), sessionId: "s2", flagged: false, formKey: "quote" },
      // outside range -> excluded
      { createdAt: new Date("2026-06-10T00:00:00.000Z"), sessionId: "s3", flagged: false, formKey: "contact" },
    ];
    const prisma = {
      client: {
        analyticsEvent: {
          findMany: jest.fn().mockResolvedValue(Array.from({ length: 8 }, (_, i) => ({ visitorId: `v${i}` }))),
          count: jest.fn().mockResolvedValue(25),
        },
        analyticsSession: {
          ...tableMock(sessions),
          aggregate: jest.fn().mockResolvedValue({ _avg: { durationSec: 42 } }),
        },
        formSubmission: tableMock(formSubmissions),
      },
    };
    const svc = await make(prisma);
    const res = await svc.overview(RANGE);

    expect(res.current.visitors).toBe(8);
    expect(res.current.pageviews).toBe(25);
    expect(res.current.sessions).toBe(10);
    expect(res.current.avgSessionSec).toBe(42);
    expect(res.current.bounceRate).toBeCloseTo(0.4, 5);
    // Only the two unflagged 'contact' rows count, even though one is unattributed.
    expect(res.current.leads).toBe(2);
    // conversionRate = convertedSessions / sessions, NOT leads / sessions.
    expect(res.current.conversionRate).toBeCloseTo(0.3, 5);
    expect(res.current.conversionRate).toBeLessThanOrEqual(1);
  });
});

describe("QueryService.funnel", () => {
  it("Lead stage counts only attributed, unflagged, 'contact' leads and stays <= Visit", async () => {
    const sessions: Row[] = [
      { id: "s1", startedAt: new Date("2026-06-02T00:00:00.000Z"), channel: "organic" },
      { id: "s2", startedAt: new Date("2026-06-03T00:00:00.000Z"), channel: "paid" },
      { id: "s3", startedAt: new Date("2026-06-04T00:00:00.000Z"), channel: "direct" },
    ]; // 3 visits
    const formSubmissions: Row[] = [
      { createdAt: new Date("2026-06-02T00:00:00.000Z"), sessionId: "s1", flagged: false, formKey: "contact" }, // counted
      { createdAt: new Date("2026-06-02T00:00:00.000Z"), sessionId: null, flagged: false, formKey: "contact" }, // excluded: unattributed
      { createdAt: new Date("2026-06-03T00:00:00.000Z"), sessionId: "s2", flagged: true, formKey: "contact" }, // excluded: flagged spam
      { createdAt: new Date("2026-06-04T00:00:00.000Z"), sessionId: "s3", flagged: false, formKey: "quote" }, // excluded: legacy formKey
      { createdAt: new Date("2026-06-02T00:00:00.000Z"), sessionId: "s1", flagged: false, formKey: "contact" }, // counted (2nd lead, same session)
    ];
    const prisma = {
      client: {
        analyticsSession: tableMock(sessions),
        analyticsEvent: { findMany: jest.fn().mockResolvedValue([]) },
        formSubmission: tableMock(formSubmissions),
      },
    };
    const svc = await make(prisma);
    const res = await svc.funnel(RANGE);

    const visit = res.stages.find((s) => s.stage === "Visit")!;
    const lead = res.stages.find((s) => s.stage === "Lead")!;
    expect(visit.count).toBe(3);
    expect(lead.count).toBe(2);
    // Funnel must stay monotonic: Lead is a subset of attributed sessions (<= Visit).
    expect(lead.count).toBeLessThanOrEqual(visit.count);
    expect(res.attribution).toEqual([{ key: "organic", leads: 2 }]);
  });

  it("attribution counts once per lead even when one session has multiple leads", async () => {
    const prisma = {
      client: {
        analyticsSession: {
          count: jest.fn().mockResolvedValue(10),
          findMany: jest.fn().mockResolvedValue([{ id: "s1", channel: "organic" }]),
        },
        analyticsEvent: {
          findMany: jest.fn().mockImplementation((args: { where: { kind: string } }) =>
            Promise.resolve([{ sessionId: "s1" }]),
          ),
        },
        formSubmission: {
          findMany: jest.fn().mockResolvedValue([{ sessionId: "s1" }, { sessionId: "s1" }]),
        },
      },
    };
    const svc = await make(prisma);
    const res = await svc.funnel(RANGE);
    expect(res.stages.find((s) => s.stage === "Lead")!.count).toBe(2);
    expect(res.attribution).toEqual([{ key: "organic", leads: 2 }]);
  });
});
