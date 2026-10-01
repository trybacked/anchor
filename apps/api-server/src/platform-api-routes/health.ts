import { platformRoute, type RouteFactory } from "../platform-api-route-factory.js";
import { HTTP_OK } from "../platform-api-route-meta.js";
import { buildPlatformHealthSnapshot } from "./health-snapshot.js";

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
    (deps) => async (c) =>
      c.json(await buildPlatformHealthSnapshot(deps, { includeCachedTenants: true })),
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
    (deps) => async (c) =>
      c.json(await buildPlatformHealthSnapshot(deps, { includeCachedTenants: false })),
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
