import { NextResponse, type NextRequest } from "next/server";
import { loginSchema } from "@signex/shared";
import { isAllowedOrigin } from "@/app/lib/origin";
import { SESSION_COOKIE } from "@/app/lib/api";
import { env } from "@/app/lib/env";

const THIRTY_DAYS = 60 * 60 * 24 * 30; // locked Decisions Log #10

// Pull `sx_session=<raw>` out of the api's Set-Cookie so we can re-issue it host-only.
function extractToken(setCookie: string | null): string | null {
  if (!setCookie) return null;
  const m = setCookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return m ? m[1] : null;
}

export async function POST(req: NextRequest) {
  if (!isAllowedOrigin(req.headers.get("origin"))) {
    return NextResponse.json({ ok: false, error: "bad origin" }, { status: 403 });
  }

  const parsed = loginSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid credentials shape" }, { status: 422 });
  }

  // Use raw fetch — NOT apiServer — so we do NOT attach an absent/stale Bearer to the login call.
  let apiRes: Response;
  try {
    apiRes = await fetch(`${env().API_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
      cache: "no-store",
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "network error" },
      { status: 502 },
    );
  }

  if (!apiRes.ok) {
    return NextResponse.json({ ok: false, error: "login failed" }, { status: apiRes.status });
  }

  const token = extractToken(apiRes.headers.get("set-cookie"));
  if (!token) {
    return NextResponse.json({ ok: false, error: "no session issued" }, { status: 502 });
  }

  const user = await apiRes.json().catch(() => ({}));
  const res = NextResponse.json({ ok: true, user });
  // Re-issue host-only with admin-owned attributes (NOT verbatim-forwarding the api flags).
  // Decision #10: 30-day session, httpOnly, sameSite=lax, secure in production.
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: THIRTY_DAYS,
  });
  return res;
}
