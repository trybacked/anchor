# Build from repository root:
#   docker build -f apps/worker-service/Dockerfile .
#
# Slim (default): CSV/JSON/XLSX and text formats.
# Full (+ Poppler for PDF page rendering / OCR path):
#   docker build -f apps/worker-service/Dockerfile --build-arg IMAGE_VARIANT=full .

ARG IMAGE_VARIANT=slim

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

FROM base AS builder
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY apps/worker-service/package.json apps/worker-service/
COPY packages/core/package.json packages/core/
COPY packages/diff/package.json packages/diff/
COPY packages/ingest/package.json packages/ingest/
COPY packages/profile/package.json packages/profile/
COPY packages/runner/package.json packages/runner/
COPY packages/semantic/package.json packages/semantic/
RUN pnpm install --frozen-lockfile
COPY apps/worker-service apps/worker-service
COPY packages packages
# Build worker-service and all workspace dependencies (core → runner → worker).
RUN pnpm --filter @backed/worker-service... build
RUN pnpm --filter @backed/worker-service deploy --prod /out
RUN rm -rf /out/src /out/tests /out/tsconfig.json /out/vitest.config.ts /out/.turbo

FROM base AS runtime
ARG IMAGE_VARIANT=slim
WORKDIR /app
ENV NODE_ENV=production
ENV WORKER_SERVICE_HOST=0.0.0.0
ENV WORKER_SERVICE_PORT=8790
ENV WORKER_SERVICE_DATA_ROOT=/data
RUN if [ "$IMAGE_VARIANT" = "full" ]; then \
      apt-get update \
      && apt-get install -y --no-install-recommends poppler-utils \
      && rm -rf /var/lib/apt/lists/*; \
    fi
RUN mkdir -p /data && chown node:node /data
COPY --from=builder --chown=node:node /out /app
USER node
EXPOSE 8790
# Persistent storage: mount a Railway Volume at /data (WORKER_SERVICE_DATA_ROOT).
# Do not use Dockerfile VOLUME — Railway rejects it at build time.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8790/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
