import { cookies } from "next/headers";
import { env } from "./env";

// The browser session cookie name (host-only, re-issued by the admin login route handler).
export const SESSION_COOKIE = "sx_session";

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string };

export interface ApiOpts {
  method?: string;
  body?: unknown;
  token?: string; // explicit override; otherwise resolved from the sx_session cookie
  headers?: Record<string, string>;
}

// Server-side api client. The browser NEVER calls the api directly — it hits same-origin
// admin route handlers / server actions, which call this and forward the session as a Bearer.
export async function apiServer<T = unknown>(path: string, opts: ApiOpts = {}): Promise<ApiResult<T>> {
  // COOKIE-BUG FIX: resolve the cookie BEFORE the truthiness check. `cookies()` returns a
  // Promise (always truthy) — `opts.token ?? cookies()` would send `Bearer [object Promise]`.
  const token = opts.token ?? (await cookies()).get(SESSION_COOKIE)?.value;

  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`${env().API_URL}${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
    });
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : "network error" };
  }

  const text = await res.text();
  let parsed: unknown = undefined;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = text;
  }

  if (!res.ok) {
    const obj = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : undefined;
    const base =
      (obj && "message" in obj ? String(obj.message) : undefined) ?? text ?? `HTTP ${res.status}`;
    // The api's ZodValidationPipe answers { message: "Validation failed", errors: [{path, message}] }.
    // Keeping only `message` drops the one thing that makes a 422 actionable — WHICH field and WHICH
    // limit failed. Fold the issue messages in so the specific cause survives this boundary (and the
    // admin-api proxy that forwards `error` downstream) instead of reaching the browser as a bare,
    // undiagnosable "Validation failed".
    const details = Array.isArray(obj?.errors)
      ? (obj.errors as Array<{ message?: unknown }>)
          .map((e) => (e && typeof e.message === "string" ? e.message : ""))
          .filter(Boolean)
      : [];
    const error = details.length ? `${base}: ${details.join("; ")}` : base;
    return { ok: false, status: res.status, error };
  }
  return { ok: true, status: res.status, data: parsed as T };
}
