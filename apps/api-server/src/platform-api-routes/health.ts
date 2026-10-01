import { platformRoute, type RouteFactory } from "../platform-api-route-factory.js";
import { HTTP_OK } from "../platform-api-route-meta.js";

export const platformApiHealthRoutes: RouteFactory[] = [
  platformRoute(
    {
      operationId: "healthLive",
      method: "get",
      path: "/health/live",
      summary: "Liveness probe",
      public: true,
      responses: HTTP_OK,
    },
    () => (c) => c.json({ ok: true as const }),
  ),
  platformRoute(
    {
      operationId: "health",
      method: "get",
      path: "/health",
      summary: "Gateway / platform liveness",
      public: true,
      responses: HTTP_OK,
    },
    (deps) => async (c) => {
      if (deps.platformRegistry !== undefined) {
        return c.json({
          ok: true as const,
          mode: "platform" as const,
          tenants: await deps.platformRegistry.listTenantIds(),
          cachedTenants: deps.platformRegistry.cachedTenantIds(),
        });
      }
      return c.json({
        ok: true as const,
        mode: "workspace" as const,
        capabilities: deps.getService().capabilities(),
      });
    },
  ),
  platformRoute(
    {
      operationId: "healthReady",
      method: "get",
      path: "/health/ready",
      summary: "Readiness probe with tenant or capability snapshot",
      public: true,
      responses: HTTP_OK,
    },
    (deps) => async (c) => {
      if (deps.platformRegistry !== undefined) {
        return c.json({
          ok: true as const,
          mode: "platform" as const,
          tenants: await deps.platformRegistry.listTenantIds(),
        });
      }
      return c.json({
        ok: true as const,
        mode: "workspace" as const,
        capabilities: deps.getService().capabilities(),
      });
    },
  ),
  platformRoute(
    {
      operationId: "openApi",
      method: "get",
      path: "/openapi.json",
      summary: "OpenAPI document",
      public: true,
      responses: { "200": { description: "OpenAPI document" } },
    },
    (deps) => (c) => c.json(deps.serveOpenApiDocument()),
  ),
];
