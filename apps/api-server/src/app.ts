import type { AnchorService } from "@trybacked/service";
import { Hono } from "hono";
import { createBearerAuthMiddleware } from "./auth.js";
import { createPlatformHandlers } from "./platform-api-handlers.js";
import { registerPlatformApiCatalog } from "./platform-api-register.js";
import { runWithRequestContext } from "./request-context.js";
import type { TenantRuntimeRegistry } from "./tenant-runtime-registry.js";
import { OntologyNotPublishedError, TenantNotFoundError } from "./tenant-runtime-registry.js";

export type CreateAnchorApiAppOptions = {
  apiToken?: string | undefined;
  platform?: { registry: TenantRuntimeRegistry } | undefined;
};

export function createAnchorApiApp(
  getService: () => AnchorService,
  options: CreateAnchorApiAppOptions = {},
): Hono<{ Variables: { anchorService: AnchorService } }> {
  const app = new Hono<{ Variables: { anchorService: AnchorService } }>();
  const auth =
    options.apiToken !== undefined ? createBearerAuthMiddleware(options.apiToken) : undefined;
  const openApiSecured = Boolean(options.apiToken);
  const platformRegistry = options.platform?.registry;

  const v1 = new Hono<{ Variables: { anchorService: AnchorService } }>();

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
      try {
        const anchorService = await platformRegistry.resolve(tenant);
        c.set("anchorService", anchorService);
        // eslint-disable-next-line @typescript-eslint/return-await -- ALS wrapper; Hono next() return type is not a Thenable
        return runWithRequestContext({ user, tenant }, () => next());
      } catch (error) {
        if (error instanceof TenantNotFoundError) {
          return c.json({ error: error.message }, 404);
        }
        if (error instanceof OntologyNotPublishedError) {
          return c.json({ error: error.message }, 503);
        }
        throw error;
      }
    });
  } else {
    v1.use("*", async (c, next) => {
      const headerUser = c.req.header("X-Backed-User")?.trim();
      const user = headerUser !== undefined && headerUser.length > 0 ? headerUser : undefined;
      c.set("anchorService", getService());
      return runWithRequestContext({ user }, () => next());
    });
  }

  registerPlatformApiCatalog(
    app,
    v1,
    createPlatformHandlers({ getService, platformRegistry, openApiSecured }),
  );

  app.route("/v1", v1);

  return app;
}
