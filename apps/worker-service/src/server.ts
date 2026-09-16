import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { SERVICE_NAME, type WorkerServiceConfig } from "./config.js";
import {
    extractAdminTenantRoute,
    extractTenantRoute,
    handleAdminGetModel,
    handleAdminGetReview,
    handleAdminGetRunStatus,
    handleAdminListRuns,
    handleAdminPatchModelElement,
    handleAdminSubmitRun,
    PayloadTooLargeError,
    type WorkerServiceDeps,
} from "./handlers.js";
import { assertTenantAccess, TenantAccessDeniedError } from "./auth.js";
import { createPartnerRegistry, type PartnerRegistry } from "./partner-registry.js";
import { parseBearerToken, sendApiError, sendJson, sendYaml } from "./http.js";
import { dispatchTenantRoute } from "./router.js";
import { RateLimiter } from "./rate-limit.js";
import { buildHealthResponse } from "./metrics.js";
import { loadOpenApiSpec } from "./openapi.js";
import { FileRunStore } from "./run-store-fs.js";
import type { RunStore } from "./run-store.js";

export interface WorkerServiceOptions {
    config: WorkerServiceConfig;
    runStore?: RunStore;
    rateLimiter?: RateLimiter;
    partnerRegistry?: PartnerRegistry;
}

function unauthorized(response: ServerResponse): void {
    sendApiError(response, 401, { error: "unauthorized" });
}

function forbidden(response: ServerResponse): void {
    sendApiError(response, 403, { error: "forbidden" });
}

const BACKED_PARTNER_ID_HEADER = "x-backed-partner-id";

function readBackedPartnerId(request: IncomingMessage): string | null {
    const raw = request.headers[BACKED_PARTNER_ID_HEADER];
    if (raw === undefined) {
        return null;
    }
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value === undefined || value.trim().length === 0) {
        return null;
    }
    return value.trim();
}

function assertAdminTenantAccess(
    partnerId: string,
    tenantId: string,
    registry: PartnerRegistry,
    response: ServerResponse,
): boolean {
    try {
        assertTenantAccess({ partnerId }, tenantId, registry);
        return true;
    }
    catch (error) {
        if (error instanceof TenantAccessDeniedError) {
            forbidden(response);
            return false;
        }
        throw error;
    }
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

function assertRateLimit(tenantId: string, limiter: RateLimiter, response: ServerResponse): boolean {
    if (!limiter.allow(tenantId)) {
        sendApiError(response, 429, { error: "rate_limit_exceeded" });
        return false;
    }
    return true;
}

export function createWorkerService(options: WorkerServiceOptions) {
    const runStore = options.runStore ?? new FileRunStore(options.config.dataRoot);
    const rateLimiter = options.rateLimiter ?? new RateLimiter({
        windowMs: options.config.rateLimitWindowMs,
        maxRequests: options.config.rateLimitMaxRequests,
    });
    const partnerRegistry = options.partnerRegistry ?? createPartnerRegistry({ config: options.config });
    const deps: WorkerServiceDeps = {
        config: options.config,
        runStore,
        partnerRegistry,
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
    const isInternalRequest =
        internalSecret !== undefined && internalToken === internalSecret;

    if (request.method === "GET" && url.pathname === "/admin/v1/runs") {
        if (!isInternalRequest) {
            unauthorized(response);
            return;
        }
        handleAdminListRuns(request, response, deps);
        return;
    }

    const adminTenantRoute = extractAdminTenantRoute(url.pathname);
    if (adminTenantRoute !== null) {
        if (!isInternalRequest) {
            unauthorized(response);
            return;
        }
        if (request.method === "GET" && adminTenantRoute.remainder === "model") {
            await handleAdminGetModel(adminTenantRoute.tenantId, response, deps);
            return;
        }
        if (request.method === "PATCH" && adminTenantRoute.remainder === "model/elements") {
            await handleAdminPatchModelElement(adminTenantRoute.tenantId, request, response, deps);
            return;
        }
        if (request.method === "GET" && adminTenantRoute.remainder === "review") {
            handleAdminGetReview(adminTenantRoute.tenantId, response, deps);
            return;
        }
        if (request.method === "POST" && adminTenantRoute.remainder === "runs") {
            const partnerId = readBackedPartnerId(request);
            if (partnerId === null) {
                sendApiError(response, 400, { error: "missing_partner_id" });
                return;
            }
            if (!assertAdminTenantAccess(partnerId, adminTenantRoute.tenantId, deps.partnerRegistry, response)) {
                return;
            }
            await handleAdminSubmitRun(adminTenantRoute.tenantId, partnerId, request, response, deps);
            return;
        }
        const adminRunStatusMatch = /^runs\/([^/]+)$/.exec(adminTenantRoute.remainder);
        if (request.method === "GET" && adminRunStatusMatch !== null) {
            const partnerId = readBackedPartnerId(request);
            if (partnerId === null) {
                sendApiError(response, 400, { error: "missing_partner_id" });
                return;
            }
            if (!assertAdminTenantAccess(partnerId, adminTenantRoute.tenantId, deps.partnerRegistry, response)) {
                return;
            }
            handleAdminGetRunStatus(
                adminTenantRoute.tenantId,
                decodeURIComponent(adminRunStatusMatch[1] ?? ""),
                response,
                deps,
            );
            return;
        }
        sendApiError(response, 404, { error: "not_found" });
        return;
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
    }
    catch (error) {
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
