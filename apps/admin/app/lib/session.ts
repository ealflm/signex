import { redirect } from "next/navigation";
import { atLeast, type RoleName } from "@signex/shared";
import { apiServer } from "./api";

export interface SessionUser {
  id: string;
  username: string;
  name: string;
  role: RoleName;
}

// Source of truth for "am I logged in" — re-validated server-side on every guarded render /
// server action (the cookie alone is only a UX hint; proxy.ts does the cheap presence check).
// GET /api/auth/me returns { user: { id, username, name, role, isActive } } — unwrap it (returning
// res.data directly leaves role undefined → requireRole bounces every Editor page back to /).
export async function getSession(): Promise<SessionUser | null> {
  const res = await apiServer<{ user: SessionUser }>("/api/auth/me");
  if (!res.ok) return null;
  return res.data?.user ?? null;
}

export async function requireSession(): Promise<SessionUser> {
  const user = await getSession();
  // `?expired=1` tells proxy.ts the cookie was PRESENT but INVALID (revoked / DB reseeded), so it
  // clears the stale cookie and renders /login instead of bouncing back here — otherwise a
  // present-but-invalid cookie ping-pongs / ↔ /login (ERR_TOO_MANY_REDIRECTS).
  if (!user) redirect("/login?expired=1");
  return user;
}

// Affordance + hard re-check: under-ranked users are bounced to the dashboard. The api
// re-checks every guarded route independently — this is defense-in-depth, not the only gate.
export async function requireRole(min: RoleName): Promise<SessionUser> {
  const user = await requireSession();
  if (!atLeast(user.role, min)) redirect("/");
  return user;
}
