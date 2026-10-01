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
COPY --from=build /deploy /app
COPY apps/api-server/scripts/docker-healthcheck.mjs ./scripts/docker-healthcheck.mjs
RUN mkdir -p /var/log/anchor && chown -R node:node /var/log/anchor
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD ["node", "scripts/docker-healthcheck.mjs"]
CMD ["node", "dist/index.js"]
