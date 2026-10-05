import { ObjectQueryBodySchema } from "@trybacked/service";
import { postServiceJsonRoute, type RouteFactory } from "../platform-api-route-factory.js";
import { jsonBody, V1_PATH_PREFIX } from "../platform-api-route-meta.js";
export const platformApiQueryRoutes: RouteFactory[] = [
  postServiceJsonRoute(
    {
      operationId: "objectQuery",
      path: `${V1_PATH_PREFIX}/query/objects`,
      summary: "Query curated warehouse objects",
      tags: ["object-query-reader"],
      jsonBody: jsonBody("ObjectQueryBody", ObjectQueryBodySchema, {
        objectId: "customer",
        mode: "count",
        filters: [{ propertyId: "country", op: "eq", value: "IT" }],
      }),
      responses: { "200": { description: "Rows or count" } },
    },
    (service, body) => service.objectQuery(body),
  ),
];
