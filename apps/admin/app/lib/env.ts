// Typed, server-only accessor for the admin's runtime env. Throws fast on missing
// required vars so a misconfigured container fails at boot, not mid-request.
export interface AdminEnv {
  API_URL: string;
  ADMIN_ORIGIN: string;
  ALLOWED_ORIGINS: string[];
  REVALIDATE_SECRET: string;
  PREVIEW_SECRET: string;
  NEXT_PUBLIC_WEB_URL: string;
}

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

export function env(): AdminEnv {
  const adminOrigin = req("ADMIN_ORIGIN");
  const allowed = (process.env.ALLOWED_ORIGINS ?? adminOrigin)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // ADMIN_ORIGIN is always allowed even if omitted from ALLOWED_ORIGINS.
  if (!allowed.includes(adminOrigin)) allowed.push(adminOrigin);
  return {
    API_URL: req("API_URL"),
    ADMIN_ORIGIN: adminOrigin,
    ALLOWED_ORIGINS: allowed,
    REVALIDATE_SECRET: process.env.REVALIDATE_SECRET ?? "",
    PREVIEW_SECRET: process.env.PREVIEW_SECRET ?? "",
    NEXT_PUBLIC_WEB_URL: process.env.NEXT_PUBLIC_WEB_URL ?? "",
  };
}
