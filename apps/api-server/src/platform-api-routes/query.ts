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
        objectId: "contract",
        mode: "count",
        filters: [{ propertyId: "source_year_month", op: "eq", value: "2025-06" }],
      }),
      responses: { "200": { description: "Rows or count" } },
    },
    (service, body) => service.objectQuery(body),
  ),
];
