import { Hono } from "hono";
import type pg from "pg";
import type { ControlPlaneConfig } from "../config.js";
import { registerAuthoringAdminRoutes } from "./authoring-admin-routes.js";
import type { AuthoringEnv } from "./authoring-types.js";
import { requireAuthoringAccess } from "./context.js";
import { registerDiscoveryRoutes } from "./discovery-routes.js";
import { registerOntologyRoutes } from "./ontology-routes.js";

export function registerAuthoringRoutes(
  app: Hono,
  config: ControlPlaneConfig,
  pool: pg.Pool,
): void {
  const base = "/v1/tenants/:tenantId/authoring";
  const authoring = new Hono<AuthoringEnv>();
  authoring.use("*", requireAuthoringAccess(config, pool));
  const deps = { config, pool };
  registerOntologyRoutes(authoring, deps);
  registerAuthoringAdminRoutes(authoring, deps);
  app.route(base, authoring);
  registerDiscoveryRoutes(app, config, pool);
}
