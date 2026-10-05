import { EntityProfileBodySchema, GraphTraverseBodySchema } from "@trybacked/service";
import { postServiceJsonRoute, type RouteFactory } from "../platform-api-route-factory.js";
import { HTTP_OK_OR_UNAVAILABLE, jsonBody, V1_PATH_PREFIX } from "../platform-api-route-meta.js";
export const platformApiProfileGraphRoutes: RouteFactory[] = [
  postServiceJsonRoute(
    {
      operationId: "entityProfile",
      path: `${V1_PATH_PREFIX}/profile/entities`,
      summary: "Entity profile with facts and documents",
      tags: ["entity-profile-reader"],
      jsonBody: jsonBody("EntityProfileBody", EntityProfileBodySchema, {
        name: "Example organization",
        matchLimit: 3,
      }),
      responses: HTTP_OK_OR_UNAVAILABLE,
    },
    (service, body) => service.entityProfile(body),
  ),
  postServiceJsonRoute(
    {
      operationId: "graphTraverse",
      path: `${V1_PATH_PREFIX}/graph/traverse`,
      summary: "Multi-hop graph traversal",
      tags: ["graph-traverse"],
      jsonBody: jsonBody("GraphTraverseBody", GraphTraverseBodySchema, {
        relationId: "contract_awarded_to_organization",
        value: "01234567890",
        depth: 1,
        limit: 20,
        mode: "rows",
      }),
      responses: HTTP_OK_OR_UNAVAILABLE,
    },
    (service, body) => service.graphTraverse(body),
  ),
];
