// proxy.ts — Next 16 renamed `middleware` to `proxy` (same level as app/).
// Locale routing: bare paths redirect to the chosen locale (remembered cookie → default vi);
// locale-prefixed paths set a cookie so future bare-path visits stay in language.
import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, hasLocale } from "@/app/lib/i18n-config";

const COOKIE = "NEXT_LOCALE";

// New visitors default to Vietnamese (DEFAULT_LOCALE = "vi"); only a previously-remembered
// choice (the NEXT_LOCALE cookie, set when the user uses the EN/VI toggle) overrides it.
// Browser Accept-Language is intentionally NOT consulted, so the site reliably opens in
// Vietnamese regardless of the visitor's browser language.
function detectLocale(request: NextRequest): string {
  const cookie = request.cookies.get(COOKIE)?.value;
  if (cookie && hasLocale(cookie)) return cookie;
  return DEFAULT_LOCALE;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const segment = pathname.split("/")[1];

  // Already on a locale path → remember the choice for later bare-path visits, and forward
  // the locale as a request header. The header is the reliable source for the localized 404
  // (app/[lang]/not-found.tsx gets no route params, and a freshly-set cookie isn't visible to
  // the same render — but a forwarded request header is).
  if (hasLocale(segment)) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-locale", segment);
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.cookies.set(COOKIE, segment, { path: "/", maxAge: 60 * 60 * 24 * 365 });
    return res;
  }

  // No locale in the path → redirect to the detected locale, preserving the rest.
  const locale = detectLocale(request);
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  // App routes only — exclude Next internals, the vendored Webflow /assets, favicon,
  // and any path containing a file extension (so CSS/JS/images load untouched).
  matcher: ["/((?!_next/static|_next/image|assets/|favicon.ico|.*\\..*).*)"],
};
