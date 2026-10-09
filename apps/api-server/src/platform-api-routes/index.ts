import type { RouteFactory } from "../platform-api-route-factory.js";
import type { PlatformApiRouteSpec } from "../platform-api-route-meta.js";
import type { PlatformHandlerDeps, PlatformRouteHandler } from "../platform-api-types.js";
import { platformApiDiscoveryProfileRoutes } from "./discovery-profile.js";
import { platformApiDocumentRoutes } from "./documents.js";
import { platformApiFileRoutes } from "./files.js";
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
  PlatformRouteHandler,
} from "../platform-api-types.js";
export type PlatformApiRoute = PlatformApiRouteSpec & {
  handle: PlatformRouteHandler;
};
const PLATFORM_API_ROUTE_FACTORIES: RouteFactory[] = [
  ...platformApiHealthRoutes,
  ...platformApiModelRoutes,
  ...platformApiQueryRoutes,
  ...platformApiEntitySearchRoutes,
  ...platformApiDocumentRoutes,
  ...platformApiDiscoveryProfileRoutes,
  ...platformApiFileRoutes,
  ...platformApiChunkSearchRoutes,
  ...platformApiProfileGraphRoutes,
  ...platformApiSemanticChatRoutes,
];
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
