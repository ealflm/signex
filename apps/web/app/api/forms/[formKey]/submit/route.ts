// app/api/forms/[formKey]/submit/route.ts
// Same-origin forwarder for public lead submissions (the public BFF, mirroring
// the admin's /admin-api). The browser never needs the API origin or CORS — it
// posts here, and we forward server-side to the API over the internal network.
//
// It also adapts the cloned-from-Webflow form fields to the API's lead schema:
// the markup keeps Webflow's capitalised names (`Name`, `Email`, …) and a
// `Sample` file input, while the API expects lowercase keys and the file under
// `upload`. We lowercase every text key (except the analytics attribution ids
// `sessionId`/`visitorId`, sent verbatim by the tracker's hidden fields — the
// API schema expects that exact casing), route the file to `upload`, and drop
// blank optionals so the stored payload is clean.

const API_URL = process.env.API_URL ?? "http://api:3060";

/** Attachment size ceiling — mirrors the API's UPLOAD_MAX_BYTES (50 MB). */
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** Analytics attribution ids from the tracker (hidden form fields) — the API schema
 *  expects these exact keys, so they must skip the lowercasing below. */
const PRESERVE = new Set(["sessionId", "visitorId"]);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ formKey: string }> },
) {
  const { formKey } = await params;

  let incoming: FormData;
  try {
    incoming = await req.formData();
  } catch {
    return Response.json(
      { ok: false, error: "Expected form data" },
      { status: 400 },
    );
  }

  const body = new FormData();
  for (const [key, value] of incoming.entries()) {
    if (value instanceof File) {
      // The Webflow markup names the file input `Sample`; the API reads `upload`.
      if (value.size > 0) {
        if (value.size > MAX_UPLOAD_BYTES) {
          return Response.json(
            { ok: false, error: "File too large (max 50MB)" },
            { status: 413 },
          );
        }
        body.append("upload", value, value.name);
      }
      continue;
    }
    const trimmed = value.trim();
    if (trimmed !== "") body.append(PRESERVE.has(key) ? key : key.toLowerCase(), trimmed);
  }

  // Preserve the real client for the lead's ip/userAgent record.
  const forwardedFor = req.headers.get("x-forwarded-for");
  const userAgent = req.headers.get("user-agent");

  let apiRes: Response;
  try {
    apiRes = await fetch(
      `${API_URL}/api/forms/${encodeURIComponent(formKey)}/submit`,
      {
        method: "POST",
        body,
        headers: {
          ...(forwardedFor ? { "x-forwarded-for": forwardedFor } : {}),
          ...(userAgent ? { "user-agent": userAgent } : {}),
        },
      },
    );
  } catch {
    return Response.json(
      { ok: false, error: "Could not reach the submission service" },
      { status: 502 },
    );
  }

  const text = await apiRes.text();
  return new Response(text, {
    status: apiRes.status,
    headers: {
      "content-type":
        apiRes.headers.get("content-type") ?? "application/json",
    },
  });
}
