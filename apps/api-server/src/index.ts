import { serve } from "@hono/node-server";
import { createRegistrySourceFromEnv } from "@trybacked/core";
import { databricksConfigFromEnv, hasDatabricksEnv } from "@trybacked/provider-databricks";
import { createAnchorApiApp } from "./app.js";
import { createAuditLogHook } from "./audit-log.js";
import { readApiConfig } from "./config.js";
import { createTenantRuntimeRegistry } from "./tenant-runtime-registry.js";
import { createWorkspaceService } from "./workspace.js";

const config = readApiConfig(process.env);

const onOperation = createAuditLogHook({
  logPath: config.auditLogPath,
  mirrorStderr: config.auditLogMirrorStderr,
});

let app;
let workspaceRoot: string | undefined;

if (config.platformMode) {
  if (!hasDatabricksEnv(process.env)) {
    throw new Error("Platform mode requires BACKED_DATABRICKS_HOST, TOKEN, and WAREHOUSE_ID.");
  }
  const databricksConfig = databricksConfigFromEnv(process.env);
  const registrySource = createRegistrySourceFromEnv({
    ...process.env,
    ...(config.tenantsRegistryPath !== undefined
      ? { ANCHOR_TENANTS_REGISTRY: config.tenantsRegistryPath }
      : {}),
  });
  const registry = createTenantRuntimeRegistry({
    registrySource,
    databricksConfig,
    env: process.env,
    cacheTtlSeconds: config.tenantCacheTtlSeconds,
    maxUploadBytes: config.maxUploadBytes,
    audit: { onOperation, auditPrincipal: config.auditPrincipalId },
  });
  app = createAnchorApiApp(
    () => {
      throw new Error("Platform mode resolves services per request.");
    },
    {
      apiToken: config.apiToken,
      platform: { registry },
    },
  );
} else {
  const workspace = await createWorkspaceService(config.workspaceRoot, {
    auditPrincipal: config.auditPrincipalId,
    onOperation,
  });
  workspaceRoot = workspace.root;
  app = createAnchorApiApp(() => workspace.service, { apiToken: config.apiToken });
}

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  const host = info.address === "::" ? "0.0.0.0" : info.address;
  const mode = config.platformMode ? "platform" : "workspace";
  console.error(
    `Anchor API listening on http://${host}:${String(info.port)} (mode: ${mode}${workspaceRoot !== undefined ? `, workspace: ${workspaceRoot}` : ""})`,
  );
  console.error("Health: /health/live · /health/ready · OpenAPI: /openapi.json");
  if (config.auditLogPath !== undefined) {
    console.error(`Audit log: ${config.auditLogPath}`);
  }
});

function shutdown(signal: string): void {
  console.error(`Anchor API received ${signal}, shutting down`);
  server.close((error) => {
    if (error !== undefined) {
      console.error(error);
      process.exit(1);
    } else {
      process.exit(0);
    }
  });
}

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  shutdown("SIGINT");
});
