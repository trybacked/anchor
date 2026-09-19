import type { IncomingMessage, ServerResponse } from "node:http";
import type { AuthContext } from "./auth.js";
import type { WorkerServiceDeps } from "./handlers.js";
import {
  handleGetAuditDeletions,
  handleGetAuditLedger,
  handleGetModel,
  handleGetReview,
  handleGetRunStatus,
  handlePostReview,
  handleSubmitRun,
} from "./handlers.js";
import { handleGetTenantConfig, handlePatchTenantConfig } from "./tenant-config-handlers.js";

type RouteHandler = (
  tenantId: string,
  auth: AuthContext,
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
    handler: (tenantId, auth, request, response, deps) =>
      handleSubmitRun(tenantId, auth.partnerId, request, response, deps),
  },
  {
    method: "GET",
    path: "model",
    handler: (tenantId, _auth, _request, response, deps) =>
      handleGetModel(tenantId, response, deps),
  },
  {
    method: "GET",
    path: "review",
    handler: (tenantId, _auth, _request, response, deps) => {
      handleGetReview(tenantId, response, deps);
    },
  },
  {
    method: "POST",
    path: "review",
    handler: (tenantId, _auth, request, response, deps) =>
      handlePostReview(tenantId, request, response, deps),
  },
  {
    method: "GET",
    path: /^runs\/([^/]+)$/,
    handler: (tenantId, _auth, _request, response, deps, params) => {
      handleGetRunStatus(tenantId, decodeURIComponent(params.runId ?? ""), response, deps);
    },
  },
  {
    method: "GET",
    path: "audit/deletions",
    handler: (tenantId, _auth, request, response, deps) =>
      handleGetAuditDeletions(tenantId, request, response, deps),
  },
  {
    method: "GET",
    path: "audit/ledger",
    handler: (tenantId, _auth, _request, response, deps) =>
      handleGetAuditLedger(tenantId, response, deps),
  },
  {
    method: "GET",
    path: "config",
    handler: (tenantId, _auth, _request, response, deps) => {
      handleGetTenantConfig(tenantId, response, deps);
    },
  },
  {
    method: "PATCH",
    path: "config",
    handler: (tenantId, _auth, request, response, deps) =>
      handlePatchTenantConfig(tenantId, request, response, deps),
  },
];

export function listTenantOpenApiRoutes(): Array<{ method: string; path: string }> {
  const routes: Array<{ method: string; path: string }> = [];
  for (const route of TENANT_ROUTES) {
    const suffix = typeof route.path === "string" ? route.path : "runs/{runId}";
    routes.push({
      method: route.method,
      path: `/v1/tenants/{tenantId}/${suffix}`,
    });
  }
  return routes;
}

export async function dispatchTenantRoute(
  method: string | undefined,
  remainder: string,
  tenantId: string,
  auth: AuthContext,
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
      await route.handler(tenantId, auth, request, response, deps, {});
      return true;
    }
    const match = route.path.exec(remainder);
    if (match === null) {
      continue;
    }
    await route.handler(tenantId, auth, request, response, deps, { runId: match[1] ?? "" });
    return true;
  }
  return false;
}
