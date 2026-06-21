import { NextResponse, type NextRequest } from "next/server";
import { isAllowedOrigin } from "@/app/lib/origin";
import { apiServer } from "@/app/lib/api";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// RouteContext is generated globally by `next build`/`next typegen`; inline the shape
// here so `tsc --noEmit` passes before the first build.
interface CatchAllCtx {
  params: Promise<{ path: string[] }>;
}

async function forward(req: NextRequest, ctx: CatchAllCtx) {
  // CSRF: enforce the Origin allowlist on every state-changing call.
  if (WRITE_METHODS.has(req.method) && !isAllowedOrigin(req.headers.get("origin"))) {
    return NextResponse.json({ ok: false, error: "bad origin" }, { status: 403 });
  }

  const { path } = await ctx.params;
  const search = req.nextUrl.search;
  const apiPath = `/api/${path.join("/")}${search}`;

  let body: unknown = undefined;
  if (WRITE_METHODS.has(req.method)) {
    body = await req.json().catch(() => undefined);
  }

  // apiServer reads the sx_session cookie and forwards it as Authorization: Bearer <token>.
  // We do NOT forward the browser cookie header to the api — Bearer only.
  const result = await apiServer(apiPath, { method: req.method, body });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status || 502 });
  }
  return NextResponse.json(result.data ?? { ok: true }, { status: result.status });
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
