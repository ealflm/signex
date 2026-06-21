# Signex

Full-stack monorepo managed by **npm workspaces + Turborepo**: a NestJS API, a public
Next.js site, a Next.js admin panel, sharing a Prisma/PostgreSQL data layer and a
zod-typed shared package. Runs as multiple containers via Docker Compose.

| Workspace | Package | Stack | Host port | Container port |
|-----------|---------|-------|-----------|----------------|
| `apps/api` | `@signex/api` | NestJS 11 (REST API) | 3060 | 3060 |
| `apps/web` | `@signex/web` | Next.js 16 (public site) | 3062 | 3062 |
| `apps/admin` | `@signex/admin` | Next.js (admin skeleton) | 3061 | 3061 |
| `packages/db` | `@signex/db` | Prisma client + schema | — | — |
| `packages/shared` | `@signex/shared` | Shared types + zod | — | — |
| (Compose) `postgres` | `postgres:16-alpine` | PostgreSQL | **3059** | 5432 |

> The database is reached at **`localhost:3059`** from your host, and at **`postgres:5432`**
> from inside the Compose network (what the API uses). Override any host port with the
> `*_PORT` variables in `.env`.

## Prerequisites

- Node.js >= 18 and npm 10+
- Docker + Docker Compose (for the database and the production stack)

## One-time setup (both modes)

```bash
cp .env.example .env      # copy env template; adjust values if needed
npm install               # installs all workspaces from the single root lockfile
```

---

## 1. Local development

Apps run from source with hot-reload (Turborepo runs `nest start --watch` and `next dev`);
only **PostgreSQL** runs in a container.

```bash
# 1) start ONLY the database (detached) — published on host :3059
docker compose up -d postgres

# 2) run all three apps together, in watch mode
npm run dev
```

`npm run dev` → Turborepo first builds the workspace libraries (`@signex/db` generates its
Prisma client + compiles, `@signex/shared` compiles), then runs the three apps in parallel:

- **API**   → http://localhost:3060/api/health  → `{ "status": "ok" }`
- **Web**   → http://localhost:3062  (`/` redirects to the detected locale, e.g. `/vi`; `/en` also serves)
- **Admin** → http://localhost:3061

The locally-run API reads `DATABASE_URL` from `.env` (`postgresql://signex:signex@localhost:3059/signex`).

### Database tooling (run against the local `postgres` container)

```bash
npm run db:generate   # prisma generate — regenerate the @signex/db client
npm run db:migrate    # prisma migrate dev — create/apply a migration (interactive)
```

### Run a single workspace

```bash
npm run dev   --workspace @signex/api      # just the API (watch)
npm run build --workspace @signex/web      # just build the web app
```

### Stop the database

```bash
docker compose stop postgres        # keep data
docker compose down                 # remove the container (pgdata volume kept)
```

---

## 2. Full production build (Docker Compose)

Builds production images for all three apps and runs the whole stack — **postgres + api +
web + admin** — on the `signex-net` network. Each app is a standalone, non-root container
(Next.js `output: "standalone"`; NestJS compiled to `dist/`).

```bash
docker compose up -d --build
```

What happens:

1. Three images are built (multi-stage `node:20-alpine`): the API runs `prisma generate` →
   compiles the libs → `nest build`; web/admin produce their standalone servers.
2. `postgres` starts and becomes healthy first.
3. `api` waits for postgres to be healthy, runs `prisma migrate deploy` on startup, then boots.
4. `web` and `admin` start once the API is healthy.

URLs (host):

- **API**   → http://localhost:3060/api/health
- **Web**   → http://localhost:3062
- **Admin** → http://localhost:3061
- **Postgres** → `localhost:3059` (container port 5432; the API connects internally via `postgres:5432`)

### Check status / health

```bash
docker compose ps                                   # all four should be Up (healthy)
docker exec signex-api wget -qO- http://127.0.0.1:3060/api/health   # {"status":"ok"}
docker compose logs -f api                          # follow API logs
```

### Tear down

```bash
docker compose down        # stop + remove containers/network; KEEP the pgdata volume
docker compose down -v     # also delete the database volume (wipes data)
```

### Overriding ports / env

Host ports come from `.env` (defaults in `.env.example`): `API_PORT=3060`, `WEB_PORT=3062`,
`ADMIN_PORT=3061`, `POSTGRES_PORT=3059`. Change a value in `.env` and re-run
`docker compose up -d` to remap. Container ports are fixed.

---

## Useful root scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Run all apps in watch mode (Turborepo). |
| `npm run build` | Build every workspace (`@signex/db#generate` runs first). |
| `npm run lint` | Lint every workspace. |
| `npm run start` | Start every built app. |
| `npm run db:generate` | Generate the Prisma client. |
| `npm run db:migrate` | Run Prisma migrations (dev, interactive). |
