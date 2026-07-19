import { describe, it, expect, vi, beforeEach } from "vitest";

const cookieStore = { get: vi.fn() };
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => cookieStore),
}));

beforeEach(() => {
  vi.restoreAllMocks();
  process.env.API_URL = "http://api:3060";
  process.env.ADMIN_ORIGIN = "http://localhost:3061";
  cookieStore.get.mockReset();
});

// Helper to extract the [url, init] args from a fetch mock call with proper typing.
function fetchCall(fetchMock: ReturnType<typeof vi.fn>, index = 0): [string, RequestInit] {
  return (fetchMock.mock.calls as unknown as [string, RequestInit][])[index]!;
}

describe("apiServer", () => {
  it("forwards the resolved sx_session cookie as a Bearer token (cookie-bug fix)", async () => {
    cookieStore.get.mockReturnValue({ value: "raw-token-123" });
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: "u1" }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { apiServer } = await import("./api");
    const res = await apiServer("/api/auth/me");

    expect(res).toEqual({ ok: true, status: 200, data: { id: "u1" } });
    const [url, init] = fetchCall(fetchMock);
    expect(url).toBe("http://api:3060/api/auth/me");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer raw-token-123");
  });

  it("sends NO Authorization header when there is no cookie and no explicit token", async () => {
    cookieStore.get.mockReturnValue(undefined);
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const { apiServer } = await import("./api");
    await apiServer("/api/auth/me");
    const [, init] = fetchCall(fetchMock);
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("prefers an explicit token over the cookie", async () => {
    cookieStore.get.mockReturnValue({ value: "cookie-token" });
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const { apiServer } = await import("./api");
    await apiServer("/api/auth/me", { token: "explicit-token" });
    const [, init] = fetchCall(fetchMock);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer explicit-token");
  });

  it("returns ok:false with the api error message on non-2xx", async () => {
    cookieStore.get.mockReturnValue({ value: "t" });
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ message: "STALE_DRAFT" }), { status: 409, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { apiServer } = await import("./api");
    const res = await apiServer("/api/content/blocks/PAGE/home.hero", { method: "PUT", body: { data: {}, expectedRevision: 1 } });
    expect(res).toEqual({ ok: false, status: 409, error: "STALE_DRAFT" });
  });

  it("folds the zod-pipe validation detail into the error, so a 422 is not an undiagnosable 'Validation failed'", async () => {
    // The api's ZodValidationPipe answers { message: "Validation failed", errors: [{path, message}] }.
    // Keeping only `message` (as this boundary used to) is exactly why a customer's failed video
    // upload surfaced as a bare "Validation failed" with no field, no limit, nothing to act on.
    cookieStore.get.mockReturnValue({ value: "t" });
    const body = {
      message: "Validation failed",
      errors: [{ path: "bytes", message: "file size 262144000 exceeds size cap 209715200 for video/mp4" }],
    };
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(body), { status: 422, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { apiServer } = await import("./api");
    const res = await apiServer("/api/assets/presign", { method: "POST", body: {} });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(422);
    // The specific cause must survive the boundary.
    expect(res.error).toContain("exceeds size cap");
    expect(res.error).toContain("Validation failed");
  });

  it("joins multiple zod issues so no field's reason is dropped", async () => {
    cookieStore.get.mockReturnValue({ value: "t" });
    const body = {
      message: "Validation failed",
      errors: [
        { path: "mime", message: "mime not in allowlist" },
        { path: "bytes", message: "file size … exceeds size cap …" },
      ],
    };
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(body), { status: 422, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { apiServer } = await import("./api");
    const res = await apiServer("/api/assets/presign", { method: "POST", body: {} });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("mime not in allowlist");
    expect(res.error).toContain("exceeds size cap");
  });

  it("leaves a message-only error untouched (no trailing colon when there are no issues)", async () => {
    // Regression guard for the STALE_DRAFT shape above: folding must be a no-op when `errors` is absent.
    cookieStore.get.mockReturnValue({ value: "t" });
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ message: "STALE_DRAFT" }), { status: 409, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { apiServer } = await import("./api");
    const res = await apiServer("/api/x", { method: "PUT", body: {} });
    expect(res).toEqual({ ok: false, status: 409, error: "STALE_DRAFT" });
  });

  it("JSON-encodes the body and sets content-type for writes", async () => {
    cookieStore.get.mockReturnValue({ value: "t" });
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const { apiServer } = await import("./api");
    await apiServer("/api/releases/publish", { method: "POST", body: { note: "x", expectedRevision: 2 } });
    const [, init] = fetchCall(fetchMock);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ note: "x", expectedRevision: 2 }));
  });
});
