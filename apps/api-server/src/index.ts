import { serve } from "@hono/node-server";
import { createAnchorApiApp } from "./app.js";
import { createAuditLogHook } from "./audit-log.js";
import { readApiConfig } from "./config.js";
import { createWorkspaceService } from "./workspace.js";

const config = readApiConfig(process.env);

const onOperation = createAuditLogHook({
  logPath: config.auditLogPath,
  mirrorStderr: config.auditLogMirrorStderr,
});

const { root, service } = await createWorkspaceService(config.workspaceRoot, {
  auditPrincipal: config.auditPrincipalId,
  onOperation,
});

const app = createAnchorApiApp(() => service, { apiToken: config.apiToken });

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  const host = info.address === "::" ? "0.0.0.0" : info.address;
  console.error(`Anchor API listening on http://${host}:${String(info.port)} (workspace: ${root})`);
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
