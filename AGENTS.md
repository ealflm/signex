# signex monorepo — agent rules

npm **workspaces** (`apps/*`, `packages/*`) + **Turborepo**. `npm@10.9.0`, Node `>=18`. Single root lockfile.

## Layout & ports
| Workspace | Package | Stack | Port |
|---|---|---|---|
| `apps/web` | `@signex/web` | Next.js 16 (public site) | 3062 |
| `apps/admin` | `@signex/admin` | Next.js 16 (admin/CMS) | 3061 |
| `apps/api` | `@signex/api` | NestJS 11 | 3060 |
| `packages/db` | `@signex/db` | Prisma 6 + Postgres 16 | — |
| `packages/shared` | `@signex/shared` | zod | — |

Postgres in Docker publishes host **3059** → container `5432`.

## Read per-app rules first
Before writing code in an app, read that app's `AGENTS.md` (e.g. `apps/web/AGENTS.md`, `apps/api/AGENTS.md`). They carry binding rules (the Next apps warn that Next 16.2.x has breaking changes vs training data — read `node_modules/next/dist/docs/` first).

## ★ Workspace-package build gotcha (load-bearing)
`@signex/db` and `@signex/shared` MUST compile to **CommonJS `dist/`** (`tsc`) before `apps/api`/`apps/*` consume them — `nest build` and Next do NOT bundle workspace deps; they import from `./dist/index.js` at runtime. Turbo encodes the ordering (`build` `dependsOn ^build`; `@signex/db#build` `dependsOn @signex/db#generate`, which regenerates the Prisma client into `packages/db/generated/`).

## Commands
- `npm install` — install (single root lockfile)
- `npm run build` / `dev` / `lint` / `start` — Turbo across all workspaces
- `npm run db:generate` — regenerate Prisma client; `npm run db:migrate` — run migrations
- `docker compose up -d --build` — full stack (postgres + 3 apps)

## Scaffolding
Create new apps/packages with **official CLIs** (`create-next-app@latest`, `nest new`, `prisma init`) — do NOT hand-copy scaffolds.
