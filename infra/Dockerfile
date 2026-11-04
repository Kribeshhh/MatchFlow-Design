# Release pipeline must resolve and record this base image digest before promotion.
FROM node:22.23.4-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npm run build

FROM build AS migration
# Privileged one-off job only; never used as the public application image.
CMD ["./node_modules/.bin/prisma", "migrate", "deploy"]

FROM build AS dependencies
RUN npm prune --omit=dev

FROM base AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/dist/api ./dist/api
COPY --from=build --chown=node:node /app/apps/web/dist ./apps/web/dist
COPY --chown=node:node infra/healthcheck.mjs ./infra/healthcheck.mjs
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD ["node", "infra/healthcheck.mjs"]
CMD ["node", "dist/api/apps/api/src/index.js"]

FROM runtime AS worker
# This process has no HTTP listener; monitor process health and queue age externally.
HEALTHCHECK NONE
CMD ["node", "dist/api/scripts/notification-worker.js"]
