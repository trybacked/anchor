import type { RouteFactory } from "../platform-api-route-factory.js";
import type { PlatformApiRouteSpec } from "../platform-api-route-meta.js";
import type { PlatformHandlerContext, PlatformHandlerDeps } from "../platform-api-types.js";
import { platformApiDocumentRoutes } from "./documents.js";
import { platformApiHealthRoutes } from "./health.js";
import { platformApiModelRoutes } from "./model.js";
import { platformApiProfileGraphRoutes } from "./profile-graph.js";
import { platformApiQueryRoutes } from "./query.js";
import { platformApiChunkSearchRoutes, platformApiEntitySearchRoutes } from "./search.js";
import { platformApiSemanticChatRoutes } from "./semantic-chat.js";

export type {
  AnchorApiVariables,
  PlatformHandlerContext,
  PlatformHandlerDeps,
} from "../platform-api-types.js";

type RouteHandler = (c: PlatformHandlerContext) => Response | Promise<Response>;

export type PlatformApiRoute = PlatformApiRouteSpec & { handle: RouteHandler };

const PLATFORM_API_ROUTE_FACTORIES: RouteFactory[] = [
  ...platformApiHealthRoutes,
  ...platformApiModelRoutes,
  ...platformApiQueryRoutes,
  ...platformApiEntitySearchRoutes,
  ...platformApiDocumentRoutes,
  ...platformApiChunkSearchRoutes,
  ...platformApiProfileGraphRoutes,
  ...platformApiSemanticChatRoutes,
];

/** Route metadata shared by OpenAPI generation (no handlers). */
export function platformApiRouteSpecs(): PlatformApiRouteSpec[] {
  return PLATFORM_API_ROUTE_FACTORIES.map((factory) => factory.meta);
}

export type PlatformOperationId =
  (typeof PLATFORM_API_ROUTE_FACTORIES)[number]["meta"]["operationId"];

export function buildPlatformApiRoutes(deps: PlatformHandlerDeps): PlatformApiRoute[] {
  return PLATFORM_API_ROUTE_FACTORIES.map((factory) => ({
    ...factory.meta,
    handle: factory.createHandler(deps),
  }));
}
