import type { IncomingMessage, ServerResponse } from "node:http";
import { assertTenantAccess, TenantAccessDeniedError } from "./auth.js";
import {
  extractAdminTenantRoute,
  handleAdminGetModel,
  handleAdminGetReview,
  handleAdminGetRunStatus,
  handleAdminListRuns,
  handleAdminPatchModelElement,
  handleAdminSubmitRun,
  handlePostReview,
  type WorkerServiceDeps,
} from "./handlers.js";
import { sendApiError } from "./http.js";
import type { PartnerRegistry } from "./partner-registry.js";
import { handleGetTenantConfig, handlePatchTenantConfig } from "./tenant-config-handlers.js";

const BACKED_PARTNER_ID_HEADER = "x-backed-partner-id";

function forbidden(response: ServerResponse): void {
  sendApiError(response, 403, { error: "forbidden" });
}

export function readBackedPartnerId(request: IncomingMessage): string | null {
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
  } catch (error) {
    if (error instanceof TenantAccessDeniedError) {
      forbidden(response);
      return false;
    }
    throw error;
  }
}

type AdminTenantHandler = (
  tenantId: string,
  request: IncomingMessage,
  response: ServerResponse,
  deps: WorkerServiceDeps,
  params: Record<string, string>,
) => Promise<void> | void;

interface AdminTenantRoute {
  method: string;
  path: string | RegExp;
  requiresPartner?: boolean;
  handler: AdminTenantHandler;
}

const ADMIN_TENANT_ROUTES: AdminTenantRoute[] = [
  {
    method: "GET",
    path: "model",
    handler: (tenantId, _request, response, deps) =>
      handleAdminGetModel(tenantId, response, deps),
  },
  {
    method: "PATCH",
    path: "model/elements",
    handler: (tenantId, request, response, deps) =>
      handleAdminPatchModelElement(tenantId, request, response, deps),
  },
  {
    method: "GET",
    path: "review",
    handler: (tenantId, _request, response, deps) => {
      handleAdminGetReview(tenantId, response, deps);
    },
  },
  {
    method: "POST",
    path: "review",
    handler: (tenantId, request, response, deps) =>
      handlePostReview(tenantId, request, response, deps),
  },
  {
    method: "GET",
    path: "config",
    handler: (tenantId, _request, response, deps) => {
      handleGetTenantConfig(tenantId, response, deps);
    },
  },
  {
    method: "PATCH",
    path: "config",
    handler: (tenantId, request, response, deps) =>
      handlePatchTenantConfig(tenantId, request, response, deps),
  },
  {
    method: "POST",
    path: "runs",
    requiresPartner: true,
    handler: (tenantId, request, response, deps, params) =>
      handleAdminSubmitRun(tenantId, params.partnerId ?? "", request, response, deps),
  },
  {
    method: "GET",
    path: /^runs\/([^/]+)$/,
    requiresPartner: true,
    handler: (tenantId, _request, response, deps, params) => {
      handleAdminGetRunStatus(tenantId, decodeURIComponent(params.runId ?? ""), response, deps);
    },
  },
];

export async function dispatchAdminRoute(
  method: string | undefined,
  pathname: string,
  request: IncomingMessage,
  response: ServerResponse,
  deps: WorkerServiceDeps,
): Promise<boolean> {
  if (method === "GET" && pathname === "/admin/v1/runs") {
    handleAdminListRuns(request, response, deps);
    return true;
  }

  const adminTenantRoute = extractAdminTenantRoute(pathname);
  if (adminTenantRoute === null) {
    return false;
  }

  if (method === undefined) {
    sendApiError(response, 404, { error: "not_found" });
    return true;
  }

  for (const route of ADMIN_TENANT_ROUTES) {
    if (route.method !== method) {
      continue;
    }
    let params: Record<string, string> = {};
    if (typeof route.path === "string") {
      if (adminTenantRoute.remainder !== route.path) {
        continue;
      }
    } else {
      const match = route.path.exec(adminTenantRoute.remainder);
      if (match === null) {
        continue;
      }
      params = { runId: match[1] ?? "" };
    }

    if (route.requiresPartner === true) {
      const partnerId = readBackedPartnerId(request);
      if (partnerId === null) {
        sendApiError(response, 400, { error: "missing_partner_id" });
        return true;
      }
      if (
        !assertAdminTenantAccess(
          partnerId,
          adminTenantRoute.tenantId,
          deps.partnerRegistry,
          response,
        )
      ) {
        return true;
      }
      params = { ...params, partnerId };
    }

    await route.handler(adminTenantRoute.tenantId, request, response, deps, params);
    return true;
  }

  sendApiError(response, 404, { error: "not_found" });
  return true;
}
