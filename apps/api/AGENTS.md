# apps/api — NestJS agent rules

NestJS **v11** app (`@nestjs/* ^11`). Conventions may differ from your training data — check the NestJS v11 docs before writing modules/providers/decorators.

## Build / workspace deps (load-bearing)
- `npm run build` = `nest build` = **plain tsc, it does NOT bundle workspace deps.** The api `require()`s `@signex/db` and `@signex/shared` at runtime from their **compiled CommonJS `dist/`** — those packages MUST be built first (Turbo's `^build` handles ordering). Shipping raw `.ts` as a package `main` crashes the container.
- DB access goes through `@signex/db` (Prisma client generated into `packages/db/generated/client`). Use the Nest `PrismaService` (`src/prisma/prisma.service.ts`), not a hand-rolled client.

## Run
- Dev: `npm run dev` (= `nest start --watch`). Prod: `node dist/main`.
- Listens on `API_PORT` (default **3060**), host `0.0.0.0`. REST health endpoint: `GET /api/health`.
