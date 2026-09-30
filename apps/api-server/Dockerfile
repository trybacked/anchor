# Build from repo root (parent of anchor/):
#   docker build -f anchor/apps/api-server/Dockerfile -t backed-anchor-api .
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY anchor/package.json anchor/pnpm-lock.yaml anchor/pnpm-workspace.yaml anchor/turbo.json ./
COPY anchor/packages ./packages
COPY anchor/apps/api-server ./apps/api-server
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @trybacked/api-server build
RUN pnpm deploy --filter @trybacked/api-server --prod /deploy

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV ANCHOR_AUDIT_LOG_PATH=/var/log/anchor/audit.jsonl
COPY --from=build /deploy /app
COPY anchor/apps/api-server/scripts/docker-healthcheck.mjs ./scripts/docker-healthcheck.mjs
RUN mkdir -p /var/log/anchor && chown -R node:node /var/log/anchor
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD ["node", "scripts/docker-healthcheck.mjs"]
CMD ["node", "dist/index.js"]
