import {
  ChunkSearchBodySchema,
  EntityProfileBodySchema,
  EntitySearchBodySchema,
  GetDefinitionBodySchema,
  GraphTraverseBodySchema,
  ObjectQueryBodySchema,
  SearchModelBodySchema,
} from "@trybacked/service";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ZodTypeAny } from "zod";
import { z } from "zod";

const SemanticAskBodySchema = z.object({
  question: z.string().min(1),
  evidence: z.boolean().optional(),
});

type JsonSchema = Record<string, unknown>;

function schemaRef(name: string): JsonSchema {
  return { $ref: `#/components/schemas/${name}` };
}

function registerSchema(components: Record<string, JsonSchema>, name: string, schema: ZodTypeAny): void {
  components[name] = zodToJsonSchema(schema, {
    $refStrategy: "none",
    target: "openApi3",
  }) as JsonSchema;
}

function jsonRequestBody(
  schemaRefName: string,
  example: unknown,
  description?: string,
): Record<string, unknown> {
  return {
    required: true,
    description,
    content: {
      "application/json": {
        schema: schemaRef(schemaRefName),
        example,
      },
    },
  };
}

const OPENAPI_SCHEMAS: Array<{ name: string; schema: ZodTypeAny }> = [
  { name: "SearchModelBody", schema: SearchModelBodySchema },
  { name: "GetDefinitionBody", schema: GetDefinitionBodySchema },
  { name: "ObjectQueryBody", schema: ObjectQueryBodySchema },
  { name: "EntitySearchBody", schema: EntitySearchBodySchema },
  { name: "ChunkSearchBody", schema: ChunkSearchBodySchema },
  { name: "EntityProfileBody", schema: EntityProfileBodySchema },
  { name: "GraphTraverseBody", schema: GraphTraverseBodySchema },
  { name: "SemanticAskBody", schema: SemanticAskBodySchema },
];

function buildComponents(secured: boolean): Record<string, unknown> {
  const schemas: Record<string, JsonSchema> = {};
  for (const entry of OPENAPI_SCHEMAS) {
    registerSchema(schemas, entry.name, entry.schema);
  }

  const components: Record<string, unknown> = { schemas };

  if (secured) {
    components.securitySchemes = {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description:
          "Platform API token (`ANCHOR_API_TOKEN`). Used only when calling platform-api directly; " +
          "the public gateway uses a session cookie instead.",
      },
    };
  }

  return components;
}

const securedOperation = [{ bearerAuth: [] }];
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
        "HTTP API for ontology discovery, governed object queries, document archive search, and semantic chat.\n\n" +
        "**Public gateway (`api.backed.app`):** open `/docs` without signing in. To call live data, sign in at `/login` " +
        "(WorkOS). Requests go to `/t/{tenantId}/v1/…`; the browser sends the `backed_session` cookie — **not** a Bearer token.\n\n" +
        "**Try it out:** use `/docs/t/{your-tenant}` (e.g. `gerace`), log in on the same host, then send requests. " +
        "Example bodies are prefilled below each POST.",
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
            { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
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
