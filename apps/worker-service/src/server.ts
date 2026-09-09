import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { SERVICE_NAME, type WorkerServiceConfig } from "./config.js";
import {
    extractTenantRoute,
    PayloadTooLargeError,
    type WorkerServiceDeps,
} from "./handlers.js";
import { parseBearerToken, sendApiError, sendJson } from "./http.js";
import { dispatchTenantRoute } from "./router.js";
import { RateLimiter } from "./rate-limit.js";
import { RunStore } from "./run-store.js";

export interface WorkerServiceOptions {
    config: WorkerServiceConfig;
    runStore?: RunStore;
    rateLimiter?: RateLimiter;
}

function unauthorized(response: ServerResponse): void {
    sendApiError(response, 401, { error: "unauthorized" });
}

function assertAuth(request: IncomingMessage, config: WorkerServiceConfig, response: ServerResponse): boolean {
    const token = parseBearerToken(request.headers.authorization);
    if (token === null || token !== config.authToken) {
        unauthorized(response);
        return false;
    }
    return true;
}

function assertRateLimit(tenantId: string, limiter: RateLimiter, response: ServerResponse): boolean {
    if (!limiter.allow(tenantId)) {
        sendApiError(response, 429, { error: "rate_limit_exceeded" });
        return false;
    }
    return true;
}

export function createWorkerService(options: WorkerServiceOptions) {
    const runStore = options.runStore ?? new RunStore();
    const rateLimiter = options.rateLimiter ?? new RateLimiter({
        windowMs: options.config.rateLimitWindowMs,
        maxRequests: options.config.rateLimitMaxRequests,
    });
    const deps: WorkerServiceDeps = {
        config: options.config,
        runStore,
    };
    return createServer((request, response) => {
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

async function handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
    deps: WorkerServiceDeps,
    rateLimiter: RateLimiter,
): Promise<void> {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (request.method === "GET" && url.pathname === "/health") {
        sendJson(response, 200, { ok: true, service: SERVICE_NAME });
        return;
    }
    if (!assertAuth(request, deps.config, response)) {
        return;
    }
    const route = extractTenantRoute(url.pathname);
    if (route === null) {
        sendApiError(response, url.pathname.startsWith("/v1/tenants/") ? 400 : 404, {
            error: url.pathname.startsWith("/v1/tenants/") ? "invalid_tenant_id" : "not_found",
        });
        return;
    }
    if (!assertRateLimit(route.tenantId, rateLimiter, response)) {
        return;
    }
    const handled = await dispatchTenantRoute(
        request.method,
        route.remainder,
        route.tenantId,
        request,
        response,
        deps,
    );
    if (!handled) {
        sendApiError(response, 404, { error: "not_found" });
    }
}

export function startWorkerService(options: WorkerServiceOptions): Promise<{ url: string; close: () => Promise<void> }> {
    const server = createWorkerService(options);
    return new Promise((resolve, reject) => {
        server.listen(options.config.port, options.config.host, () => {
            const address = server.address();
            if (address === null || typeof address === "string") {
                reject(new Error("Unable to bind worker service"));
                return;
            }
            resolve({
                url: `http://${options.config.host}:${String(address.port)}`,
                close: () => new Promise<void>((closeResolve, closeReject) => {
                    server.close((error) => {
                        if (error) {
                            closeReject(error);
                            return;
                        }
                        closeResolve();
                    });
                }),
            });
        });
    });
}
