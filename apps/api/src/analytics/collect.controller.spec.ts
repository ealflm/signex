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
