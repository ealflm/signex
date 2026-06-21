# Signex

Full-stack monorepo managed by **npm workspaces + Turborepo**.

| Workspace | Package | Stack | Port |
|-----------|---------|-------|------|
| `apps/web` | `@signex/web` | Next.js 16 (public site) | 3062 |
| `apps/admin` | `@signex/admin` | Next.js (admin skeleton) | 3061 |
| `apps/api` | `@signex/api` | NestJS 11 (REST API) | 3060 |
| `packages/db` | `@signex/db` | Prisma client + schema | — |
| `packages/shared` | `@signex/shared` | Shared types + zod | — |
| (Compose) | `postgres:16-alpine` | PostgreSQL | 5432 |

## Prerequisites

- Node.js >= 18 and npm 10+
- Docker + Docker Compose (for the database and the prod-like stack)

## Setup

```bash
cp .env.example .env      # then edit values if needed
npm install               # installs all workspaces from the single root lockfile
```

## Local development

Start Postgres (only the DB) in the background, then run all apps via Turborepo:

```bash
docker compose up -d postgres   # database on :5432
npm run dev                     # turbo runs api (:3060), web (:3062), admin (:3061)
```

- Web:   http://localhost:3062  (`/` redirects to the detected locale, e.g. `/vi`; `/en` also serves)
- Admin: http://localhost:3061
- API health: http://localhost:3060/api/health  → `{ "status": "ok" }`

### Database tooling

```bash
npm run db:generate   # prisma generate (regenerate the @signex/db client)
npm run db:migrate    # prisma migrate dev (apply/create migrations)
```

## Prod-like stack (Docker Compose)

Build and run all four containers (postgres, api, web, admin) on the `signex-net` network:

```bash
docker compose up -d --build
```

- Web:   http://localhost:3062
- Admin: http://localhost:3061
- API:   http://localhost:3060/api/health
- Postgres: localhost:5432

Tear down (keep the `pgdata` volume):

```bash
docker compose down
```

## Useful root scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Run all apps in watch mode (Turborepo). |
| `npm run build` | Build every workspace (`@signex/db#generate` runs first). |
| `npm run lint` | Lint every workspace. |
| `npm run start` | Start every built app. |
| `npm run db:generate` | Generate the Prisma client. |
| `npm run db:migrate` | Run Prisma migrations (dev). |
