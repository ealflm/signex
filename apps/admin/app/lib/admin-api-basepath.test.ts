import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Regression guard for a recurring PROD-ONLY bug class: the admin is served under a basePath
// ("/admin") in production, and Next does NOT prepend it to raw fetch("/…") / <form action="/…">
// string literals (only <Link>, router.push() and server redirect() get it). So a same-origin
// client call to ANY absolute app path ("/admin-api/…", "/api/…", …) 404s in prod — it hits the
// un-prefixed path instead of the real "/admin/…" route handler — while silently working in dev
// where the basePath is empty. Every such path MUST be wrapped in adminApi() (app/lib/base-path.ts).
//
// This scans source for two raw shapes and fails on any that isn't wrapped in adminApi():
//   fetch("/…")            → must be fetch(adminApi("/…"))
//   <form action="/…">     → must be action={adminApi("/…")}
// Cross-origin fetches use a full URL or an `${API_URL}` template (start with `h`/`$`, not `/`),
// so they never match. See base-path.test.ts for the helper's contract.
const ADMIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const IGNORE_DIRS = new Set(["node_modules", ".next", "dist"]);
// base-path.ts DEFINES adminApi() and documents the very anti-pattern (`fetch("/…")`) in prose.
const EXEMPT = new Set(["app/lib/base-path.ts"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (IGNORE_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

describe("no raw same-origin absolute paths (basePath guard)", () => {
  it("every client fetch()/form-action path is wrapped in adminApi()", () => {
    const files = walk(ADMIN_ROOT);
    expect(files.length).toBeGreaterThan(0); // path-resolution sanity

    // A raw absolute path literal passed straight to fetch(...) or a form action=. The adminApi()
    // wrapper puts `adminApi(` between `fetch(`/`action=` and the quote, so wrapped calls never match.
    const RAW = /(?:fetch\(|action=\{?)\s*(['"`])\//g;
    const offenders: string[] = [];
    for (const file of files) {
      if (EXEMPT.has(path.relative(ADMIN_ROOT, file))) continue;
      const src = readFileSync(file, "utf8");
      let m: RegExpExecArray | null;
      while ((m = RAW.exec(src))) {
        const line = src.slice(0, m.index).split("\n").length;
        const snippet = src.slice(m.index, m.index + 48).split("\n")[0];
        offenders.push(`${path.relative(ADMIN_ROOT, file)}:${line}  ${snippet}`);
      }
    }
    expect(
      offenders,
      `raw same-origin path bypasses the admin basePath — wrap in adminApi():\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
