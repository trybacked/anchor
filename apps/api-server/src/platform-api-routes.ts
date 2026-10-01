import {
  ChunkSearchBodySchema,
  EntityProfileBodySchema,
  EntitySearchBodySchema,
  GetDefinitionBodySchema,
  GraphTraverseBodySchema,
  ObjectQueryBodySchema,
  SearchModelBodySchema,
  SemanticAskBodySchema,
  type AnchorService,
  type SemanticAskResponse,
} from "@trybacked/service";
import { documentErrorStatus } from "./platform-api-handler-utils.js";
import {
  platformRoute,
  postJsonRoute,
  postServiceJsonRoute,
  type RouteFactory,
} from "./platform-api-route-factory.js";
import {
  HTTP_OK,
  HTTP_OK_OR_UNAVAILABLE,
  jsonBody,
  type PlatformApiRouteSpec,
  V1_PATH_PREFIX,
} from "./platform-api-route-meta.js";
import {
  DocumentIdParamSchema,
  DocumentPreviewQuerySchema,
  EntityIdParamSchema,
  ListRelationsQuerySchema,
} from "./platform-api-schemas.js";
import type { PlatformHandlerContext, PlatformHandlerDeps } from "./platform-api-types.js";

export type {
  AnchorApiVariables,
  PlatformHandlerContext,
  PlatformHandlerDeps,
} from "./platform-api-types.js";

type RouteHandler = (c: PlatformHandlerContext) => Response | Promise<Response>;

export type PlatformApiRoute = PlatformApiRouteSpec & { handle: RouteHandler };

const PLATFORM_API_ROUTE_FACTORIES: RouteFactory[] = [
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
    (deps) => async (c) => {
      if (deps.platformRegistry !== undefined) {
        return c.json({
          ok: true as const,
          mode: "platform" as const,
          tenants: await deps.platformRegistry.listTenantIds(),
          cachedTenants: deps.platformRegistry.cachedTenantIds(),
        });
      }
      return c.json({
        ok: true as const,
        mode: "workspace" as const,
        capabilities: deps.getService().capabilities(),
      });
    },
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
    (deps) => async (c) => {
      if (deps.platformRegistry !== undefined) {
        return c.json({
          ok: true as const,
          mode: "platform" as const,
          tenants: await deps.platformRegistry.listTenantIds(),
        });
      }
      return c.json({
        ok: true as const,
        mode: "workspace" as const,
        capabilities: deps.getService().capabilities(),
      });
    },
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
  platformRoute(
    {
      operationId: "listEntities",
      method: "get",
      path: `${V1_PATH_PREFIX}/model/entities`,
      summary: "List ontology entities",
      tags: ["model"],
      responses: { "200": { description: "Entities" } },
    },
    () => (c) => c.json(c.get("anchorService").listEntities()),
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
      const result = c.get("anchorService").getEntity(id);
      if ("error" in result) {
        return c.json({ error: result.error }, 404);
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
      return c.json(c.get("anchorService").listRelations(entityId));
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
    async (c, { query }) => c.json(await c.get("anchorService").searchModel(query)),
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
    (c, { term }) => c.json(c.get("anchorService").getDefinition(term)),
  ),
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
  postJsonRoute(
    {
      operationId: "entitySearch",
      path: `${V1_PATH_PREFIX}/search/entities`,
      summary: "Full-text entity search",
      tags: ["entity-search"],
      jsonBody: jsonBody("EntitySearchBody", EntitySearchBodySchema, {
        query: "contract",
        kinds: ["entity"],
      }),
      responses: { "200": { description: "Matches" } },
    },
    async (c, body) => c.json(await c.get("anchorService").entitySearch(body)),
  ),
  platformRoute(
    {
      operationId: "getDocument",
      method: "get",
      path: `${V1_PATH_PREFIX}/documents/{id}`,
      summary: "Document metadata",
      tags: ["documents"],
      paramSchema: DocumentIdParamSchema,
      responses: {
        "200": { description: "Document metadata" },
        "404": { description: "Not found" },
        "503": { description: "Unavailable" },
      },
    },
    () => async (c) => {
      const { id } = DocumentIdParamSchema.parse(c.req.param());
      const result = await c.get("anchorService").getDocument(id);
      if ("error" in result) {
        return c.json({ error: result.error }, documentErrorStatus(result.error));
      }
      return c.json(result);
    },
  ),
  platformRoute(
    {
      operationId: "getDocumentPreview",
      method: "get",
      path: `${V1_PATH_PREFIX}/documents/{id}/preview`,
      summary: "PDF preview page",
      tags: ["documents"],
      paramSchema: DocumentIdParamSchema,
      querySchema: DocumentPreviewQuerySchema,
      responses: {
        "200": { description: "PDF bytes or JSON preview descriptor (Accept: application/json)" },
        "404": { description: "Not found" },
        "503": { description: "Unavailable" },
      },
    },
    () => async (c) => {
      const { id } = DocumentIdParamSchema.parse(c.req.param());
      const { page, format } = DocumentPreviewQuerySchema.parse(c.req.query());
      const accept = c.req.header("accept") ?? "";
      const wantsJson =
        format === "json" || (format !== "file" && accept.includes("application/json"));
      const service = c.get("anchorService");
      if (wantsJson) {
        const descriptor = await service.describeDocumentPreview(id, page);
        if ("error" in descriptor) {
          return c.json({ error: descriptor.error }, documentErrorStatus(descriptor.error));
        }
        return c.json(descriptor);
      }
      const range = c.req.header("range") ?? undefined;
      const preview = await service.readDocumentPreview(id, { page, range });
      if ("error" in preview) {
        return c.json({ error: preview.error }, documentErrorStatus(preview.error));
      }
      const { file } = preview;
      const headers: Record<string, string> = {
        "content-type": file.contentType,
        "content-disposition": `inline; filename="${file.filename.replaceAll('"', "")}"`,
        "x-backed-document-page": String(page),
      };
      if (file.contentLength !== undefined) {
        headers["content-length"] = String(file.contentLength);
      }
      if (file.contentRange !== undefined) {
        headers["content-range"] = file.contentRange;
      }
      if (file.acceptRanges !== undefined) {
        headers["accept-ranges"] = file.acceptRanges;
      }
      return new Response(file.data, { status: file.status, headers });
    },
  ),
  postServiceJsonRoute(
    {
      operationId: "chunkSearch",
      path: `${V1_PATH_PREFIX}/search/chunks`,
      summary: "Semantic chunk search",
      tags: ["chunk-search"],
      jsonBody: jsonBody("ChunkSearchBody", ChunkSearchBodySchema, { query: "appalto", limit: 10 }),
      responses: HTTP_OK_OR_UNAVAILABLE,
    },
    (service, body) => service.chunkSearch(body),
  ),
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
  postJsonRoute(
    {
      operationId: "semanticAsk",
      path: `${V1_PATH_PREFIX}/chat/ask`,
      summary: "Natural-language question",
      tags: ["semantic-chat"],
      jsonBody: jsonBody("SemanticAskBody", SemanticAskBodySchema, {
        question: "How many contracts in June 2025?",
        evidence: true,
      }),
      responses: {
        "200": {
          description:
            "NL answer with route (single|template), execution steps, SQL, rows/count, and provenance",
        },
        "503": { description: "Unavailable" },
      },
    },
    async (c, body) => {
      const service = c.get("anchorService") as AnchorService & {
        semanticAsk?: (body: {
          question: string;
          evidence?: boolean;
        }) => Promise<SemanticAskResponse>;
      };
      if (service.semanticAsk === undefined) {
        return c.json(
          { error: "Semantic chat is unavailable: set AI_GATEWAY_API_KEY (Vercel AI Gateway)." },
          503,
        );
      }
      const answer = await service.semanticAsk({
        question: body.question,
        ...(body.evidence !== undefined ? { evidence: body.evidence } : {}),
      });
      return c.json(answer);
    },
  ),
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
