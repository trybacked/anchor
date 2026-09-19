import { listTenantOpenApiRoutes } from "./router.js";

export interface DocumentedHttpRoute {
  method: string;
  path: string;
}

const INFRA_HTTP_ROUTES: DocumentedHttpRoute[] = [
  { method: "GET", path: "/health" },
  { method: "GET", path: "/openapi.yaml" },
];

/** Public routes that must appear in `openapi.yaml` (tenant table is the source of truth). */
export const DOCUMENTED_HTTP_ROUTES: DocumentedHttpRoute[] = [
  ...INFRA_HTTP_ROUTES,
  ...listTenantOpenApiRoutes(),
];
