import { NextResponse, type NextRequest } from "next/server";
import { isAllowedOrigin } from "@/app/lib/origin";
import { apiServer, SESSION_COOKIE } from "@/app/lib/api";

export async function POST(req: NextRequest) {
  if (!isAllowedOrigin(req.headers.get("origin"))) {
    return NextResponse.json({ ok: false, error: "bad origin" }, { status: 403 });
  }
  // Revoke server-side (instant kill), then clear the cookie regardless of api outcome.
  await apiServer("/api/auth/logout", { method: "POST" });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
