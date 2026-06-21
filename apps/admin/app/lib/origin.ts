import { env } from "./env";

// CSRF gate enforced at the admin route handlers (where the real browser request lands).
// A null/absent Origin is rejected: same-site fetch() from our own pages always sends one.
export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  return env().ALLOWED_ORIGINS.includes(origin);
}
