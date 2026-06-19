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
