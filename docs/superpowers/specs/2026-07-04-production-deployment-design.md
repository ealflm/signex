# Production Deployment Design — signex (single VPS)

**Date:** 2026-07-04
**Status:** Approved (design phase)
**Scope:** Deploy the full signex stack (api + web + admin + postgres + minio) to a single
VPS behind a host-level nginx + Let's Encrypt, on **one domain** (`signex.vn`). Deployment is
**manual, built on the VPS**.

---

## 1. Context & current state

The repo already ships a near-production Docker Compose stack:

- `docker-compose.yml` — 6 services (`postgres`, `minio`, `minio-init`, `api`, `web`, `admin`)
  with `NODE_ENV=production`, healthchecks, `restart: unless-stopped`, non-root containers.
- Multi-stage Dockerfiles per app. The **api** container runs `prisma migrate deploy` on
  start, then `node dist/main`.
- Media is S3-compatible and swap-ready: the **same code** runs against bundled MinIO or
  Cloudflare R2 via the `R2_*` env (`apps/api/src/assets/r2.service.ts`, `forcePathStyle: true`,
  a separate presign client keyed on `R2_PUBLIC_ENDPOINT`).
- CI (`.github/workflows/ci.yml`) builds/lints/unit-tests only — no image publish, no deploy.

**Gaps to production:** all URLs default to `localhost`; no HTTPS / reverse proxy; dev secrets;
no deploy runbook; admin has no `basePath` (needed to serve it under a path).

### Key architectural fact — BFF (load-bearing)

The **browser never calls the NestJS API directly.** Each front-end talks only to its own
origin's route handlers, which then call the API **server-side** over the internal Docker
network (`http://api:3060`), forwarding the session as a Bearer token:

- **admin** → browser hits `/admin-api/*` (Next route handlers) → server-side `fetch(${API_URL}/api/*)`.
  Login: browser POSTs `/admin-api/auth/login` → handler calls the api, then **re-issues** the
  `sx_session` cookie host-only on the admin origin (`apps/admin/app/admin-api/auth/login/route.ts`).
- **web** → owns its own `/api/*` route handlers (`/api/collect`, `/api/revalidate`, `/api/draft`,
  `/api/forms/[formKey]/submit`) + reads Postgres directly via `@signex/db` for the public read path.

`NEXT_PUBLIC_API_URL` is **unused** in the source (legacy env). Consequence: **the NestJS API
does not need any public exposure** — it stays entirely inside the Docker network. This removes
the `/api` path collision entirely and shrinks the attack surface.

---

## 2. Goals / non-goals

**Goals**
- Serve everything on one domain over HTTPS: web at `/`, admin at `/admin`, media at `/signex-media/`.
- Keep api + postgres private (no host port, no public route).
- A repeatable manual deploy runbook (build on the VPS, `docker compose up -d --build`).
- First-boot seed (admin user + initial content Release v1) documented.

**Non-goals (explicit, per decisions)**
- No CI/CD auto-deploy pipeline (build-on-VPS, manual).
- No managed Postgres; no automated DB backups (an ad-hoc `pg_dump` one-liner is documented).
- No Cloudflare R2; media stays on self-hosted MinIO.
- No Kubernetes.

---

## 3. Target topology

```
                        Internet — HTTPS :443
                               │
                ┌──────────────▼───────────────┐
                │  Host nginx (systemd)         │  ← certbot / Let's Encrypt (TLS)
                │  server_name signex.vn       │
                └──────────────┬───────────────┘
                proxy_pass → 127.0.0.1 loopback ports
     ┌────────────────┬────────────────────┬──────────────────────┐
     │ location /     │ location /admin/    │ location /signex-media/
     ▼                ▼                     ▼
   web:3062        admin:3061            minio:9000
     │   \             │                       ▲
     │    \ (BFF: server-side call over docker net)
     ▼     ▼           ▼                        │
   api:3060 ◄──────────┘   (NOT published)      │ (browser presign PUT / public GET)
     │                                          │
   postgres:5432 (NOT published)   minio-init (bucket + public-read, one-shot)
```

Public surface via nginx = **web (`/`), admin (`/admin/`), media (`/signex-media/`)** only.
`api` and `postgres` have **no host port** in prod; front-ends reach them over `signex-net`.

---

## 4. Reverse proxy — host nginx + certbot (I write the config)

The VPS already has nginx (global, systemd) + certbot installed. We add **one** site config,
proxying to the loopback-bound container ports. certbot injects the TLS/443 block.

`/etc/nginx/sites-available/signex.conf` (HTTP form; `certbot --nginx` adds 443 + redirect):

```nginx
server {
    listen 80;
    server_name signex.vn;                 # ← real domain

    # Forms accept images + PDF up to 50MB; media uploads pass through too.
    client_max_body_size 64m;

    # ── Media: self-hosted MinIO exposed at the apex path /signex-media/ ──
    # NO path rewrite — the bucket name IS the first path segment, so the SigV4
    # signature (signed against R2_PUBLIC_ENDPOINT=https://signex.vn, path
    # /signex-media/<key>, host signex.vn) validates unchanged at MinIO.
    location /signex-media/ {
        proxy_pass http://127.0.0.1:9000;   # NO trailing slash → path preserved
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # ── Admin (Next, basePath=/admin) ──
    location = /admin { return 308 /admin/; }
    location /admin/ {
        proxy_pass http://127.0.0.1:3061;   # path preserved (admin expects /admin/*)
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

Operator steps (documented, not automated): symlink to `sites-enabled`, `sudo nginx -t`,
`sudo systemctl reload nginx`, `sudo certbot --nginx -d signex.vn`.

nginx longest-prefix matching guarantees `/signex-media/` and `/admin/` win over `/`.

---

## 5. Compose changes for prod (minimal — no overlay file)

Compose merges `ports:` by **concatenation**, not replacement, so a `docker-compose.prod.yml`
overlay that re-binds ports would collide (both `0.0.0.0:3062` and `127.0.0.1:3062`). Instead,
**parameterize the bind address in the base `docker-compose.yml`** — backward-compatible because
the default keeps dev on `0.0.0.0`:

- Wrap every host binding with `${BIND_IP:-0.0.0.0}:` — e.g.
  `"${BIND_IP:-0.0.0.0}:${WEB_PORT:-3062}:3062"` for `web`, and likewise for `admin` (3061),
  `minio` (9000 **and** the 9001 console), `api` (3060), `postgres` (3059).
- Prod `.env` sets `BIND_IP=127.0.0.1` → every container port is loopback-only, reachable by the
  host nginx but never on the public interface (api/postgres/minio-console reachable only via SSH
  tunnel). Dev leaves `BIND_IP` unset → `0.0.0.0`, unchanged.

**No overlay file and no `COMPOSE_FILE` are needed:** the web `MEDIA_PUBLIC_BASE` **build arg** is
already env-driven in the base compose (`args: MEDIA_PUBLIC_BASE: ${MEDIA_PUBLIC_BASE:-…}`), so
setting `MEDIA_PUBLIC_BASE` in `.env` flows into the SSG build automatically. A plain
`docker compose up -d --build` on the server is the whole deploy.

---

## 6. Production environment (`.env` on the server)

Gitignored, `chmod 600`, owned by the deploy user. Values that change from the dev defaults:

| Variable | Production value | Notes |
|---|---|---|
| `POSTGRES_PASSWORD` | *(strong random)* | rotate the default |
| `SEED_ADMIN_USERNAME` / `SEED_ADMIN_NAME` | your admin | |
| `SEED_ADMIN_PASSWORD` | *(strong random, ≥12)* | rotate after first login |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | *(strong random)* | = MinIO root creds |
| `R2_ENDPOINT` | `http://minio:9000` | internal server-side S3 calls |
| `R2_PUBLIC_ENDPOINT` | `https://signex.vn` | baked into presigned PUT URLs |
| `R2_BUCKET` | `signex-media` | first path segment at the apex |
| `MEDIA_PUBLIC_BASE` | `https://signex.vn/signex-media` | public read base (no r2.dev) |
| `REVALIDATE_SECRET` | *(strong random)* | shared api↔web |
| `PREVIEW_SECRET` | *(strong random)* | shared api↔admin |
| `AUTH_ALLOWED_ORIGINS` | `https://signex.vn` | api CORS + OriginGuard |
| `ADMIN_ORIGIN` | `https://signex.vn` | admin CSRF origin |
| `ALLOWED_ORIGINS` | `https://signex.vn` | admin route-handler CSRF |
| `PREVIEW_FRAME_ANCESTORS` | `https://signex.vn` | web CSP for /preview iframe |
| `NEXT_PUBLIC_WEB_URL` | `https://signex.vn` | admin "view live" links |
| `NEXT_PUBLIC_BASE_PATH` | `/admin` | drives admin basePath + client fetch prefix (§7) |
| `BIND_IP` | `127.0.0.1` | loopback-only host port bindings (§5) |
| `API_URL` | `http://api:3060` | internal BFF target |
| `WEB_REVALIDATE_URL` | `http://web:3062/api/revalidate` | internal ISR trigger |

Because admin and web are now the **same origin**, the CORS/CSRF allow-lists collapse to a
single entry.

---

## 7. Admin under `/admin` — basePath change (code)

Admin must serve under `/admin`. Changes, scoped and dev-safe (env-driven so `npm run dev`
keeps working with no basePath):

1. **`apps/admin/next.config.ts`** — `basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined`.
   (Prod build passes `/admin`; dev leaves it unset → admin still at `localhost:3061/`.)

2. **New helper** `apps/admin/app/lib/base-path.ts`:
   ```ts
   export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
   export const adminApi = (p: string) => `${BASE_PATH}${p}`;
   ```
   Rationale: Next's `basePath` prepends to `<Link>`, `router.push`, and server `redirect()`,
   but **not** to raw `fetch("/…")` string literals. Those must be prefixed manually.

3. **Prefix all 13 client-side `fetch('/admin-api…')` call sites** with `adminApi(...)`:
   - `app/login/page.tsx:40`
   - `app/(dash)/catalog/catalog-image-picker.tsx:55`
   - `app/(dash)/content/[blockKey]/zod-form.tsx:80`
   - `app/(dash)/media/media-manager.tsx:25`
   - `app/(dash)/media/asset-dialog.tsx:63, 89, 108`
   - `app/lib/upload-asset.ts:84, 117`
   - `app/(dash)/editor/editor-shell.tsx:299, 456, 480, 530`
   (In dev `BASE_PATH=""` → unchanged behavior; in prod → `/admin/admin-api/…`.)

4. **Session cookie path** — in `app/admin-api/auth/login/route.ts:59` and
   `app/admin-api/auth/logout/route.ts:12`, change cookie `path` from `"/"` to `BASE_PATH || "/"`
   so `sx_session` is scoped to `/admin` and not sent to the public web at `/`. (login + logout
   must use the same path or logout won't clear it.)

5. **Server `redirect()` calls need no change** — `app/lib/session.ts` (`/login`, `/`) and
   `app/(dash)/catalog/actions.ts` (`/catalog`) are basePath-aware automatically. Admin has
   **no `middleware.ts`**, so there is no matcher to update. Verify during implementation that
   no `window.location`/absolute-href bypass exists (grep found none).

---

## 8. Media — apex-path proxy (single-domain, no subdomain)

- Server-side S3 (put/head/get) uses `R2_ENDPOINT=http://minio:9000` (internal).
- Presigned PUT URLs are built by the presign client against `R2_PUBLIC_ENDPOINT=https://signex.vn`;
  with `forcePathStyle`, the URL is `https://signex.vn/signex-media/<key>?X-Amz-…`.
- nginx proxies `/signex-media/` → `127.0.0.1:9000` **without rewriting the path** and forwards
  `Host: signex.vn`, so MinIO recomputes the SigV4 signature over the same host+path → valid.
- Public reads (`MEDIA_PUBLIC_BASE + '/' + key`) are anonymous GETs (bucket public-read via
  `minio-init`) through the same location.
- `client_max_body_size 64m` covers media uploads (align with the app's presign `maxBytes`).

**Fallback if presign signatures ever misbehave through the proxy:** move MinIO to a
`media.signex.vn` subdomain (nginx pass-through, zero rewrite) and set
`R2_PUBLIC_ENDPOINT=https://media.signex.vn`, `MEDIA_PUBLIC_BASE=https://media.signex.vn/signex-media`.
Documented as a known escape hatch; not the default.

---

## 9. Postgres

- Keep `postgres:16-alpine` + the `pgdata` named volume. No host port in prod.
- No automated backups (per decision). Ad-hoc dump one-liner for the runbook:
  `docker exec signex-postgres pg_dump -U signex signex | gzip > signex-$(date +%F).sql.gz`
  (run from the host; redirect on the host side).

---

## 10. First-boot seed & content (runbook detail)

The api container auto-runs `prisma migrate deploy` on start, but **not** the seed or importer.
On the **first** deploy, after the stack is healthy, run once:

1. `docker exec signex-api node dist/auth/seed` — idempotent SYSTEM/ADMIN user
   (fixed id `seedsystemadmin0000000000`, role ADMIN, from `SEED_ADMIN_*`). Safe to re-run.
2. `docker exec signex-api node dist/importer/importer.command` — mints the `Default` theme +
   **Release v1** (`schemaVersion 1`) from the committed dicts
   `apps/web/app/[lang]/dictionaries/{en,vi}.json`. Idempotency-guarded (refuses if any Theme
   exists).

**Content note (verified 2026-07-04):** the Vietnamese content is clean — `vi.json` and the
emitted `apps/web/app/lib/initial-snapshot.ts` are valid UTF-8, ~1880 precomposed Vietnamese
diacritics, **zero mojibake markers**, and both were committed together (`5e4bea7`) so they are
in sync. No re-encoding needed.

**Content caveat (important):** the importer seeds only the **initial v1** content from the
dict files. Any content edited later through the admin CMS in another environment lives only in
that environment's Postgres and is **not** reproduced by the importer. A fresh prod deploy starts
at Release v1 = dict content. To carry over edited content, migrate the DB (dump/restore), not
the importer.

---

## 11. Deploy runbook

**First deploy**
1. `git pull` on the VPS.
2. Create/populate `.env` with the §6 production values (incl. `BIND_IP=127.0.0.1`,
   `NEXT_PUBLIC_BASE_PATH=/admin`); `chmod 600 .env`.
3. `docker compose up -d --build` — builds 3 images, starts the stack; api applies migrations.
4. Wait for health: `docker compose ps` (api/web/admin `healthy`).
5. Seed once: `docker exec signex-api node dist/auth/seed` then
   `docker exec signex-api node dist/importer/importer.command`.
6. Install nginx site config, `sudo nginx -t && sudo systemctl reload nginx`,
   `sudo certbot --nginx -d signex.vn`.
7. Verify (§12).

**Subsequent deploys**
`git pull && docker compose up -d --build` — migrations auto-apply; `auth:seed` is idempotent;
re-run the importer only when the dicts change (it refuses once a Theme exists — content edits
happen through the admin, not the importer).

---

## 12. Verification (end-to-end)

- `https://signex.vn/en` and `/vi` render with images loading from `https://signex.vn/signex-media/…`.
- `https://signex.vn/admin` → login works; cookie `sx_session` is set with `Path=/admin`.
- In admin: open the media manager, **upload an image** (exercises presign PUT through nginx →
  MinIO — the SigV4-through-proxy path), confirms READY.
- Edit content in the visual editor, **publish**, then confirm the public web reflects it
  (on-demand revalidation via `WEB_REVALIDATE_URL`).
- `curl -I https://signex.vn/signex-media/<known-key>` → `200` with immutable cache headers.
- Confirm api/postgres are **not** reachable from the public interface (only via `signex-net`).

---

## 13. Risks & mitigations

- **SigV4 presign through a path proxy** is the highest-risk item. Mitigation: no path rewrite +
  `Host` preservation (§8); tested by the upload step in §12; subdomain fallback documented.
- **basePath fetch misses** — a missed `fetch('/admin-api…')` call site 404s (routed to web).
  Mitigation: the enumerated 13 sites + a final grep for `admin-api` in `apps/admin/app` before
  deploy; dev stays on `BASE_PATH=""` so no regression.
- **Cookie scope** — if `Path` isn't updated, the admin cookie leaks to web at `/` (works but
  wasteful/leaky). Mitigation: §7.4.
- **Secrets in `.env`** — single-file on the VPS; `chmod 600`, gitignored, never committed.

---

## 14. Files touched (implementation surface)

- **New:** `deploy/nginx/signex.conf` (in-repo copy of the nginx site config), and
  `apps/admin/app/lib/base-path.ts`.
- **Edit:** `docker-compose.yml` (`BIND_IP`-parameterized host bindings),
  `apps/admin/next.config.ts` (basePath), 13 admin client fetch call sites,
  admin login/logout route cookie `path`, `.env.example` (prod guidance + `NEXT_PUBLIC_BASE_PATH`,
  `BIND_IP`), `README.md` (production deploy runbook).
- **No change:** api source (already BFF-internal), web source, Prisma schema, migrations.
