# Signex Monorepo Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn /home/ealflm/dev/signex into a full-stack npm-workspaces + Turborepo monorepo (apps/api NestJS, apps/web = the existing signex-web moved in verbatim, apps/admin Next.js skeleton; packages/db Prisma + packages/shared zod), with Prisma+Postgres wired and a multi-container Docker Compose deploy — scaffold only, no business features.

**Architecture:** apps/ holds the three deployable units (each its own Docker image/container); packages/ holds imported libraries (@signex/db Prisma client, @signex/shared types+zod). Turborepo orchestrates tasks (db#generate -> build -> dev/lint/start) over a single root lockfile. Docker Compose runs postgres + api + web + admin on one network.

**Tech Stack:** npm workspaces, Turborepo 2.x, NestJS 11, Next.js 16, Prisma 6 + PostgreSQL 16, zod, Docker Compose, node:20-alpine.

## Global Constraints

SHARED INTERFACE CONTRACT — every value below is FIXED. Use verbatim; never invent alternatives.

Repo root (absolute): /home/ealflm/dev/signex
Spec file (read it first): /home/ealflm/dev/signex/docs/superpowers/specs/2026-06-18-signex-monorepo-scaffold-design.md

- Package manager: npm workspaces. SINGLE root package-lock.json. Turborepo 2.x — turbo.json uses the "tasks" key (NOT "pipeline").
- Workspaces globs: ["apps/*","packages/*"]
- Package names: root "signex" (private, no version publish). @signex/api (apps/api), @signex/web (apps/web), @signex/admin (apps/admin), @signex/db (packages/db), @signex/shared (packages/shared).
- Ports: web 2051, admin 2052, api 4000, postgres 5432.
- Env vars (root .env.example committed; .env gitignored): POSTGRES_USER=signex, POSTGRES_PASSWORD=signex, POSTGRES_DB=signex, DATABASE_URL=postgresql://signex:signex@localhost:5432/signex?schema=public (host becomes "postgres" inside Compose), API_PORT=4000, WEB_PORT=2051, ADMIN_PORT=2052, API_URL=http://api:4000, NEXT_PUBLIC_API_URL=http://localhost:4000.
- @signex/db: prisma init; schema.prisma datasource postgresql url=env("DATABASE_URL") + generator client with explicit output=packages/db/generated/client; NO domain models (datasource+generator only, ready to migrate). index.ts exports a singleton "prisma" (PrismaClient) and re-exports its types. gitignore the generated client. scripts: generate (prisma generate), migrate (prisma migrate dev), migrate:deploy (prisma migrate deploy).
- @signex/shared: small TS package exporting placeholder shared types + at least one example zod schema.
- apps/api (NestJS, @nestjs/cli new, v11): keep default AppModule/main.ts; global prefix "api" (routes under /api/...); GET /api/health -> {status:"ok"}; a thin PrismaModule providing the @signex/db "prisma" singleton so the DB connection is exercised even with empty schema; listen 0.0.0.0:API_PORT (default 4000). NestJS ships jest+supertest — use an e2e/supertest test for /api/health.
- apps/web: the EXISTING signex-web working tree moved in VERBATIM (behavior unchanged: Next 16.2.7, proxy.ts i18n, app/[lang], vendored Webflow public/ assets, its own eslint/tsconfig). Only allowed edits: rename package to @signex/web; delete its old docker-compose.yml, package-lock.json, node_modules, .next; add outputFileTracingRoot (repo root) to next.config.ts (keep output:"standalone"). Do NOT normalize its config.
- apps/admin (Next.js, create-next-app@latest, TS + App Router): run on 2052; next.config.ts output:"standalone" + outputFileTracingRoot (repo root); skeleton only = root layout + one placeholder dashboard page ("Signex Admin"); no auth/API calls/CRUD.
- Docker: each app Dockerfile build context = REPO ROOT; multi-stage node:20-alpine; non-root user. web/admin = Next standalone (with outputFileTracingRoot the standalone server lives at apps/<name>/.next/standalone/apps/<name>/server.js with hoisted node_modules at the standalone root — copy paths shift accordingly). api: build stage runs prisma generate then nest build -> dist/, runtime carries dist + prod node_modules + generated Prisma client + query engine; start runs "prisma migrate deploy" then "node dist/main". Compose services: postgres (postgres:16-alpine, volume pgdata, healthcheck pg_isready), api (depends_on postgres service_healthy, healthcheck GET /api/health), web (healthcheck GET /en), admin (healthcheck on root). All on network signex-net. Healthchecks MUST use http://127.0.0.1:<port>/... NOT localhost (Alpine resolves localhost to IPv6 ::1 first; server binds IPv4 0.0.0.0).
- Git: brand-new repo at root. Strict order: (1) commit signex-web's uncommitted work IN ITS OWN repo + keep a full backup copy of the old repo OUTSIDE the monorepo before touching anything; (2) build skeleton; (3) move web in + cleanup; (4) git init at root + .gitignore + first monorepo commit (includes the spec). DO NOT preserve web git history.
- All scaffolds via OFFICIAL LATEST CLIs: npx @nestjs/cli new, npx create-next-app@latest, npx prisma init. CLI-generated per-app package-lock.json files MUST be removed (root lockfile owns the tree).

GLOBAL TASK NUMBERING (fixed — produce ONLY your assigned tasks, numbered exactly as given):
  Task 1  — Backup + commit existing signex-web (own repo) + copy backup outside monorepo
  Task 2  — Create monorepo root skeleton (root package.json workspaces, turbo.json, .gitignore, .env.example, README, empty apps/ + packages/)
  Task 3  — packages/shared (@signex/shared: package.json, tsconfig, index.ts types + zod schema)
  Task 4  — packages/db (@signex/db: prisma init, schema.prisma, client singleton, scripts, gitignore generated client)
  Task 5  — apps/api scaffold (nest new + workspace integration: rename, remove lockfile, global prefix "api", listen API_PORT)
  Task 6  — apps/api health + PrismaModule (GET /api/health, import @signex/db, connect on boot, supertest e2e)
  Task 7  — apps/admin scaffold (create-next-app + integration: port 2052, standalone + outputFileTracingRoot, placeholder dashboard)
  Task 8  — apps/web migration (move signex-web -> apps/web + cleanup: remove .git/old compose/lockfile/node_modules/.next, rename package)
  Task 9  — apps/web config edit (next.config.ts outputFileTracingRoot; verify dev + standalone build still green, behavior unchanged)
  Task 10 — Dockerfiles for api, web (adapt), admin + .dockerignore
  Task 11 — docker-compose.yml (postgres, api, web, admin; network signex-net; pgdata volume; healthchecks; depends_on)
  Task 12 — git init at root + .gitignore confirm + first monorepo commit
  Task 13 — Full-stack verification (npm install/build green; docker compose up; /api/health 200; web /en renders; admin :2052; prisma migrate works)

---

Now I have everything I need. The signex-web repo is on `main`, working tree clean (the research fact-sheet noted it clean, confirmed). I'll write Tasks 1 and 2 grounding every command in the verified state.

Note: working tree is clean, but the spec/contract mandates the `git add -A && git commit` safety step regardless — I'll make that step robust (handles "nothing to commit").

### Task 1: Backup and commit existing signex-web in its own repo, copy backup outside the monorepo

**Files:**
- Modify (commit if dirty): `/home/ealflm/dev/signex/signex-web/.git` (new commit + backup branch + backup tag in signex-web's OWN repo)
- Create: `/home/ealflm/dev/signex-web-backup-2026-06-19/` (full copy of the old repo, OUTSIDE the monorepo)

**Interfaces:**
- Consumes: existing repo at `/home/ealflm/dev/signex/signex-web` (branch `main`, last commit `84c6b7e`, remote `origin https://github.com/ealflm/signex-web.git`).
- Produces:
  - In `signex-web`'s own git: a commit capturing any uncommitted work, a backup branch `backup/pre-monorepo`, and an annotated tag `pre-monorepo-backup` (all pointing at the head-of-`main` snapshot).
  - A complete on-disk backup directory `/home/ealflm/dev/signex-web-backup-2026-06-19/` (includes `.git`) that later tasks rely on as the rollback source. Task 8 (web migration) relies on this backup existing before it deletes `apps/web/.git`.

- [ ] **Step 1: Confirm we are in the right repo and capture current head**
  ```bash
  git -C /home/ealflm/dev/signex/signex-web rev-parse --is-inside-work-tree
  git -C /home/ealflm/dev/signex/signex-web rev-parse --abbrev-ref HEAD
  git -C /home/ealflm/dev/signex/signex-web log -1 --oneline
  ```
  Run the three commands above.
  Expected: first prints `true`; second prints `main`; third prints `84c6b7e commit` (or a newer hash if work was committed since — record whatever it shows).

- [ ] **Step 2: Stage and commit any uncommitted work (safe no-op if clean)**
  Stage everything (including untracked) and commit only if there is something to commit, so the step never errors on a clean tree.
  ```bash
  git -C /home/ealflm/dev/signex/signex-web add -A
  git -C /home/ealflm/dev/signex/signex-web diff --cached --quiet \
    && echo "NOTHING_TO_COMMIT" \
    || git -C /home/ealflm/dev/signex/signex-web commit -m "chore: snapshot all work before monorepo migration"
  ```
  Run the command above.
  Expected: either `NOTHING_TO_COMMIT` (tree was already clean — current known state) or a normal `git commit` summary line like `[main <hash>] chore: snapshot all work before monorepo migration` with a files-changed count.

- [ ] **Step 3: Verify the working tree is now clean**
  ```bash
  git -C /home/ealflm/dev/signex/signex-web status --short
  ```
  Run the command above.
  Expected: empty output (no lines) — the tree is fully clean with nothing uncommitted.

- [ ] **Step 4: Create an in-repo backup branch and annotated tag at the current head**
  These give two named, recoverable references inside signex-web's own history before anything is moved.
  ```bash
  git -C /home/ealflm/dev/signex/signex-web branch backup/pre-monorepo
  git -C /home/ealflm/dev/signex/signex-web tag -a pre-monorepo-backup -m "Full signex-web snapshot before monorepo migration"
  git -C /home/ealflm/dev/signex/signex-web branch --list "backup/*"
  git -C /home/ealflm/dev/signex/signex-web tag --list "pre-monorepo-backup"
  ```
  Run the four commands above.
  Expected: the last two commands print `  backup/pre-monorepo` and `pre-monorepo-backup` respectively, confirming both references exist. (If `backup/pre-monorepo` already exists, the `branch` command errors `fatal: a branch named 'backup/pre-monorepo' already exists` — that is acceptable; the reference is already present.)

- [ ] **Step 5: Verify no other git repo sits above signex-web (parent must NOT be a repo yet)**
  Task 12 creates the root git repo; it must not exist now, or the copy in Step 6 would entangle histories.
  ```bash
  git -C /home/ealflm/dev/signex rev-parse --is-inside-work-tree 2>&1 || true
  ```
  Run the command above.
  Expected: prints `fatal: not a git repository (or any of the parent directories): .git` — confirming `/home/ealflm/dev/signex` is NOT yet a git repo. (If it unexpectedly prints `true`, STOP: a root repo already exists and the migration ordering in the contract is violated.)

- [ ] **Step 6: Copy the entire old repo (including .git) to a backup location OUTSIDE the monorepo**
  The backup lives at `/home/ealflm/dev/` — a sibling of `/home/ealflm/dev/signex`, so it is outside the future monorepo and untouched by Task 8's `.git` deletion. `cp -a` preserves permissions, symlinks, and the `.git` directory.
  ```bash
  cp -a /home/ealflm/dev/signex/signex-web /home/ealflm/dev/signex-web-backup-2026-06-19
  ```
  Run the command above.
  Expected: no output (success). If the destination already exists, `cp` errors `cp: cannot create directory ... File exists` — in that case the backup is already present; verify it in Step 7 rather than overwriting.

- [ ] **Step 7: Verify the backup is complete and a valid git repo**
  ```bash
  test -d /home/ealflm/dev/signex-web-backup-2026-06-19/.git && echo "BACKUP_HAS_GIT"
  test -d /home/ealflm/dev/signex-web-backup-2026-06-19/public && echo "BACKUP_HAS_PUBLIC"
  git -C /home/ealflm/dev/signex-web-backup-2026-06-19 log -1 --oneline
  git -C /home/ealflm/dev/signex-web-backup-2026-06-19 status --short
  diff -rq --exclude=.git /home/ealflm/dev/signex/signex-web /home/ealflm/dev/signex-web-backup-2026-06-19 && echo "BACKUP_CONTENTS_MATCH"
  ```
  Run the five commands above.
  Expected: `BACKUP_HAS_GIT`, then `BACKUP_HAS_PUBLIC` (the 59M vendored Webflow assets copied), then the same head commit as the source (e.g. `84c6b7e commit`), then empty `status --short` output (clean tree), then `BACKUP_CONTENTS_MATCH` with no `diff` "Only in" / "differ" lines printed.

- [ ] **Final step: Commit**
  Task 1 operates inside signex-web's OWN existing git repo, so it commits there now (this is the one pre-Task-12 task that commits, per the contract). The snapshot commit, backup branch, and backup tag created in Steps 2 and 4 ARE this task's commit; no root commit is made (the root repo does not exist until Task 12). No further `git commit` is required here — the work product is the in-repo snapshot/branch/tag plus the external on-disk backup. Confirm the recorded references one final time:
  ```bash
  git -C /home/ealflm/dev/signex/signex-web log -1 --oneline
  git -C /home/ealflm/dev/signex/signex-web show-ref --verify refs/heads/backup/pre-monorepo
  git -C /home/ealflm/dev/signex/signex-web show-ref --verify refs/tags/pre-monorepo-backup
  ```
  Expected: the head commit prints; both `show-ref` commands print a `<sha> refs/heads/backup/pre-monorepo` and `<sha> refs/tags/pre-monorepo-backup` line (exit 0). The external backup at `/home/ealflm/dev/signex-web-backup-2026-06-19/` is preserved untouched for the remainder of the migration.

---

### Task 2: Create monorepo root skeleton

**Files:**
- Create: `/home/ealflm/dev/signex/package.json`
- Create: `/home/ealflm/dev/signex/turbo.json`
- Create: `/home/ealflm/dev/signex/.gitignore`
- Create: `/home/ealflm/dev/signex/.env.example`
- Create: `/home/ealflm/dev/signex/README.md`
- Create: `/home/ealflm/dev/signex/apps/.gitkeep`
- Create: `/home/ealflm/dev/signex/packages/.gitkeep`

**Interfaces:**
- Consumes: nothing from earlier tasks (Task 1 only touched signex-web's own repo and an external backup). Relies on `/home/ealflm/dev/signex` existing and NOT yet being a git repo.
- Produces:
  - Root package `signex` (private) with `"workspaces": ["apps/*","packages/*"]`, devDependency `turbo@^2`, and turbo-proxy scripts `dev` / `build` / `lint` / `start` (→ `turbo run <task>`) plus `db:generate` (→ `turbo run generate --filter=@signex/db`) and `db:migrate` (→ `npm run migrate --workspace @signex/db`, run directly so the interactive `prisma migrate dev` prompt works).
  - `/home/ealflm/dev/signex/turbo.json` using the Turborepo 2.x `"tasks"` key, with the `@signex/db#generate` wiring that `build`/`dev` depend on.
  - `/home/ealflm/dev/signex/.env.example` documenting EVERY env var from the contract: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL`, `API_PORT`, `WEB_PORT`, `ADMIN_PORT`, `API_URL`, `NEXT_PUBLIC_API_URL`.
  - `/home/ealflm/dev/signex/.gitignore` covering `node_modules`, `.next`, `dist`, `.turbo`, `.env`, the Prisma generated client, and build artifacts.
  - `/home/ealflm/dev/signex/README.md` quickstart for both `npm run dev` and `docker compose up`.
  - Empty workspace dirs `apps/` and `packages/` (held by `.gitkeep`) that Tasks 3–8 populate.
  - All files are STAGED but NOT committed here — the root git repo does not exist until Task 12; these files are committed as part of Task 12's first monorepo commit.

- [ ] **Step 1: Verify the monorepo root state before writing**
  Confirm the root has only `signex-web/` and `docs/` and is not yet a git repo.
  ```bash
  ls -A /home/ealflm/dev/signex
  git -C /home/ealflm/dev/signex rev-parse --is-inside-work-tree 2>&1 || true
  ```
  Run the two commands above.
  Expected: `ls` shows `docs` and `signex-web` (and nothing named `apps`, `packages`, `package.json`, or `turbo.json` yet); the `git` command prints `fatal: not a git repository (or any of the parent directories): .git`.

- [ ] **Step 2: Create the empty workspace directories with `.gitkeep`**
  ```bash
  mkdir -p /home/ealflm/dev/signex/apps /home/ealflm/dev/signex/packages
  touch /home/ealflm/dev/signex/apps/.gitkeep /home/ealflm/dev/signex/packages/.gitkeep
  ls -A /home/ealflm/dev/signex/apps /home/ealflm/dev/signex/packages
  ```
  Run the command above.
  Expected: both directories exist and each lists `.gitkeep`.

- [ ] **Step 3: Write the root `package.json`**
  Create `/home/ealflm/dev/signex/package.json` with this exact content:
  ```json
  {
    "name": "signex",
    "version": "0.0.0",
    "private": true,
    "workspaces": [
      "apps/*",
      "packages/*"
    ],
    "scripts": {
      "dev": "turbo run dev",
      "build": "turbo run build",
      "lint": "turbo run lint",
      "start": "turbo run start",
      "db:generate": "turbo run generate --filter=@signex/db",
      "db:migrate": "npm run migrate --workspace @signex/db"
    },
    "devDependencies": {
      "turbo": "^2.5.0"
    },
    "packageManager": "npm@10.9.0",
    "engines": {
      "node": ">=18"
    }
  }
  ```
  Write the file.
  Expected: file exists at `/home/ealflm/dev/signex/package.json` with the content above.

- [ ] **Step 4: Validate the root `package.json` is valid JSON and has the right shape**
  ```bash
  node -e "const p=require('/home/ealflm/dev/signex/package.json'); if(p.name!=='signex') throw new Error('name'); if(!p.private) throw new Error('private'); if(JSON.stringify(p.workspaces)!=='[\"apps/*\",\"packages/*\"]') throw new Error('workspaces'); if(!p.devDependencies.turbo) throw new Error('turbo'); if(p.scripts['db:generate']!=='turbo run generate --filter=@signex/db') throw new Error('db:generate'); console.log('ROOT_PKG_OK');"
  ```
  Run the command above.
  Expected: prints `ROOT_PKG_OK` (any thrown error means the JSON is malformed or a field is wrong — fix before continuing).

- [ ] **Step 5: Write `turbo.json` (Turborepo 2.x `"tasks"` schema with `@signex/db#generate` wiring)**
  Create `/home/ealflm/dev/signex/turbo.json` with this exact content:
  ```json
  {
    "$schema": "https://turborepo.dev/schema.json",
    "tasks": {
      "generate": {
        "cache": false
      },
      "@signex/db#generate": {
        "cache": false,
        "inputs": ["prisma/schema.prisma"],
        "outputs": ["generated/**"]
      },
      "@signex/db#build": {
        "dependsOn": ["@signex/db#generate"],
        "outputs": ["dist/**"]
      },
      "build": {
        "dependsOn": ["^build"],
        "outputs": [".next/**", "!.next/cache/**", "dist/**"]
      },
      "lint": {
        "dependsOn": ["^build"]
      },
      "dev": {
        "dependsOn": ["^build"],
        "cache": false,
        "persistent": true
      },
      "start": {
        "dependsOn": ["build"],
        "cache": false,
        "persistent": true
      }
    }
  }
  ```
  Write the file.
  Expected: file exists at `/home/ealflm/dev/signex/turbo.json`. Note: the top-level key is `"tasks"` (Turborepo 2.x), NOT `"pipeline"`. `@signex/db#build` `dependsOn` `@signex/db#generate` (Prisma client generated before the db lib is compiled); the generic `build`/`dev` `dependsOn` `^build`, so building or running any app first builds its workspace dependencies (`@signex/db`, `@signex/shared`) in order — which transitively generates the Prisma client and compiles the libs to runnable JS.

- [ ] **Step 6: Validate `turbo.json` is valid JSON with the `tasks` key (not `pipeline`)**
  ```bash
  node -e "const t=require('/home/ealflm/dev/signex/turbo.json'); if(!t.tasks) throw new Error('missing tasks key'); if(t.pipeline) throw new Error('must not use pipeline key'); if(!t.tasks['@signex/db#generate']) throw new Error('missing @signex/db#generate'); if(!t.tasks['@signex/db#build'].dependsOn.includes('@signex/db#generate')) throw new Error('@signex/db#build must depend on @signex/db#generate'); if(!t.tasks.build.dependsOn.includes('^build')) throw new Error('build must depend on ^build'); if(!t.tasks.dev.persistent) throw new Error('dev persistent'); console.log('TURBO_JSON_OK');"
  ```
  Run the command above.
  Expected: prints `TURBO_JSON_OK`.

- [ ] **Step 7: Write the root `.gitignore`**
  Create `/home/ealflm/dev/signex/.gitignore` with this exact content:
  ```gitignore
  # Dependencies
  node_modules/
  .pnp
  .pnp.*

  # Build outputs
  .next/
  out/
  build/
  dist/

  # Turborepo
  .turbo/

  # Prisma generated client (build artifact; regenerate with `prisma generate`)
  packages/db/generated/

  # TypeScript / Next build info
  *.tsbuildinfo
  next-env.d.ts

  # Env files (committed: .env.example only)
  .env
  .env.*
  !.env.example

  # Test / coverage
  coverage/

  # Logs
  *.log
  npm-debug.log*

  # OS / editor
  .DS_Store
  .vercel
  ```
  Write the file.
  Expected: file exists at `/home/ealflm/dev/signex/.gitignore`. Note: `.env.example` is explicitly un-ignored (`!.env.example`) so it is committed while all other `.env*` files are ignored; `packages/db/generated/` is ignored (the Prisma client is a build artifact, regenerated by Task 4's `generate` script).

- [ ] **Step 8: Write `.env.example` (committed; documents EVERY contract env var)**
  Create `/home/ealflm/dev/signex/.env.example` with this exact content:
  ```dotenv
  # ---------------------------------------------------------------------------
  # Signex monorepo environment template.
  # Copy to `.env` and adjust values: `cp .env.example .env`
  # `.env` is gitignored; this `.env.example` is committed.
  # ---------------------------------------------------------------------------

  # Postgres (consumed by the `postgres` Compose service)
  POSTGRES_USER=signex
  POSTGRES_PASSWORD=signex
  POSTGRES_DB=signex

  # Prisma / DB connection.
  # Local dev uses host `localhost`. INSIDE Docker Compose change the host to
  # `postgres` (the service name): postgresql://signex:signex@postgres:5432/signex?schema=public
  DATABASE_URL=postgresql://signex:signex@localhost:5432/signex?schema=public

  # Service ports
  API_PORT=4000
  WEB_PORT=2051
  ADMIN_PORT=2052

  # API URLs
  # API_URL is the server-side base used inside the Compose network (service name `api`).
  API_URL=http://api:4000
  # NEXT_PUBLIC_API_URL is the client-side (browser) base; exposed to the frontends.
  NEXT_PUBLIC_API_URL=http://localhost:4000
  ```
  Write the file.
  Expected: file exists at `/home/ealflm/dev/signex/.env.example`.

- [ ] **Step 9: Verify `.env.example` contains every required variable**
  ```bash
  for v in POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB DATABASE_URL API_PORT WEB_PORT ADMIN_PORT API_URL NEXT_PUBLIC_API_URL; do grep -q "^${v}=" /home/ealflm/dev/signex/.env.example || { echo "MISSING: $v"; exit 1; }; done; echo "ENV_EXAMPLE_OK"
  ```
  Run the command above.
  Expected: prints `ENV_EXAMPLE_OK` (no `MISSING:` line). Confirms all nine contract variables are present with the exact key names.

- [ ] **Step 10: Write the root `README.md` quickstart**
  Create `/home/ealflm/dev/signex/README.md` with this exact content:
  ```markdown
  # Signex

  Full-stack monorepo managed by **npm workspaces + Turborepo**.

  | Workspace | Package | Stack | Port |
  |-----------|---------|-------|------|
  | `apps/web` | `@signex/web` | Next.js 16 (public site) | 2051 |
  | `apps/admin` | `@signex/admin` | Next.js (admin skeleton) | 2052 |
  | `apps/api` | `@signex/api` | NestJS 11 (REST API) | 4000 |
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
  npm run dev                     # turbo runs api (:4000), web (:2051), admin (:2052)
  ```

  - Web:   http://localhost:2051  (`/` redirects to the detected locale, e.g. `/vi`; `/en` also serves)
  - Admin: http://localhost:2052
  - API health: http://localhost:4000/api/health  → `{ "status": "ok" }`

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

  - Web:   http://localhost:2051
  - Admin: http://localhost:2052
  - API:   http://localhost:4000/api/health
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
  ```
  Write the file.
  Expected: file exists at `/home/ealflm/dev/signex/README.md` documenting both the `npm run dev` and `docker compose up` workflows.

- [ ] **Step 11: Final sanity check of the skeleton layout**
  ```bash
  ls -A /home/ealflm/dev/signex
  test -f /home/ealflm/dev/signex/package.json && test -f /home/ealflm/dev/signex/turbo.json && test -f /home/ealflm/dev/signex/.gitignore && test -f /home/ealflm/dev/signex/.env.example && test -f /home/ealflm/dev/signex/README.md && test -f /home/ealflm/dev/signex/apps/.gitkeep && test -f /home/ealflm/dev/signex/packages/.gitkeep && echo "SKELETON_OK"
  ```
  Run the two commands above.
  Expected: `ls -A` shows `.env.example`, `.gitignore`, `README.md`, `apps`, `docs`, `package.json`, `packages`, `signex-web`, `turbo.json`; the second command prints `SKELETON_OK`.

- [ ] **Final step: Commit**
  The root git repo does NOT exist yet (it is created in Task 12), so this task cannot `git commit` at the repo root. There is nothing to stage now. All files created here (`package.json`, `turbo.json`, `.gitignore`, `.env.example`, `README.md`, `apps/.gitkeep`, `packages/.gitkeep`) are committed as part of Task 12's first monorepo commit (`git init` + `git add -A` + initial commit). No commit is performed in this task.

---

Now I have everything needed. Producing Task 3.

### Task 3: packages/shared (@signex/shared — types + zod schema)

**Files:**
- Create: `/home/ealflm/dev/signex/packages/shared/package.json`
- Create: `/home/ealflm/dev/signex/packages/shared/tsconfig.json`
- Create: `/home/ealflm/dev/signex/packages/shared/src/index.ts`
- Test: `/home/ealflm/dev/signex/packages/shared/src/index.ts` (verified via a `node -e` + `ts-node`/`tsx`-free `tsc --noEmit` typecheck and a runtime zod-parse exercise — no new test framework added)

**Interfaces:**
- Consumes:
  - Root workspace `package.json` with `"workspaces": ["apps/*","packages/*"]` and the empty `packages/` directory (from Task 2). The root has NOT been `npm install`ed against `@signex/shared` yet (root `npm install` happens in later tasks once all workspaces exist), so this task installs `zod` locally inside the package for the verification step and notes it will be hoisted at the next root install.
  - npm workspaces does NOT support the `workspace:` protocol — downstream consumers depend on `"@signex/shared": "*"`.
- Produces:
  - Package name `@signex/shared` (private, version `0.0.0`).
  - **Compiled-JS consumption strategy (REQUIRED for the Nest runtime):** the package is compiled to CommonJS with `tsc`; `main`/`types`/`exports` point at the built output `./dist/index.js` + `./dist/index.d.ts`. `nest build` is plain `tsc` and does NOT bundle workspace deps, so at runtime the api `require()`s `@signex/shared` — it must resolve to runnable JS, not raw `.ts` (Node cannot execute TS). The package therefore ships a real `build` step; `dist/` is a git-ignored build artifact (regenerated by `npm run build`). Turborepo's `^build` builds this package before any consuming app (Task 2 `turbo.json`).
  - Runtime dependency `zod` (declared in `packages/shared/package.json` `dependencies`).
  - Exports from `@signex/shared` (i.e. `./src/index.ts`):
    - `type ID` — placeholder shared type (`string`).
    - `type ApiResult<T>` — placeholder generic envelope type.
    - `contactMessageSchema` — a zod schema (example DTO).
    - `type ContactMessage` — `z.infer<typeof contactMessageSchema>`.
    - `z` — re-exported from `zod` so consumers can build/extend schemas without adding their own `zod` dep.

- [ ] **Step 1: Create the package manifest**
  Create `/home/ealflm/dev/signex/packages/shared/package.json` with this EXACT content. `main`/`types`/`exports` point at the compiled output in `dist/` (emitted by the `build` script = `tsc`). `zod` is a runtime dependency (pinned to 3.x so `z.string().email()` behaves as the verification asserts); `typescript` is a devDependency used by `build`/`typecheck`.
  ```json
  {
    "name": "@signex/shared",
    "version": "0.0.0",
    "private": true,
    "main": "./dist/index.js",
    "types": "./dist/index.d.ts",
    "exports": {
      ".": {
        "types": "./dist/index.d.ts",
        "default": "./dist/index.js"
      }
    },
    "files": [
      "dist"
    ],
    "scripts": {
      "build": "tsc",
      "typecheck": "tsc --noEmit"
    },
    "dependencies": {
      "zod": "^3.23.8"
    },
    "devDependencies": {
      "typescript": "^5"
    }
  }
  ```
  Run: `test -f /home/ealflm/dev/signex/packages/shared/package.json && echo MANIFEST_OK`
  Expected: prints `MANIFEST_OK`.

- [ ] **Step 2: Create the package tsconfig (standalone typecheck only)**
  Create `/home/ealflm/dev/signex/packages/shared/tsconfig.json` with this EXACT content. It is self-contained (no `extends`), emits **CommonJS** to `dist/` with declaration files (so the Nest app can `require()` it at runtime), `strict`, `rootDir: src` → `outDir: dist`.
  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "module": "commonjs",
      "moduleResolution": "node",
      "lib": ["ES2022"],
      "outDir": "dist",
      "rootDir": "src",
      "declaration": true,
      "strict": true,
      "esModuleInterop": true,
      "skipLibCheck": true,
      "forceConsistentCasingInFileNames": true
    },
    "include": ["src/**/*.ts"]
  }
  ```
  Run: `test -f /home/ealflm/dev/signex/packages/shared/tsconfig.json && echo TSCONFIG_OK`
  Expected: prints `TSCONFIG_OK`.

- [ ] **Step 3: Write the source `index.ts` (placeholder types + zod schema + inferred type)**
  Create `/home/ealflm/dev/signex/packages/shared/src/index.ts` with this EXACT content.
  ```ts
  import { z } from "zod";

  /**
   * @signex/shared — placeholder shared types + an example zod schema.
   * Compiled to CommonJS in dist/ (see package.json "main"/"exports") so the
   * NestJS runtime can require() it. Build with `npm run build`.
   */

  /** Placeholder shared identifier type. */
  export type ID = string;

  /** Placeholder generic API result envelope used across apps. */
  export type ApiResult<T> =
    | { ok: true; data: T }
    | { ok: false; error: string };

  /**
   * Example DTO schema (proves the zod dependency + import path work).
   * Mirrors a contact-message payload; not wired to any feature yet.
   */
  export const contactMessageSchema = z.object({
    name: z.string().min(1, "name is required"),
    email: z.string().email("must be a valid email"),
    message: z.string().min(1, "message is required"),
  });

  /** Inferred type for the example DTO. */
  export type ContactMessage = z.infer<typeof contactMessageSchema>;

  /** Re-export zod so consumers can build/extend schemas without their own dep. */
  export { z };
  ```
  Run: `test -f /home/ealflm/dev/signex/packages/shared/src/index.ts && echo INDEX_OK`
  Expected: prints `INDEX_OK`.

- [ ] **Step 4: Install dependencies locally for the verification step**
  The root has no `node_modules` resolving `zod`/`typescript` for this package yet (the full root `npm install` happens after all workspaces exist). Install inside the package now so Steps 5–6 can run; a later root `npm install` will hoist these into the single root tree.
  Run: `npm install --prefix /home/ealflm/dev/signex/packages/shared`
  Expected: npm creates `/home/ealflm/dev/signex/packages/shared/node_modules` containing `zod` and `typescript`; no error output; exit code 0. (`/home/ealflm/dev/signex/packages/shared/package-lock.json` is created — it is removed in Step 7 because the root lockfile owns the tree.)

- [ ] **Step 5: Typecheck the package (tsc, no new test framework)**
  Run: `npm run --prefix /home/ealflm/dev/signex/packages/shared typecheck`
  Expected: `tsc --noEmit` exits 0 with NO output (no type errors). A non-zero exit or any `error TS...` line is a failure — fix the source before continuing.

- [ ] **Step 6: Build the package, then runtime-verify the compiled zod schema imports and parses**
  Compile to `dist/` (the real `build` step) and `require()` the built CommonJS entrypoint from a `node -e` script, running a valid and an invalid parse through `contactMessageSchema`.
  Run:
  ```bash
  npm run build --prefix /home/ealflm/dev/signex/packages/shared && \
  node -e '
    const { contactMessageSchema } = require("/home/ealflm/dev/signex/packages/shared/dist/index.js");
    const ok = contactMessageSchema.safeParse({ name: "Ada", email: "ada@example.com", message: "hi" });
    const bad = contactMessageSchema.safeParse({ name: "", email: "nope", message: "" });
    if (!ok.success) { console.error("VALID PAYLOAD REJECTED", ok.error.issues); process.exit(1); }
    if (bad.success) { console.error("INVALID PAYLOAD ACCEPTED"); process.exit(1); }
    console.log("SHARED_ZOD_OK", ok.data.email, "errors=" + bad.error.issues.length);
  '
  ```
  Expected: `tsc` emits `/home/ealflm/dev/signex/packages/shared/dist/index.js` + `index.d.ts`, then the script prints `SHARED_ZOD_OK ada@example.com errors=3` (valid payload parsed; invalid payload produced 3 issues — empty name, bad email, empty message). Exit code 0.

- [ ] **Step 7: Remove the per-package lockfile (root lockfile owns the tree)**
  Per the contract, no per-package lockfiles may remain; the single root `package-lock.json` (created at the first full root install in a later task) owns the dependency tree. Remove the lockfile and the local `node_modules` created for verification. The built `dist/` is a git-ignored build artifact (root `.gitignore` ignores `dist/`) — leave it; it is not committed.
  Run: `rm -f /home/ealflm/dev/signex/packages/shared/package-lock.json && rm -rf /home/ealflm/dev/signex/packages/shared/node_modules && echo CLEANUP_OK`
  Expected: prints `CLEANUP_OK`; `/home/ealflm/dev/signex/packages/shared` contains `package.json`, `tsconfig.json`, `src/` and the git-ignored `dist/` (no `node_modules`, no `package-lock.json`).

- [ ] **Final step: Stage (commit deferred to Task 12)**
  Git is initialized at the repo root in Task 12, so this task cannot commit at the root yet. Stage nothing here (no repo exists); the files created above will be included in Task 12's first monorepo commit. Verify the final file set is correct.
  ```bash
  ls -A /home/ealflm/dev/signex/packages/shared
  ```
  Expected: lists `package.json`, `src`, `tsconfig.json` and the git-ignored `dist/` (no `node_modules`, no `package-lock.json`). The committed files are `package.json`, `tsconfig.json`, `src/index.ts` (`dist/` is ignored) — included in **Task 12's first monorepo commit** (`chore: scaffold signex monorepo`).

---

Now I have the full spec context. Producing Task 4.

### Task 4: packages/db (@signex/db — Prisma init, schema, client singleton, scripts, gitignored client)

**Files:**
- Create: `/home/ealflm/dev/signex/packages/db/package.json`
- Create: `/home/ealflm/dev/signex/packages/db/prisma/schema.prisma`
- Create: `/home/ealflm/dev/signex/packages/db/src/client.ts`
- Create: `/home/ealflm/dev/signex/packages/db/src/index.ts`
- Create: `/home/ealflm/dev/signex/packages/db/tsconfig.json`
- Create: `/home/ealflm/dev/signex/packages/db/.gitignore`
- Create: `/home/ealflm/dev/signex/packages/db/.env` (gitignored, for local `prisma generate`/`migrate`)
- Delete: `/home/ealflm/dev/signex/packages/db/package-lock.json` (if `prisma init`/install emits one — root lockfile owns the tree)

**Interfaces:**
- Consumes:
  - Repo root skeleton from Task 2: root `/home/ealflm/dev/signex/package.json` with `"workspaces": ["apps/*","packages/*"]`, the empty `/home/ealflm/dev/signex/packages/` directory, and the root `.gitignore`.
  - Env var `DATABASE_URL=postgresql://signex:signex@localhost:5432/signex?schema=public` (documented in root `.env.example` from Task 2).
- Produces (later tasks rely on these exact names/paths):
  - Workspace package `@signex/db` at `/home/ealflm/dev/signex/packages/db`.
  - Named export `prisma` (a `PrismaClient` singleton) and a type re-export of everything from the generated client, so `import { prisma } from "@signex/db"` and `import { type Prisma, PrismaClient } from "@signex/db"` both resolve. **Consumed by Task 6** (api `PrismaModule`).
  - Schema at `/home/ealflm/dev/signex/packages/db/prisma/schema.prisma` (datasource + generator only, no models). **Consumed by Tasks 10/13** (Docker `prisma generate` / `migrate deploy`).
  - Generator output dir `/home/ealflm/dev/signex/packages/db/generated/client` (git-ignored build artifact, regenerated by `prisma generate`). **Consumed by Tasks 10/13** (copied into the api runtime image).
  - npm scripts in `@signex/db`: `generate` (`prisma generate`), `migrate` (`prisma migrate dev`), `migrate:deploy` (`prisma migrate deploy`). **Consumed by Task 2's** turbo `generate`/`@signex/db#generate` task wiring and by Task 13's migration verification.
  - Runtime dependency `@prisma/client@^6.18.0` and devDependency `prisma@^6.18.0`.

> Note: `prisma migrate dev` / `migrate:deploy` against a live Postgres container is **NOT** exercised here (no DB is running yet) — it is verified end-to-end in **Task 13**. This task only proves `prisma generate` succeeds and that `import { prisma } from "@signex/db"` type-resolves via `tsc`.

- [ ] **Step 1: Create the package directory and hand-author `package.json`**
  We hand-author the files rather than rely on `prisma init` scaffolding (per the Prisma research: the init output is minimal and we overwrite `schema.prisma`/`package.json` anyway). Create the dir, then write the manifest.
  Run:
  ```bash
  mkdir -p /home/ealflm/dev/signex/packages/db/prisma /home/ealflm/dev/signex/packages/db/src
  ```
  Expected: directories `/home/ealflm/dev/signex/packages/db`, `.../prisma`, and `.../src` exist (no output on success).

  Create `/home/ealflm/dev/signex/packages/db/package.json`:
  ```json
  {
    "name": "@signex/db",
    "version": "0.0.0",
    "private": true,
    "main": "./dist/index.js",
    "types": "./dist/index.d.ts",
    "exports": {
      ".": {
        "types": "./dist/index.d.ts",
        "default": "./dist/index.js"
      }
    },
    "files": [
      "dist",
      "prisma"
    ],
    "scripts": {
      "generate": "prisma generate",
      "build": "tsc",
      "migrate": "prisma migrate dev",
      "migrate:deploy": "prisma migrate deploy",
      "typecheck": "tsc --noEmit"
    },
    "dependencies": {
      "@prisma/client": "^6.18.0"
    },
    "devDependencies": {
      "@types/node": "^20",
      "prisma": "^6.18.0",
      "typescript": "^5"
    }
  }
  ```
  Expected: file exists; `name` is exactly `@signex/db`, `main`/`types`/`exports` point at the compiled output `./dist/index.js` + `./dist/index.d.ts` (the api `require()`s it at runtime — `nest build` does not bundle workspace deps), and a `build` script (`tsc`) emits `dist/`.

- [ ] **Step 2: Write `prisma/schema.prisma` (datasource + generator ONLY — no models)**
  Use the `prisma-client-js` generator with an explicit `output` inside the package and `binaryTargets` including the Alpine musl target (so Task 10's Docker build produces the `linux-musl-openssl-3.0.x` query engine). No domain models — ready to migrate.
  Create `/home/ealflm/dev/signex/packages/db/prisma/schema.prisma`:
  ```prisma
  // Prisma schema for @signex/db.
  // Datasource + generator ONLY — no domain models yet (ready to `prisma migrate`).
  // The generated client is a build artifact: it lands in ../generated/client and is git-ignored.
  // Regenerate with `npm run -w @signex/db generate`.

  generator client {
    provider      = "prisma-client-js"
    output        = "../generated/client"
    binaryTargets = ["native", "linux-musl-openssl-3.0.x"]
  }

  datasource db {
    provider = "postgresql"
    url      = env("DATABASE_URL")
  }
  ```
  Expected: file exists. `output = "../generated/client"` resolves (relative to the schema) to `/home/ealflm/dev/signex/packages/db/generated/client`. `binaryTargets` includes `native` (host, for local generate/dev) and `linux-musl-openssl-3.0.x` (Alpine runtime, for Docker).

- [ ] **Step 3: Write the singleton client `src/client.ts`**
  The `prisma-client-js` generator with a custom `output` emits the client at `../generated/client` (relative to the schema dir `packages/db/prisma/`), i.e. `packages/db/generated/client`. From `packages/db/src/client.ts` that path is `../generated/client`. The `globalThis` memoization prevents exhausting the connection pool under HMR.
  Create `/home/ealflm/dev/signex/packages/db/src/client.ts`:
  ```ts
  import { PrismaClient } from "../generated/client";

  const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
  };

  export const prisma =
    globalForPrisma.prisma ??
    new PrismaClient({
      log:
        process.env.NODE_ENV === "development"
          ? ["query", "warn", "error"]
          : ["error"],
    });

  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
  ```
  Expected: file exists; imports `PrismaClient` from the generated output path `../generated/client` (NOT from `@prisma/client`), and exports the memoized `prisma` singleton.

- [ ] **Step 4: Write the barrel `src/index.ts` (the `@signex/db` entrypoint)**
  Re-export the singleton and all generated types/enums/`Prisma` namespace so consumers get both the instance and the types from one import path.
  Create `/home/ealflm/dev/signex/packages/db/src/index.ts`:
  ```ts
  export { prisma } from "./client";
  export * from "../generated/client";
  ```
  Expected: file exists. After generate, `import { prisma } from "@signex/db"` (instance) and `import { type Prisma, PrismaClient } from "@signex/db"` (types) both resolve.

- [ ] **Step 5: Write `tsconfig.json` (used by the typecheck verification in Step 9)**
  A self-contained strict config that emits **CommonJS** to `dist/` from `src/` (the generated Prisma client is already emitted JS+`.d.ts` at `../generated/client` and is referenced via a relative import that resolves identically from `src/` and `dist/` — not recompiled). The api `require()`s the built `dist/index.js` at runtime.
  Create `/home/ealflm/dev/signex/packages/db/tsconfig.json`:
  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "module": "commonjs",
      "moduleResolution": "node",
      "lib": ["ES2022"],
      "outDir": "dist",
      "rootDir": "src",
      "strict": true,
      "esModuleInterop": true,
      "skipLibCheck": true,
      "forceConsistentCasingInFileNames": true,
      "declaration": true
    },
    "include": ["src/**/*.ts"],
    "exclude": ["node_modules", "dist"]
  }
  ```
  Expected: file exists.

- [ ] **Step 6: Write `.gitignore` (exclude the generated client + local env)**
  The generated client and its query engine are build artifacts (regenerated by `prisma generate`); the local `.env` carries the real `DATABASE_URL`. The committed schema lives in `prisma/` and `prisma/migrations/` will be committed when it appears (Task 13) — so do NOT ignore `prisma/`.
  Create `/home/ealflm/dev/signex/packages/db/.gitignore`:
  ```gitignore
  # Prisma generated client (build artifact — regenerate with `prisma generate`)
  /generated/

  # Local env (real DATABASE_URL); .env.example is committed at the repo root
  .env

  # npm
  node_modules/
  ```
  Expected: file exists.

- [ ] **Step 7: Write the local `.env` so `prisma generate` can resolve `env("DATABASE_URL")`**
  `prisma generate` reads `env("DATABASE_URL")` from the schema and loads `.env` from the schema's package dir. Value matches the contract (localhost host for local runs; Compose overrides to host `postgres`).
  Create `/home/ealflm/dev/signex/packages/db/.env`:
  ```dotenv
  DATABASE_URL=postgresql://signex:signex@localhost:5432/signex?schema=public
  ```
  Expected: file exists and is git-ignored (covered by Step 6's `.env` rule).

- [ ] **Step 8: Install workspace deps from the root, then remove any per-package lockfile**
  Install at the repo root so the single root lockfile owns the tree (npm workspaces hoist + symlink `@signex/db`). Then delete any `package-lock.json` that npm may have written inside the package.
  Run:
  ```bash
  npm install --prefix /home/ealflm/dev/signex
  ```
  Expected: install completes; `/home/ealflm/dev/signex/package-lock.json` exists and contains a `node_modules/@signex/db` (or `packages/db`) workspace entry; `prisma` and `@prisma/client` resolve under the root `node_modules`.

  Run:
  ```bash
  rm -f /home/ealflm/dev/signex/packages/db/package-lock.json
  ```
  Expected: no per-package lockfile remains. Verify with:
  ```bash
  test ! -f /home/ealflm/dev/signex/packages/db/package-lock.json && echo "no per-package lockfile OK"
  ```
  Expected output: `no per-package lockfile OK`

- [ ] **Step 9: Generate the Prisma client (proves the schema is valid + emits the client)**
  Run the package's own `generate` script via the workspace. This validates the schema, generates the client into `generated/client`, and downloads the engines for the declared `binaryTargets`.
  Run:
  ```bash
  npm run generate --workspace @signex/db
  ```
  Expected: output ends with `✔ Generated Prisma Client (v6.x...) to ./generated/client`. The directory `/home/ealflm/dev/signex/packages/db/generated/client` now exists with `index.d.ts`/runtime files. Verify:
  ```bash
  test -d /home/ealflm/dev/signex/packages/db/generated/client && echo "generated client OK"
  ```
  Expected output: `generated client OK`

- [ ] **Step 10: Typecheck + build the package, prove `import { prisma } from "@signex/db"` resolves**
  Typecheck, then run the real `build` (`tsc` → `dist/`) so the api can `require()` the compiled client at runtime. The generated client (Step 9) must exist first.
  Run:
  ```bash
  npm run typecheck --workspace @signex/db && \
  npm run build --workspace @signex/db && \
  node -e "const db=require('/home/ealflm/dev/signex/packages/db/dist/index.js'); if(typeof db.prisma!=='object') throw new Error('prisma not exported'); console.log('DB_DIST_OK');"
  ```
  Expected: `tsc --noEmit` is clean, `tsc` emits `/home/ealflm/dev/signex/packages/db/dist/index.js` + `index.d.ts`, and the `node -e` require of the compiled CommonJS entry prints `DB_DIST_OK` (the `prisma` singleton is exported; `new PrismaClient()` instantiates against the generated client without needing a live DB connection).

  Then prove the **public import path** `@signex/db` resolves from a consumer's perspective (workspace symlink + `tsc` module resolution). Create a throwaway probe and typecheck it with the package's own (NodeNext) tsconfig:
  ```bash
  printf '%s\n' \
    'import { prisma } from "@signex/db";' \
    'import type { Prisma } from "@signex/db";' \
    'const _p: typeof prisma = prisma;' \
    'type _T = Prisma.JsonValue;' \
    'void _p;' \
    > /home/ealflm/dev/signex/packages/db/__probe.ts
  npx --prefix /home/ealflm/dev/signex tsc \
    --noEmit --strict --module NodeNext --moduleResolution NodeNext --skipLibCheck \
    --baseUrl /home/ealflm/dev/signex \
    /home/ealflm/dev/signex/packages/db/__probe.ts
  ```
  Expected: `tsc` exits 0 (no output) — `@signex/db` resolves via the npm workspace symlink and exposes both the `prisma` value and the `Prisma` type namespace. Then remove the probe:
  ```bash
  rm -f /home/ealflm/dev/signex/packages/db/__probe.ts
  ```
  Expected: probe file removed (no output).

- [ ] **Final step: Commit**
  Git is not initialized at the repo root until **Task 12**, so this task cannot commit at the root. Stage the new package's source-of-truth files (the generated client, `node_modules`, and local `.env` are git-ignored and intentionally NOT staged). These will land in **Task 12's first monorepo commit**.
  ```bash
  git -C /home/ealflm/dev/signex add \
    packages/db/package.json \
    packages/db/tsconfig.json \
    packages/db/.gitignore \
    packages/db/prisma/schema.prisma \
    packages/db/src/client.ts \
    packages/db/src/index.ts \
    2>/dev/null || echo "root repo not yet initialized — packages/db files will be committed as part of Task 12's first monorepo commit"
  ```
  Note: `packages/db/generated/`, `packages/db/dist/`, `packages/db/.env`, and `packages/db/node_modules/` are deliberately excluded (git-ignored build artifacts / secrets). `git add` will no-op or print the fallback notice until Task 12 runs `git init`; either way these files are committed as part of **Task 12's first monorepo commit**.

---

Now I have the full spec. Let me produce Tasks 5 and 6.

### Task 5: Scaffold apps/api (NestJS) + workspace integration

**Files:**
- Create (via `nest new`): `/home/ealflm/dev/signex/apps/api/` (full NestJS v11 starter tree: `src/app.controller.ts`, `src/app.controller.spec.ts`, `src/app.module.ts`, `src/app.service.ts`, `src/main.ts`, `test/app.e2e-spec.ts`, `test/jest-e2e.json`, `nest-cli.json`, `tsconfig.json`, `tsconfig.build.json`, `eslint.config.mjs`, `.prettierrc`, `package.json`, `README.md`, `.gitignore`)
- Modify: `/home/ealflm/dev/signex/apps/api/package.json` (name → `@signex/api`; add `@signex/db`, `@signex/shared` deps)
- Modify: `/home/ealflm/dev/signex/apps/api/src/main.ts` (full rewrite — global prefix `api`, listen `0.0.0.0`, `API_PORT`)
- Delete: `/home/ealflm/dev/signex/apps/api/package-lock.json` (CLI-generated; root lockfile owns the tree)
- Delete: `/home/ealflm/dev/signex/apps/api/node_modules` (CLI-generated; root install hoists)
- Delete: `/home/ealflm/dev/signex/apps/api/.git` (if any — guarded by `--skip-git`, removed defensively)

**Interfaces:**
- Consumes: monorepo root skeleton from Task 2 — `/home/ealflm/dev/signex/package.json` with `"workspaces": ["apps/*","packages/*"]`, empty `/home/ealflm/dev/signex/apps/` dir; `@signex/db` (Task 4) and `@signex/shared` (Task 3) package names declared (their dirs exist as workspaces so npm can link them); env var `API_PORT=4000` (from Task 2 `.env.example`).
- Produces: workspace package `@signex/api` at `/home/ealflm/dev/signex/apps/api`; NestJS app with global route prefix `api` (routes under `/api/...`); server bound `0.0.0.0:${process.env.API_PORT ?? 4000}`; default `AppModule` (`/home/ealflm/dev/signex/apps/api/src/app.module.ts`) and bootstrap entry `/home/ealflm/dev/signex/apps/api/src/main.ts`; jest + supertest devDeps available for Task 6's e2e test. No per-app lockfile remains.

- [ ] **Step 1: Confirm preconditions (root workspace + empty apps/ exist, api/ does not)**
  ```bash
  test -f /home/ealflm/dev/signex/package.json \
    && grep -q '"apps/\*"' /home/ealflm/dev/signex/package.json \
    && test -d /home/ealflm/dev/signex/apps \
    && ! test -e /home/ealflm/dev/signex/apps/api \
    && echo "PRECONDITIONS_OK"
  ```
  Run: the command above.
  Expected: prints exactly `PRECONDITIONS_OK`. (If `apps/api` already exists from a previous attempt, stop and remove it first: `rm -rf /home/ealflm/dev/signex/apps/api`.)

- [ ] **Step 2: Scaffold NestJS v11 into apps/api with the exact CLI flags**
  `nest new` always creates a subdirectory named after the project argument and cannot scaffold in-place, so generate as `api` from inside `apps/` (the project arg `api` creates `apps/api`).
  ```bash
  cd /home/ealflm/dev/signex/apps && npx @nestjs/cli@latest new api --package-manager npm --skip-git
  ```
  Run: the command above.
  Expected: the CLI prints `🚀 Successfully created project api` (and a "Get started" block). The tree `/home/ealflm/dev/signex/apps/api/{src,test,package.json,nest-cli.json,tsconfig.json,tsconfig.build.json,eslint.config.mjs}` now exists. (It also created `apps/api/package-lock.json` and `apps/api/node_modules` — removed in Step 3.)

- [ ] **Step 3: Remove the CLI-generated lockfile, node_modules, and any stray .git**
  The single root `package-lock.json` (Task 2) must own the entire dependency tree; the per-app lockfile and node_modules must not survive (spec §10 "CLI-generated lockfiles", contract "CLI-generated per-app package-lock.json files MUST be removed").
  ```bash
  rm -rf /home/ealflm/dev/signex/apps/api/package-lock.json \
         /home/ealflm/dev/signex/apps/api/node_modules \
         /home/ealflm/dev/signex/apps/api/.git
  ```
  Run: the command above, then verify:
  ```bash
  ls -la /home/ealflm/dev/signex/apps/api | grep -E 'package-lock\.json|node_modules|\.git$' || echo "CLEANED"
  ```
  Expected: prints exactly `CLEANED` (none of those three entries remain).

- [ ] **Step 4: Read the generated package.json so the next edits match exactly**
  Run:
  ```bash
  cat /home/ealflm/dev/signex/apps/api/package.json
  ```
  Expected: a JSON object whose first lines include `"name": "api"`, `"version": "0.0.1"`, `"private": true`; a `"scripts"` block containing `"build": "nest build"`, `"start": "nest start"`, `"start:dev": "nest start --watch"`, `"start:prod": "node dist/main"`, `"test": "jest"`, `"test:e2e": "jest --config ./test/jest-e2e.json"`; a `"dependencies"` block with `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`, `reflect-metadata`, `rxjs`; a `"devDependencies"` block with `@nestjs/cli`, `@nestjs/schematics`, `@nestjs/testing`, `jest ^29.x`, `ts-jest`, `supertest ^7.x`, `@types/jest`, `@types/supertest`, `typescript`; and an inline `"jest"` config block. Note the exact `"name": "api"` string and the exact opening of the `"dependencies": {` object for the edits in Steps 5–6.

- [ ] **Step 5: Rename the package to `@signex/api`**
  Edit `/home/ealflm/dev/signex/apps/api/package.json` — replace the name field:
  - old: `"name": "api",`
  - new: `"name": "@signex/api",`

  Run:
  ```bash
  grep '"name":' /home/ealflm/dev/signex/apps/api/package.json
  ```
  Expected: prints `  "name": "@signex/api",`.

- [ ] **Step 6: Add `@signex/db` and `@signex/shared` as workspace dependencies (`"*"`)**
  npm workspaces do NOT support the `workspace:` protocol (npm throws `EUNSUPPORTEDPROTOCOL`); use `"*"`, which npm's Arborist resolves to the in-repo workspace symlink. Edit `/home/ealflm/dev/signex/apps/api/package.json`, inserting the two deps as the FIRST entries of the existing `"dependencies"` object:
  - old:
    ```json
    "dependencies": {
        "@nestjs/common": 
    ```
  - new:
    ```json
    "dependencies": {
        "@signex/db": "*",
        "@signex/shared": "*",
        "@nestjs/common": 
    ```
  (Match the generator's exact indentation — the NestJS starter indents `package.json` with 2 spaces; the dependency entries inside `"dependencies"` are at 4 spaces. Adjust the leading whitespace to match what Step 4 printed.)

  Run:
  ```bash
  node -e "const p=require('/home/ealflm/dev/signex/apps/api/package.json'); console.log(p.name, p.dependencies['@signex/db'], p.dependencies['@signex/shared'])"
  ```
  Expected: prints `@signex/api * *`.

- [ ] **Step 7: Rewrite `src/main.ts` — global prefix `api`, bind `0.0.0.0`, listen on `API_PORT`**
  Replace the entire contents of `/home/ealflm/dev/signex/apps/api/src/main.ts` with the version below. `app.setGlobalPrefix('api')` makes a controller `@Get('health')` resolve to `/api/health`; the two-arg `app.listen(port, '0.0.0.0')` overload binds all interfaces (required inside Docker); `process.env.API_PORT ?? 4000` matches the contract's `API_PORT=4000` env var (a string from env is accepted by `listen`). `enableShutdownHooks()` ensures the PrismaService `onModuleDestroy` (Task 6) fires on container stop.
  ```typescript
  import { NestFactory } from '@nestjs/core';
  import { AppModule } from './app.module';

  async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    app.setGlobalPrefix('api');
    app.enableShutdownHooks();
    const port = process.env.API_PORT ?? 4000;
    await app.listen(port, '0.0.0.0');
  }
  void bootstrap();
  ```
  Run:
  ```bash
  grep -n "setGlobalPrefix('api')" /home/ealflm/dev/signex/apps/api/src/main.ts && grep -n "process.env.API_PORT" /home/ealflm/dev/signex/apps/api/src/main.ts && grep -n "'0.0.0.0'" /home/ealflm/dev/signex/apps/api/src/main.ts
  ```
  Expected: three lines printed — the `setGlobalPrefix('api')` line, the `process.env.API_PORT ?? 4000` line, and the `app.listen(port, '0.0.0.0')` line — confirming all three edits are present.

- [ ] **Step 8: Install at the root so the workspace links and api deps resolve**
  Run from the repo root (single lockfile is created/updated here):
  ```bash
  npm install --prefix /home/ealflm/dev/signex
  ```
  Expected: completes with `added N packages` and no `EUNSUPPORTEDPROTOCOL` / `ERESOLVE` errors. A single `/home/ealflm/dev/signex/package-lock.json` exists and is the only lockfile:
  ```bash
  find /home/ealflm/dev/signex -name package-lock.json -not -path '*/node_modules/*'
  ```
  Expected: prints exactly one path: `/home/ealflm/dev/signex/package-lock.json`.

- [ ] **Step 9: Verify the workspace symlink and a typecheck/build of the default app**
  Confirm npm linked `@signex/api` as a workspace and the default NestJS app still compiles after the `main.ts` edits.
  ```bash
  test -L /home/ealflm/dev/signex/node_modules/@signex/api && echo "LINKED" ; \
  npm run build --workspace @signex/api
  ```
  Run: the command above (`build` = `nest build`).
  Expected: prints `LINKED`, then `nest build` completes with no TypeScript errors and produces `/home/ealflm/dev/signex/apps/api/dist/main.js`. Verify:
  ```bash
  test -f /home/ealflm/dev/signex/apps/api/dist/main.js && echo "BUILD_OK"
  ```
  Expected: prints `BUILD_OK`.

- [ ] **Final step: Stage (no commit yet — repo root git is initialized in Task 12)**
  The root repo is not a git repo until Task 12 (per the contract's strict git ordering), so this task cannot commit at the root. Leave the generated/edited files in place; they are committed as part of **Task 12's first monorepo commit**. Sanity-check the artifacts that Task 12 will pick up:
  ```bash
  ls /home/ealflm/dev/signex/apps/api/src/main.ts \
     /home/ealflm/dev/signex/apps/api/src/app.module.ts \
     /home/ealflm/dev/signex/apps/api/package.json \
     && echo "TASK5_ARTIFACTS_PRESENT"
  ```
  Expected: prints the three paths followed by `TASK5_ARTIFACTS_PRESENT`. (Committed as part of Task 12's first monorepo commit.)

---

### Task 6: apps/api health endpoint + PrismaModule (TDD with supertest e2e)

**Files:**
- Test (write FIRST, must fail): `/home/ealflm/dev/signex/apps/api/test/health.e2e-spec.ts`
- Create: `/home/ealflm/dev/signex/apps/api/src/health/health.controller.ts`
- Create: `/home/ealflm/dev/signex/apps/api/src/health/health.module.ts`
- Create: `/home/ealflm/dev/signex/apps/api/src/prisma/prisma.service.ts`
- Create: `/home/ealflm/dev/signex/apps/api/src/prisma/prisma.module.ts`
- Modify: `/home/ealflm/dev/signex/apps/api/src/app.module.ts` (import `HealthModule` + `PrismaModule`)

**Interfaces:**
- Consumes: `@signex/api` scaffold from Task 5 — `/home/ealflm/dev/signex/apps/api/src/app.module.ts`, `/home/ealflm/dev/signex/apps/api/src/main.ts` with `app.setGlobalPrefix('api')`; jest + supertest devDeps; the `test:e2e` script (`jest --config ./test/jest-e2e.json`) and `test/jest-e2e.json` (testRegex `*.e2e-spec.ts`). The `@signex/db` package (Task 4) exporting the singleton `prisma` (a `PrismaClient`) from `/home/ealflm/dev/signex/packages/db/src/index.ts` — imported as `import { prisma } from '@signex/db'`.
- Produces: `GET /api/health` → `200 {"status":"ok"}` (consumed by the api Docker healthcheck in Tasks 10/11); a global `PrismaModule` exporting `PrismaService` (whose `.client` wraps the `@signex/db` `prisma` singleton and `$connect()`s on boot / `$disconnect()`s on shutdown) — proves the DB connection is exercised with an empty schema; a passing e2e test at `/home/ealflm/dev/signex/apps/api/test/health.e2e-spec.ts`.

- [ ] **Step 1: Read TDD skill, then read the current app.module.ts**
  Follow `superpowers:test-driven-development` (write the failing test first, watch it fail for the right reason, then implement). Read the file the next edit modifies:
  ```bash
  cat /home/ealflm/dev/signex/apps/api/src/app.module.ts
  ```
  Expected: the default NestJS starter module —
  ```typescript
  import { Module } from '@nestjs/common';
  import { AppController } from './app.controller';
  import { AppService } from './app.service';

  @Module({
    imports: [],
    controllers: [AppController],
    providers: [AppService],
  })
  export class AppModule {}
  ```
  Note the exact `imports: []` line and import header for the Step 6 edit.

- [ ] **Step 2: Write the failing e2e test for `GET /api/health`**
  Create `/home/ealflm/dev/signex/apps/api/test/health.e2e-spec.ts`. The global prefix is NOT inherited from `main.ts` in tests, so the test re-applies `setGlobalPrefix('api')` to mirror production; supertest wraps `app.getHttpServer()` and `app.init()` (not `app.listen()`) is sufficient.
  ```typescript
  import { Test, TestingModule } from '@nestjs/testing';
  import { INestApplication } from '@nestjs/common';
  import request from 'supertest';
  import { AppModule } from './../src/app.module';

  describe('HealthController (e2e)', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      app = moduleFixture.createNestApplication();
      app.setGlobalPrefix('api'); // mirror main.ts so the /api prefix applies
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('/api/health (GET) returns 200 { status: "ok" }', () => {
      return request(app.getHttpServer())
        .get('/api/health')
        .expect(200)
        .expect({ status: 'ok' });
    });
  });
  ```

- [ ] **Step 3: Run the e2e test and watch it FAIL (route does not exist yet)**
  Run:
  ```bash
  npm run test:e2e --workspace @signex/api
  ```
  Expected: jest runs `health.e2e-spec.ts` and the test FAILS. The failure is the right reason — the route is unregistered, so supertest receives `404` (Nest's `Cannot GET /api/health`) and jest reports `expected 200 "OK", got 404 "Not Found"` for `HealthController (e2e) › /api/health (GET) returns 200 { status: "ok" }`. (It must NOT fail on a compile/import error; if it does, fix the test file first.)

- [ ] **Step 4: Implement the HealthController**
  Create `/home/ealflm/dev/signex/apps/api/src/health/health.controller.ts`. `@Controller('health')` + `@Get()` resolves under the global `api` prefix to `/api/health`.
  ```typescript
  import { Controller, Get } from '@nestjs/common';

  @Controller('health')
  export class HealthController {
    @Get()
    check(): { status: string } {
      return { status: 'ok' };
    }
  }
  ```

- [ ] **Step 5: Implement the HealthModule**
  Create `/home/ealflm/dev/signex/apps/api/src/health/health.module.ts`.
  ```typescript
  import { Module } from '@nestjs/common';
  import { HealthController } from './health.controller';

  @Module({
    controllers: [HealthController],
  })
  export class HealthModule {}
  ```

- [ ] **Step 6: Implement the thin PrismaService wrapping the `@signex/db` singleton**
  Create `/home/ealflm/dev/signex/apps/api/src/prisma/prisma.service.ts`. Use the composition pattern (a `.client` property, NOT `extends PrismaClient` — `extends` is fragile on Prisma 6.14+/7). The service injects the externally-provided `prisma` singleton exported by `@signex/db` and `$connect()`s it on module init (exercising the DB connection on boot, even with the empty schema); the connect is wrapped in try/catch so a missing DB at boot logs a warning instead of crashing the app (the connection is verified for real against Postgres in Task 13), and `$disconnect()`s on destroy (fired via `enableShutdownHooks()` from Task 5's `main.ts`). `PrismaClient` is re-exported as a type from `@signex/db` (Task 4's `export * from "../generated/client"`).
  ```typescript
  import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
  import { prisma, type PrismaClient } from '@signex/db';

  @Injectable()
  export class PrismaService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(PrismaService.name);
    readonly client: PrismaClient = prisma;

    async onModuleInit(): Promise<void> {
      try {
        await this.client.$connect();
      } catch (err) {
        // Scaffold: don't hard-crash the API if the DB is unreachable at boot
        // (e.g. running the e2e without a database). The connection is exercised
        // for real against the Postgres container in Task 13.
        this.logger.warn(
          `Prisma $connect failed at boot (continuing): ${(err as Error).message}`,
        );
      }
    }

    async onModuleDestroy(): Promise<void> {
      await this.client.$disconnect();
    }
  }
  ```

- [ ] **Step 7: Implement the global PrismaModule**
  Create `/home/ealflm/dev/signex/apps/api/src/prisma/prisma.module.ts`. `@Global()` means `AppModule` imports it once and `PrismaService` is injectable anywhere without re-importing — ready for future domain modules.
  ```typescript
  import { Global, Module } from '@nestjs/common';
  import { PrismaService } from './prisma.service';

  @Global()
  @Module({
    providers: [PrismaService],
    exports: [PrismaService],
  })
  export class PrismaModule {}
  ```

- [ ] **Step 8: Wire both modules into AppModule**
  Edit `/home/ealflm/dev/signex/apps/api/src/app.module.ts`. Add the two imports to the header and to the `imports` array (keeping the default `AppController`/`AppService`, per the contract "keep default AppModule"). Replace the whole file with:
  ```typescript
  import { Module } from '@nestjs/common';
  import { AppController } from './app.controller';
  import { AppService } from './app.service';
  import { HealthModule } from './health/health.module';
  import { PrismaModule } from './prisma/prisma.module';

  @Module({
    imports: [PrismaModule, HealthModule],
    controllers: [AppController],
    providers: [AppService],
  })
  export class AppModule {}
  ```

- [ ] **Step 9: Build `@signex/db`, then re-run the e2e test and watch it PASS (no DB required)**
  The PrismaService `require()`s the `prisma` singleton from `@signex/db`, whose `PrismaClient` lives in the generated client and is re-exported from the compiled `dist/` (Task 4). Generate + build it first, then run the test. The e2e boots the full `AppModule`, so `PrismaService.onModuleInit` attempts `$connect()`; the connect is wrapped in try/catch (Step 6), so the test PASSES even with NO Postgres running — the real connection is verified in Task 13.
  ```bash
  npm run generate --workspace @signex/db && \
  npm run build --workspace @signex/db && \
  npm run test:e2e --workspace @signex/api
  ```
  Run: the command above.
  Expected: `prisma generate` reports `Generated Prisma Client`; `tsc` emits `packages/db/dist`; then jest prints `PASS test/health.e2e-spec.ts` with `✓ /api/health (GET) returns 200 { status: "ok" }` and `Tests: 1 passed`. (A `PrismaService` warning line about `$connect` may appear in the log if no DB is running — that is expected and does NOT fail the test.)

- [ ] **Step 10: Build the workspace deps, then the api, to confirm everything compiles together**
  `nest build` is plain `tsc` and resolves `@signex/db`'s types from its compiled `dist/index.d.ts`, so build the packages first (generate is idempotent), then the api.
  Run:
  ```bash
  npm run generate --workspace @signex/db && \
  npm run build --workspace @signex/db --workspace @signex/shared && \
  npm run build --workspace @signex/api
  ```
  Expected: the package builds emit `packages/db/dist` + `packages/shared/dist`; then `nest build` completes with no TypeScript errors and `/home/ealflm/dev/signex/apps/api/dist/main.js`, `dist/health/health.controller.js`, and `dist/prisma/prisma.service.js` are produced. Verify:
  ```bash
  test -f /home/ealflm/dev/signex/apps/api/dist/health/health.controller.js \
    && test -f /home/ealflm/dev/signex/apps/api/dist/prisma/prisma.service.js \
    && echo "BUILD_OK"
  ```
  Expected: prints `BUILD_OK`.

- [ ] **Final step: Stage (no commit yet — repo root git is initialized in Task 12)**
  As in Task 5, the root is not yet a git repo (Task 12 owns the first monorepo commit), so this task does not commit at the root. Confirm the new files are on disk for Task 12 to pick up:
  ```bash
  ls /home/ealflm/dev/signex/apps/api/src/health/health.controller.ts \
     /home/ealflm/dev/signex/apps/api/src/health/health.module.ts \
     /home/ealflm/dev/signex/apps/api/src/prisma/prisma.service.ts \
     /home/ealflm/dev/signex/apps/api/src/prisma/prisma.module.ts \
     /home/ealflm/dev/signex/apps/api/test/health.e2e-spec.ts \
     && echo "TASK6_ARTIFACTS_PRESENT"
  ```
  Expected: prints the five paths followed by `TASK6_ARTIFACTS_PRESENT`. (Committed as part of Task 12's first monorepo commit, alongside Task 5's api scaffold.)

---

Now I have the full spec context. Let me produce Task 7.

### Task 7: apps/admin scaffold (create-next-app + integration: port 2052, standalone + outputFileTracingRoot, placeholder dashboard)

**Files:**
- Create: `/home/ealflm/dev/signex/apps/admin/` (entire app, via `create-next-app@latest`)
- Modify: `/home/ealflm/dev/signex/apps/admin/package.json` (name → `@signex/admin`; `dev`/`start` scripts → `-p 2052`)
- Modify: `/home/ealflm/dev/signex/apps/admin/next.config.ts` (add `output: "standalone"` + `outputFileTracingRoot`)
- Modify: `/home/ealflm/dev/signex/apps/admin/app/page.tsx` (replace boilerplate with "Signex Admin" placeholder dashboard)
- Modify: `/home/ealflm/dev/signex/apps/admin/app/layout.tsx` (set metadata title to "Signex Admin")
- Delete: `/home/ealflm/dev/signex/apps/admin/package-lock.json` (CLI-emitted; root lockfile owns the tree)
- Delete: `/home/ealflm/dev/signex/apps/admin/app/page.module.css` and `/home/ealflm/dev/signex/apps/admin/app/globals.css` are KEPT (globals.css referenced by layout); only the home-page boilerplate content is replaced

**Interfaces:**
- Consumes: monorepo root skeleton from Task 2 — root `package.json` with `"workspaces": ["apps/*","packages/*"]`, root `turbo.json` (`tasks` key), empty `apps/` directory at `/home/ealflm/dev/signex/apps`. Repo root: `/home/ealflm/dev/signex`. Git is NOT yet initialized at root (Task 12 owns `git init`).
- Produces:
  - Workspace package `@signex/admin` at `/home/ealflm/dev/signex/apps/admin`.
  - `next dev`/`next start` bound to port **2052**.
  - `next.config.ts` with `output: "standalone"` + `outputFileTracingRoot` = repo root, yielding standalone server at `apps/admin/.next/standalone/apps/admin/server.js` with hoisted `node_modules` at the standalone root (consumed by Task 10 Dockerfile and Task 11 compose healthcheck on `127.0.0.1:2052/`).
  - Placeholder dashboard page rendering "Signex Admin" at route `/`.
  - NO per-app `package-lock.json` (root lockfile, Task 2/Task 13, owns the dependency tree).

- [ ] **Step 1: Scaffold the admin app with create-next-app (minimal, no Tailwind)**
  Run the official latest CLI into `apps/admin`. `--no-tailwind` disables Tailwind (on by default), `--no-src-dir` keeps `app/` at the project root, `--disable-git` skips git init (root owns git), `--skip-install` avoids a per-app install (root install happens in Task 13), `--no-agents-md` skips AGENTS.md/CLAUDE.md. The CLI still emits a `package-lock.json` even with `--skip-install` (it writes the lockfile during resolution); it is removed in Step 4.
  ```bash
  cd /home/ealflm/dev/signex && npx --yes create-next-app@latest apps/admin \
    --ts --app --eslint \
    --no-tailwind --no-src-dir \
    --import-alias "@/*" \
    --use-npm --disable-git --skip-install --no-agents-md --yes
  ```
  Run: `cd /home/ealflm/dev/signex && npx --yes create-next-app@latest apps/admin --ts --app --eslint --no-tailwind --no-src-dir --import-alias "@/*" --use-npm --disable-git --skip-install --no-agents-md --yes`
  Expected: CLI prints `Creating a new Next.js app in /home/ealflm/dev/signex/apps/admin.` and finishes with `Success! Created admin at /home/ealflm/dev/signex/apps/admin`. No `tailwind.config.*` or `postcss.config.*` files created.

- [ ] **Step 2: Verify the generated file set**
  Confirm the expected App-Router skeleton exists and no Tailwind/src-dir artifacts were produced.
  Run: `ls -A /home/ealflm/dev/signex/apps/admin && echo "---app---" && ls -A /home/ealflm/dev/signex/apps/admin/app`
  Expected: top level lists `app`, `public`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `next-env.d.ts`, `package.json`, `.gitignore`, and `package-lock.json` (to be removed in Step 4). It must NOT contain `tailwind.config.ts`, `postcss.config.mjs`, or `src`. The `app/` dir lists `layout.tsx`, `page.tsx`, `globals.css`, `favicon.ico`, and `page.module.css`.

- [ ] **Step 3: Read the generated package.json to capture exact dependency versions**
  The CLI pins exact `next`/`react`/`react-dom` versions; read them so later edits preserve the generated tree.
  Run: `cat /home/ealflm/dev/signex/apps/admin/package.json`
  Expected: a JSON document with `"name": "admin"`, `"private": true`, `"scripts"` containing `"dev": "next dev --turbopack"`, `"build": "next build --turbopack"`, `"start": "next start"`, `"lint": "eslint"`, and `"dependencies"` with `next`, `react`, `react-dom` plus `"devDependencies"` for `typescript`, `@types/*`, `eslint`, `eslint-config-next`, `@eslint/eslintrc`. Note the exact generated values for the next step (the CLI sets the current Next 16.x version, e.g. `16.2.x`).

- [ ] **Step 4: Remove the CLI-generated lockfile (root lockfile owns the tree)**
  Per the contract, every CLI-generated per-app `package-lock.json` must be deleted so the single root lockfile is authoritative.
  Run: `rm -f /home/ealflm/dev/signex/apps/admin/package-lock.json && test ! -e /home/ealflm/dev/signex/apps/admin/package-lock.json && echo "admin lockfile removed"`
  Expected: prints `admin lockfile removed`.

- [ ] **Step 5: Rename the package to `@signex/admin`**
  Read the current package.json (already read in Step 3), then change only the `name` field. The exact generated line is `"name": "admin",`.
  ```
  Edit /home/ealflm/dev/signex/apps/admin/package.json
    old_string:   "name": "admin",
    new_string:   "name": "@signex/admin",
  ```
  Run: `grep '"name"' /home/ealflm/dev/signex/apps/admin/package.json`
  Expected: output is `  "name": "@signex/admin",`

- [ ] **Step 6: Point `dev` and `start` scripts at port 2052**
  The generated scripts are `"dev": "next dev --turbopack"` and `"start": "next start"`. Add `-p 2052` to both so the admin app runs on its assigned port (web is 2051; admin is 2052). Keep `--turbopack` on `dev` exactly as generated. Edit each line individually so the change is unambiguous.
  ```
  Edit /home/ealflm/dev/signex/apps/admin/package.json
    old_string:     "dev": "next dev --turbopack",
    new_string:     "dev": "next dev --turbopack -p 2052",
  ```
  ```
  Edit /home/ealflm/dev/signex/apps/admin/package.json
    old_string:     "start": "next start",
    new_string:     "start": "next start -p 2052",
  ```
  Run: `grep -E '"(dev|start)":' /home/ealflm/dev/signex/apps/admin/package.json`
  Expected:
  ```
      "dev": "next dev --turbopack -p 2052",
      "start": "next start -p 2052",
  ```

- [ ] **Step 7: Configure `next.config.ts` for standalone + monorepo file tracing**
  Overwrite the generated `next.config.ts` (which is `import type { NextConfig } from "next"; const nextConfig: NextConfig = {}; export default nextConfig;`) with one that emits a standalone server and sets the file-tracing root to the repo root. `apps/admin` is two levels below the root, so `path.join(__dirname, "../../")` resolves to `/home/ealflm/dev/signex`. `outputFileTracingRoot` is a top-level config key in Next 16 (not under `experimental`).
  ```ts
  import type { NextConfig } from "next";
  import path from "node:path";

  const nextConfig: NextConfig = {
    // Emit a self-contained production server at .next/standalone for a small Docker image.
    output: "standalone",
    // Trace files from the monorepo root so hoisted workspace node_modules are included.
    // apps/admin -> repo root is two levels up.
    outputFileTracingRoot: path.join(__dirname, "../../"),
  };

  export default nextConfig;
  ```
  Run: `cat /home/ealflm/dev/signex/apps/admin/next.config.ts`
  Expected: file content matches the block above exactly (contains `output: "standalone"` and `outputFileTracingRoot: path.join(__dirname, "../../")`).

- [ ] **Step 8: Replace the boilerplate home page with the "Signex Admin" placeholder dashboard**
  Overwrite the generated `app/page.tsx` (the create-next-app starter splash) with a minimal server-component placeholder dashboard. No auth, no API calls, no CRUD — skeleton only. It imports no CSS modules (so `app/page.module.css` becomes unused but is harmless and left in place).
  ```tsx
  export default function AdminDashboardPage() {
    return (
      <main
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          minHeight: "100vh",
          padding: "3rem",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <h1 style={{ fontSize: "2rem", fontWeight: 600 }}>Signex Admin</h1>
        <p style={{ color: "#555" }}>Admin dashboard placeholder.</p>
      </main>
    );
  }
  ```
  Write to: `/home/ealflm/dev/signex/apps/admin/app/page.tsx`
  Run: `cat /home/ealflm/dev/signex/apps/admin/app/page.tsx`
  Expected: file content matches the block above (a single default-exported `AdminDashboardPage` rendering an `<h1>Signex Admin</h1>`).

- [ ] **Step 9: Set the document title metadata to "Signex Admin"**
  The generated `app/layout.tsx` declares `export const metadata: Metadata = { title: "Create Next App", description: "Generated by create Next App", };`. Read the file first, then update both metadata fields. Leave the rest of the layout (the `<html>`/`<body>` shell, font setup, and `import "./globals.css"`) untouched.
  ```
  Edit /home/ealflm/dev/signex/apps/admin/app/layout.tsx
    old_string: export const metadata: Metadata = {
      title: "Create Next App",
      description: "Generated by create Next App",
    };
    new_string: export const metadata: Metadata = {
      title: "Signex Admin",
      description: "Signex admin panel",
    };
  ```
  Run: `grep -A2 'export const metadata' /home/ealflm/dev/signex/apps/admin/app/layout.tsx`
  Expected:
  ```
  export const metadata: Metadata = {
    title: "Signex Admin",
    description: "Signex admin panel",
  };
  ```

- [ ] **Step 10: Install dependencies at the repo root so the workspace resolves**
  Because Step 1 used `--skip-install` and Step 4 removed the per-app lockfile, install from the root once so `@signex/admin`'s deps are present for the dev/build verification below. This writes/updates the single root `package-lock.json`.
  Run: `cd /home/ealflm/dev/signex && npm install`
  Expected: npm completes with `added N packages` (or `up to date`) and exits 0. A single `/home/ealflm/dev/signex/package-lock.json` exists; `ls /home/ealflm/dev/signex/apps/admin/package-lock.json` reports `No such file or directory`.

- [ ] **Step 11: Verify `next dev` starts on port 2052**
  Start the admin dev server in the background, poll the root URL until it responds, assert the page renders "Signex Admin", then stop the server. This proves the port and the placeholder page.
  ```bash
  cd /home/ealflm/dev/signex/apps/admin && (npm run dev > /tmp/admin-dev.log 2>&1 &) ; \
  for i in $(seq 1 30); do \
    if curl -fs http://127.0.0.1:2052/ > /tmp/admin-dev-body.html 2>/dev/null; then break; fi; \
    sleep 2; \
  done; \
  grep -q "Signex Admin" /tmp/admin-dev-body.html && echo "DEV_OK_2052"; \
  curl -fs -o /dev/null -w "%{http_code}\n" http://127.0.0.1:2052/; \
  pkill -f "next dev" || true; pkill -f "next-server" || true
  ```
  Run: the block above.
  Expected: `/tmp/admin-dev.log` shows Next starting with a `- Local: http://localhost:2052` (or `Network`) line; the script prints `DEV_OK_2052` and a status code `200`. The `pkill` stops the dev server.

- [ ] **Step 12: Verify the production build produces the nested standalone server**
  Build the admin workspace and confirm the standalone output lands at the monorepo-nested path (because `outputFileTracingRoot` = repo root), with hoisted `node_modules` at the standalone root. This is the exact layout Task 10's Dockerfile copies from.
  ```bash
  cd /home/ealflm/dev/signex/apps/admin && npm run build && \
  test -f .next/standalone/apps/admin/server.js && \
  test -d .next/standalone/node_modules && \
  test -d .next/static && \
  echo "STANDALONE_OK"
  ```
  Run: the block above.
  Expected: `next build` completes with a route table listing `/` (and `/_not-found`), prints `○  (Static)` for `/`, reports `Finalizing page optimization`, and the script prints `STANDALONE_OK`. The per-app server entrypoint is `.next/standalone/apps/admin/server.js`; hoisted deps are at `.next/standalone/node_modules`.

- [ ] **Step 13: Confirm no per-app lockfile crept back in and the build artifacts are gitignore-covered**
  The generated `apps/admin/.gitignore` (create-next-app default) already ignores `/node_modules`, `/.next/`, and `next-env.d.ts`, so the `.next` build output from Step 12 will not be committed. Re-confirm the per-app lockfile is still absent (npm install in Step 10 must not have recreated one inside the workspace).
  Run: `test ! -e /home/ealflm/dev/signex/apps/admin/package-lock.json && echo "no per-app lockfile" && grep -E '^/\.next/|^/node_modules' /home/ealflm/dev/signex/apps/admin/.gitignore`
  Expected: prints `no per-app lockfile`, then `/node_modules` (note: create-next-app's `.gitignore` uses `/node_modules` and a `.next` block — the grep matches at least `/node_modules`; the `.next` artifacts are covered by the `# next.js` section's `/.next/` entry).

- [ ] **Final step: Stage `apps/admin` (committed as part of Task 12's first monorepo commit)**
  Git is initialized at the repo root only in Task 12, so there is no root repository to commit into yet. Do NOT run `git init` or `git commit` here. Leave the scaffolded, renamed, reconfigured `apps/admin` on disk; it will be included in the single first monorepo commit created in Task 12. As a sanity check that the working tree is clean of disallowed artifacts before that commit:
  ```bash
  test ! -e /home/ealflm/dev/signex/apps/admin/package-lock.json \
    && test ! -d /home/ealflm/dev/signex/apps/admin/.git \
    && echo "apps/admin ready; will be committed in Task 12"
  ```
  Run: the block above.
  Expected: prints `apps/admin ready; will be committed in Task 12`. (No commit is made in this task; `apps/admin/.git` must not exist because `--disable-git` was passed in Step 1.)

---

I have the exact file inventory. The dotfiles to move are `.dockerignore`, `.git`, `.gitignore`, `.next`. Now I have everything needed to produce Tasks 8 and 9 with exact paths and commands.

### Task 8: Migrate signex-web into apps/web (move + cleanup + rename)

**Files:**
- Move (source tree, deleted after move): `/home/ealflm/dev/signex/signex-web/` → `/home/ealflm/dev/signex/apps/web/`
- Delete (after move): `/home/ealflm/dev/signex/apps/web/.git`, `/home/ealflm/dev/signex/apps/web/docker-compose.yml`, `/home/ealflm/dev/signex/apps/web/package-lock.json`, `/home/ealflm/dev/signex/apps/web/node_modules`, `/home/ealflm/dev/signex/apps/web/.next`, `/home/ealflm/dev/signex/apps/web/tsconfig.tsbuildinfo`
- Modify: `/home/ealflm/dev/signex/apps/web/package.json` (line 2: `name` field only)

**Interfaces:**
- Consumes: the existing `signex-web` git repo with all work already committed (Task 1 — its working tree is clean, last commit `84c6b7e`, backup copy kept outside the monorepo); the monorepo skeleton with `apps/` directory (Task 2); root `package.json` declaring `"workspaces": ["apps/*","packages/*"]` (Task 2).
- Produces: workspace `@signex/web` rooted at `/home/ealflm/dev/signex/apps/web` (package.json `name: "@signex/web"`, all original scripts `dev`/`build`/`start` on port 2051 + `lint` and all deps/devDeps unchanged); the full Next 16 web tree (`app/`, `proxy.ts`, `public/` 59M vendored Webflow assets, `tsconfig.json` with `@/*`→app-local alias, `eslint.config.mjs`, `postcss.config.mjs`, `next.config.ts`, `next-env.d.ts`, `Dockerfile`, `.dockerignore`, `.gitignore`, `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/`) moved in verbatim; `apps/web/next.config.ts` still has only `output: "standalone"` (edited in Task 9); the old standalone `docker-compose.yml`, per-app `package-lock.json`, `node_modules`, `.next`, `.git`, and `tsconfig.tsbuildinfo` removed.

- [ ] **Step 1: Confirm preconditions — clean source repo, backup exists, empty target**
  Verify the source working tree is clean (Task 1 already committed everything), that `apps/web` does not yet exist, and that a backup copy lives outside the monorepo.
  Run:
  ```bash
  git -C /home/ealflm/dev/signex/signex-web status --porcelain && echo "WORKTREE_CLEAN" && \
  ls -d /home/ealflm/dev/signex/apps/web 2>/dev/null && echo "TARGET_EXISTS" || echo "TARGET_ABSENT"
  ```
  Expected: `git status --porcelain` prints nothing, then `WORKTREE_CLEAN`, then `TARGET_ABSENT`. (If `WORKTREE_CLEAN` does not print or any path is listed, STOP — Task 1's commit/backup was not completed.)

- [ ] **Step 2: Remove disposable artifacts from the source BEFORE moving** (avoid moving 59M+ of node_modules/.next)
  Delete the standalone-only and regenerable items in place. These are either git-ignored build artifacts (`.next`, `node_modules`, `tsconfig.tsbuildinfo`) or being replaced by the monorepo (`docker-compose.yml`, `package-lock.json`). They are all preserved in the Task 1 backup outside the monorepo, so deletion is safe.
  ```bash
  rm -rf /home/ealflm/dev/signex/signex-web/node_modules \
         /home/ealflm/dev/signex/signex-web/.next \
         /home/ealflm/dev/signex/signex-web/tsconfig.tsbuildinfo \
         /home/ealflm/dev/signex/signex-web/package-lock.json \
         /home/ealflm/dev/signex/signex-web/docker-compose.yml
  ```
  Run:
  ```bash
  ls -d /home/ealflm/dev/signex/signex-web/node_modules \
        /home/ealflm/dev/signex/signex-web/.next \
        /home/ealflm/dev/signex/signex-web/tsconfig.tsbuildinfo \
        /home/ealflm/dev/signex/signex-web/package-lock.json \
        /home/ealflm/dev/signex/signex-web/docker-compose.yml 2>&1 | sort -u
  ```
  Expected: every line is a "No such file or directory" error (all five paths gone). The git index inside `signex-web` will now show `docker-compose.yml` and `package-lock.json` as deleted, but we never commit in this repo again — the whole `.git` is discarded in Step 4.

- [ ] **Step 3: Move the source tree (incl. remaining dotfiles) into apps/web**
  Create `apps/web` and move every remaining regular file and dotfile. The remaining dotfiles are `.dockerignore`, `.git`, `.gitignore` ( `.next` was already removed in Step 2). Using `find ... -mindepth 1 -maxdepth 1` moves both visible and hidden entries in one pass without the `.`/`..` trap of a glob.
  ```bash
  mkdir -p /home/ealflm/dev/signex/apps/web
  find /home/ealflm/dev/signex/signex-web -mindepth 1 -maxdepth 1 \
    -exec mv -t /home/ealflm/dev/signex/apps/web {} +
  rmdir /home/ealflm/dev/signex/signex-web
  ```
  Run:
  ```bash
  ls -la /home/ealflm/dev/signex/apps/web && \
  ls -d /home/ealflm/dev/signex/signex-web 2>/dev/null && echo "SRC_STILL_EXISTS" || echo "SRC_REMOVED"
  ```
  Expected: `apps/web` lists the moved tree — `AGENTS.md`, `CLAUDE.md`, `Dockerfile`, `README.md`, `app/`, `docs/`, `eslint.config.mjs`, `next-env.d.ts`, `next.config.ts`, `package.json`, `postcss.config.mjs`, `proxy.ts`, `public/`, `tsconfig.json`, plus dotfiles `.dockerignore`, `.git`, `.gitignore` — and the final line is `SRC_REMOVED` (the now-empty `signex-web` directory is gone).

- [ ] **Step 4: Delete the moved-in old git repo (history NOT preserved)**
  The contract mandates dropping web's git history; the monorepo gets a fresh `git init` in Task 12. Remove the carried-over `.git` so `apps/web` is just files under the (future) root repo.
  ```bash
  rm -rf /home/ealflm/dev/signex/apps/web/.git
  ```
  Run:
  ```bash
  ls -d /home/ealflm/dev/signex/apps/web/.git 2>/dev/null && echo "GIT_STILL_EXISTS" || echo "GIT_REMOVED"
  ```
  Expected: `GIT_REMOVED`.

- [ ] **Step 5: Confirm all forbidden artifacts are gone and load-bearing files survived**
  Single check that the five deletions stuck AND that the must-stay-verbatim files are present at `apps/web`.
  Run:
  ```bash
  for p in .git docker-compose.yml package-lock.json node_modules .next tsconfig.tsbuildinfo; do \
    [ -e "/home/ealflm/dev/signex/apps/web/$p" ] && echo "FAIL-present: $p" || echo "ok-absent: $p"; \
  done; \
  for p in next.config.ts proxy.ts tsconfig.json eslint.config.mjs postcss.config.mjs package.json app public public/assets/js; do \
    [ -e "/home/ealflm/dev/signex/apps/web/$p" ] && echo "ok-present: $p" || echo "FAIL-missing: $p"; \
  done
  ```
  Expected: every line for the first loop is `ok-absent: ...` (no `FAIL-present`), and every line for the second loop is `ok-present: ...` (no `FAIL-missing`).

- [ ] **Step 6: Rename the package to @signex/web (only the name field changes)**
  Edit `/home/ealflm/dev/signex/apps/web/package.json` line 2. Change ONLY the `name`; keep `version`, `private`, all `scripts` (`dev`/`build`/`start` on 2051, `lint`), all `dependencies` and `devDependencies` byte-for-byte.
  Apply this exact edit (old → new):
  ```
  -  "name": "signex-web",
  +  "name": "@signex/web",
  ```
  Resulting `/home/ealflm/dev/signex/apps/web/package.json` (full, for reference — only line 2 differs from the original):
  ```json
  {
    "name": "@signex/web",
    "version": "0.1.0",
    "private": true,
    "scripts": {
      "dev": "next dev -p 2051",
      "build": "next build",
      "start": "next start -p 2051",
      "lint": "eslint"
    },
    "dependencies": {
      "next": "16.2.7",
      "react": "19.2.4",
      "react-dom": "19.2.4"
    },
    "devDependencies": {
      "@tailwindcss/postcss": "^4",
      "@types/node": "^20",
      "@types/react": "^19",
      "@types/react-dom": "^19",
      "eslint": "^9",
      "eslint-config-next": "16.2.7",
      "tailwindcss": "^4",
      "typescript": "^5"
    }
  }
  ```
  Run:
  ```bash
  node -e "const p=require('/home/ealflm/dev/signex/apps/web/package.json'); console.log(p.name, '|', JSON.stringify(p.scripts), '|', p.dependencies.next, p.dependencies.react)"
  ```
  Expected (proves rename happened and scripts/deps are untouched):
  ```
  @signex/web | {"dev":"next dev -p 2051","build":"next build","start":"next start -p 2051","lint":"eslint"} | 16.2.7 19.2.4
  ```

- [ ] **Final step: Stage for the first monorepo commit**
  Git is not initialized at the repo root until Task 12, so this task cannot commit here. The moved-and-renamed `apps/web` tree is left in place and will be included in **Task 12's first monorepo commit** (`feat: scaffold signex monorepo`). No `git add`/`git commit` is run in this task. (Note: the per-app config edit in Task 9 must land before that single commit, so `apps/web` is staged once, after Task 9.)
  Run (sanity — confirm there is no repo here yet, so nothing to commit prematurely):
  ```bash
  git -C /home/ealflm/dev/signex rev-parse --is-inside-work-tree 2>/dev/null && echo "REPO_EXISTS_UNEXPECTED" || echo "NO_REPO_YET_OK"
  ```
  Expected: `NO_REPO_YET_OK` (the root is not a git repo until Task 12; `apps/web` will be committed there).

### Task 9: apps/web next.config.ts — add outputFileTracingRoot and verify behavior unchanged

**Files:**
- Modify: `/home/ealflm/dev/signex/apps/web/next.config.ts` (lines 1-10 — add `path` import, add `outputFileTracingRoot`, keep `output: "standalone"`)

**Interfaces:**
- Consumes: `/home/ealflm/dev/signex/apps/web/next.config.ts` containing only `output: "standalone"` (from Task 8); the `@signex/web` workspace integrated under the root npm workspaces install (`/home/ealflm/dev/signex/node_modules` populated by a root `npm install` — Task 5/Task 7 already ran a root `npm install`; if not yet installed, this task runs it). The web app's `proxy.ts` i18n (`DEFAULT_LOCALE = "vi"`, locales `["en","vi"]`, bare-path 307 redirect) and `public/` Webflow assets, all unchanged from Task 8.
- Produces: `/home/ealflm/dev/signex/apps/web/next.config.ts` with `output: "standalone"` AND `outputFileTracingRoot` pointing at the repo root `/home/ealflm/dev/signex`, enabling correct standalone file tracing across the workspace. The build emits the nested standalone server at `/home/ealflm/dev/signex/apps/web/.next/standalone/apps/web/server.js` with hoisted `node_modules` at the standalone root — the exact layout Task 10's web Dockerfile COPY paths depend on. Behavior of the running app is unchanged (`/` → 307 → `/vi`, `/en` → 200, Webflow animations boot).

- [ ] **Step 1: Edit next.config.ts — add `outputFileTracingRoot`, keep `output: "standalone"`**
  Replace the entire file `/home/ealflm/dev/signex/apps/web/next.config.ts` with the version below. `outputFileTracingRoot` is a **top-level** config key in Next 16 (not under `experimental`). It is set to the repo root, two levels up from `apps/web`, using `path.join(__dirname, "../../")` — Next loads `next.config.ts` via jiti in a CommonJS context where `__dirname` is defined and reliable. Use the SAME idiom as `apps/admin/next.config.ts` (Task 7); do NOT mix `__dirname` and `import.meta.dirname` across the two apps.
  Full new file content:
  ```ts
  import type { NextConfig } from "next";
  import path from "node:path";

  const nextConfig: NextConfig = {
    // Emit a self-contained production server at .next/standalone (server.js + only the traced
    // node_modules) for a small Docker image. Static assets (.next/static) and public/ are NOT
    // included by standalone — the Dockerfile copies them in. No effect on `next dev`.
    output: "standalone",
    // Monorepo: trace files from the repo root so the standalone bundle spans the whole workspace
    // (hoisted root node_modules + this app). With this set, the standalone server is emitted at
    // .next/standalone/apps/web/server.js with node_modules hoisted to the standalone root.
    outputFileTracingRoot: path.join(__dirname, "../../"),
  };

  export default nextConfig;
  ```
  Run (verify the edit landed — both load-bearing keys present, `__dirname` idiom matching admin):
  ```bash
  grep -q 'output: "standalone"' /home/ealflm/dev/signex/apps/web/next.config.ts && \
  grep -q 'outputFileTracingRoot: path.join(__dirname, "../../")' /home/ealflm/dev/signex/apps/web/next.config.ts && \
  echo "WEB_CONFIG_OK"
  ```
  Expected: prints `WEB_CONFIG_OK` (both `output: "standalone"` and the `__dirname`-based `outputFileTracingRoot` are present). The authoritative validation that the tracing root resolves to the repo root is the standalone build in Step 3.

- [ ] **Step 2: Ensure root install + Prisma client present, then typecheck the web config**
  The web app is now a workspace; ensure deps are installed at the root and verify `next.config.ts` is type-valid against `@signex/web`'s own `tsconfig.json` (do NOT modify tsconfig). A root `npm install` may already have run in an earlier task; running it again is idempotent.
  ```bash
  cd /home/ealflm/dev/signex && npm install
  cd /home/ealflm/dev/signex/apps/web && npx tsc --noEmit -p tsconfig.json
  ```
  Run:
  ```bash
  cd /home/ealflm/dev/signex/apps/web && npx tsc --noEmit -p tsconfig.json && echo "TSC_OK"
  ```
  Expected: no type errors printed, final line `TSC_OK`. (`NextConfig` accepts `outputFileTracingRoot: string`; `__dirname` is available because Next loads the TS config under jiti's CommonJS context.)

- [ ] **Step 3: Production build — confirm standalone emits at the nested monorepo path**
  Build only the `@signex/web` workspace from the repo root. This is the authoritative proof that `outputFileTracingRoot` is honored and the Docker-relevant layout is produced.
  ```bash
  cd /home/ealflm/dev/signex && npm run build -w @signex/web
  ```
  Run (after the build, assert the nested standalone server.js and hoisted node_modules exist):
  ```bash
  ls /home/ealflm/dev/signex/apps/web/.next/standalone/apps/web/server.js && \
  ls -d /home/ealflm/dev/signex/apps/web/.next/standalone/node_modules && \
  echo "STANDALONE_NESTED_OK"
  ```
  Expected: both `ls` lines print their paths (the per-app `apps/web/server.js` under `.next/standalone/`, and the hoisted `node_modules` directory at the standalone root), then `STANDALONE_NESTED_OK`. This nested `apps/web/server.js` + root-hoisted `node_modules` is exactly what Task 10's web Dockerfile COPY paths assume. (Contrast: without `outputFileTracingRoot`, `server.js` would sit directly at `.next/standalone/server.js` — its absence at the nested path here would mean the edit did not take effect.)

- [ ] **Step 4: Dev server — verify behavior unchanged (`/` → 307 → `/vi`, `/en` → 200, Webflow JS served)**
  Start the dev server on its configured port 2051 in the background, wait until it answers, then probe the i18n redirect and a Webflow asset. `outputFileTracingRoot` has no effect on `next dev`, so this must behave identically to pre-migration.
  ```bash
  cd /home/ealflm/dev/signex/apps/web && (npm run dev > /tmp/signex-web-dev.log 2>&1 &) ; \
  for i in $(seq 1 60); do curl -s -o /dev/null http://127.0.0.1:2051/en && break; sleep 1; done
  ```
  Run (probe redirect + locale page + a vendored Webflow asset, then stop the dev server):
  ```bash
  echo "bare /:"; curl -s -o /dev/null -D - http://127.0.0.1:2051/ | grep -iE '^(HTTP/|location:)'; \
  echo "/en:";   curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:2051/en; \
  echo "/vi:";   curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:2051/vi; \
  echo "webflow js:"; curl -s -o /dev/null -w "%{http_code}\n" "$(ls /home/ealflm/dev/signex/apps/web/public/assets/js/*.js | head -1 | sed 's#.*/public#http://127.0.0.1:2051#')"; \
  pkill -f "next dev -p 2051" || pkill -f "next-server"
  ```
  Expected:
  - Under `bare /:` an `HTTP/1.1 307 Temporary Redirect` line and a `location: /vi` line (default locale is `vi`; if the `NEXT_LOCALE` cookie were `en` it would be `/vi` still on a cookieless curl — cookieless requests redirect to `DEFAULT_LOCALE="vi"`).
  - Under `/en:` → `200`.
  - Under `/vi:` → `200`.
  - Under `webflow js:` → `200` (a vendored Webflow script under `public/assets/js/` is served, confirming assets moved verbatim and animations can boot).
  - The final `pkill` stops the background dev server (no output or a process-killed line).

- [ ] **Final step: Stage for the first monorepo commit**
  As in Task 8, the repo root is not a git repo until Task 12, so no commit happens here. The `outputFileTracingRoot` edit completes `apps/web`'s migration; the full `apps/web` tree (Task 8 move + this config edit) is staged once and included in **Task 12's first monorepo commit** (`feat: scaffold signex monorepo`). Before that commit, the throwaway build/dev artifacts produced for verification (`.next`, the dev log) must not be committed — they are covered by the root `.gitignore` (Task 2/Task 12). Clean the verification artifact:
  ```bash
  rm -rf /home/ealflm/dev/signex/apps/web/.next /tmp/signex-web-dev.log
  ```
  Run (confirm artifacts cleaned and config edit is intact):
  ```bash
  ls -d /home/ealflm/dev/signex/apps/web/.next 2>/dev/null && echo "NEXT_STILL_PRESENT" || echo "NEXT_CLEANED"; \
  grep -c "outputFileTracingRoot" /home/ealflm/dev/signex/apps/web/next.config.ts
  ```
  Expected: `NEXT_CLEANED`, then `1` (the `outputFileTracingRoot` line is present in `next.config.ts`). The cleaned, edited `apps/web` is committed as part of Task 12's first monorepo commit.

---

The apps/ and packages/ dirs don't exist yet (they get created by earlier tasks). I have everything I need from the research and spec. Here are Tasks 10 and 11.

### Task 10: Dockerfiles for api, web (adapt), admin + .dockerignore

**Files:**
- Create: `/home/ealflm/dev/signex/apps/api/Dockerfile`
- Create: `/home/ealflm/dev/signex/apps/admin/Dockerfile`
- Modify: `/home/ealflm/dev/signex/apps/web/Dockerfile` (full rewrite — the file moved in from `signex-web` in Task 8; adapt context + standalone copy paths for the monorepo)
- Create: `/home/ealflm/dev/signex/.dockerignore`

**Interfaces:**
- Consumes:
  - Root workspace `package.json` + single root `package-lock.json` (Task 2), workspaces `["apps/*","packages/*"]`.
  - `packages/db/package.json` + `packages/db/prisma/schema.prisma` (generator `output = "../generated/client"`, `binaryTargets = ["native","linux-musl-openssl-3.0.x"]`) + scripts `generate`/`migrate:deploy` (Task 4).
  - `packages/shared/package.json` (Task 3).
  - `apps/api/package.json` (`@signex/api`, scripts `build`=`nest build`, `start:prod`=`node dist/main`) + `apps/api/src` producing `apps/api/dist/main.js` (Tasks 5–6).
  - `apps/web/package.json` (`@signex/web`) + `apps/web/next.config.ts` (`output:"standalone"` + `outputFileTracingRoot` repo root) producing `apps/web/.next/standalone/apps/web/server.js` (Tasks 8–9). Port 2051.
  - `apps/admin/package.json` (`@signex/admin`) + `apps/admin/next.config.ts` (`output:"standalone"` + `outputFileTracingRoot` repo root) producing `apps/admin/.next/standalone/apps/admin/server.js` (Task 7). Port 2052.
- Produces:
  - `apps/api/Dockerfile` — runtime command `npx prisma migrate deploy --schema packages/db/prisma/schema.prisma && node apps/api/dist/main`, EXPOSE 4000, HEALTHCHECK `wget` against `http://127.0.0.1:4000/api/health`.
  - `apps/web/Dockerfile` — runtime command `node apps/web/server.js`, EXPOSE 2051, HEALTHCHECK `wget` against `http://127.0.0.1:2051/en`.
  - `apps/admin/Dockerfile` — runtime command `node apps/admin/server.js`, EXPOSE 2052, HEALTHCHECK `wget` against `http://127.0.0.1:2052/`.
  - `/home/ealflm/dev/signex/.dockerignore` — keeps the build context small for all three root-context builds.
  - All three consumed by Task 11's `docker-compose.yml` via `build.context: .` + `dockerfile: apps/<name>/Dockerfile`.

- [ ] **Step 1: Write the root `.dockerignore`**
  The build context for all three apps is the repo root, so a single root `.dockerignore` governs every build. Exclude `node_modules`, build outputs, the Prisma generated client (must be regenerated inside the Linux build stage — never copy a host-built engine), git, env files, and the 59M of web build artifacts. The old per-app `apps/web/.dockerignore` (moved in from `signex-web`) is now harmless but redundant; this root one is authoritative because the context root moved. Write `/home/ealflm/dev/signex/.dockerignore`:
  ```gitignore
  # ---- VCS / docs / tooling ----
  .git
  .gitignore
  .turbo
  **/.turbo
  docs
  README.md
  **/README.md

  # ---- dependencies (always reinstalled inside the image from the root lockfile) ----
  node_modules
  **/node_modules

  # ---- Next.js build artifacts (regenerated in the builder stage) ----
  **/.next
  **/out
  **/build

  # ---- NestJS build artifacts (regenerated in the builder stage) ----
  apps/api/dist

  # ---- Prisma generated client + engine (MUST be generated inside the Linux build stage) ----
  packages/db/generated

  # ---- TS / Next incremental ----
  **/*.tsbuildinfo
  **/next-env.d.ts

  # ---- env (never bake secrets into the image; Compose injects env at runtime) ----
  .env
  .env.*
  !.env.example
  **/.env
  **/.env.*

  # ---- editor / OS noise ----
  .vscode
  .idea
  **/.DS_Store

  # ---- docker meta (don't recurse the compose/dockerfiles into the context build) ----
  docker-compose.yml
  **/Dockerfile
  .dockerignore
  ```
  Run: `grep -Eq '^node_modules$' /home/ealflm/dev/signex/.dockerignore && grep -Eq '^packages/db/generated$' /home/ealflm/dev/signex/.dockerignore && grep -Eq '^\.env$' /home/ealflm/dev/signex/.dockerignore && grep -Eq '^!\.env\.example$' /home/ealflm/dev/signex/.dockerignore && echo DOCKERIGNORE_OK`
  Expected: prints `DOCKERIGNORE_OK` (the key rules are present: `node_modules`, the Prisma `generated` dir, `.env` ignored, `.env.example` un-ignored). The exact line count is not asserted (comments/spacing may vary).

- [ ] **Step 2: Write `apps/api/Dockerfile` (NestJS + Prisma, multi-stage)**
  Context = repo root. `deps` installs the whole workspace from the root lockfile; `build` runs `prisma generate` (emitting `packages/db/generated/client` + the `linux-musl-openssl-3.0.x` engine), compiles the workspace libraries `@signex/db`/`@signex/shared` to their `dist/` (so they are runnable JS, not raw `.ts`), then `nest build`; `runtime` carries the api `dist`, the compiled libs' `dist`, prod `node_modules`, the generated Prisma client, the schema+migrations, and on start runs `prisma migrate deploy` then `node apps/api/dist/main`. `openssl` is installed in every Prisma-touching stage. The `prisma` CLI stays available at runtime because the runtime stage copies the **full, un-pruned** `node_modules` from the build stage (no `npm prune` / `--omit=dev`), so both `@prisma/client` (prod) and the `prisma` CLI (devDep) are present for `prisma migrate deploy`. The healthcheck uses Alpine BusyBox `wget` against `127.0.0.1` (NOT `localhost`). Write `/home/ealflm/dev/signex/apps/api/Dockerfile`:
  ```dockerfile
  # syntax=docker/dockerfile:1
  # Build context = repo root (see docker-compose.yml: build.context: .).

  # ---------- deps: install ALL workspaces from the single root lockfile ----------
  FROM node:20-alpine AS deps
  WORKDIR /app
  # Prisma's musl query engine links against OpenSSL 3.0 on Alpine.
  RUN apk add --no-cache openssl
  # Copy only manifests + lockfile first for a cached, deterministic install.
  COPY package.json package-lock.json ./
  COPY apps/api/package.json ./apps/api/package.json
  COPY apps/web/package.json ./apps/web/package.json
  COPY apps/admin/package.json ./apps/admin/package.json
  COPY packages/db/package.json ./packages/db/package.json
  COPY packages/shared/package.json ./packages/shared/package.json
  RUN npm ci

  # ---------- build: prisma generate -> nest build -> dist/ ----------
  FROM node:20-alpine AS build
  WORKDIR /app
  RUN apk add --no-cache openssl
  ENV NEXT_TELEMETRY_DISABLED=1
  COPY --from=deps /app/node_modules ./node_modules
  COPY . .
  # Generate the Prisma client + the linux-musl-openssl-3.0.x engine into packages/db/generated/client.
  RUN npm run generate --workspace @signex/db
  # Compile the workspace libraries to dist/ (nest build = plain tsc, does NOT bundle workspace
  # deps — the api require()s @signex/db / @signex/shared as compiled JS at runtime).
  RUN npm run build --workspace @signex/db --workspace @signex/shared
  # Compile the NestJS app -> apps/api/dist (tsc/nest build).
  RUN npm run build --workspace @signex/api

  # ---------- runtime: dist + prod deps + generated Prisma client + engine ----------
  FROM node:20-alpine AS runtime
  WORKDIR /app
  ENV NODE_ENV=production
  ENV API_PORT=4000
  # OpenSSL for the Prisma query engine at runtime.
  RUN apk add --no-cache openssl
  RUN addgroup --system --gid 1001 nodejs \
   && adduser  --system --uid 1001 nestjs
  # Full (un-pruned) node_modules: keeps @prisma/client (prod) AND the prisma CLI
  # (devDep) so `prisma migrate deploy` works at container start.
  COPY --from=build --chown=nestjs:nodejs /app/node_modules ./node_modules
  # Root + workspace manifests so npm workspace resolution still works at runtime.
  COPY --from=build --chown=nestjs:nodejs /app/package.json ./package.json
  COPY --from=build --chown=nestjs:nodejs /app/apps/api/package.json ./apps/api/package.json
  COPY --from=build --chown=nestjs:nodejs /app/packages/db/package.json ./packages/db/package.json
  COPY --from=build --chown=nestjs:nodejs /app/packages/shared/package.json ./packages/shared/package.json
  # Compiled NestJS output.
  COPY --from=build --chown=nestjs:nodejs /app/apps/api/dist ./apps/api/dist
  # Compiled workspace libraries (the api require()s these at runtime via the node_modules
  # symlinks; raw .ts source is NOT runnable by node — that is why packages/*/dist is copied here).
  COPY --from=build --chown=nestjs:nodejs /app/packages/db/dist ./packages/db/dist
  COPY --from=build --chown=nestjs:nodejs /app/packages/shared/dist ./packages/shared/dist
  # Generated Prisma client + libquery_engine-linux-musl-openssl-3.0.x.so.node (load-bearing).
  COPY --from=build --chown=nestjs:nodejs /app/packages/db/generated ./packages/db/generated
  # Schema + migrations, needed by `prisma migrate deploy` at start.
  COPY --from=build --chown=nestjs:nodejs /app/packages/db/prisma ./packages/db/prisma
  USER nestjs
  EXPOSE 4000
  HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=20s \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:4000/api/health || exit 1
  # Apply pending migrations against the prod DB, then start the compiled app.
  CMD ["sh", "-c", "npx prisma migrate deploy --schema packages/db/prisma/schema.prisma && node apps/api/dist/main"]
  ```
  Run: `grep -n 'CMD\|HEALTHCHECK\|EXPOSE' /home/ealflm/dev/signex/apps/api/Dockerfile`
  Expected: shows `EXPOSE 4000`, a `HEALTHCHECK` line hitting `http://127.0.0.1:4000/api/health`, and a `CMD` running `npx prisma migrate deploy ... && node apps/api/dist/main`.

- [ ] **Step 3: Overwrite `apps/web/Dockerfile` (adapt the moved-in file for the monorepo standalone layout)**
  The file that moved in from `signex-web` (Task 8) installed from an app-local lockfile and copied `.next/standalone` → `./` with `CMD ["node","server.js"]`. In the monorepo, the build context is the repo root, deps install from the **root** lockfile, and because `outputFileTracingRoot` points at the repo root the real per-app server lives at `apps/web/.next/standalone/apps/web/server.js` with hoisted `node_modules` at the standalone root. Rewrite the three runner COPYs (standalone → `./`, static → `apps/web/.next/static`, public → `apps/web/public`) and the `CMD` to `node apps/web/server.js`. Healthcheck via BusyBox `wget` on `127.0.0.1:2051/en` (default locale is `vi`; `/en` serves 200 directly). Write `/home/ealflm/dev/signex/apps/web/Dockerfile` (full replacement):
  ```dockerfile
  # syntax=docker/dockerfile:1
  # Build context = repo root (see docker-compose.yml: build.context: .).
  # signex-web moved into apps/web; with output:"standalone" + outputFileTracingRoot=repo root,
  # the per-app server lands at apps/web/.next/standalone/apps/web/server.js and node_modules
  # are hoisted to the standalone root.

  # ---------- deps: install ALL workspaces from the single root lockfile ----------
  FROM node:20-alpine AS deps
  RUN apk add --no-cache libc6-compat
  WORKDIR /app
  COPY package.json package-lock.json ./
  COPY apps/web/package.json ./apps/web/package.json
  COPY apps/admin/package.json ./apps/admin/package.json
  COPY apps/api/package.json ./apps/api/package.json
  COPY packages/db/package.json ./packages/db/package.json
  COPY packages/shared/package.json ./packages/shared/package.json
  RUN npm ci

  # ---------- builder: build only the web workspace ----------
  FROM node:20-alpine AS builder
  WORKDIR /app
  COPY --from=deps /app/node_modules ./node_modules
  COPY . .
  ENV NEXT_TELEMETRY_DISABLED=1
  RUN npm run build --workspace @signex/web

  # ---------- runner: Next standalone server (monorepo-nested layout) ----------
  FROM node:20-alpine AS runner
  WORKDIR /app
  ENV NODE_ENV=production
  ENV NEXT_TELEMETRY_DISABLED=1
  ENV PORT=2051
  ENV HOSTNAME=0.0.0.0
  RUN addgroup --system --gid 1001 nodejs \
   && adduser  --system --uid 1001 nextjs
  # 1) standalone root -> "./": brings the launcher + hoisted node_modules + apps/web/.
  COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
  # 2) static assets -> mirrored nested app path.
  COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
  # 3) vendored Webflow public/ assets -> mirrored nested app path.
  COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
  USER nextjs
  EXPOSE 2051
  HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=20s \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:2051/en || exit 1
  # Run the PER-APP server.js (not the standalone-root launcher).
  CMD ["node", "apps/web/server.js"]
  ```
  Run: `grep -n 'CMD\|HEALTHCHECK\|EXPOSE\|standalone' /home/ealflm/dev/signex/apps/web/Dockerfile`
  Expected: shows `EXPOSE 2051`, a `HEALTHCHECK` hitting `http://127.0.0.1:2051/en`, the standalone COPY into `./`, and `CMD ["node", "apps/web/server.js"]`.

- [ ] **Step 4: Write `apps/admin/Dockerfile` (same Next-standalone pattern, port 2052)**
  Identical pattern to web, building the `@signex/admin` workspace; nested standalone server at `apps/admin/.next/standalone/apps/admin/server.js`. Healthcheck hits the admin root path `/` (the placeholder dashboard, served 200 directly — no i18n redirect). Write `/home/ealflm/dev/signex/apps/admin/Dockerfile`:
  ```dockerfile
  # syntax=docker/dockerfile:1
  # Build context = repo root (see docker-compose.yml: build.context: .).
  # admin uses output:"standalone" + outputFileTracingRoot=repo root, so the per-app server
  # lands at apps/admin/.next/standalone/apps/admin/server.js with hoisted node_modules.

  # ---------- deps: install ALL workspaces from the single root lockfile ----------
  FROM node:20-alpine AS deps
  RUN apk add --no-cache libc6-compat
  WORKDIR /app
  COPY package.json package-lock.json ./
  COPY apps/web/package.json ./apps/web/package.json
  COPY apps/admin/package.json ./apps/admin/package.json
  COPY apps/api/package.json ./apps/api/package.json
  COPY packages/db/package.json ./packages/db/package.json
  COPY packages/shared/package.json ./packages/shared/package.json
  RUN npm ci

  # ---------- builder: build only the admin workspace ----------
  FROM node:20-alpine AS builder
  WORKDIR /app
  COPY --from=deps /app/node_modules ./node_modules
  COPY . .
  ENV NEXT_TELEMETRY_DISABLED=1
  RUN npm run build --workspace @signex/admin

  # ---------- runner: Next standalone server (monorepo-nested layout) ----------
  FROM node:20-alpine AS runner
  WORKDIR /app
  ENV NODE_ENV=production
  ENV NEXT_TELEMETRY_DISABLED=1
  ENV PORT=2052
  ENV HOSTNAME=0.0.0.0
  RUN addgroup --system --gid 1001 nodejs \
   && adduser  --system --uid 1001 nextjs
  # 1) standalone root -> "./": launcher + hoisted node_modules + apps/admin/.
  COPY --from=builder --chown=nextjs:nodejs /app/apps/admin/.next/standalone ./
  # 2) static assets -> mirrored nested app path.
  COPY --from=builder --chown=nextjs:nodejs /app/apps/admin/.next/static ./apps/admin/.next/static
  # 3) public assets -> mirrored nested app path.
  COPY --from=builder --chown=nextjs:nodejs /app/apps/admin/public ./apps/admin/public
  USER nextjs
  EXPOSE 2052
  HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=20s \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:2052/ || exit 1
  # Run the PER-APP server.js (not the standalone-root launcher).
  CMD ["node", "apps/admin/server.js"]
  ```
  Run: `grep -n 'CMD\|HEALTHCHECK\|EXPOSE\|standalone' /home/ealflm/dev/signex/apps/admin/Dockerfile`
  Expected: shows `EXPOSE 2052`, a `HEALTHCHECK` hitting `http://127.0.0.1:2052/`, the standalone COPY into `./`, and `CMD ["node", "apps/admin/server.js"]`.

- [ ] **Step 5: Lint all four files (no domain build yet — just structural sanity)**
  Confirm each Dockerfile parses and the `.dockerignore` excludes the heavy/forbidden paths. (Hadolint is not assumed installed; use grep-based structural checks.)
  Run:
  ```bash
  for f in apps/api/Dockerfile apps/web/Dockerfile apps/admin/Dockerfile; do \
    echo "== $f =="; \
    grep -c '^FROM ' /home/ealflm/dev/signex/$f; \
  done; \
  grep -Eq '^packages/db/generated$' /home/ealflm/dev/signex/.dockerignore && echo "dockerignore: generated OK"; \
  grep -Eq '^node_modules$' /home/ealflm/dev/signex/.dockerignore && echo "dockerignore: node_modules OK"
  ```
  Expected: api prints `3` FROM stages, web prints `3`, admin prints `3`, then `dockerignore: generated OK` and `dockerignore: node_modules OK`.

- [ ] **Final step: Commit**
  Git is initialized at the repo root only in Task 12, so this task cannot commit at the root. Stage the four files; they are included in Task 12's first monorepo commit.
  ```bash
  git -C /home/ealflm/dev/signex add apps/api/Dockerfile apps/web/Dockerfile apps/admin/Dockerfile .dockerignore 2>/dev/null || true
  ```
  Note: staging is a no-op until `git init` runs in Task 12; these files are committed as part of Task 12's first monorepo commit. No standalone commit here.

### Task 11: Root docker-compose.yml (postgres, api, web, admin)

**Files:**
- Create: `/home/ealflm/dev/signex/docker-compose.yml`

**Interfaces:**
- Consumes:
  - Root `.env.example` / `.env` (Task 2): `POSTGRES_USER=signex`, `POSTGRES_PASSWORD=signex`, `POSTGRES_DB=signex`, `DATABASE_URL=postgresql://signex:signex@localhost:5432/signex?schema=public` (host rewritten to `postgres` here), `API_PORT=4000`, `WEB_PORT=2051`, `ADMIN_PORT=2052`, `API_URL=http://api:4000`, `NEXT_PUBLIC_API_URL=http://localhost:4000`.
  - `apps/api/Dockerfile`, `apps/web/Dockerfile`, `apps/admin/Dockerfile` and root `.dockerignore` (Task 10).
  - In-container ports: api 4000, web 2051, admin 2052; each Dockerfile already defines its own `HEALTHCHECK` (Task 10), so Compose-level healthchecks here are explicit and authoritative for `depends_on` ordering.
- Produces:
  - `/home/ealflm/dev/signex/docker-compose.yml` — services `postgres`, `api`, `web`, `admin`; network `signex-net`; named volume `pgdata`. Consumed by Task 13 (full-stack `docker compose up -d --build` verification).

- [ ] **Step 1: Write `docker-compose.yml`**
  All three app services build with `context: .` (repo root) and `dockerfile: apps/<name>/Dockerfile`. Postgres uses a named `pgdata` volume + `pg_isready` healthcheck. `api` waits for `postgres` `service_healthy` and overrides `DATABASE_URL` so the host is `postgres` (the Compose service DNS name) instead of `localhost`. Compose-level healthchecks use BusyBox `wget` against `127.0.0.1` (Alpine resolves `localhost` to IPv6 `::1` first, but the servers bind IPv4 `0.0.0.0`). Host ports are overridable via `${WEB_PORT}` / `${ADMIN_PORT}` / `${API_PORT}` with the contract defaults as fallbacks. Write `/home/ealflm/dev/signex/docker-compose.yml`:
  ```yaml
  # Signex monorepo — multi-container stack.
  # Run: docker compose up -d --build
  # Env comes from the root .env (see .env.example). Host ports overridable via *_PORT vars.

  services:
    postgres:
      image: postgres:16-alpine
      container_name: signex-postgres
      restart: unless-stopped
      environment:
        POSTGRES_USER: ${POSTGRES_USER:-signex}
        POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-signex}
        POSTGRES_DB: ${POSTGRES_DB:-signex}
      ports:
        - "5432:5432"
      volumes:
        - pgdata:/var/lib/postgresql/data
      healthcheck:
        test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-signex} -d ${POSTGRES_DB:-signex}"]
        interval: 10s
        timeout: 5s
        retries: 5
        start_period: 10s
      networks:
        - signex-net

    api:
      build:
        context: .
        dockerfile: apps/api/Dockerfile
      image: signex-api:latest
      container_name: signex-api
      restart: unless-stopped
      depends_on:
        postgres:
          condition: service_healthy
      environment:
        NODE_ENV: production
        API_PORT: ${API_PORT:-4000}
        # Inside the Compose network the DB host is the service name "postgres", not localhost.
        DATABASE_URL: postgresql://${POSTGRES_USER:-signex}:${POSTGRES_PASSWORD:-signex}@postgres:5432/${POSTGRES_DB:-signex}?schema=public
      ports:
        - "${API_PORT:-4000}:4000"
      healthcheck:
        test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://127.0.0.1:4000/api/health"]
        interval: 30s
        timeout: 5s
        retries: 3
        start_period: 40s
      networks:
        - signex-net

    web:
      build:
        context: .
        dockerfile: apps/web/Dockerfile
      image: signex-web:latest
      container_name: signex-web
      restart: unless-stopped
      depends_on:
        api:
          condition: service_healthy
      environment:
        NODE_ENV: production
        PORT: 2051
        HOSTNAME: 0.0.0.0
        NEXT_TELEMETRY_DISABLED: "1"
        # Server-side calls use the Compose service DNS; client-side uses the public placeholder.
        API_URL: ${API_URL:-http://api:4000}
        NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL:-http://localhost:4000}
      ports:
        - "${WEB_PORT:-2051}:2051"
      healthcheck:
        test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://127.0.0.1:2051/en"]
        interval: 30s
        timeout: 5s
        retries: 3
        start_period: 20s
      networks:
        - signex-net

    admin:
      build:
        context: .
        dockerfile: apps/admin/Dockerfile
      image: signex-admin:latest
      container_name: signex-admin
      restart: unless-stopped
      depends_on:
        api:
          condition: service_healthy
      environment:
        NODE_ENV: production
        PORT: 2052
        HOSTNAME: 0.0.0.0
        NEXT_TELEMETRY_DISABLED: "1"
        API_URL: ${API_URL:-http://api:4000}
        NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL:-http://localhost:4000}
      ports:
        - "${ADMIN_PORT:-2052}:2052"
      healthcheck:
        test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://127.0.0.1:2052/"]
        interval: 30s
        timeout: 5s
        retries: 3
        start_period: 20s
      networks:
        - signex-net

  volumes:
    pgdata:

  networks:
    signex-net:
      driver: bridge
  ```
  Run: `test -s /home/ealflm/dev/signex/docker-compose.yml && grep -cE '^  (postgres|api|web|admin):' /home/ealflm/dev/signex/docker-compose.yml`
  Expected: prints `4` (the file is non-empty and declares all four services: postgres, api, web, admin). The exact line count is not asserted; `docker compose config` in Step 2 is the authoritative validation.

- [ ] **Step 2: Validate the Compose file syntax + interpolation**
  `docker compose config` parses the YAML, validates the schema, and resolves `${VAR}` interpolation. Provide the contract env inline so interpolation succeeds even before `.env` is finalized (Task 2 commits the real `.env.example`; `docker compose` reads `.env` automatically when present).
  Run:
  ```bash
  POSTGRES_USER=signex POSTGRES_PASSWORD=signex POSTGRES_DB=signex \
  API_PORT=4000 WEB_PORT=2051 ADMIN_PORT=2052 \
  API_URL=http://api:4000 NEXT_PUBLIC_API_URL=http://localhost:4000 \
  docker compose -f /home/ealflm/dev/signex/docker-compose.yml config --quiet \
    && echo "compose config: VALID"
  ```
  Expected: no schema/interpolation errors and a final line `compose config: VALID`.

- [ ] **Step 3: Confirm key wiring resolved correctly**
  Render the resolved config and assert the load-bearing values: `api`'s `DATABASE_URL` host is `postgres` (not `localhost`), `api` depends on `postgres` healthy, the three host-port mappings, and the named volume + network.
  Run:
  ```bash
  POSTGRES_USER=signex POSTGRES_PASSWORD=signex POSTGRES_DB=signex \
  API_PORT=4000 WEB_PORT=2051 ADMIN_PORT=2052 \
  API_URL=http://api:4000 NEXT_PUBLIC_API_URL=http://localhost:4000 \
  docker compose -f /home/ealflm/dev/signex/docker-compose.yml config \
    | grep -E 'DATABASE_URL|@postgres:5432|service_healthy|signex-net|pgdata|published|target:'
  ```
  Expected: shows `DATABASE_URL` containing `@postgres:5432/signex?schema=public`, a `condition: service_healthy` under api's `depends_on`, published host ports `4000`/`2051`/`2052` mapping to targets `4000`/`2051`/`2052`, the `pgdata` volume, and the `signex-net` network — confirming the DB host is the service name `postgres`, not `localhost`.

- [ ] **Final step: Commit**
  Git is initialized at the repo root only in Task 12, so this task cannot commit at the root. Stage `docker-compose.yml`; it is included in Task 12's first monorepo commit.
  ```bash
  git -C /home/ealflm/dev/signex add docker-compose.yml 2>/dev/null || true
  ```
  Note: staging is a no-op until `git init` runs in Task 12; `docker-compose.yml` is committed as part of Task 12's first monorepo commit. No standalone commit here.

---

Now I have everything I need. Here are Tasks 12 and 13.

### Task 12: Git init at repo root + first monorepo commit

**Files:**
- Create: `/home/ealflm/dev/signex/.gitignore` (confirm/finalize — created in Task 2, verified here)
- Modify: `/home/ealflm/dev/signex/.git/` (initialized by `git init`)

**Interfaces:**
- Consumes:
  - All scaffold output from Tasks 2-11: `/home/ealflm/dev/signex/package.json`, `/home/ealflm/dev/signex/turbo.json`, `/home/ealflm/dev/signex/.env.example`, `/home/ealflm/dev/signex/README.md`, `/home/ealflm/dev/signex/docker-compose.yml`, `/home/ealflm/dev/signex/.dockerignore`, `/home/ealflm/dev/signex/apps/api`, `/home/ealflm/dev/signex/apps/web`, `/home/ealflm/dev/signex/apps/admin`, `/home/ealflm/dev/signex/packages/db`, `/home/ealflm/dev/signex/packages/shared`, `/home/ealflm/dev/signex/docs/`.
  - The `/home/ealflm/dev/signex/.gitignore` created in Task 2.
  - `apps/web/.git` was already removed in Task 8; `apps/api` and `apps/admin` were scaffolded with `--skip-git`/`--disable-git` so no nested `.git` exists.
- Produces:
  - A git repository at `/home/ealflm/dev/signex` on branch `main` with exactly one commit containing the entire monorepo scaffold (apps, packages, root config, and the spec under `docs/`). This is the FIRST repo-root commit; every Task 2-11 "stage only, commit in Task 12" note resolves here.

- [ ] **Step 1: Confirm no nested `.git` directories survive the scaffold**
  Nested `.git` dirs would turn `apps/web` etc. into git submodules/embedded repos and break the single-repo commit. Verify none exist (web's `.git` was deleted in Task 8; api/admin scaffolded with skip-git).
  Run: `find /home/ealflm/dev/signex -name .git -not -path '*/node_modules/*' -type d`
  Expected: empty output (no lines). If `/home/ealflm/dev/signex/apps/web/.git` is listed, delete it with `rm -rf /home/ealflm/dev/signex/apps/web/.git` and re-run until empty.

- [ ] **Step 2: `git init` at the repo root and set the default branch to `main`**
  Run: `git -C /home/ealflm/dev/signex init -b main`
  Expected: prints `Initialized empty Git repository in /home/ealflm/dev/signex/.git/` (or `Reinitialized` if re-run). Branch is `main`.
  Verify: `git -C /home/ealflm/dev/signex symbolic-ref --short HEAD` prints `main`.

- [ ] **Step 3: Confirm the root `.gitignore` covers every required ignore path**
  Open `/home/ealflm/dev/signex/.gitignore` (created in Task 2) and ensure it contains exactly these entries (matching contract §4.1 / spec §4.1). If any line is missing, add it. The file must contain:
  ```gitignore
  # Dependencies
  node_modules/

  # Build outputs
  .next/
  dist/
  out/
  build/
  *.tsbuildinfo

  # Turborepo
  .turbo/

  # Next.js
  next-env.d.ts
  .vercel/

  # Env files (real values; .env.example IS committed)
  .env
  .env.local
  .env.*.local

  # Prisma generated client (build artifact; regenerate with `prisma generate`)
  packages/db/generated/

  # Logs / misc
  *.log
  .DS_Store
  ```
  Run: `grep -E -c '^(node_modules/|\.next/|dist/|\.turbo/|\.env$|packages/db/generated/)' /home/ealflm/dev/signex/.gitignore`
  Expected: prints `6` (all six required ignore patterns — node_modules, .next, dist, .turbo, .env, generated client — are present).

- [ ] **Step 3b: Confirm `.env.example` is NOT ignored but `.env` IS**
  Run: `git -C /home/ealflm/dev/signex check-ignore -v .env .env.example apps/web/node_modules packages/db/generated/client .turbo apps/api/dist 2>/dev/null; echo "exit=$?"`
  Expected: lines showing `.env`, `apps/web/node_modules`, `packages/db/generated/client`, `.turbo`, and `apps/api/dist` matched (each printed with the `.gitignore` rule that matched), and `.env.example` is NOT printed (it is tracked). `exit=0`.
  Cross-check that `.env.example` is reported as committable: `git -C /home/ealflm/dev/signex check-ignore .env.example; echo "exit=$?"` prints only `exit=1` (no match → will be committed).

- [ ] **Step 4: Stage the entire monorepo and confirm the index excludes ignored artifacts**
  Run: `git -C /home/ealflm/dev/signex add -A`
  Then verify no ignored artifact slipped into the index:
  Run: `git -C /home/ealflm/dev/signex ls-files | grep -E -c '(^|/)(node_modules|\.next|\.turbo)/|(^|/)dist/|packages/db/generated/|^\.env$'`
  Expected: prints `0` (no node_modules, .next, .turbo, dist, generated client, or real .env staged).

- [ ] **Step 5: Confirm the key scaffold files and the spec ARE staged**
  Run: `git -C /home/ealflm/dev/signex ls-files -- package.json turbo.json .env.example .gitignore .dockerignore README.md docker-compose.yml docs/superpowers/specs/2026-06-18-signex-monorepo-scaffold-design.md apps/api/package.json apps/web/package.json apps/admin/package.json packages/db/package.json packages/db/prisma/schema.prisma packages/shared/package.json | sort`
  Expected: every one of these 14 paths is printed (14 lines), confirming root config, all five workspace `package.json` files, the Prisma schema, and the design spec are staged:
  ```
  .dockerignore
  .env.example
  .gitignore
  README.md
  apps/admin/package.json
  apps/api/package.json
  apps/web/package.json
  docker-compose.yml
  docs/superpowers/specs/2026-06-18-signex-monorepo-scaffold-design.md
  package.json
  packages/db/package.json
  packages/db/prisma/schema.prisma
  packages/shared/package.json
  turbo.json
  ```
  Then assert the root lockfile is staged **if it exists** (it does once any task ran `npm install`; otherwise Task 13 Step 1's install creates it and Task 13's final commit picks it up):
  Run: `if [ -f /home/ealflm/dev/signex/package-lock.json ]; then git -C /home/ealflm/dev/signex ls-files --error-unmatch package-lock.json && echo "LOCKFILE_STAGED"; else echo "LOCKFILE_DEFERRED_TO_TASK13"; fi`
  Expected: prints either `package-lock.json` + `LOCKFILE_STAGED`, or `LOCKFILE_DEFERRED_TO_TASK13` — both acceptable.

- [ ] **Step 6: Confirm web's vendored Webflow assets are staged (verbatim move, behavior unchanged)**
  Run: `git -C /home/ealflm/dev/signex ls-files -- 'apps/web/public/*' | wc -l`
  Expected: a number well above `0` (the 59M of vendored Webflow assets under `apps/web/public/` — videos/images/fonts/js/css — are tracked). Spot-check `proxy.ts`: `git -C /home/ealflm/dev/signex ls-files -- apps/web/proxy.ts` prints `apps/web/proxy.ts`.

- [ ] **Final step: Commit (the FIRST monorepo commit)**
  ```bash
  git -C /home/ealflm/dev/signex commit -m "chore: scaffold signex monorepo (npm workspaces + turborepo)

Initial monorepo: apps/api (NestJS), apps/web (signex-web moved verbatim),
apps/admin (Next.js skeleton), packages/db (@signex/db Prisma), packages/shared
(@signex/shared). Root turbo.json, docker-compose.yml, per-app Dockerfiles, and
the design spec under docs/. Web git history intentionally not preserved."
  ```
  Run: `git -C /home/ealflm/dev/signex log --oneline -1 && git -C /home/ealflm/dev/signex status --porcelain`
  Expected: the log line shows the new commit; `git status --porcelain` prints nothing (clean working tree — everything either committed or ignored).

---

### Task 13: Full-stack verification (spec §9 definition of done)

**Files:**
- Modify: none (verification only; any fix discovered loops back to the owning task). If `npm install` produces/updates `/home/ealflm/dev/signex/package-lock.json` after the Task 12 commit, amend it in via the final step of this task.
- Test: `/home/ealflm/dev/signex/apps/api/test/health.e2e-spec.ts` (the supertest e2e created in Task 6) is exercised in Step 4.

**Interfaces:**
- Consumes:
  - Root workspace: `/home/ealflm/dev/signex/package.json` (scripts `build`, `dev`), `/home/ealflm/dev/signex/turbo.json` (`tasks.build.dependsOn` includes `^build`; `@signex/db#build` dependsOn `@signex/db#generate`).
  - `@signex/db` script `generate` (`prisma generate` → `packages/db/generated/client`); `@signex/api` script `build` (`nest build` → `apps/api/dist`); web/admin `build` (`next build` → `.next`).
  - API route `GET /api/health` → `{status:"ok"}` (Task 6); web route `/en` (Task 8/9); admin placeholder page `/` "Signex Admin" (Task 7).
  - `/home/ealflm/dev/signex/docker-compose.yml` services `postgres`, `api`, `web`, `admin` on network `signex-net`, volume `pgdata` (Task 11); per-app Dockerfiles (Task 10); `/home/ealflm/dev/signex/.env.example`.
  - Env values from the contract: ports web 2051 / admin 2052 / api 4000 / postgres 5432; `DATABASE_URL=postgresql://signex:signex@localhost:5432/signex?schema=public` (host `postgres` inside Compose).
- Produces:
  - Evidence that all nine spec §9 criteria pass. The `prisma migrate dev --name init` run produces `/home/ealflm/dev/signex/packages/db/prisma/migrations/<timestamp>_init/migration.sql` and the `_prisma_migrations` table in Postgres — committed as the final step.

- [ ] **Step 1: §9.1 — `npm install` at root, single lockfile, no per-app lockfiles**
  Create `/home/ealflm/dev/signex/.env` from the example so Prisma/Compose have values:
  Run: `cp /home/ealflm/dev/signex/.env.example /home/ealflm/dev/signex/.env`
  Then install the whole workspace tree from the root:
  Run: `npm install --prefix /home/ealflm/dev/signex`
  Expected: completes with `added N packages` and NO `EUNSUPPORTEDPROTOCOL` error (workspace deps use `"*"`, not `workspace:`). A single `/home/ealflm/dev/signex/package-lock.json` exists.
  Assert no per-app/per-package lockfiles remain (CLI-generated ones from nest/create-next-app/prisma must have been removed in Tasks 4/5/7/8):
  Run: `find /home/ealflm/dev/signex/apps /home/ealflm/dev/signex/packages -maxdepth 2 -name package-lock.json -not -path '*/node_modules/*'`
  Expected: empty output (zero per-app lockfiles).
  Assert workspace symlinks exist:
  Run: `test -L /home/ealflm/dev/signex/node_modules/@signex/db && test -L /home/ealflm/dev/signex/node_modules/@signex/shared && echo OK`
  Expected: prints `OK`.

- [ ] **Step 2: §9.2 — Turborepo build is green; `db#generate` runs before `api#build`**
  First prove ordering explicitly with a dry run, parsing the JSON with `node` (no extra tooling):
  Run:
  ```bash
  npx --prefix /home/ealflm/dev/signex turbo run build --dry=json --cwd /home/ealflm/dev/signex \
    | node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8")); const t=(d.tasks||[]).find(x=>/(@signex\/api#build|^api#build)/.test(x.taskId)); const deps=(t&&t.dependencies)||[]; console.log("api deps:", deps.join(", ")); if(!deps.some(x=>/@signex\/db#(build|generate)/.test(x))){ console.error("FAIL: api build does not depend on @signex/db build/generate"); process.exit(1);} console.log("ORDER_OK");'
  ```
  Expected: prints `api deps: ...` listing `@signex/db#build` (which itself dependsOn `@signex/db#generate`) followed by `ORDER_OK` (confirming the Prisma client is generated and the db lib compiled before the api build). If the `--dry=json` schema differs, fall back to `npx --prefix /home/ealflm/dev/signex turbo run build --dry=text --cwd /home/ealflm/dev/signex | grep -A4 'api#build'` and read its `Dependencies` line.
  Then run the real build:
  Run: `npm run build --prefix /home/ealflm/dev/signex`
  Expected: ends with a Turborepo summary `Tasks:    N successful, N total` and `Failed: 0` (exit code 0). The build log shows `@signex/db#generate` completing before `@signex/api#build` starts.
  Assert each workspace's build output exists:
  Run: `test -d /home/ealflm/dev/signex/packages/db/generated/client && test -f /home/ealflm/dev/signex/apps/api/dist/main.js && test -d /home/ealflm/dev/signex/apps/web/.next && test -d /home/ealflm/dev/signex/apps/admin/.next && echo BUILD_OK`
  Expected: prints `BUILD_OK` (Prisma client generated, api compiled, both Next apps built).

- [ ] **Step 3: §9.9 — `@signex/shared` and `@signex/db` importable from `apps/api` (typecheck passes)**
  Run a no-emit TypeScript check of the api workspace (uses its generated `tsconfig.json`):
  Run: `npx --prefix /home/ealflm/dev/signex tsc --noEmit -p /home/ealflm/dev/signex/apps/api/tsconfig.json`
  Expected: no output, exit code 0 (no type errors; the `@signex/db` `prisma` singleton import in `PrismaModule` and any `@signex/shared` import resolve and typecheck).
  Additionally exercise the compiled shared package at runtime to prove the export path works (Step 2's `npm run build` already emitted `packages/shared/dist`):
  Run: `cd /home/ealflm/dev/signex && node -e "const m = require('@signex/shared'); if(!m.contactMessageSchema) throw new Error('contactMessageSchema not exported'); const r = m.contactMessageSchema.safeParse({name:'A',email:'a@b.co',message:'hi'}); console.log(r.success ? 'SHARED_LOADS' : 'FAIL');"`
  Expected: prints `SHARED_LOADS` — `require('@signex/shared')` resolves via the workspace symlink (root `node_modules/@signex/shared`) to the compiled `dist/index.js`, and the zod example schema parses a valid payload.

- [ ] **Step 4: §9.6 — API health route + Prisma connect via the e2e supertest (local, no DB-on-host needed beyond Postgres container)**
  Start only the Postgres container so the API can connect on boot (the e2e exercises the PrismaModule connect):
  Run: `docker compose -f /home/ealflm/dev/signex/docker-compose.yml up -d postgres`
  Wait until healthy:
  Run: `until [ "$(docker inspect -f '{{.State.Health.Status}}' signex-postgres 2>/dev/null)" = "healthy" ]; do sleep 2; done; echo PG_HEALTHY`
  Expected: prints `PG_HEALTHY` (container name is `signex-postgres` per the Task 11 compose; adjust if the compose sets a different `container_name`).
  Run the api e2e (host `DATABASE_URL` points at `localhost:5432`, already in `.env`):
  Run: `npm run test:e2e --prefix /home/ealflm/dev/signex/apps/api`
  Expected: Jest reports `Tests: 1 passed, 1 total` and the spec `HealthController (e2e) › /api/health (GET) returns 200 { status: "ok" }` passes (proves the route returns `200 {status:"ok"}` and the app boots, exercising the PrismaModule connect against the running Postgres).

- [ ] **Step 5: §9.3 — `npm run dev` starts api + web + admin together without errors**
  Start the dev pipeline in the background, capture logs, give it time to boot all three, then assert each port responds, then stop it:
  ```bash
  cd /home/ealflm/dev/signex && \
  (npm run dev > /tmp/signex-dev.log 2>&1 &) ; \
  until grep -qiE 'ready|started|Nest application successfully started|Local:' /tmp/signex-dev.log && \
        curl -sf -o /dev/null http://127.0.0.1:4000/api/health && \
        curl -sf -o /dev/null http://127.0.0.1:2051/en && \
        curl -sf -o /dev/null http://127.0.0.1:2052/ ; do \
    sleep 3; \
    if grep -qiE 'EADDRINUSE|Cannot find module|Error: |compilation failed' /tmp/signex-dev.log; then echo DEV_ERROR; break; fi; \
  done ; \
  echo "API=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4000/api/health) WEB=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:2051/en) ADMIN=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:2052/)" ; \
  pkill -f 'turbo run dev' ; pkill -f 'nest start' ; pkill -f 'next dev' ; pkill -f 'next-server'
  ```
  Run: the block above.
  Expected: prints `API=200 WEB=200 ADMIN=200` and NO `DEV_ERROR` line. (`turbo run dev` ran `nest start --watch`, `next dev -p 2051`, and `next dev -p 2052` in parallel; all three answer.) `/tmp/signex-dev.log` contains no `EADDRINUSE`/`Cannot find module`/`compilation failed`. The `pkill` lines stop the persistent dev tasks.
  Note: this step requires the Postgres container from Step 4 to still be up so api boots cleanly; if it was stopped, re-run `docker compose -f /home/ealflm/dev/signex/docker-compose.yml up -d postgres` first.

- [ ] **Step 6: §9.8 — `docker compose up -d --build` brings up all four containers; healthchecks reach `healthy`; api waits for postgres**
  Build and start the full stack:
  Run: `docker compose -f /home/ealflm/dev/signex/docker-compose.yml up -d --build`
  Expected: builds all three app images and starts `postgres`, `api`, `web`, `admin` with no build errors; final lines show each service `Started`/`Healthy`. `api` only starts after `postgres` is `service_healthy` (depends_on).
  Wait for all four to be healthy (postgres + api + web + admin all declare healthchecks):
  ```bash
  for c in signex-postgres signex-api signex-web signex-admin; do \
    until [ "$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$c" 2>/dev/null)" = "healthy" ]; do \
      st="$(docker inspect -f '{{.State.Status}}' "$c" 2>/dev/null)"; \
      if [ "$st" = "exited" ] || [ "$st" = "dead" ]; then echo "$c CRASHED"; docker logs --tail 40 "$c"; break; fi; \
      sleep 3; \
    done; \
    echo "$c=$(docker inspect -f '{{.State.Health.Status}}' "$c" 2>/dev/null)"; \
  done
  ```
  Run: the loop above.
  Expected: prints exactly:
  ```
  signex-postgres=healthy
  signex-api=healthy
  signex-web=healthy
  signex-admin=healthy
  ```
  and NO `CRASHED` line. Confirm the depends_on gate with `docker compose -f /home/ealflm/dev/signex/docker-compose.yml ps` showing all four `Up (healthy)`.

- [ ] **Step 7: §9.6 (containerized) — `GET /api/health` → 200 `{status:"ok"}` via `docker exec wget`**
  Probe the api from inside its own container (healthcheck-style, IPv4 loopback per the §10 gotcha):
  Run: `docker exec signex-api wget -qO- http://127.0.0.1:4000/api/health`
  Expected: prints exactly `{"status":"ok"}`.
  Confirm the HTTP status is 200 (some `wget` builds need `-S`):
  Run: `docker exec signex-api wget -S -qO- http://127.0.0.1:4000/api/health 2>&1 | grep -m1 'HTTP/'`
  Expected: a line containing `HTTP/1.1 200 OK`.

- [ ] **Step 8: §9.4 — web `/en` → 200 with Webflow boot (behavior unchanged)**
  Probe web from inside its container and assert the rendered page contains Webflow markup:
  Run: `docker exec signex-web wget -S -qO- http://127.0.0.1:2051/en 2>&1 | grep -m1 'HTTP/'`
  Expected: a line containing `HTTP/1.1 200 OK`.
  Assert the Webflow runtime/markup is present (vendored Webflow assets boot; behavior unchanged):
  Run: `docker exec signex-web wget -qO- http://127.0.0.1:2051/en | grep -ciE 'data-wf-page|webflow|wf-'`
  Expected: a number `>= 1` (the page carries Webflow attributes/script references — the Webflow boot is intact).
  Assert a vendored Webflow asset is served (confirms the `public/` assets moved verbatim and can boot):
  Run: `docker exec signex-web sh -c 'wget -S -qO- "http://127.0.0.1:2051/$(ls apps/web/public/assets/js/*.js | head -1 | sed "s#.*/public/##")" 2>&1 | grep -m1 "HTTP/"'`
  Expected: a line containing `HTTP/1.1 200 OK` (a vendored Webflow script under `/assets/js/` is served).
  Soft check — the bare-path 307 redirect to the default locale (§9.4: `/` → 307 → `/vi`). Proxy/middleware normally runs in the standalone production server (ensure `proxy.ts` sits at `apps/web/` so it is traced into `.next/standalone`):
  Run: `docker exec signex-web wget -S -qO- http://127.0.0.1:2051/ 2>&1 | grep -m1 -E 'HTTP/1.1 30[0-9]|Location:'`
  Expected (load-bearing = the `/en` 200 above; this redirect is a soft check): a `30x` response with a `Location:` header pointing at `/vi`. If instead `/` returns `200`, proxy is not firing in standalone — investigate `proxy.ts` tracing rather than failing the whole verification. (Note: "no console errors" per §9.4 cannot be verified via wget/curl — it needs a headless browser and is out of scope for this container probe.)

- [ ] **Step 9: §9.5 — admin placeholder page on `:2052`**
  Probe admin from inside its container:
  Run: `docker exec signex-admin wget -S -qO- http://127.0.0.1:2052/ 2>&1 | grep -m1 'HTTP/'`
  Expected: a line containing `HTTP/1.1 200 OK`.
  Assert the placeholder content is rendered:
  Run: `docker exec signex-admin wget -qO- http://127.0.0.1:2052/ | grep -c 'Signex Admin'`
  Expected: a number `>= 1` (the "Signex Admin" placeholder dashboard page renders).
  Confirm host-port mapping works too (admin reachable on the host at 2052):
  Run: `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:2052/`
  Expected: prints `200`.

- [ ] **Step 10: §9.7 — Prisma migration tooling works against the Postgres container (`_prisma_migrations` created)**
  With the Postgres container up (Step 6) and host `DATABASE_URL` pointing at `localhost:5432` (from `.env`), create the first migration from the db package. Even with an empty schema this creates the migration folder and the `_prisma_migrations` table:
  Run: `npm run migrate --prefix /home/ealflm/dev/signex/packages/db -- --name init`
  Expected: Prisma prints `Applying migration ...init`, `The following migration(s) have been created and applied`, and creates `/home/ealflm/dev/signex/packages/db/prisma/migrations/<timestamp>_init/migration.sql`. Exit code 0.
  Assert the migration folder exists:
  Run: `ls /home/ealflm/dev/signex/packages/db/prisma/migrations/*_init/migration.sql`
  Expected: prints one path ending in `_init/migration.sql`.
  Assert `_prisma_migrations` exists in the Postgres container:
  Run: `docker exec signex-postgres psql -U signex -d signex -tAc "SELECT to_regclass('public._prisma_migrations');"`
  Expected: prints `_prisma_migrations` (the bookkeeping table was created).
  Prove non-interactive `migrate deploy` also works (idempotent on an up-to-date DB):
  Run: `npm run migrate:deploy --prefix /home/ealflm/dev/signex/packages/db`
  Expected: Prisma prints `No pending migrations to apply.` (or applies and reports the `_init` migration), exit code 0.

- [ ] **Step 11: Tear down the stack (leave a clean machine)**
  Run: `docker compose -f /home/ealflm/dev/signex/docker-compose.yml down`
  Expected: stops and removes `signex-postgres`, `signex-api`, `signex-web`, `signex-admin` and the `signex-net` network; the `pgdata` volume is retained (no `-v` flag), so the applied migration persists for the next run.

- [ ] **Final step: Commit (migration + any lockfile churn from verification)**
  The verification produced the first Prisma migration (`prisma/migrations/<timestamp>_init/`), which IS committed (generated client stays git-ignored). `package-lock.json` may have changed during `npm install`. The local `.env` is git-ignored and must NOT be staged.
  ```bash
  git -C /home/ealflm/dev/signex add packages/db/prisma/migrations package-lock.json
  git -C /home/ealflm/dev/signex commit -m "chore(db): add initial empty prisma migration; verify full stack

Full-stack verification per spec §9: npm install (single root lockfile, no
per-app lockfiles), turbo build green (db#generate before api#build), npm run
dev starts api+web+admin, docker compose up -d --build brings all four
containers healthy, /api/health 200 {status:\"ok\"}, web /en 200 with Webflow
boot, admin :2052 placeholder, prisma migrate dev/deploy works against Postgres
(_prisma_migrations created)."
  ```
  Run: `git -C /home/ealflm/dev/signex status --porcelain && git -C /home/ealflm/dev/signex log --oneline -2`
  Expected: `git status --porcelain` shows no staged-but-uncommitted scaffold files (only the git-ignored `.env` and any untracked logs remain unmentioned because they're ignored); the log shows this verification commit on top of the Task 12 first monorepo commit.
