# Build from anchor/ repo root:
#   docker build -f apps/api-server/Dockerfile -t backed-anchor-api .
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/api-server ./apps/api-server
RUN pnpm install --frozen-lockfile
RUN pnpm turbo build --filter=@trybacked/api-server...
RUN pnpm deploy --filter @trybacked/api-server --prod /deploy

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV ANCHOR_AUDIT_LOG_PATH=/var/log/anchor/audit.jsonl
USER root
RUN apt-get update \
  && apt-get install -y --no-install-recommends unzip wget \
  && wget -q https://github.com/duckdb/duckdb/releases/download/v1.2.1/duckdb_cli-linux-amd64.zip -O /tmp/duckdb.zip \
  && unzip -q /tmp/duckdb.zip -d /usr/local/bin \
  && chmod +x /usr/local/bin/duckdb \
  && rm /tmp/duckdb.zip \
  && apt-get purge -y unzip wget \
  && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/*
USER node
COPY --from=build /deploy /app
COPY apps/api-server/scripts/docker-healthcheck.mjs ./scripts/docker-healthcheck.mjs
RUN mkdir -p /var/log/anchor && chown -R node:node /var/log/anchor
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD ["node", "scripts/docker-healthcheck.mjs"]
CMD ["node", "dist/index.js"]
