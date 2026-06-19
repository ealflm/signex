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
