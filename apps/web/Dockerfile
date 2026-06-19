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
