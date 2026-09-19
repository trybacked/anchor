import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { assertTenantAccess, TenantAccessDeniedError } from "./auth.js";
import { SERVICE_NAME, type WorkerServiceConfig } from "./config.js";
import {
  extractTenantRoute,
  PayloadTooLargeError,
  type WorkerServiceDeps,
} from "./handlers.js";
import { parseBearerToken, sendApiError, sendJson, sendYaml } from "./http.js";
import { buildHealthResponse } from "./metrics.js";
import { loadOpenApiSpec } from "./openapi.js";
import { createPartnerRegistry, type PartnerRegistry } from "./partner-registry.js";
import { RateLimiter } from "./rate-limit.js";
import { logHttpRequest } from "./request-log.js";
import { createRunExecutor, type RunExecutor } from "./run-executor.js";
import { dispatchAdminRoute } from "./admin-router.js";
import { dispatchTenantRoute } from "./router.js";
import { FileRunStore } from "./run-store-fs.js";
import type { RunStore } from "./run-store.js";

export interface WorkerServiceOptions {
  config: WorkerServiceConfig;
  runStore?: RunStore;
  rateLimiter?: RateLimiter;
  partnerRegistry?: PartnerRegistry;
  runExecutor?: RunExecutor;
}

function unauthorized(response: ServerResponse): void {
  sendApiError(response, 401, { error: "unauthorized" });
}

function forbidden(response: ServerResponse): void {
  sendApiError(response, 403, { error: "forbidden" });
}

async function assertAuth(
  request: IncomingMessage,
  registry: PartnerRegistry,
  response: ServerResponse,
): Promise<{ partnerId: string } | null> {
  const token = parseBearerToken(request.headers.authorization);
  if (token === null) {
    unauthorized(response);
    return null;
  }
  const auth = await registry.resolveToken(token);
  if (auth === null) {
    unauthorized(response);
    return null;
  }
  return auth;
}

function assertRateLimit(
  tenantId: string,
  limiter: RateLimiter,
  response: ServerResponse,
): boolean {
  if (!limiter.allow(tenantId)) {
    sendApiError(response, 429, { error: "rate_limit_exceeded" });
    return false;
  }
  return true;
}

export function createWorkerService(options: WorkerServiceOptions) {
  const runStore = options.runStore ?? new FileRunStore(options.config.dataRoot);
  const rateLimiter =
    options.rateLimiter ??
    new RateLimiter({
      windowMs: options.config.rateLimitWindowMs,
      maxRequests: options.config.rateLimitMaxRequests,
    });
  const partnerRegistry =
    options.partnerRegistry ?? createPartnerRegistry({ config: options.config });
  const runExecutor =
    options.runExecutor ??
    createRunExecutor({
      config: options.config,
      runStore,
      partnerRegistry,
    });
  const deps: WorkerServiceDeps = {
    config: options.config,
    runStore,
    partnerRegistry,
    runExecutor,
  };
  return createServer((request, response) => {
    const startedAtMs = Date.now();
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    response.on("finish", () => {
      const tenantId = extractTenantIdFromPath(pathname);
      logHttpRequest({
        request,
        status: response.statusCode,
        startedAtMs,
        ...(tenantId !== undefined ? { tenantId } : {}),
      });
    });
    void handleRequest(request, response, deps, rateLimiter).catch((error: unknown) => {
      if (error instanceof PayloadTooLargeError) {
        sendApiError(response, 413, { error: "payload_too_large", maxBytes: error.maxBytes });
        return;
      }
      sendApiError(response, 500, {
        error: "internal_error",
        message: error instanceof Error ? error.message : String(error),
      });
    });
  });
}

function extractTenantIdFromPath(pathname: string): string | undefined {
  const match = /^\/(?:admin\/)?v1\/tenants\/([^/]+)/.exec(pathname);
  return match?.[1] !== undefined ? decodeURIComponent(match[1]) : undefined;
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  deps: WorkerServiceDeps,
  rateLimiter: RateLimiter,
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (request.method === "GET" && url.pathname === "/health") {
    const health = buildHealthResponse(SERVICE_NAME, deps.config.dataRoot);
    sendJson(response, health.ok ? 200 : 503, health);
    return;
  }
  if (request.method === "GET" && url.pathname === "/openapi.yaml") {
    sendYaml(response, 200, loadOpenApiSpec());
    return;
  }
  const internalSecret = deps.config.controlPlane?.internalSecret;
  const internalToken = parseBearerToken(request.headers.authorization);
  const isInternalRequest = internalSecret !== undefined && internalToken === internalSecret;

  if (url.pathname === "/admin/v1/runs" || url.pathname.startsWith("/admin/v1/tenants/")) {
    if (!isInternalRequest) {
      unauthorized(response);
      return;
    }
    const handled = await dispatchAdminRoute(request.method, url.pathname, request, response, deps);
    if (handled) {
      return;
    }
  }

  const auth = await assertAuth(request, deps.partnerRegistry, response);
  if (auth === null) {
    return;
  }
  const route = extractTenantRoute(url.pathname);
  if (route === null) {
    sendApiError(response, url.pathname.startsWith("/v1/tenants/") ? 400 : 404, {
      error: url.pathname.startsWith("/v1/tenants/") ? "invalid_tenant_id" : "not_found",
    });
    return;
  }
  try {
    assertTenantAccess(auth, route.tenantId, deps.partnerRegistry);
  } catch (error) {
    if (error instanceof TenantAccessDeniedError) {
      forbidden(response);
      return;
    }
    throw error;
  }
  if (!assertRateLimit(route.tenantId, rateLimiter, response)) {
    return;
  }
  const handled = await dispatchTenantRoute(
    request.method,
    route.remainder,
    route.tenantId,
    auth,
    request,
    response,
    deps,
  );
  if (!handled) {
    sendApiError(response, 404, { error: "not_found" });
  }
}

export function startWorkerService(
  options: WorkerServiceOptions,
): Promise<{ url: string; close: () => Promise<void> }> {
  const partnerRegistry =
    options.partnerRegistry ?? createPartnerRegistry({ config: options.config });
  const runStore = options.runStore ?? new FileRunStore(options.config.dataRoot);
  const runExecutor =
    options.runExecutor ??
    createRunExecutor({
      config: options.config,
      runStore,
      partnerRegistry,
    });
  const recovered = runExecutor.recoverOrphanedRuns();
  if (recovered > 0) {
    console.error(
      JSON.stringify({
        event: "run.recover_orphans",
        ts: new Date().toISOString(),
        count: recovered,
      }),
    );
  }
  const server = createWorkerService({ ...options, runStore, partnerRegistry, runExecutor });
  return new Promise((resolve, reject) => {
    server.listen(options.config.port, options.config.host, () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("Unable to bind worker service"));
        return;
      }
      resolve({
        url: `http://${options.config.host}:${String(address.port)}`,
        close: async () => {
          await runExecutor.shutdown();
          await new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }
              closeResolve();
            });
          });
        },
      });
    });
  });
}
