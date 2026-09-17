import {
  patchTenantPipelineConfig,
  readTenantPipelineConfig,
  resolveTenantWorkspace,
  TenantPipelineConfigPatchSchema,
  type TenantPipelineConfig,
} from "@backed/runner";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { WorkerServiceDeps } from "./handlers.js";
import { readRequestBody, sendApiError, sendJson } from "./http.js";

export function handleGetTenantConfig(
  tenantId: string,
  response: ServerResponse,
  deps: WorkerServiceDeps,
): void {
  const workspace = resolveTenantWorkspace(deps.config.dataRoot, tenantId);
  const config = readTenantPipelineConfig(workspace.paths.persistDir);
  sendJson(response, 200, { config });
}

export async function handlePatchTenantConfig(
  tenantId: string,
  request: IncomingMessage,
  response: ServerResponse,
  deps: WorkerServiceDeps,
): Promise<void> {
  const body = await readRequestBody(request, deps.config.maxUploadBytes);
  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(body.toString("utf8"));
  } catch {
    sendApiError(response, 400, { error: "invalid_json" });
    return;
  }

  const payload = TenantPipelineConfigPatchSchema.safeParse(parsedPayload);
  if (!payload.success) {
    sendApiError(response, 400, { error: "invalid_config" });
    return;
  }

  const workspace = resolveTenantWorkspace(deps.config.dataRoot, tenantId);
  const config = patchTenantPipelineConfig(workspace.paths.persistDir, payload.data);
  sendJson(response, 200, { config });
}

export type { TenantPipelineConfig };
