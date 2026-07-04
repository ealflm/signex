import { describe, it, expect, beforeEach, vi } from "vitest";

beforeEach(() => {
  vi.resetModules(); // re-evaluate BASE_PATH const on each import
  delete process.env.NEXT_PUBLIC_BASE_PATH;
});

describe("adminApi / BASE_PATH", () => {
  it("returns the path unchanged when no base path is set (dev)", async () => {
    const { adminApi, BASE_PATH } = await import("./base-path");
    expect(BASE_PATH).toBe("");
    expect(adminApi("/admin-api/assets")).toBe("/admin-api/assets");
  });

  it("prefixes the base path when set (prod)", async () => {
    process.env.NEXT_PUBLIC_BASE_PATH = "/admin";
    const { adminApi, BASE_PATH } = await import("./base-path");
    expect(BASE_PATH).toBe("/admin");
    expect(adminApi("/admin-api/assets")).toBe("/admin/admin-api/assets");
    expect(adminApi(`/admin-api/themes/abc/save-draft`)).toBe("/admin/admin-api/themes/abc/save-draft");
  });
});
