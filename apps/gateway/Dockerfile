# Build from anchor/ repo root (trybacked/anchor on Railway):
#   docker build -f apps/gateway/Dockerfile -t backed-gateway .
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY apps/gateway ./apps/gateway
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @trybacked/gateway build
RUN pnpm deploy --filter @trybacked/gateway --prod /deploy

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV GATEWAY_PORT=8790
COPY --from=build /deploy /app
USER node
EXPOSE 8790
CMD ["node", "dist/index.js"]
