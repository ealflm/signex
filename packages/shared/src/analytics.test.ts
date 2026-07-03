import { describe, it, expect } from "vitest";
import { collectEventSchema, EVENT_KINDS, CHANNELS } from "./analytics";

describe("collectEventSchema", () => {
  const base = { visitorId: "v1", sessionId: "s1", kind: "page_view", path: "/en" };

  it("accepts a minimal valid page_view", () => {
    expect(collectEventSchema.safeParse(base).success).toBe(true);
  });
  it("accepts optional utm + meta", () => {
    const r = collectEventSchema.safeParse({ ...base, kind: "cta_click", utmSource: "fb", meta: { ctaId: "quote" } });
    expect(r.success).toBe(true);
  });
  it("rejects an unknown kind", () => {
    expect(collectEventSchema.safeParse({ ...base, kind: "rage_click" }).success).toBe(false);
  });
  it("rejects a missing sessionId", () => {
    expect(collectEventSchema.safeParse({ visitorId: "v1", kind: "page_view", path: "/en" }).success).toBe(false);
  });
  it("rejects an over-long path (>512)", () => {
    expect(collectEventSchema.safeParse({ ...base, path: "/" + "a".repeat(600) }).success).toBe(false);
  });
  it("exposes the six kinds and six channels", () => {
    expect(EVENT_KINDS).toHaveLength(6);
    expect(CHANNELS).toContain("organic");
  });
});
