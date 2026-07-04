// The admin is served under a URL sub-path in production ("/admin") or at root in dev ("").
// Next's basePath prepends to <Link>, router.push() and server redirect() — but NOT to raw
// fetch("/…") string literals or Set-Cookie `path`. This module is the single source of truth
// for that prefix. NEXT_PUBLIC_BASE_PATH is inlined at build time by Next (both bundles).
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Prefix a same-origin path with the admin base path (no-op in dev). */
export function adminApi(path: string): string {
  return `${BASE_PATH}${path}`;
}

/** Inverse of adminApi: strip a leading BASE_PATH from an already-resolved pathname. */
export function stripBasePath(path: string): string {
  if (!BASE_PATH) return path;
  if (path === BASE_PATH) return "/";
  if (path.startsWith(BASE_PATH + "/")) return path.slice(BASE_PATH.length);
  return path;
}
