// apps/web/app/lib/analytics/tracker.ts
// First-party analytics tracker (browser-only). Fire-and-forget beacons to the
// same-origin BFF route /api/collect. Never throws into the page.
import type { EventKind } from "@signex/shared";

const VID_COOKIE = "sx_vid";
const SID_KEY = "sx_sid";
const SID_TS_KEY = "sx_sid_ts";
const SESSION_GAP_MS = 30 * 60 * 1000;
const COLLECT_URL = "/api/collect";

function uuid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  }
}

function readCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function getVisitorId(): string {
  let vid = readCookie(VID_COOKIE);
  if (!vid) {
    vid = uuid();
    const oneYear = 60 * 60 * 24 * 365;
    document.cookie = `${VID_COOKIE}=${encodeURIComponent(vid)}; Max-Age=${oneYear}; Path=/; SameSite=Lax`;
  }
  return vid;
}

function getSessionId(): string {
  const now = Date.now();
  const last = Number(sessionStorage.getItem(SID_TS_KEY) ?? 0);
  let sid = sessionStorage.getItem(SID_KEY);
  if (!sid || now - last > SESSION_GAP_MS) {
    sid = uuid();
    sessionStorage.setItem(SID_KEY, sid);
  }
  sessionStorage.setItem(SID_TS_KEY, String(now));
  return sid;
}

/** Attribution ids for the lead forms (safe to call in the browser). */
export function getAnalyticsIds(): { visitorId: string; sessionId: string } | null {
  try {
    if (typeof window === "undefined") return null;
    return { visitorId: getVisitorId(), sessionId: getSessionId() };
  } catch {
    return null;
  }
}

function parseUtm(): Record<string, string> {
  const p = new URLSearchParams(window.location.search);
  const out: Record<string, string> = {};
  for (const [key, field] of [
    ["utm_source", "utmSource"], ["utm_medium", "utmMedium"], ["utm_campaign", "utmCampaign"],
    ["utm_term", "utmTerm"], ["utm_content", "utmContent"],
  ] as const) {
    const v = p.get(key);
    if (v) out[field] = v;
  }
  return out;
}

export interface TrackOpts {
  catalogSlug?: string;
  productSlug?: string;
  meta?: Record<string, unknown>;
}

export function track(kind: EventKind, opts: TrackOpts = {}): void {
  try {
    if (typeof window === "undefined") return;
    if (navigator.doNotTrack === "1") return; // honor DNT
    const payload = {
      visitorId: getVisitorId(),
      sessionId: getSessionId(),
      kind,
      path: window.location.pathname,
      title: document.title || undefined,
      referrer: document.referrer || undefined,
      ...parseUtm(),
      lang: document.documentElement.lang || undefined,
      ...opts,
    };
    const blob = new Blob([JSON.stringify(payload)], { type: "text/plain" }); // same-origin; text/plain avoids any preflight
    if (typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(COLLECT_URL, blob);
    } else {
      void fetch(COLLECT_URL, { method: "POST", body: blob, keepalive: true }).catch(() => undefined);
    }
  } catch {
    // analytics must never break the page
  }
}
