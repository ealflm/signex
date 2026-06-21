// proxy.ts — Next 16 renamed `middleware` to `proxy` (same level as app/).
// UX redirect ONLY: bounce visitors with no sx_session cookie to /login, and bounce
// logged-in visitors away from /login. This is NOT the security boundary — every (dash)
// render calls getSession()->/api/auth/me, and the api re-checks each guarded route.
import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "sx_session";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === "/login") {
    if (hasSession) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Gate app pages; exclude Next internals, the same-origin route handlers (/admin-api),
  // static assets, and any path with a file extension.
  matcher: ["/((?!_next/static|_next/image|admin-api|favicon.ico|.*\\..*).*)"],
};
