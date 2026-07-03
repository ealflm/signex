// app/api/analytics/realtime/route.ts
import { NextResponse } from "next/server";
import { requireRole } from "@/app/lib/session";
import { apiServer } from "@/app/lib/api";
import type { RealtimeResponse } from "@signex/shared";

export async function GET() {
  await requireRole("EDITOR");
  const res = await apiServer<RealtimeResponse>("/api/analytics/realtime");
  return NextResponse.json(res.ok ? res.data : { activeVisitors: 0, perMinute: [], topPages: [], recent: [] });
}
