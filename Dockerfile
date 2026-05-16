# syntax=docker/dockerfile:1.7

# ============================
# Stage 1 — Builder
# ============================
FROM node:24-alpine AS builder
WORKDIR /app

# Install all deps (dev + prod) for bundling
COPY package.json package-lock.json ./
RUN npm ci

# Copy sources and build
COPY tsconfig.json tsup.config.ts biome.json ./
COPY src ./src
COPY seed ./seed

RUN npm run build

# Prune to production deps only (mongodb driver is required at runtime
# because grammyjs/storage-mongodb and our db client import it directly).
RUN npm prune --omit=dev

# ============================
# Stage 2 — Runtime
# ============================
FROM node:24-alpine AS runtime
WORKDIR /app

# wget for HEALTHCHECK
RUN apk add --no-cache wget tini && \
    addgroup -g 1001 -S app && \
    adduser  -u 1001 -S app -G app

ENV NODE_ENV=production \
    PORT=3000

COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/dist         ./dist
# seed/* is used at one-shot bootstrap via `npm run seed` from compose
COPY --from=builder --chown=app:app /app/seed         ./seed
COPY --chown=app:app package.json                     ./

USER app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3000/health || exit 1

# tini reaps zombies and forwards SIGTERM to Node for graceful shutdown
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.cjs"]
