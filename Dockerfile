# Multi-stage Dockerfile for the License Engine server.
#
# Targets:
#   - deps     install all workspace deps (used by dev and builder)
#   - dev      development image with hot-reload, used by docker-compose
#   - builder  produces the Next.js standalone build + Prisma client
#   - runtime  small production image, runs the standalone server
#
# Build production:   docker build --target runtime -t license-engine .
# Build dev:          docker build --target dev -t license-engine:dev .

# ------------------------------------------------------------ base
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.3.0 --activate
WORKDIR /app

# ------------------------------------------------------------ deps
FROM base AS deps
COPY pnpm-workspace.yaml package.json ./
COPY apps/server/package.json apps/server/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/sdk-js/package.json packages/sdk-js/
RUN pnpm install --frozen-lockfile=false

# ------------------------------------------------------------ dev
FROM deps AS dev
ENV NODE_ENV=development
COPY . .
RUN pnpm --filter @license-engine/server prisma:generate
EXPOSE 3000
WORKDIR /app/apps/server
CMD ["pnpm", "dev"]

# ------------------------------------------------------------ builder
FROM deps AS builder
ENV NODE_ENV=production
COPY . .
RUN pnpm --filter @license-engine/server prisma:generate \
 && pnpm --filter @license-engine/shared-types build \
 && pnpm --filter @license-engine/server build

# ------------------------------------------------------------ runtime
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
WORKDIR /app

# Next.js standalone output bundles the minimal node_modules it needs.
COPY --from=builder --chown=nextjs:nodejs /app/apps/server/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/server/.next/static ./apps/server/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/server/public ./apps/server/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/server/prisma ./apps/server/prisma
COPY --from=builder --chown=nextjs:nodejs /app/apps/server/messages ./apps/server/messages
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

CMD ["node", "apps/server/server.js"]
