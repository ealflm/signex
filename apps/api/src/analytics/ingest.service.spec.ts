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

  it("still records the event when the session write fails", async () => {
    const prisma = makePrisma();
    prisma.client.analyticsSession.findUnique.mockRejectedValue(new Error("session db err"));
    const svc = await makeService(prisma);
    await svc.ingest(ev(), ctx);
    expect(prisma.client.analyticsEvent.create).toHaveBeenCalledTimes(1);
  });
});
