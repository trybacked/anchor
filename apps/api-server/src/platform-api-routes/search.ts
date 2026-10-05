import { ChunkSearchBodySchema, EntitySearchBodySchema } from "@trybacked/service";
import { getAnchorService } from "../platform-api-handler-utils.js";
import {
  postJsonRoute,
  postServiceJsonRoute,
  type RouteFactory,
} from "../platform-api-route-factory.js";
import { HTTP_OK_OR_UNAVAILABLE, jsonBody, V1_PATH_PREFIX } from "../platform-api-route-meta.js";
export const platformApiEntitySearchRoutes: RouteFactory[] = [
  postJsonRoute(
    {
      operationId: "entitySearch",
      path: `${V1_PATH_PREFIX}/search/entities`,
      summary: "Full-text entity search",
      tags: ["entity-search"],
      jsonBody: jsonBody("EntitySearchBody", EntitySearchBodySchema, {
        query: "customer",
        kinds: ["entity"],
      }),
      responses: { "200": { description: "Matches" } },
    },
    async (c, body) => c.json(await getAnchorService(c).entitySearch(body)),
  ),
];
export const platformApiChunkSearchRoutes: RouteFactory[] = [
  postServiceJsonRoute(
    {
      operationId: "chunkSearch",
      path: `${V1_PATH_PREFIX}/search/chunks`,
      summary: "Semantic chunk search",
      tags: ["chunk-search"],
      jsonBody: jsonBody("ChunkSearchBody", ChunkSearchBodySchema, {
        query: "termination clause",
        limit: 10,
      }),
      responses: HTTP_OK_OR_UNAVAILABLE,
    },
    (service, body) => service.chunkSearch(body),
  ),
];
