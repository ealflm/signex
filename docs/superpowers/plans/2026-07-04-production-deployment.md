# Production Deployment (signex.vn) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing Docker Compose stack production-deployable on a single VPS behind a host-level nginx + Let's Encrypt, serving web at `https://signex.vn/`, admin at `https://signex.vn/admin`, and media at `https://signex.vn/signex-media/`, with the NestJS API and Postgres kept private.

**Architecture:** Host nginx (already installed, systemd) terminates TLS via certbot and reverse-proxies to loopback-bound containers. The front-ends use a BFF pattern (browser → own-origin route handlers → internal `api:3060`), so the API is never publicly exposed. The only code change is putting the admin under a `/admin` basePath; everything else is config, Dockerfile, env, and docs.

**Tech Stack:** Docker Compose, node:20-alpine images, Next.js 16.2.7 (web + admin, standalone output), NestJS 11 (api), Prisma 6 + Postgres 16, MinIO (S3-compatible), nginx + certbot on the host, vitest (admin unit tests).

## Global Constraints

- Node `>=18`, npm workspaces + Turborepo, single root lockfile. Do not add dependencies.
- **Next 16.2.7 differs from training data** — read `apps/admin/node_modules/next/dist/docs/` before touching admin Next config/routing. (`apps/admin/AGENTS.md`)
- **Dev must keep working unchanged:** every new behavior is gated on `NEXT_PUBLIC_BASE_PATH`/`BIND_IP` whose defaults reproduce today's dev behavior (`""` / `0.0.0.0`). `npm run dev` must be unaffected.
- Single canonical origin in production: **`https://signex.vn`** (www redirects to it). All CORS/CSRF/cookie config uses this one origin.
- The API (`api:3060`) and Postgres stay **internal** — no public route, loopback host bindings only.
- Media proxy through nginx must **not rewrite the path** — the SigV4 presign signature is computed against `R2_PUBLIC_ENDPOINT=https://signex.vn` + path `/signex-media/<key>` + host `signex.vn`, and must reach MinIO unchanged.
- `NEXT_PUBLIC_*` vars are **inlined at build time** — they must be passed as Docker build args, not just runtime env.
- Spec of record: `docs/superpowers/specs/2026-07-04-production-deployment-design.md`.

---

## File Structure

**New files**
- `apps/admin/app/lib/base-path.ts` — exports `BASE_PATH` + `adminApi(path)`; the single source of truth for the admin's URL prefix. Consumed by every client `fetch('/admin-api/…')` call site and the login/logout cookie `path`.
- `apps/admin/app/lib/base-path.test.ts` — vitest unit test for the helper.
- `deploy/nginx/signex.vn.conf` — in-repo copy of the host nginx site config (operator installs it to `/etc/nginx/sites-available/`).

**Modified files**
- `apps/admin/next.config.ts` — add env-driven `basePath`.
- 6 admin client files (13 call sites) — wrap `fetch('/admin-api/…')` with `adminApi(...)`.
- `apps/admin/app/admin-api/auth/login/route.ts` + `.../logout/route.ts` — cookie `path` → `BASE_PATH || "/"`.
- `apps/admin/Dockerfile` — `NEXT_PUBLIC_BASE_PATH` build ARG/ENV + basePath-aware healthcheck.
- `docker-compose.yml` — `${BIND_IP:-0.0.0.0}` host bindings + admin `build.args.NEXT_PUBLIC_BASE_PATH`.
- `.env.example` — `BIND_IP`, `NEXT_PUBLIC_BASE_PATH`, production `signex.vn` guidance.
- `README.md` — production deploy runbook.

**Not changed:** api source (already BFF-internal), web source, Prisma schema, migrations.

---

## Task 1: Admin basePath foundation (helper + next.config)

**Files:**
- Create: `apps/admin/app/lib/base-path.ts`
- Create: `apps/admin/app/lib/base-path.test.ts`
- Modify: `apps/admin/next.config.ts`

**Interfaces:**
- Produces: `BASE_PATH: string` (`""` in dev, `"/admin"` in prod) and `adminApi(path: string): string` (returns `` `${BASE_PATH}${path}` ``). Tasks 2 consume both.

- [ ] **Step 1: Write the failing test**

Create `apps/admin/app/lib/base-path.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

beforeEach(() => {
  vi.resetModules(); // re-evaluate BASE_PATH const on each import
  delete process.env.NEXT_PUBLIC_BASE_PATH;
});

describe("adminApi / BASE_PATH", () => {
  it("returns the path unchanged when no base path is set (dev)", async () => {
    const { adminApi, BASE_PATH } = await import("./base-path");
    expect(BASE_PATH).toBe("");
    expect(adminApi("/admin-api/assets")).toBe("/admin-api/assets");
  });

  it("prefixes the base path when set (prod)", async () => {
    process.env.NEXT_PUBLIC_BASE_PATH = "/admin";
    const { adminApi, BASE_PATH } = await import("./base-path");
    expect(BASE_PATH).toBe("/admin");
    expect(adminApi("/admin-api/assets")).toBe("/admin/admin-api/assets");
    expect(adminApi(`/admin-api/themes/abc/save-draft`)).toBe("/admin/admin-api/themes/abc/save-draft");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @signex/admin -- base-path`
Expected: FAIL — `Cannot find module './base-path'`.

- [ ] **Step 3: Create the helper**

Create `apps/admin/app/lib/base-path.ts`:

```ts
// The admin is served under a URL sub-path in production ("/admin") or at root in dev ("").
// Next's basePath prepends to <Link>, router.push() and server redirect() — but NOT to raw
// fetch("/…") string literals or Set-Cookie `path`. This module is the single source of truth
// for that prefix. NEXT_PUBLIC_BASE_PATH is inlined at build time by Next (both bundles).
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Prefix a same-origin path with the admin base path (no-op in dev). */
export function adminApi(path: string): string {
  return `${BASE_PATH}${path}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace @signex/admin -- base-path`
Expected: PASS (2 tests).

- [ ] **Step 5: Add env-driven basePath to next.config**

Modify `apps/admin/next.config.ts` — add the `basePath` line to the config object:

```ts
const nextConfig: NextConfig = {
  // Prod serves the admin under /admin (set NEXT_PUBLIC_BASE_PATH at build time); dev leaves it
  // unset → root. Empty string coerces to undefined so Next omits basePath entirely in dev.
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
  // Emit a self-contained production server at .next/standalone for a small Docker image.
  output: "standalone",
  // apps/admin -> repo root is two levels up.
  outputFileTracingRoot: path.join(__dirname, "../../"),
};
```

- [ ] **Step 6: Verify dev build still succeeds with no basePath**

Run: `npm run build --workspace @signex/admin`
Expected: PASS — build completes; the route table shows routes at root (`/login`, not `/admin/login`) because `NEXT_PUBLIC_BASE_PATH` is unset.

- [ ] **Step 7: Verify a prod-style build applies the basePath**

Run: `NEXT_PUBLIC_BASE_PATH=/admin npm run build --workspace @signex/admin`
Expected: PASS — the build output lists routes under `/admin` (e.g. `/admin/login`).

- [ ] **Step 8: Commit**

```bash
git add apps/admin/app/lib/base-path.ts apps/admin/app/lib/base-path.test.ts apps/admin/next.config.ts
git commit -m "feat(admin): env-driven basePath + adminApi() path helper"
```

---

## Task 2: Apply BASE_PATH to all call sites (13 fetches + login/logout cookie)

**Files:**
- Modify: `apps/admin/app/login/page.tsx:40`
- Modify: `apps/admin/app/(dash)/catalog/catalog-image-picker.tsx:55`
- Modify: `apps/admin/app/(dash)/content/[blockKey]/zod-form.tsx:80`
- Modify: `apps/admin/app/(dash)/media/media-manager.tsx:25`
- Modify: `apps/admin/app/(dash)/media/asset-dialog.tsx:63,89,108`
- Modify: `apps/admin/app/lib/upload-asset.ts:84,117`
- Modify: `apps/admin/app/(dash)/editor/editor-shell.tsx:299,456,480,530`
- Modify: `apps/admin/app/admin-api/auth/login/route.ts:55-61`
- Modify: `apps/admin/app/admin-api/auth/logout/route.ts:12`

**Interfaces:**
- Consumes: `adminApi`, `BASE_PATH` from `@/app/lib/base-path` (Task 1).

Each client file gets `import { adminApi } from "@/app/lib/base-path";` at the top (alongside existing imports) and every `fetch("/admin-api/…", …)` / `` fetch(`/admin-api/…`, …) `` becomes `fetch(adminApi("/admin-api/…"), …)` / `` fetch(adminApi(`/admin-api/…`), …) `` — only the **first** argument is wrapped; the init object is unchanged.

- [ ] **Step 1: Edit `login/page.tsx`**

Add `import { adminApi } from "@/app/lib/base-path";`. Change line 40:
- Before: `const res = await fetch("/admin-api/auth/login", {`
- After:  `const res = await fetch(adminApi("/admin-api/auth/login"), {`

- [ ] **Step 2: Edit `catalog/catalog-image-picker.tsx`**

Add the import. Change line 55:
- Before: `const res = await fetch("/admin-api/assets", { cache: "no-store" });`
- After:  `const res = await fetch(adminApi("/admin-api/assets"), { cache: "no-store" });`

- [ ] **Step 3: Edit `content/[blockKey]/zod-form.tsx`**

Add the import. Change line 80:
- Before: `` res = await fetch(`/admin-api/themes/${themeId}/save-draft`, { ``
- After:  `` res = await fetch(adminApi(`/admin-api/themes/${themeId}/save-draft`), { ``

- [ ] **Step 4: Edit `media/media-manager.tsx`**

Add the import. Change line 25:
- Before: `const res = await fetch("/admin-api/assets", { cache: "no-store" });`
- After:  `const res = await fetch(adminApi("/admin-api/assets"), { cache: "no-store" });`

- [ ] **Step 5: Edit `media/asset-dialog.tsx` (3 sites)**

Add the import. Change lines 63, 89, 108:
- L63 before: `` fetch(`/admin-api/assets/usage?assetId=${encodeURIComponent(asset.id)}`, { cache: "no-store" }) ``
  after:  `` fetch(adminApi(`/admin-api/assets/usage?assetId=${encodeURIComponent(asset.id)}`), { cache: "no-store" }) ``
- L89 before: `` const res = await fetch(`/admin-api/assets/${asset.id}/alt`, { ``
  after:  `` const res = await fetch(adminApi(`/admin-api/assets/${asset.id}/alt`), { ``
- L108 before: `` const res = await fetch(`/admin-api/assets/${asset.id}`, { method: "DELETE" }); ``
  after:  `` const res = await fetch(adminApi(`/admin-api/assets/${asset.id}`), { method: "DELETE" }); ``

- [ ] **Step 6: Edit `lib/upload-asset.ts` (2 sites)**

Add the import. Change lines 84, 117:
- L84 before: `const presignRes = await fetch("/admin-api/assets/presign", {`
  after:  `const presignRes = await fetch(adminApi("/admin-api/assets/presign"), {`
- L117 before: `` const confirmRes = await fetch(`/admin-api/assets/${presign.assetId}/confirm`, { ``
  after:  `` const confirmRes = await fetch(adminApi(`/admin-api/assets/${presign.assetId}/confirm`), { ``

- [ ] **Step 7: Edit `editor/editor-shell.tsx` (4 sites)**

Add the import. Change lines 299, 456, 480, 530:
- L299 before: `const res = await fetch("/admin-api/assets", { cache: "no-store" });`
  after:  `const res = await fetch(adminApi("/admin-api/assets"), { cache: "no-store" });`
- L456 before: `` const res = await fetch(`/admin-api/themes/${themeId}/save-draft`, { ``
  after:  `` const res = await fetch(adminApi(`/admin-api/themes/${themeId}/save-draft`), { ``
- L480 before: `` const fresh = await fetch(`/admin-api/themes/${themeId}`, { cache: "no-store" }); ``
  after:  `` const fresh = await fetch(adminApi(`/admin-api/themes/${themeId}`), { cache: "no-store" }); ``
- L530 before: `const res = await fetch("/admin-api/releases/publish", {`
  after:  `const res = await fetch(adminApi("/admin-api/releases/publish"), {`

- [ ] **Step 8: Scope the session cookie to the base path (login route)**

Modify `apps/admin/app/admin-api/auth/login/route.ts`. Add `import { BASE_PATH } from "@/app/lib/base-path";` near the other `@/app/lib` imports. Change the cookie `path` (line 59):
- Before: `    path: "/",`
- After:  `    path: BASE_PATH || "/",`

- [ ] **Step 9: Match the cookie path on logout**

Modify `apps/admin/app/admin-api/auth/logout/route.ts`. Add `import { BASE_PATH } from "@/app/lib/base-path";`. Change line 12:
- Before: `  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });`
- After:  `  res.cookies.set(SESSION_COOKIE, "", { path: BASE_PATH || "/", maxAge: 0 });`

(Clear-path must equal set-path or logout won't remove the cookie.)

- [ ] **Step 10: Verify no bare `/admin-api` fetch remains**

Run: `grep -rn "fetch(" apps/admin/app | grep -F "admin-api" | grep -vF "adminApi("`
Expected: **no matches** (every `fetch(...admin-api...)` now goes through `adminApi(...)`).

- [ ] **Step 11: Lint + unit tests + prod-style build**

Run: `npm run lint --workspace @signex/admin && npm run test --workspace @signex/admin`
Expected: PASS (lint clean; existing vitest suites incl. `base-path` green).
Run: `NEXT_PUBLIC_BASE_PATH=/admin npm run build --workspace @signex/admin`
Expected: PASS — compiles with basePath.

- [ ] **Step 12: Commit**

```bash
git add apps/admin
git commit -m "feat(admin): route all /admin-api fetches + session cookie through BASE_PATH"
```

---

## Task 3: Docker packaging — admin build arg, basePath healthcheck, loopback bindings

**Files:**
- Modify: `apps/admin/Dockerfile`
- Modify: `docker-compose.yml`

**Interfaces:**
- Consumes: `NEXT_PUBLIC_BASE_PATH` (build arg), `BIND_IP` (compose env).

- [ ] **Step 1: Pass the basePath build arg into the admin build stage**

In `apps/admin/Dockerfile`, in the `builder` stage, add the ARG+ENV **before** `RUN npm run build --workspace @signex/admin` (line 30):

```dockerfile
# Baked into the Next bundles at build time (NEXT_PUBLIC_* is inlined, not runtime).
# Empty default = dev/root; compose passes "/admin" for production.
ARG NEXT_PUBLIC_BASE_PATH=""
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH
```

- [ ] **Step 2: Carry the value into the runner stage for the healthcheck**

ARGs do not cross stages. In the `runner` stage, add after the other `ENV` lines (after line 38, before the `USER`/`HEALTHCHECK`):

```dockerfile
ARG NEXT_PUBLIC_BASE_PATH=""
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH
```

- [ ] **Step 3: Make the healthcheck basePath-aware**

With `basePath=/admin`, `/` returns 404 — the current `--spider http://127.0.0.1:3061/` would mark the container unhealthy. Replace the HEALTHCHECK (lines 51-52) with one that targets the public login page under the base path (empty in dev → `/login`):

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=20s \
  CMD wget --no-verbose --tries=1 --spider "http://127.0.0.1:3061${NEXT_PUBLIC_BASE_PATH}/login" || exit 1
```

- [ ] **Step 4: Bind host ports to `${BIND_IP}` in compose**

In `docker-compose.yml`, prefix every `ports:` host mapping with `${BIND_IP:-0.0.0.0}:`. Exact edits:
- `postgres`: `- "${BIND_IP:-0.0.0.0}:${POSTGRES_PORT:-3059}:5432"`
- `minio`: `- "${BIND_IP:-0.0.0.0}:9000:9000"` and `- "${BIND_IP:-0.0.0.0}:9001:9001"`
- `api`: `- "${BIND_IP:-0.0.0.0}:${API_PORT:-3060}:3060"`
- `web`: `- "${BIND_IP:-0.0.0.0}:${WEB_PORT:-3062}:3062"`
- `admin`: `- "${BIND_IP:-0.0.0.0}:${ADMIN_PORT:-3061}:3061"`

- [ ] **Step 5: Pass `NEXT_PUBLIC_BASE_PATH` as an admin build arg in compose**

In `docker-compose.yml`, extend the `admin` service `build:` block:

```yaml
  admin:
    build:
      context: .
      dockerfile: apps/admin/Dockerfile
      args:
        # Baked into the admin bundles so the app serves under /admin in production.
        NEXT_PUBLIC_BASE_PATH: ${NEXT_PUBLIC_BASE_PATH:-}
```

- [ ] **Step 6: Verify compose renders (default = 0.0.0.0)**

Run: `docker compose config | grep -E "published|host_ip" | head`
Expected: parse succeeds; published ports show `host_ip: 0.0.0.0` (dev default).

- [ ] **Step 7: Verify prod env renders loopback bindings**

Run: `BIND_IP=127.0.0.1 docker compose config | grep -E "published|host_ip" | head`
Expected: every `host_ip:` is `127.0.0.1`.

- [ ] **Step 8: Verify the admin image builds with the base path baked in**

Run: `NEXT_PUBLIC_BASE_PATH=/admin docker compose build admin`
Expected: build succeeds (the `NEXT_PUBLIC_BASE_PATH=/admin` build arg flows into `next build`).

- [ ] **Step 9: Commit**

```bash
git add apps/admin/Dockerfile docker-compose.yml
git commit -m "chore(deploy): admin basePath build arg + basePath healthcheck + BIND_IP loopback bindings"
```

---

## Task 4: Host nginx site config (in-repo)

**Files:**
- Create: `deploy/nginx/signex.vn.conf`

- [ ] **Step 1: Write the nginx site config**

Create `deploy/nginx/signex.vn.conf`:

```nginx
# signex.vn — host nginx reverse proxy to the loopback-bound Docker containers.
# Install: sudo cp deploy/nginx/signex.vn.conf /etc/nginx/sites-available/signex.vn.conf
#          sudo ln -s /etc/nginx/sites-available/signex.vn.conf /etc/nginx/sites-enabled/
#          sudo nginx -t && sudo systemctl reload nginx
#          sudo certbot --nginx -d signex.vn -d www.signex.vn   # adds the 443 blocks + redirect
#
# certbot rewrites these listen-80 blocks to add TLS on 443 and an HTTP->HTTPS redirect.

# Canonical redirect: www -> apex. www serves NO content — one origin keeps cookie/CORS/CSP valid.
server {
    listen 80;
    server_name www.signex.vn;
    return 308 https://signex.vn$request_uri;
}

server {
    listen 80;
    server_name signex.vn;

    # Forms accept images + PDF up to 50MB; media presign PUTs pass through here too.
    client_max_body_size 64m;

    # ── Media: self-hosted MinIO exposed at the apex path /signex-media/ ──
    # NO path rewrite: the bucket name IS the first path segment, so the SigV4 signature
    # (signed against https://signex.vn, path /signex-media/<key>, host signex.vn) validates
    # unchanged at MinIO. Host header is forwarded verbatim for the same reason.
    location /signex-media/ {
        proxy_pass http://127.0.0.1:9000;   # no trailing slash -> URI preserved
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # ── Admin (Next standalone, basePath=/admin) ──
    location = /admin { return 308 /admin/; }
    location /admin/ {
        proxy_pass http://127.0.0.1:3061;   # URI preserved; admin expects /admin/*
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # SSE for /admin/admin-api/analytics/realtime
        proxy_set_header Connection "";
        proxy_buffering off;
    }

    # ── Web (public site; owns its own /api/* route handlers) ──
    location / {
        proxy_pass http://127.0.0.1:3062;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

- [ ] **Step 2: Validate the config syntax with a containerized nginx**

Run:
```bash
docker run --rm -v "$PWD/deploy/nginx/signex.vn.conf:/etc/nginx/conf.d/signex.vn.conf:ro" \
  nginx:alpine nginx -t
```
Expected: `nginx: configuration file /etc/nginx/nginx.conf test is successful`.
(`nginx -t` checks syntax only; it does not connect to the 127.0.0.1 upstreams.)

- [ ] **Step 3: Commit**

```bash
git add deploy/nginx/signex.vn.conf
git commit -m "feat(deploy): host nginx site config for signex.vn (web/admin/media + www redirect)"
```

---

## Task 5: `.env.example` production guidance

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add `BIND_IP` next to the service ports**

In `.env.example`, after the `ADMIN_PORT=3061` line (line 22), add:

```bash

# Host interface for published container ports.
#   Production: 127.0.0.1  (loopback-only — the host nginx is the sole client; api/postgres/
#               minio-console are then reachable only via SSH tunnel, never the public NIC).
#   Dev:        leave unset  → 0.0.0.0 (published on all interfaces, as today).
BIND_IP=
```

- [ ] **Step 2: Add `NEXT_PUBLIC_BASE_PATH` in the admin section**

After the `NEXT_PUBLIC_WEB_URL=...` line (near the end), add:

```bash

# Admin URL sub-path. Production serves the admin under /admin (single-domain deploy);
# this is inlined into the admin bundles AT BUILD TIME (passed as a Docker build arg by
# compose). Dev leaves it empty → admin at root (http://localhost:3061/).
NEXT_PUBLIC_BASE_PATH=
```

- [ ] **Step 3: Add a production values reference block**

At the end of `.env.example`, append a commented block documenting the single-domain prod values (operators copy these into the server `.env` and set real secrets):

```bash

# ---------------------------------------------------------------------------
# PRODUCTION (single VPS, one domain https://signex.vn — see
# docs/superpowers/specs/2026-07-04-production-deployment-design.md).
# Copy into the server .env, replace every secret with a strong random value,
# then run `docker compose up -d --build`.
# ---------------------------------------------------------------------------
#   BIND_IP=127.0.0.1
#   NEXT_PUBLIC_BASE_PATH=/admin
#   POSTGRES_PASSWORD=<strong-random>
#   SEED_ADMIN_PASSWORD=<strong-random, >=12 chars, rotate after first login>
#   R2_ACCESS_KEY_ID=<strong-random>            # = MinIO root user
#   R2_SECRET_ACCESS_KEY=<strong-random>        # = MinIO root password
#   R2_ENDPOINT=http://minio:9000               # internal, server-side S3 calls
#   R2_PUBLIC_ENDPOINT=https://signex.vn        # baked into presigned PUT URLs
#   R2_BUCKET=signex-media
#   MEDIA_PUBLIC_BASE=https://signex.vn/signex-media
#   REVALIDATE_SECRET=<strong-random>
#   PREVIEW_SECRET=<strong-random>
#   AUTH_ALLOWED_ORIGINS=https://signex.vn
#   ADMIN_ORIGIN=https://signex.vn
#   ALLOWED_ORIGINS=https://signex.vn
#   PREVIEW_FRAME_ANCESTORS=https://signex.vn
#   NEXT_PUBLIC_WEB_URL=https://signex.vn
#   API_URL=http://api:3060
#   WEB_REVALIDATE_URL=http://web:3062/api/revalidate
# ---------------------------------------------------------------------------
```

- [ ] **Step 4: Verify the keys are present and the file is well-formed**

Run: `grep -E "^BIND_IP=|^NEXT_PUBLIC_BASE_PATH=" .env.example`
Expected: both lines print.
Run: `grep -c "signex.vn" .env.example`
Expected: ≥ 8 (the production block references the real domain).

- [ ] **Step 5: Commit**

```bash
git add .env.example
git commit -m "docs(deploy): document BIND_IP, NEXT_PUBLIC_BASE_PATH + prod signex.vn env"
```

---

## Task 6: README production deploy runbook

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a production deployment section**

In `README.md`, after the `## 2. Full production build (Docker Compose)` section (before `## Useful root scripts`), insert:

````markdown
---

## 3. Production deployment (single VPS — signex.vn)

Host **nginx** (systemd, already installed) terminates TLS via **certbot** and reverse-proxies
to the loopback-bound containers. Web is at `/`, admin at `/admin`, media at `/signex-media/`;
the **api and Postgres stay internal** (no public route). Design:
`docs/superpowers/specs/2026-07-04-production-deployment-design.md`.

### First deploy

```bash
# 1) On the VPS, in the repo:
git pull

# 2) Create the production .env (see the PRODUCTION block in .env.example). Minimum:
#    BIND_IP=127.0.0.1  NEXT_PUBLIC_BASE_PATH=/admin  + strong secrets + https://signex.vn URLs
cp .env.example .env && $EDITOR .env
chmod 600 .env

# 3) Build + start the stack (api auto-runs `prisma migrate deploy` on boot).
docker compose up -d --build
docker compose ps                      # api / web / admin should be (healthy)

# 4) One-time seed: fixed admin user, then initial content Release v1.
docker exec signex-api node dist/auth/seed
docker exec signex-api node dist/importer/importer.command

# 5) nginx + TLS (DNS A records for signex.vn AND www.signex.vn must point here first):
sudo cp deploy/nginx/signex.vn.conf /etc/nginx/sites-available/signex.vn.conf
sudo ln -s /etc/nginx/sites-available/signex.vn.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d signex.vn -d www.signex.vn
```

### Subsequent deploys

```bash
git pull && docker compose up -d --build     # migrations auto-apply; auth:seed is idempotent
```

Re-run the importer only when the dictionary content changes — it refuses once a Theme exists
(content is edited through the admin, not the importer).

### Notes

- **Content:** the importer seeds initial **Release v1** from `apps/web/app/[lang]/dictionaries/{en,vi}.json`.
  Content edited later via the admin lives only in the DB — a fresh deploy starts at v1. To carry
  edited content across environments, dump/restore Postgres, not the importer.
- **Ad-hoc DB backup:** `docker exec signex-postgres pg_dump -U signex signex | gzip > signex-$(date +%F).sql.gz`
- **Media fallback:** if presign uploads ever fail through the path proxy, move MinIO to a
  `media.signex.vn` subdomain (nginx pass-through) and set `R2_PUBLIC_ENDPOINT=https://media.signex.vn`,
  `MEDIA_PUBLIC_BASE=https://media.signex.vn/signex-media`.
````

- [ ] **Step 2: Verify the section renders and links resolve**

Run: `grep -n "## 3. Production deployment" README.md && test -f docs/superpowers/specs/2026-07-04-production-deployment-design.md && echo "spec link OK"`
Expected: the heading line prints and `spec link OK`.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: production deploy runbook (signex.vn, nginx+certbot, seed order)"
```

---

## Task 7: End-to-end verification (operator dry run on the VPS)

**Files:** none (verification only — run after Tasks 1-6 are merged and the stack is deployed per Task 6).

This task is the acceptance gate. Each check maps to a spec §12 requirement.

- [ ] **Step 1: Stack is healthy, api/postgres are private**

Run: `docker compose ps`
Expected: `api`, `web`, `admin`, `postgres`, `minio` all `Up`; api/web/admin `(healthy)`.
Run: `docker compose config | grep -A1 -E "3060|5432" | grep host_ip`
Expected: api's published host_ip is `127.0.0.1` (not `0.0.0.0`); postgres has no public host_ip beyond loopback.

- [ ] **Step 2: www redirects to the apex**

Run: `curl -sI https://www.signex.vn/ | grep -i -E "^HTTP|^location"`
Expected: `HTTP/… 308` and `location: https://signex.vn/`.

- [ ] **Step 3: Public site renders with media URLs**

Run: `curl -s https://signex.vn/en | grep -o "https://signex.vn/signex-media/[^\"']*" | head`
Expected: at least one `https://signex.vn/signex-media/…` asset URL appears.
Run: `curl -sI "https://signex.vn/signex-media/<a-key-from-above>" | grep -i -E "^HTTP|cache-control"`
Expected: `200` with `cache-control: public, max-age=31536000, immutable`.

- [ ] **Step 4: Admin loads under /admin and login sets a scoped cookie**

Open `https://signex.vn/admin` → the login page renders (assets load from `/admin/_next/...`).
Log in with `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD`. In DevTools → Application → Cookies,
confirm `sx_session` has **Path = /admin**, `HttpOnly`, `Secure`, `SameSite=Lax`.

- [ ] **Step 5: Media upload exercises presign-through-proxy (highest-risk path)**

In the admin media manager, upload an image. Expected: upload succeeds and the asset shows READY.
(This validates the SigV4 presigned PUT surviving the nginx apex-path proxy — the key media risk.)
If it fails with a signature error, apply the `media.signex.vn` subdomain fallback (README notes).

- [ ] **Step 6: Publish reflects on the public site**

Edit a content block in the admin, publish, then reload the matching public page.
Expected: the change appears (on-demand revalidation via `WEB_REVALIDATE_URL`).

- [ ] **Step 7: Record the result**

No commit. Report pass/fail per step. Any failure → open a follow-up before declaring the deploy done.

---

## Self-Review notes (already reconciled)

- **Spec coverage:** §4 nginx → Task 4; §5 BIND_IP/compose → Task 3; §6 env → Task 5 (+ server `.env`);
  §7 admin basePath (config, 13 fetches, cookie path, no middleware) → Tasks 1-2; §8 media apex proxy →
  Task 4 config + Task 7 upload check; §9 Postgres/backup note → Task 6 README; §10 seed order → Task 6;
  §11 runbook → Task 6; §12 verification → Task 7. §7's build-time inlining of `NEXT_PUBLIC_BASE_PATH`
  surfaced the Dockerfile/compose build-arg + healthcheck work now captured in Task 3.
- **Not changed:** api/web source, Prisma, migrations (BFF keeps the api internal).
- **Dev safety:** `BIND_IP` default `0.0.0.0`, `NEXT_PUBLIC_BASE_PATH` default `""` → `npm run dev`
  and the dev `docker compose up` behave exactly as today.
