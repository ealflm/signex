import { NextResponse, type NextRequest } from "next/server";
import { isAllowedOrigin } from "@/app/lib/origin";
import { SESSION_COOKIE } from "@/app/lib/api";
import { ACTIVE_THEME_COOKIE } from "@/app/lib/themes";

export async function POST(req: NextRequest) {
  if (!isAllowedOrigin(req.headers.get("origin"))) {
    return NextResponse.json({ ok: false, error: "bad origin" }, { status: 403 });
  }

  // Require an active session — this cookie is not a secret but it should
  // only be writable by authenticated users.
  const session = req.cookies.get(SESSION_COOKIE);
  if (!session?.value) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  let themeId: string | undefined;
  try {
    const body = await req.json();
    themeId = typeof body?.themeId === "string" ? body.themeId : undefined;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }

  if (!themeId) {
    return NextResponse.json({ ok: false, error: "themeId is required" }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ACTIVE_THEME_COOKIE, themeId, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    // No explicit maxAge — session-scoped (cleared when browser closes) is fine.
  });
  return res;
}
