import { describe, it, expect, beforeEach } from "vitest";

describe("isAllowedOrigin", () => {
  beforeEach(() => {
    process.env.API_URL = "http://localhost:3060";
    process.env.ADMIN_ORIGIN = "http://localhost:3061";
    process.env.ALLOWED_ORIGINS = "http://localhost:3061,https://admin.signex.test";
  });

  it("accepts the admin origin", async () => {
    const { isAllowedOrigin } = await import("./origin");
    expect(isAllowedOrigin("http://localhost:3061")).toBe(true);
  });

  it("accepts any explicitly-allowed origin", async () => {
    const { isAllowedOrigin } = await import("./origin");
    expect(isAllowedOrigin("https://admin.signex.test")).toBe(true);
  });

  it("rejects an unknown origin", async () => {
    const { isAllowedOrigin } = await import("./origin");
    expect(isAllowedOrigin("https://evil.example")).toBe(false);
  });

  it("rejects a null Origin header (no same-site guarantee)", async () => {
    const { isAllowedOrigin } = await import("./origin");
    expect(isAllowedOrigin(null)).toBe(false);
  });
});
