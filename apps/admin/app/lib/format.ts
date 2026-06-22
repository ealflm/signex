/** Shared formatting helpers for the Overview dashboard (locale-stable, SSR-safe). */

/** Compact thousands separator for KPI numbers. e.g. 1234 → "1,234". */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

/** ISO date (YYYY-MM-DD) → short label "Jun 12" (UTC, stable across server/client). */
export function formatDateLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** ISO datetime → relative-ish "today" / "yesterday" / "Jun 12" (UTC-stable). */
export function formatRelativeDate(iso: string): string {
  const then = new Date(iso);
  const now = Date.now();
  const days = Math.floor((now - then.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return then.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Exact ISO datetime → "YYYY-MM-DD" for the table's title tooltip. */
export function formatIsoDay(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/** Best-effort extraction of a person's name + email from a form payload. */
export function readContact(payload: unknown): { name: string; email: string } {
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    const name = typeof p.name === "string" ? p.name : "";
    const email = typeof p.email === "string" ? p.email : "";
    return { name, email };
  }
  return { name: "", email: "" };
}
