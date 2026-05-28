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
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/server/package.json apps/server/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/sdk-js/package.json packages/sdk-js/
# Frozen lockfile: the committed pnpm-lock.yaml is the single source of truth,
# so the build is reproducible and fails loudly if package.json drifts from it.
RUN pnpm install --frozen-lockfile

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

# Next.js standalone output bundles the minimal node_modules it needs —
# including the generated Prisma client and the linux-musl query engine
# (traced from the pnpm store under node_modules/.pnpm/...). We therefore do
# NOT copy node_modules/.prisma separately: that path does not exist in a pnpm
# layout and the COPY would fail the build. The engine is already inside
# .next/standalone.
COPY --from=builder --chown=nextjs:nodejs /app/apps/server/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/server/.next/static ./apps/server/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/server/public ./apps/server/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/server/prisma ./apps/server/prisma
COPY --from=builder --chown=nextjs:nodejs /app/apps/server/messages ./apps/server/messages

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

CMD ["node", "apps/server/server.js"]
