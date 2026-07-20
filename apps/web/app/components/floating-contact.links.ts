// Pure link resolver for the two floating buttons — extracted so it is unit-testable
// without rendering. Each button's final href is: explicit link (if set) else derived
// from the businessContact phone (today's behavior). Only http/https/tel/mailto is ever
// emitted; anything else is treated as a bare value and formatted (never passed through).

/** Schemes we emit verbatim. A stray `javascript:`/`data:` never matches → gets formatted away. */
export const SAFE_HREF = /^(https?:|tel:|mailto:)/i;

/** "(+84) 979 700 072" → "tel:+84979700072" — keep digits and one leading +. */
export function telHref(value: string): string {
  const s = value.replace(/[^\d+]/g, "");
  return `tel:${s.startsWith("+") ? "+" + s.slice(1).replace(/\+/g, "") : s.replace(/\+/g, "")}`;
}

/** "(+84) 94 9999 326" → "https://zalo.me/0949999326" — digits, +84/84 prefix normalised to 0. */
export function zaloHref(value: string): string {
  let d = value.replace(/\D/g, "");
  if (d.startsWith("84")) d = "0" + d.slice(2);
  return `https://zalo.me/${d}`;
}

export function resolveCallHref(explicit: string, phone: string | undefined): string {
  const e = (explicit ?? "").trim();
  if (e) {
    if (SAFE_HREF.test(e)) return e;
    const formatted = telHref(e);
    if (/\d/.test(formatted)) return formatted; // a real number was given
    // else: no digits → treat as unset and fall through to the phone
  }
  const p = phone?.trim();
  return p ? telHref(p) : "";
}

export function resolveZaloHref(explicit: string, phone: string | undefined): string {
  const e = (explicit ?? "").trim();
  if (e) {
    if (SAFE_HREF.test(e)) return e;
    const formatted = zaloHref(e);
    if (/\d/.test(formatted)) return formatted; // a real number was given
    // else: no digits → treat as unset and fall through to the phone
  }
  const p = phone?.trim();
  return p ? zaloHref(p) : "";
}

/** The user-facing number behind a resolved href — "tel:+84982633377" → "0982633377",
 *  "https://zalo.me/0979700072" → "0979700072" (84-prefix normalised to 0, same convention as
 *  zaloHref). Null when the target isn't a plain number (Zalo OA/group links, mailto, …): the
 *  button then gets a generic label instead of a fabricated number. */
export function displayNumber(href: string): string | null {
  const m = /^tel:(\+?\d+)$/i.exec(href) ?? /^https:\/\/zalo\.me\/(\d+)$/i.exec(href);
  if (!m) return null;
  let d = m[1];
  if (d.startsWith("+84")) d = "0" + d.slice(3);
  else if (d.startsWith("84") && d.length >= 11) d = "0" + d.slice(2);
  else if (d.startsWith("+")) return null; // non-VN international — don't guess a local format
  return /^\d{9,11}$/.test(d) ? d : null;
}
