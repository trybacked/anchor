import type { AnchorService } from "@trybacked/service";
import { Hono } from "hono";
import { createBearerAuthMiddleware } from "./auth.js";
import { buildOpenApiDocument } from "./openapi-document.js";
import { registerPlatformApiRoutes } from "./platform-api-register.js";
import type { AnchorApiVariables } from "./platform-api-types.js";
import { withRequestContext } from "./request-context.js";
import type { TenantRuntimeRegistry } from "./tenant-runtime-registry.js";
export type CreateAnchorApiAppOptions = {
  apiToken?: string | undefined;
  platform?:
    | {
        registry: TenantRuntimeRegistry;
      }
    | undefined;
};
export function createAnchorApiApp(
  getService: () => AnchorService,
  options: CreateAnchorApiAppOptions = {},
): Hono<{
  Variables: AnchorApiVariables;
}> {
  const app = new Hono<{
    Variables: AnchorApiVariables;
  }>();
  const auth =
    options.apiToken !== undefined ? createBearerAuthMiddleware(options.apiToken) : undefined;
  const openApiSecured = Boolean(options.apiToken);
  const platformRegistry = options.platform?.registry;
  const v1 = new Hono<{
    Variables: AnchorApiVariables;
  }>();
  if (auth !== undefined) {
    v1.use("*", auth);
  }
  if (platformRegistry !== undefined) {
    v1.use("*", async (c, next) => {
      const headerUser = c.req.header("X-Backed-User")?.trim();
      const user = headerUser !== undefined && headerUser.length > 0 ? headerUser : undefined;
      const tenant = c.req.header("X-Backed-Tenant")?.trim();
      if (tenant === undefined || tenant.length === 0) {
        return c.json({ error: "Missing X-Backed-Tenant header" }, 400);
      }
      c.set("tenantId", tenant);
      await withRequestContext({ user, tenant }, () => next());
      return;
    });
  } else {
    v1.use("*", async (c, next) => {
      const headerUser = c.req.header("X-Backed-User")?.trim();
      const user = headerUser !== undefined && headerUser.length > 0 ? headerUser : undefined;
      c.set("tenantId", "workspace");
      c.set("anchorService", getService());
      await withRequestContext({ user }, () => next());
      return;
    });
  }
  registerPlatformApiRoutes(app, v1, {
    getService,
    platformRegistry,
    serveOpenApiDocument: () => buildOpenApiDocument(openApiSecured),
    resolveOntologyService: async (tenantId) => {
      if (platformRegistry !== undefined) {
        return await platformRegistry.resolve(tenantId);
      }
      return getService();
    },
    resolveFilesService: async (tenantId) => {
      if (platformRegistry === undefined) {
        throw new Error("Platform registry required for file operations");
      }
      return await platformRegistry.resolveFiles(tenantId);
    },
  });
  app.route("/v1", v1);
  return app;
}
