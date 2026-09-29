FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY anchor/package.json anchor/pnpm-lock.yaml anchor/pnpm-workspace.yaml anchor/turbo.json ./
COPY anchor/packages ./packages
COPY anchor/apps/api-server ./apps/api-server
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @trybacked/api-server build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/api-server/dist ./dist
COPY --from=build /app/apps/api-server/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
EXPOSE 8787
CMD ["node", "dist/index.js"]
