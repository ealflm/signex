# Signex Monorepo Scaffold — Design Spec

**Date:** 2026-06-18
**Status:** Approved (design), pending implementation plan
**Scope:** Scaffold a full-stack monorepo and migrate the existing `signex-web` into it. Backend
monolith (NestJS), two Next.js frontends, Prisma + Postgres wired and ready, multi-container
Docker Compose. **No business features** are built in this pass.

---

## 1. Goals & non-goals

### Goals
- Turn `/home/ealflm/dev/signex/` into a **monorepo** managed by **npm workspaces + Turborepo**.
- Create three deployable apps generated with their **official latest CLIs**:
  - `apps/api` — NestJS (`@nestjs/cli new`), backend monolith.
  - `apps/web` — Next.js, **the existing `signex-web` moved in verbatim** (not regenerated).
  - `apps/admin` — Next.js (`create-next-app@latest`), admin panel skeleton.
- Create two shared library packages:
  - `packages/db` — Prisma (schema + migrations + generated client), `@signex/db`.
  - `packages/shared` — shared TypeScript types + zod schemas, `@signex/shared`.
- **DB-ready:** Prisma initialized, a Postgres container in Compose, `api` connects via
  `DATABASE_URL`, migration tooling working — but **no domain models/features**.
- Everything runs locally (`npm run dev` via Turborepo) and as **multi-container Docker Compose**
  (`docker compose up -d --build`).

### Non-goals (explicitly deferred to later passes)
- Real auth + analytics in the API; any domain data model / CRUD endpoints.
- Admin authentication and real admin UI; web calling the real API (e.g. the quote form).
- Reverse proxy / gateway (nginx/traefik) and production domains.
- CI/CD. Shared eslint/tsconfig packages (each app keeps its own config for now).

---

## 2. Architecture decisions (and rationale)

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **Scaffold only** — no business features | Establish architecture first; features in later passes. |
| 2 | **npm workspaces + Turborepo** | Keep npm (matches existing web + its tuned Docker setup); Turborepo adds task pipeline + caching. Single lockfile at root. |
| 3 | **New monorepo git; web history NOT preserved** | Simplest. Commit current web state as a backup, copy files in, drop the old `.git`. |
| 4 | **`api` in `apps/`** (not `packages/`) | The NestJS API is a deployable, independently-running container; nobody imports it. Turborepo/Nx convention: `apps/` = runnable/deployable units, `packages/` = imported libraries. |
| 5 | **`admin` is a separate app** (`apps/admin`), not an `/admin` route in web | Container isolation, no admin code leaking into the public bundle, matches the multi-container goal. |
| 6 | **Prisma + Postgres wired now** ("DB-ready") | Chosen over deferring DB. `packages/db` holds the schema/client; Postgres runs as a Compose service; api connects. Schema has no domain models yet. |
| 7 | **`db` and `shared` in `packages/`** | Both are imported by apps (api imports `@signex/db`; all three may import `@signex/shared`). |
| 8 | **No reverse proxy yet** | Each app exposed on its own host port; gateway is a later step. |

---

## 3. Directory structure

```
signex/                              # repo root (new git), npm workspaces + Turborepo
├── apps/
│   ├── api/                         # NestJS — REST API, /api/health, imports @signex/db   :4000
│   ├── web/                         # Next.js — signex-web moved here verbatim             :2051
│   └── admin/                       # Next.js — admin skeleton (layout + placeholder)      :2052
├── packages/
│   ├── db/                          # @signex/db — Prisma schema + migrations + client
│   └── shared/                      # @signex/shared — types + zod schemas
├── package.json                     # private root; workspaces ["apps/*","packages/*"]; devDep turbo
├── package-lock.json                # single lockfile at root
├── turbo.json                       # pipeline: db#generate → build → dev / lint / start
├── docker-compose.yml               # services: postgres, api, web, admin
├── .env.example                     # committed
├── .env                             # gitignored (real values)
├── .gitignore
└── README.md
```

Workspace package names: root `signex` (private), `@signex/api`, `@signex/web`, `@signex/admin`,
`@signex/db`, `@signex/shared`.

---

## 4. Component specs

### 4.1 Root workspace
- **`package.json`** — `"private": true`, `"workspaces": ["apps/*", "packages/*"]`, devDependency
  `turbo`. Scripts proxy to Turborepo: `dev`, `build`, `lint`, `start` → `turbo run <task>`; plus
  `db:generate` → `turbo run generate --filter=@signex/db` and `db:migrate` helper.
- **`turbo.json`** — tasks:
  - `generate` (in `@signex/db`): runs `prisma generate`; outputs the generated client.
  - `build`: `dependsOn: ["^build", "@signex/db#generate"]`; outputs `.next/**`, `dist/**`.
  - `dev`: `persistent: true`, `cache: false`.
  - `lint`, `start`.
- **`.gitignore`** — `node_modules`, `.next`, `dist`, `.turbo`, `.env`, Prisma generated client,
  build artifacts.
- **`.env.example`** (committed) — documents every variable:
  - `POSTGRES_USER=signex`, `POSTGRES_PASSWORD=signex`, `POSTGRES_DB=signex`
  - `DATABASE_URL=postgresql://signex:signex@localhost:5432/signex?schema=public`
    (inside Compose the host becomes `postgres`)
  - `API_PORT=4000`, `WEB_PORT=2051`, `ADMIN_PORT=2052`
  - `API_URL=http://api:4000` (server-side, Compose network)
  - `NEXT_PUBLIC_API_URL=http://localhost:4000` (client-side placeholder)
- **`README.md`** — quickstart for both `npm run dev` and `docker compose up`.

### 4.2 `apps/api` — NestJS
- Generated with `npx @nestjs/cli new api` (latest, v11) into `apps/api`, package renamed
  `@signex/api`, integrated into the workspace (own lockfile removed).
- Keep the default `AppModule`/`main.ts`. Add:
  - Global prefix `api` (so routes live under `/api/...`).
  - `GET /api/health` → `{ status: "ok" }` (a `HealthModule`/controller, or extend the default
    controller). Used by the Docker healthcheck.
- Imports `@signex/db` (Prisma client) — a thin `PrismaModule`/provider exposing the client, so the
  DB connection is exercised even with an empty schema. No domain modules.
- Reads `DATABASE_URL` and `API_PORT` from env. Listens on `0.0.0.0:${API_PORT:-4000}`.

### 4.3 `apps/web` — Next.js (existing signex-web, moved verbatim)
- The current `signex-web` working tree, moved in **unchanged in behavior**. Only workspace/Docker
  integration edits:
  - `package.json` name → `@signex/web` (scripts kept: `dev`/`build`/`start` on port 2051, `lint`).
  - Remove its standalone `docker-compose.yml` (Compose is now at root) and its `package-lock.json`
    (root lockfile owns deps).
  - `next.config.ts`: keep `output: "standalone"`, **add `outputFileTracingRoot`** pointing at the
    repo root so file tracing spans the workspace.
  - Keep its `Dockerfile` but adapt it for the monorepo (see §6).
- All Next 16 specifics preserved: `proxy.ts` i18n, `app/[lang]` routes, vendored Webflow
  assets in `public/`, eslint/tsconfig as-is.

### 4.4 `apps/admin` — Next.js (skeleton)
- Generated with `npx create-next-app@latest admin` (TypeScript, App Router) into `apps/admin`,
  package renamed `@signex/admin`, integrated into the workspace (own lockfile removed).
- Configured to run on port **2052** (`next dev/start -p 2052`).
- `next.config.ts`: `output: "standalone"` + `outputFileTracingRoot` (root), for the Docker image.
- Skeleton content only: root layout + a single dashboard placeholder page (e.g. `/` showing
  "Signex Admin"). No auth, no API calls, no CRUD.

### 4.5 `packages/db` — Prisma (`@signex/db`)
- `npx prisma init` inside `packages/db`:
  - `prisma/schema.prisma` — `datasource db { provider = "postgresql"; url = env("DATABASE_URL") }`,
    `generator client`. **No domain models** (datasource + generator only; ready to migrate).
  - Generator `output` set to a path inside the package (e.g. `generated/client`) per modern Prisma
    requirements; `.gitignore` excludes the generated client.
- `package.json` (`@signex/db`) exposes an entrypoint that constructs and exports a singleton
  `PrismaClient` and re-exports its types, so consumers do `import { prisma } from "@signex/db"`.
- Scripts: `generate` (`prisma generate`), `migrate` (`prisma migrate dev`),
  `migrate:deploy` (`prisma migrate deploy`).
- Migration tooling must work end-to-end against the Postgres container (an initial empty migration
  creating the `_prisma_migrations` table is acceptable proof).

### 4.6 `packages/shared` — types + zod (`@signex/shared`)
- A small TypeScript package: `package.json` (`@signex/shared`), `tsconfig.json`, an `index.ts`
  exporting placeholder shared types and at least one example **zod** schema (proves the dependency
  and the import path work). Consumable by api/web/admin.

---

## 5. Docker Compose (multi-container)

`docker-compose.yml` at root. One network `signex-net`. Services:

| Service | Image / build | Ports (host:container) | Notes |
|---------|---------------|------------------------|-------|
| `postgres` | `postgres:16-alpine` | `5432:5432` | volume `pgdata`; env `POSTGRES_*`; healthcheck `pg_isready -U $POSTGRES_USER`. |
| `api` | build `apps/api/Dockerfile`, context = repo root | `4000:4000` | `depends_on: postgres (service_healthy)`; env `DATABASE_URL` (host `postgres`), `API_PORT`; healthcheck `GET /api/health`. On start: `prisma migrate deploy` then `node dist/main`. |
| `web` | build `apps/web/Dockerfile`, context = repo root | `2051:2051` | env `API_URL`, `NEXT_PUBLIC_API_URL`; healthcheck `GET /en` (existing pattern — use `127.0.0.1`, not `localhost`). |
| `admin` | build `apps/admin/Dockerfile`, context = repo root | `2052:2052` | env `API_URL`, `NEXT_PUBLIC_API_URL`; healthcheck on its root path via `127.0.0.1`. |

Host ports overridable via `${API_PORT}`, `${WEB_PORT}`, `${ADMIN_PORT}` from `.env`.

---

## 6. Dockerfiles (per app, context = repo root)

All three app Dockerfiles build from the **repo root** so they can install workspace dependencies
from the single root lockfile, then build only their own workspace.

- **Common install pattern:** copy root `package.json` + `package-lock.json` + each workspace's
  `package.json`, run `npm ci`, then copy sources.
- **`apps/web` / `apps/admin` (Next standalone):** multi-stage `node:20-alpine` (deps → builder →
  runner). Because of `outputFileTracingRoot`, the standalone output nests under
  `apps/<name>/.next/standalone/apps/<name>/server.js` with hoisted `node_modules` at the standalone
  root — the runner stage copies `.next/standalone` → `./`, `.next/static` → the nested static path,
  and `public` → the nested public path accordingly. Non-root user. `web` keeps port 2051,
  `admin` 2052.
- **`apps/api` (NestJS):** multi-stage `node:20-alpine`. Build stage installs deps, runs
  `prisma generate` (needs `packages/db`), then `nest build` → `dist/`. Runtime stage carries
  `dist/`, production `node_modules`, and the generated Prisma client + query engine. Non-root user,
  port 4000. Start command runs `prisma migrate deploy` then `node dist/main`.

---

## 7. Web migration procedure (safe — no lost work)

The existing `signex-web` has substantial **uncommitted** work. Order matters:

1. **Backup first.** In `signex-web/`: `git add -A && git commit -m "..."` to capture all
   uncommitted work; create a backup tag/branch; keep a copy of the whole old repo directory
   **outside** the monorepo before touching anything.
2. **Create monorepo skeleton** (`apps/`, `packages/`, root files).
3. **Move** `signex-web/` contents → `apps/web/`. Then in `apps/web`: delete `.git`, delete the old
   `docker-compose.yml`, delete `package-lock.json`, `node_modules`, `.next`. Keep & adapt
   `Dockerfile`; add `outputFileTracingRoot` to `next.config.ts`; rename package to `@signex/web`.
4. **`git init`** at the repo root, add `.gitignore`, make the first monorepo commit (includes this
   spec and all scaffold files).

---

## 8. Dev workflow & ports

- **Local:** `npm install` at root → `npm run dev` (Turborepo runs `nest start --watch` for api and
  `next dev` for web + admin in parallel). DB via `docker compose up -d postgres` (or full stack).
- **Prod-like:** `docker compose up -d --build` → web `:2051`, admin `:2052`, api `:4000`,
  postgres `:5432`.

| App | Dev port | Container port | Host port |
|-----|----------|----------------|-----------|
| web | 2051 | 2051 | 2051 |
| admin | 2052 | 2052 | 2052 |
| api | 4000 | 4000 | 4000 |
| postgres | — | 5432 | 5432 |

---

## 9. Verification criteria (definition of done for this pass)

1. `npm install` at root succeeds with a single root lockfile; no per-app lockfiles remain.
2. `npm run build` (Turborepo) is green for all workspaces; `db#generate` runs before `api#build`.
3. `npm run dev` starts api + web + admin together without errors.
4. `apps/web` still renders exactly as before: `/` → 307 → `/vi` (or `/en` per cookie), Webflow
   animations boot, no console errors, no behavior change.
5. `apps/admin` serves its placeholder page on `:2052`.
6. `GET /api/health` returns `200 {status:"ok"}` and the API process connects to Postgres on boot.
7. Prisma migration tooling works against the Postgres container (`prisma migrate` succeeds;
   `_prisma_migrations` table created).
8. `docker compose up -d --build` brings up all four containers; api/web/admin healthchecks reach
   `healthy`; `api` waits for `postgres` healthy before starting.
9. `@signex/shared` and `@signex/db` are importable from `apps/api` (typecheck passes).

---

## 10. Known gotchas to handle

- **Next standalone in a monorepo:** must set `outputFileTracingRoot` to the repo root, and the
  Docker copy paths shift to the nested `apps/<name>/...` layout inside `.next/standalone`. (Applies
  to web and admin.)
- **Compose healthcheck host:** use `http://127.0.0.1:<port>/...` not `localhost` — Alpine resolves
  `localhost` to IPv6 `::1` first while the server binds IPv4 `0.0.0.0` (existing web lesson).
- **CLI-generated lockfiles:** `nest new` and `create-next-app` each emit their own
  `package-lock.json`; these must be removed so the root lockfile owns the dependency tree.
- **Prisma client output + runtime engine:** the generated client and its query engine binary must
  be present in the api runtime image, not just the build stage.
- **Web's tuned config is load-bearing:** do not "normalize" web's eslint/tsconfig/Next config into
  shared packages — only add `outputFileTracingRoot` and the package rename.
```
