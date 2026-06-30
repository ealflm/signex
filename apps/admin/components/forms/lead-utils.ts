/**
 * Payload helpers for the Leads inbox.
 *
 * The submitted payload is free-form — different public forms send different
 * keys (a quote sends company; a contact sends subject) — so these read the
 * known contact/request fields leniently and expose every *remaining* key
 * generically. Nothing the client submits is ever dropped: known fields get a
 * first-class slot, anything else falls through to `rest`.
 */

export interface LeadFields {
  name: string;
  email: string;
  phone: string;
  company: string;
  subject: string;
  message: string;
  /** Every payload key not surfaced above, in submission order. */
  rest: Array<{ key: string; value: string }>;
}

const EMPTY: LeadFields = {
  name: "",
  email: "",
  phone: "",
  company: "",
  subject: "",
  message: "",
  rest: [],
};

/** Keys (lowercased) that are surfaced as first-class fields and so excluded from `rest`. */
const KNOWN = new Set([
  "name",
  "fullname",
  "full_name",
  "email",
  "e-mail",
  "phone",
  "tel",
  "telephone",
  "mobile",
  "company",
  "organization",
  "organisation",
  "subject",
  "topic",
  "message",
  "note",
  "notes",
  "content",
  "comment",
  "comments",
]);

/** First non-empty string/number among `keys`, trimmed. */
function pick(p: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = p[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return "";
}

/** Read a submission payload into known contact/request fields + the leftover `rest`. */
export function readLead(payload: unknown): LeadFields {
  if (!payload || typeof payload !== "object") return EMPTY;
  const p = payload as Record<string, unknown>;

  const rest: Array<{ key: string; value: string }> = [];
  for (const [key, raw] of Object.entries(p)) {
    if (KNOWN.has(key.toLowerCase())) continue;
    if (raw == null || raw === "") continue;
    rest.push({
      key,
      value:
        typeof raw === "object" ? JSON.stringify(raw, null, 2) : String(raw),
    });
  }

  return {
    name: pick(p, ["name", "fullName", "full_name", "fullname"]),
    email: pick(p, ["email", "e-mail"]),
    phone: pick(p, ["phone", "tel", "telephone", "mobile"]),
    company: pick(p, ["company", "organization", "organisation"]),
    subject: pick(p, ["subject", "topic"]),
    message: pick(p, ["message", "note", "notes", "content", "comment", "comments"]),
    rest,
  };
}

/** One-line gist of the request for an inbox row — the message, else the subject, else the company. */
export function previewOf(payload: unknown): string {
  const f = readLead(payload);
  return f.message || f.subject || f.company || "";
}

/** A payload key as a human label: "fullName" / "full_name" → "Full name". */
export function humanizeKey(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
