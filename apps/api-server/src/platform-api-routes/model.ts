import { GetDefinitionBodySchema, SearchModelBodySchema } from "@trybacked/service";
import { getAnchorService, respondIfServiceError } from "../platform-api-handler-utils.js";
import { platformRoute, postJsonRoute, type RouteFactory } from "../platform-api-route-factory.js";
import { jsonBody, V1_PATH_PREFIX } from "../platform-api-route-meta.js";
import { EntityIdParamSchema, ListRelationsQuerySchema } from "../platform-api-schemas.js";

export const platformApiModelRoutes: RouteFactory[] = [
  platformRoute(
    {
      operationId: "listEntities",
      method: "get",
      path: `${V1_PATH_PREFIX}/model/entities`,
      summary: "List ontology entities",
      tags: ["model"],
      responses: { "200": { description: "Entities" } },
    },
    () => (c) => c.json(getAnchorService(c).listEntities()),
  ),
  platformRoute(
    {
      operationId: "getEntity",
      method: "get",
      path: `${V1_PATH_PREFIX}/model/entities/{id}`,
      summary: "Get entity by id",
      tags: ["model"],
      paramSchema: EntityIdParamSchema,
      responses: { "200": { description: "Entity" }, "404": { description: "Not found" } },
    },
    () => (c) => {
      const { id } = EntityIdParamSchema.parse(c.req.param());
      const result = getAnchorService(c).getEntity(id);
      const errorResponse = respondIfServiceError(c, result);
      if (errorResponse !== null) {
        return errorResponse;
      }
      return c.json(result);
    },
  ),
  platformRoute(
    {
      operationId: "listRelations",
      method: "get",
      path: `${V1_PATH_PREFIX}/model/relations`,
      summary: "List relations",
      tags: ["model"],
      querySchema: ListRelationsQuerySchema,
      responses: { "200": { description: "Relations" } },
    },
    () => (c) => {
      const { entityId } = ListRelationsQuerySchema.parse(c.req.query());
      return c.json(getAnchorService(c).listRelations(entityId));
    },
  ),
  postJsonRoute(
    {
      operationId: "searchModel",
      path: `${V1_PATH_PREFIX}/model/search`,
      summary: "Search model terms",
      tags: ["model"],
      jsonBody: jsonBody("SearchModelBody", SearchModelBodySchema, { query: "organization" }),
      responses: { "200": { description: "Matches" } },
    },
    async (c, { query }) => c.json(await getAnchorService(c).searchModel(query)),
  ),
  postJsonRoute(
    {
      operationId: "getDefinition",
      path: `${V1_PATH_PREFIX}/model/definitions`,
      summary: "Resolve a model definition",
      tags: ["model"],
      jsonBody: jsonBody("GetDefinitionBody", GetDefinitionBodySchema, { term: "contract" }),
      responses: { "200": { description: "Definition" } },
    },
    (c, { term }) => c.json(getAnchorService(c).getDefinition(term)),
  ),
];
