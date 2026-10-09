import type { AnchorService } from "@trybacked/service";
import type { Hono } from "hono";
import { honoPathFromCatalogPath, isV1CatalogPath } from "./platform-api-route-meta.js";
import { buildPlatformApiRoutes, type PlatformApiRoute } from "./platform-api-routes/index.js";
import type {
  AnchorApiVariables,
  PlatformHandlerDeps,
  PlatformRouteHandler,
} from "./platform-api-types.js";
import { OntologyNotPublishedError, TenantNotFoundError } from "./tenant-runtime-registry.js";
function mountRoute(
  app: Hono<{
    Variables: AnchorApiVariables;
  }>,
  v1: Hono<{
    Variables: AnchorApiVariables;
  }>,
  route: PlatformApiRoute,
): void {
  const honoPath = honoPathFromCatalogPath(route.path);
  const mount = isV1CatalogPath(route.path) ? v1 : app;
  switch (route.method) {
    case "get":
      mount.get(honoPath, route.handle);
      break;
    case "post":
      mount.post(honoPath, route.handle);
      break;
    case "delete":
      mount.delete(honoPath, route.handle);
      break;
    default: {
      const exhaustive: never = route.method;
      throw new Error(`Unsupported HTTP method: ${String(exhaustive)}`);
    }
  }
}
function routeSkipsOntologyResolve(route: PlatformApiRoute): boolean {
  if (route.public !== true) {
    return false;
  }
  return route.path.startsWith("/health") || route.path === "/openapi.json";
}

function wrapRouteHandler(
  route: PlatformApiRoute,
  deps: PlatformHandlerDeps,
): PlatformRouteHandler {
  return async (c) => {
    if (!routeSkipsOntologyResolve(route)) {
    try {
      const service: AnchorService = await deps.resolveOntologyService(c.get("tenantId"));
      c.set("anchorService", service);
    } catch (error) {
      if (error instanceof TenantNotFoundError) {
        return c.json({ error: error.message }, 404);
      }
      if (error instanceof OntologyNotPublishedError) {
        return c.json({ error: error.message }, 503);
      }
      throw error;
    }
    }
    return route.handle(c);
  };
}
export function registerPlatformApiRoutes(
  app: Hono<{
    Variables: AnchorApiVariables;
  }>,
  v1: Hono<{
    Variables: AnchorApiVariables;
  }>,
  deps: PlatformHandlerDeps,
): void {
  for (const route of buildPlatformApiRoutes(deps)) {
    mountRoute(app, v1, {
      ...route,
      handle: wrapRouteHandler(route, deps),
    });
  }
}
