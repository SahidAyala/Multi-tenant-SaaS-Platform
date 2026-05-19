# ============================================================
# ATLAS API — Multi-stage Dockerfile (pnpm)
# ============================================================

FROM node:20-alpine AS base
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig*.json ./
COPY nest-cli.json ./

# ----------------------------------------------------------
# Development stage (hot-reload, debug port exposed)
# ----------------------------------------------------------
FROM base AS development
ENV NODE_ENV=development
RUN pnpm install --frozen-lockfile
COPY . .
EXPOSE 3000 9229
CMD ["pnpm", "run", "start:debug"]

# ----------------------------------------------------------
# Builder stage
# ----------------------------------------------------------
FROM base AS builder
ENV NODE_ENV=production
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

# ----------------------------------------------------------
# Production stage (minimal image)
# ----------------------------------------------------------
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@latest --activate && \
    addgroup --system --gid 1001 atlas && \
    adduser --system --uid 1001 atlas

COPY --from=builder --chown=atlas:atlas /app/dist ./dist
COPY --from=builder --chown=atlas:atlas /app/node_modules ./node_modules
COPY --from=builder --chown=atlas:atlas /app/package.json ./

USER atlas

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/apps/api/main"]
