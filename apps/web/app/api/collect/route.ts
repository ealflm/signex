// app/api/collect/route.ts
// Same-origin ingest → forwards to the API server-side (BFF), so the browser
// never talks cross-origin. Always 204; never blocks on the forward.
import type { NextRequest } from "next/server";

const API_URL = process.env.API_URL ?? "http://api:3060";

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const bodyText = await req.text();
    const headers: Record<string, string> = { "content-type": "application/json" };
    const country = req.headers.get("cf-ipcountry");
    if (country) headers["x-country"] = country;
    const xff = req.headers.get("x-forwarded-for");
    if (xff) headers["x-forwarded-for"] = xff;
    const ua = req.headers.get("user-agent");
    if (ua) headers["user-agent"] = ua;
    await fetch(`${API_URL}/api/collect`, { method: "POST", body: bodyText, headers }).catch(() => undefined);
  } catch {
    /* ignore */
  }
  return new Response(null, { status: 204 });
}
