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

# ---------- builder: build deps (db client + shared) then the web workspace ----------
FROM node:20-alpine AS builder
WORKDIR /app
# openssl required by the Prisma query engine (linux-musl-openssl-3.0.x) at generate time.
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# @signex/db + @signex/shared are require()d by the web read-path at runtime; they must be
# generated/compiled to dist/ + generated/ BEFORE next build so the standalone trace can
# include the Prisma client (linux-musl engine) and the CJS shared registry.
RUN npm run -w @signex/db generate \
 && npm run build -w @signex/db -w @signex/shared \
 && npm run build --workspace @signex/web

# ---------- runner: Next standalone server (monorepo-nested layout) ----------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3062
ENV HOSTNAME=0.0.0.0
# openssl required by the Prisma query engine at runtime.
RUN apk add --no-cache openssl \
 && addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs
# 1) standalone root -> "./": brings the launcher + hoisted node_modules + apps/web/.
#    outputFileTracingRoot=repo-root means standalone node_modules span the workspace.
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
# 2) static assets -> mirrored nested app path.
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
# 3) vendored Webflow public/ assets -> mirrored nested app path.
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
# 4) Belt-and-suspenders: Prisma native engine (.so.node) is sometimes missed by nft.
#    Explicit copy ensures the linux-musl-openssl-3.0.x engine is present at runtime.
COPY --from=builder --chown=nextjs:nodejs /app/packages/db/generated ./packages/db/generated
# 5) CJS dist for @signex/db + @signex/shared (require()d by the web read-path server components).
COPY --from=builder --chown=nextjs:nodejs /app/packages/db/dist ./packages/db/dist
COPY --from=builder --chown=nextjs:nodejs /app/packages/shared/dist ./packages/shared/dist
USER nextjs
EXPOSE 3062
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=20s \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3062/en || exit 1
# Run the PER-APP server.js (not the standalone-root launcher).
CMD ["node", "apps/web/server.js"]
