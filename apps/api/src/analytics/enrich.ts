// apps/api/src/analytics/enrich.ts
// Pure server-side enrichment: referrer/utm -> channel, UA -> device/browser/os.
import type { Channel } from "@signex/shared";

const SEARCH_HOSTS = ["google.", "bing.", "duckduckgo.", "coccoc.", "yahoo.", "yandex."];
const SOCIAL_HOSTS = [
  "facebook.", "instagram.", "zalo.", "tiktok.", "youtube.",
  "linkedin.", "twitter.", "x.com", "t.co", "threads.",
];

function refHost(referrer?: string): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).host.toLowerCase();
  } catch {
    return null;
  }
}

export function classifyChannel(
  referrer: string | undefined,
  utm: { utmSource?: string; utmMedium?: string },
): Channel {
  const medium = (utm.utmMedium ?? "").toLowerCase();
  const source = (utm.utmSource ?? "").toLowerCase();
  if (/(^|[-_])(cpc|ppc|paid)/.test(medium) || medium === "paidsearch") return "paid";
  if (medium === "email" || source === "newsletter" || source === "email") return "email";
  const host = refHost(referrer);
  if (medium === "social" || (host !== null && SOCIAL_HOSTS.some((h) => host.includes(h)))) return "social";
  if (host !== null && SEARCH_HOSTS.some((h) => host.includes(h))) return "organic";
  if (host !== null) return "referral";
  return "direct";
}

export type Device = "mobile" | "tablet" | "desktop";

export function parseDevice(ua: string | undefined): Device {
  const s = (ua ?? "").toLowerCase();
  if (/ipad|tablet|playbook|silk/.test(s) || (/android/.test(s) && !/mobile/.test(s))) return "tablet";
  if (/mobi|iphone|ipod|android|blackberry|iemobile|opera mini/.test(s)) return "mobile";
  return "desktop";
}

export function parseBrowser(ua: string | undefined): string | undefined {
  const s = ua ?? "";
  if (/Edg\//.test(s)) return "Edge";
  if (/OPR\/|Opera/.test(s)) return "Opera";
  if (/Chrome\//.test(s) && !/Chromium/.test(s)) return "Chrome";
  if (/Firefox\//.test(s)) return "Firefox";
  if (/Version\/.*Safari\//.test(s)) return "Safari";
  return undefined;
}

export function parseOs(ua: string | undefined): string | undefined {
  const s = ua ?? "";
  if (/Windows NT/.test(s)) return "Windows";
  if (/iPhone|iPad|iPod|iOS/.test(s)) return "iOS";
  if (/Mac OS X/.test(s)) return "macOS";
  if (/Android/.test(s)) return "Android";
  if (/Linux/.test(s)) return "Linux";
  return undefined;
}
