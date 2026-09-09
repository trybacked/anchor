import type { IncomingMessage, ServerResponse } from "node:http";
import type { WorkerServiceDeps } from "./handlers.js";
import {
    handleGetModel,
    handleGetReview,
    handleGetRunStatus,
    handlePostReview,
    handleSubmitRun,
} from "./handlers.js";

type RouteHandler = (
    tenantId: string,
    request: IncomingMessage,
    response: ServerResponse,
    deps: WorkerServiceDeps,
    params: Record<string, string>,
) => Promise<void> | void;

interface TenantRoute {
    method: string;
    path: string | RegExp;
    handler: RouteHandler;
}

const TENANT_ROUTES: TenantRoute[] = [
    {
        method: "POST",
        path: "runs",
        handler: (tenantId, request, response, deps) => handleSubmitRun(tenantId, request, response, deps),
    },
    {
        method: "GET",
        path: "model",
        handler: (tenantId, _request, response, deps) => handleGetModel(tenantId, response, deps),
    },
    {
        method: "GET",
        path: "review",
        handler: (tenantId, _request, response, deps) => {
            handleGetReview(tenantId, response, deps);
        },
    },
    {
        method: "POST",
        path: "review",
        handler: (tenantId, request, response, deps) => handlePostReview(tenantId, request, response, deps),
    },
    {
        method: "GET",
        path: /^runs\/([^/]+)$/,
        handler: (tenantId, _request, response, deps, params) => {
            handleGetRunStatus(tenantId, decodeURIComponent(params.runId ?? ""), response, deps);
        },
    },
];

export async function dispatchTenantRoute(
    method: string | undefined,
    remainder: string,
    tenantId: string,
    request: IncomingMessage,
    response: ServerResponse,
    deps: WorkerServiceDeps,
): Promise<boolean> {
    if (method === undefined) {
        return false;
    }
    for (const route of TENANT_ROUTES) {
        if (route.method !== method) {
            continue;
        }
        if (typeof route.path === "string") {
            if (remainder !== route.path) {
                continue;
            }
            await route.handler(tenantId, request, response, deps, {});
            return true;
        }
        const match = route.path.exec(remainder);
        if (match === null) {
            continue;
        }
        await route.handler(tenantId, request, response, deps, { runId: match[1] ?? "" });
        return true;
    }
    return false;
}
