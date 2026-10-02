# Build from anchor/ repo root:
#   docker build -f apps/control-plane/Dockerfile -t backed-control-plane .
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/control-plane ./apps/control-plane
RUN pnpm install --frozen-lockfile
RUN pnpm turbo build --filter=@trybacked/control-plane...
RUN pnpm deploy --filter @trybacked/control-plane --prod /deploy

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
COPY --from=build /deploy /app
USER node
EXPOSE 8791
CMD ["sh", "-c", "node dist/db/migrate-cli.js && node dist/index.js"]
