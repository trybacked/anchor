import {
  ChunkSearchBodySchema,
  EntityProfileBodySchema,
  EntitySearchBodySchema,
  GetDefinitionBodySchema,
  GraphTraverseBodySchema,
  ObjectQueryBodySchema,
  SearchModelBodySchema,
  SemanticAskBodySchema,
} from "@trybacked/service";
import type { z } from "zod";
import {
  DocumentIdParamSchema,
  DocumentPreviewQuerySchema,
  EntityIdParamSchema,
  ListRelationsQuerySchema,
} from "./platform-api-schemas.js";

export const AUTH_SCHEME = "backedAuth";

export type HttpMethod = "get" | "post";

type JsonBodySpec<Name extends string, Schema extends z.ZodType> = {
  componentName: Name;
  schema: Schema;
  example: z.input<Schema>;
};

export type PlatformApiRouteSpec = {
  operationId: string;
  method: HttpMethod;
  /** Public URL path (OpenAPI syntax, e.g. `/v1/model/entities/{id}`). */
  path: string;
  summary: string;
  tags?: string[];
  public?: boolean;
  parameters?: Array<Record<string, unknown>>;
  responses: Record<string, { description: string }>;
  jsonBody?: JsonBodySpec<string, z.ZodType>;
  paramSchema?: z.ZodObject<z.ZodRawShape>;
  querySchema?: z.ZodType;
};

/** Single catalog for Hono registration and OpenAPI generation — paths must not drift. */
export const PLATFORM_API_CATALOG = [
  {
    operationId: "healthLive",
    method: "get",
    path: "/health/live",
    summary: "Liveness probe",
    public: true,
    responses: { "200": { description: "OK" } },
  },
  {
    operationId: "health",
    method: "get",
    path: "/health",
    summary: "Gateway / platform liveness",
    public: true,
    responses: { "200": { description: "OK" } },
  },
  {
    operationId: "healthReady",
    method: "get",
    path: "/health/ready",
    summary: "Readiness probe with tenant or capability snapshot",
    public: true,
    responses: { "200": { description: "OK" } },
  },
  {
    operationId: "openApi",
    method: "get",
    path: "/openapi.json",
    summary: "OpenAPI document",
    public: true,
    responses: { "200": { description: "OpenAPI document" } },
  },
  {
    operationId: "listEntities",
    method: "get",
    path: "/v1/model/entities",
    summary: "List ontology entities",
    tags: ["model"],
    responses: { "200": { description: "Entities" } },
  },
  {
    operationId: "getEntity",
    method: "get",
    path: "/v1/model/entities/{id}",
    summary: "Get entity by id",
    tags: ["model"],
    paramSchema: EntityIdParamSchema,
    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
    responses: { "200": { description: "Entity" }, "404": { description: "Not found" } },
  },
  {
    operationId: "listRelations",
    method: "get",
    path: "/v1/model/relations",
    summary: "List relations",
    tags: ["model"],
    querySchema: ListRelationsQuerySchema,
    parameters: [
      {
        name: "entityId",
        in: "query",
        required: false,
        schema: { type: "string" },
        description: "Filter relations to those touching this entity id",
      },
    ],
    responses: { "200": { description: "Relations" } },
  },
  {
    operationId: "searchModel",
    method: "post",
    path: "/v1/model/search",
    summary: "Search model terms",
    tags: ["model"],
    jsonBody: {
      componentName: "SearchModelBody",
      schema: SearchModelBodySchema,
      example: { query: "organization" },
    },
    responses: { "200": { description: "Matches" } },
  },
  {
    operationId: "getDefinition",
    method: "post",
    path: "/v1/model/definitions",
    summary: "Resolve a model definition",
    tags: ["model"],
    jsonBody: {
      componentName: "GetDefinitionBody",
      schema: GetDefinitionBodySchema,
      example: { term: "contract" },
    },
    responses: { "200": { description: "Definition" } },
  },
  {
    operationId: "objectQuery",
    method: "post",
    path: "/v1/query/objects",
    summary: "Query curated warehouse objects",
    tags: ["object-query-reader"],
    jsonBody: {
      componentName: "ObjectQueryBody",
      schema: ObjectQueryBodySchema,
      example: {
        objectId: "contract",
        mode: "count",
        filters: [{ propertyId: "source_year_month", op: "eq", value: "2025-06" }],
      },
    },
    responses: { "200": { description: "Rows or count" } },
  },
  {
    operationId: "entitySearch",
    method: "post",
    path: "/v1/search/entities",
    summary: "Full-text entity search",
    tags: ["entity-search"],
    jsonBody: {
      componentName: "EntitySearchBody",
      schema: EntitySearchBodySchema,
      example: { query: "contract", kinds: ["entity"] },
    },
    responses: { "200": { description: "Matches" } },
  },
  {
    operationId: "getDocument",
    method: "get",
    path: "/v1/documents/{id}",
    summary: "Document metadata",
    tags: ["documents"],
    paramSchema: DocumentIdParamSchema,
    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
    responses: {
      "200": { description: "Document metadata" },
      "404": { description: "Not found" },
      "503": { description: "Unavailable" },
    },
  },
  {
    operationId: "getDocumentPreview",
    method: "get",
    path: "/v1/documents/{id}/preview",
    summary: "PDF preview page",
    tags: ["documents"],
    paramSchema: DocumentIdParamSchema,
    querySchema: DocumentPreviewQuerySchema,
    parameters: [
      { name: "id", in: "path", required: true, schema: { type: "string" } },
      { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
      { name: "format", in: "query", schema: { enum: ["json", "file"] } },
    ],
    responses: {
      "200": { description: "PDF bytes or JSON preview descriptor (Accept: application/json)" },
      "404": { description: "Not found" },
      "503": { description: "Unavailable" },
    },
  },
  {
    operationId: "chunkSearch",
    method: "post",
    path: "/v1/search/chunks",
    summary: "Semantic chunk search",
    tags: ["chunk-search"],
    jsonBody: {
      componentName: "ChunkSearchBody",
      schema: ChunkSearchBodySchema,
      example: { query: "appalto", limit: 10 },
    },
    responses: { "200": { description: "Matching chunks" }, "503": { description: "Unavailable" } },
  },
  {
    operationId: "entityProfile",
    method: "post",
    path: "/v1/profile/entities",
    summary: "Entity profile with facts and documents",
    tags: ["entity-profile-reader"],
    jsonBody: {
      componentName: "EntityProfileBody",
      schema: EntityProfileBodySchema,
      example: { name: "Comune di Gerace", matchLimit: 3 },
    },
    responses: { "200": { description: "Profile" }, "503": { description: "Unavailable" } },
  },
  {
    operationId: "graphTraverse",
    method: "post",
    path: "/v1/graph/traverse",
    summary: "Multi-hop graph traversal",
    tags: ["graph-traverse"],
    jsonBody: {
      componentName: "GraphTraverseBody",
      schema: GraphTraverseBodySchema,
      example: {
        relationId: "contract_awarded_to_organization",
        value: "01234567890",
        depth: 1,
        limit: 20,
        mode: "rows",
      },
    },
    responses: { "200": { description: "Joined rows" }, "503": { description: "Unavailable" } },
  },
  {
    operationId: "semanticAsk",
    method: "post",
    path: "/v1/chat/ask",
    summary: "Natural-language question",
    tags: ["semantic-chat"],
    jsonBody: {
      componentName: "SemanticAskBody",
      schema: SemanticAskBodySchema,
      example: { question: "Quanti contratti a giugno 2025?", evidence: true },
    },
    responses: {
      "200": {
        description:
          "NL answer with route (single|template), execution steps, SQL, rows/count, and provenance",
      },
      "503": { description: "Unavailable" },
    },
  },
] satisfies PlatformApiRouteSpec[];

export const PLATFORM_OPERATION_IDS = [
  "healthLive",
  "health",
  "healthReady",
  "openApi",
  "listEntities",
  "getEntity",
  "listRelations",
  "searchModel",
  "getDefinition",
  "objectQuery",
  "entitySearch",
  "getDocument",
  "getDocumentPreview",
  "chunkSearch",
  "entityProfile",
  "graphTraverse",
  "semanticAsk",
] as const;

export type PlatformOperationId = (typeof PLATFORM_OPERATION_IDS)[number];

export function honoPathFromCatalogPath(catalogPath: string): string {
  const withoutV1 = catalogPath.startsWith("/v1/") ? catalogPath.slice("/v1".length) : catalogPath;
  return withoutV1.replace(/\{([^}]+)\}/g, ":$1");
}

export function isV1CatalogPath(path: string): boolean {
  return path.startsWith("/v1/");
}
