import type { Hono } from "hono";
import {
  honoPathFromCatalogPath,
  isV1CatalogPath,
  PLATFORM_API_CATALOG,
  PLATFORM_OPERATION_IDS,
  type PlatformOperationId,
} from "./platform-api-catalog.js";
import type { AnchorApiVariables, PlatformHandlerContext } from "./platform-api-handlers.js";

type RouteHandler = (c: PlatformHandlerContext) => Response | Promise<Response>;

export function registerPlatformApiCatalog(
  app: Hono<{ Variables: AnchorApiVariables }>,
  v1: Hono<{ Variables: AnchorApiVariables }>,
  handlers: Record<PlatformOperationId, RouteHandler>,
): void {
  for (const operationId of PLATFORM_OPERATION_IDS) {
    const spec = PLATFORM_API_CATALOG.find((route) => route.operationId === operationId);
    if (spec === undefined) {
      throw new Error(`Missing catalog entry for operation ${operationId}`);
    }

    const handler = handlers[operationId];
    const honoPath = honoPathFromCatalogPath(spec.path);
    const mount = isV1CatalogPath(spec.path) ? v1 : app;

    if (spec.method === "get") {
      mount.get(honoPath, handler);
    } else {
      mount.post(honoPath, handler);
    }
  }
}
