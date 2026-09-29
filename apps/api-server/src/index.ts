import { serve } from "@hono/node-server";
import { writeAuditJsonLine } from "@trybacked/service";
import { createAnchorApiApp } from "./app.js";
import { readApiConfig } from "./config.js";
import { createWorkspaceService } from "./workspace.js";

const config = readApiConfig(process.env);

const { root, service } = await createWorkspaceService(config.workspaceRoot, {
  auditPrincipal: config.auditPrincipalId,
  onOperation: writeAuditJsonLine,
});

const app = createAnchorApiApp(() => service, { apiToken: config.apiToken });

serve({ fetch: app.fetch, port: config.port }, () => {
  console.error(`Anchor API listening on http://127.0.0.1:${String(config.port)} (workspace: ${root})`);
  console.error("OpenAPI: /openapi.json");
});
