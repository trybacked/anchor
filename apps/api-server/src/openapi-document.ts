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
import { zodToJsonSchema } from "zod-to-json-schema";

/**
 * Security scheme name is deliberately transport-neutral: the gateway serves this same document
 * with the scheme redefined as a session cookie, keeping every operation requirement unchanged.
 */
const AUTH_SCHEME = "backedAuth";

/** Request body components, keyed by the name used in `$ref`. */
const BODY_SCHEMAS = {
  SearchModelBody: SearchModelBodySchema,
  GetDefinitionBody: GetDefinitionBodySchema,
  ObjectQueryBody: ObjectQueryBodySchema,
  EntitySearchBody: EntitySearchBodySchema,
  ChunkSearchBody: ChunkSearchBodySchema,
  EntityProfileBody: EntityProfileBodySchema,
  GraphTraverseBody: GraphTraverseBodySchema,
  SemanticAskBody: SemanticAskBodySchema,
} satisfies Record<string, z.ZodType>;

type BodySchemaName = keyof typeof BODY_SCHEMAS;

function jsonRequestBody<Name extends BodySchemaName>(
  name: Name,
  example: z.input<(typeof BODY_SCHEMAS)[Name]>,
): Record<string, unknown> {
  return {
    required: true,
    content: {
      "application/json": {
        schema: { $ref: `#/components/schemas/${name}` },
        example,
      },
    },
  };
}

function buildComponents(secured: boolean): Record<string, unknown> {
  const schemas = Object.fromEntries(
    Object.entries(BODY_SCHEMAS).map(([name, schema]) => [
      name,
      zodToJsonSchema(schema, { $refStrategy: "none", target: "openApi3" }),
    ]),
  );

  if (!secured) {
    return { schemas };
  }

  return {
    schemas,
    securitySchemes: {
      [AUTH_SCHEME]: {
        type: "http",
        scheme: "bearer",
        description:
          "Platform API token (`ANCHOR_API_TOKEN`). Used only when calling platform-api directly; " +
          "the public gateway redefines this scheme as a session cookie.",
      },
    },
  };
}

const securedOperation = [{ [AUTH_SCHEME]: [] }];
const publicOperation: never[] = [];

export function buildOpenApiDocument(secured: boolean): Record<string, unknown> {
  const components = buildComponents(secured);
  const opSecurity = secured ? securedOperation : publicOperation;

  return {
    openapi: "3.1.0",
    info: {
      title: "Backed Platform API",
      version: "0.1.0",
      description:
        "HTTP API for ontology discovery, governed object queries, document archive search, and semantic chat. " +
        "Every POST documents its JSON body with a prefilled example. " +
        "Requests carry a tenant: direct platform calls send `X-Backed-Tenant`, " +
        "while the public gateway derives it from the request path and injects it for you.",
    },
    tags: [
      { name: "model", description: "Ontology entities, relations, and definitions" },
      { name: "object-query-reader", description: "Curated warehouse object queries" },
      { name: "entity-search", description: "Entity text search across the model" },
      { name: "documents", description: "Document metadata and PDF preview" },
      { name: "chunk-search", description: "Semantic search over document chunks" },
      { name: "entity-profile-reader", description: "Enriched entity profiles" },
      { name: "graph-traverse", description: "Multi-hop graph traversal" },
      { name: "semantic-chat", description: "Natural-language answers over governed data" },
    ],
    ...(secured ? { components, security: opSecurity } : { components }),
    paths: {
      "/health": {
        get: {
          operationId: "health",
          summary: "Gateway / platform liveness",
          security: publicOperation,
          responses: { "200": { description: "OK" } },
        },
      },
      "/health/live": {
        get: {
          operationId: "healthLive",
          summary: "Liveness probe",
          security: publicOperation,
          responses: { "200": { description: "OK" } },
        },
      },
      "/health/ready": {
        get: {
          operationId: "healthReady",
          summary: "Readiness probe with tenant or capability snapshot",
          security: publicOperation,
          responses: { "200": { description: "OK" } },
        },
      },
      "/openapi.json": {
        get: {
          operationId: "openApi",
          summary: "OpenAPI document",
          security: publicOperation,
          responses: { "200": { description: "OpenAPI document" } },
        },
      },
      "/v1/model/entities": {
        get: {
          operationId: "listEntities",
          summary: "List ontology entities",
          tags: ["model"],
          security: opSecurity,
          responses: { "200": { description: "Entities" } },
        },
      },
      "/v1/model/entities/{id}": {
        get: {
          operationId: "getEntity",
          summary: "Get entity by id",
          tags: ["model"],
          security: opSecurity,
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Entity" }, "404": { description: "Not found" } },
        },
      },
      "/v1/model/relations": {
        get: {
          operationId: "listRelations",
          summary: "List relations",
          tags: ["model"],
          security: opSecurity,
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
      },
      "/v1/model/search": {
        post: {
          operationId: "searchModel",
          summary: "Search model terms",
          tags: ["model"],
          security: opSecurity,
          requestBody: jsonRequestBody("SearchModelBody", { query: "organization" }),
          responses: { "200": { description: "Matches" } },
        },
      },
      "/v1/model/definitions": {
        post: {
          operationId: "getDefinition",
          summary: "Resolve a model definition",
          tags: ["model"],
          security: opSecurity,
          requestBody: jsonRequestBody("GetDefinitionBody", { term: "contract" }),
          responses: { "200": { description: "Definition" } },
        },
      },
      "/v1/query/objects": {
        post: {
          operationId: "objectQuery",
          summary: "Query curated warehouse objects",
          tags: ["object-query-reader"],
          security: opSecurity,
          requestBody: jsonRequestBody("ObjectQueryBody", {
            objectId: "contract",
            mode: "count",
            filters: [{ propertyId: "source_year_month", op: "eq", value: "2025-06" }],
          }),
          responses: { "200": { description: "Rows or count" } },
        },
      },
      "/v1/search/entities": {
        post: {
          operationId: "entitySearch",
          summary: "Full-text entity search",
          tags: ["entity-search"],
          security: opSecurity,
          requestBody: jsonRequestBody("EntitySearchBody", {
            query: "contract",
            kinds: ["entity"],
          }),
          responses: { "200": { description: "Matches" } },
        },
      },
      "/v1/documents/{id}": {
        get: {
          operationId: "getDocument",
          summary: "Document metadata",
          tags: ["documents"],
          security: opSecurity,
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Document metadata" },
            "404": { description: "Not found" },
            "503": { description: "Unavailable" },
          },
        },
      },
      "/v1/documents/{id}/preview": {
        get: {
          operationId: "getDocumentPreview",
          summary: "PDF preview page",
          tags: ["documents"],
          security: opSecurity,
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
            { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
            { name: "format", in: "query", schema: { enum: ["json", "file"] } },
          ],
          responses: {
            "200": {
              description: "PDF bytes or JSON preview descriptor (Accept: application/json)",
            },
            "404": { description: "Not found" },
            "503": { description: "Unavailable" },
          },
        },
      },
      "/v1/search/chunks": {
        post: {
          operationId: "chunkSearch",
          summary: "Semantic chunk search",
          tags: ["chunk-search"],
          security: opSecurity,
          requestBody: jsonRequestBody("ChunkSearchBody", {
            query: "appalto",
            limit: 10,
          }),
          responses: {
            "200": { description: "Matching chunks" },
            "503": { description: "Unavailable" },
          },
        },
      },
      "/v1/profile/entities": {
        post: {
          operationId: "entityProfile",
          summary: "Entity profile with facts and documents",
          tags: ["entity-profile-reader"],
          security: opSecurity,
          requestBody: jsonRequestBody("EntityProfileBody", {
            name: "Comune di Gerace",
            matchLimit: 3,
          }),
          responses: { "200": { description: "Profile" }, "503": { description: "Unavailable" } },
        },
      },
      "/v1/graph/traverse": {
        post: {
          operationId: "graphTraverse",
          summary: "Multi-hop graph traversal",
          tags: ["graph-traverse"],
          security: opSecurity,
          requestBody: jsonRequestBody("GraphTraverseBody", {
            relationId: "contract_awarded_to_organization",
            value: "01234567890",
            depth: 1,
            limit: 20,
            mode: "rows",
          }),
          responses: {
            "200": { description: "Joined rows" },
            "503": { description: "Unavailable" },
          },
        },
      },
      "/v1/chat/ask": {
        post: {
          operationId: "semanticAsk",
          summary: "Natural-language question",
          tags: ["semantic-chat"],
          security: opSecurity,
          requestBody: jsonRequestBody("SemanticAskBody", {
            question: "Quanti contratti a giugno 2025?",
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
      },
    },
  };
}
