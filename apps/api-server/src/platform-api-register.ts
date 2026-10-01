import type { Hono } from "hono";
import { honoPathFromCatalogPath, isV1CatalogPath } from "./platform-api-route-meta.js";
import {
  buildPlatformApiRoutes,
  type AnchorApiVariables,
  type PlatformApiRoute,
  type PlatformHandlerDeps,
} from "./platform-api-routes.js";

function mountRoute(
  app: Hono<{ Variables: AnchorApiVariables }>,
  v1: Hono<{ Variables: AnchorApiVariables }>,
  route: PlatformApiRoute,
): void {
  const honoPath = honoPathFromCatalogPath(route.path);
  const mount = isV1CatalogPath(route.path) ? v1 : app;
  if (route.method === "get") {
    mount.get(honoPath, route.handle);
  } else {
    mount.post(honoPath, route.handle);
  }
}

export function registerPlatformApiRoutes(
  app: Hono<{ Variables: AnchorApiVariables }>,
  v1: Hono<{ Variables: AnchorApiVariables }>,
  deps: PlatformHandlerDeps,
): void {
  for (const route of buildPlatformApiRoutes(deps)) {
    mountRoute(app, v1, route);
  }
}
