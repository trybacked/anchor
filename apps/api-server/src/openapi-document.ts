import { zodToJsonSchema } from "zod-to-json-schema";
import {
  AUTH_SCHEME,
  PLATFORM_API_CATALOG,
  type PlatformApiRouteSpec,
} from "./platform-api-catalog.js";

const securedOperation = [{ [AUTH_SCHEME]: [] }];
const publicOperation: never[] = [];

function jsonRequestBodyFromSpec(
  spec: NonNullable<PlatformApiRouteSpec["jsonBody"]>,
): Record<string, unknown> {
  return {
    required: true,
    content: {
      "application/json": {
        schema: { $ref: `#/components/schemas/${spec.componentName}` },
        example: spec.example as Record<string, unknown>,
      },
    },
  };
}

function buildComponents(secured: boolean): Record<string, unknown> {
  const schemas = Object.fromEntries(
    PLATFORM_API_CATALOG.flatMap((route) => {
      if (route.jsonBody === undefined) {
        return [];
      }
      const body = route.jsonBody;
      return [
        [
          body.componentName,
          zodToJsonSchema(body.schema, { $refStrategy: "none", target: "openApi3" }),
        ],
      ];
    }),
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

function operationFromSpec(spec: PlatformApiRouteSpec, secured: boolean): Record<string, unknown> {
  const opSecurity =
    spec.public === true ? publicOperation : secured ? securedOperation : publicOperation;
  return {
    operationId: spec.operationId,
    summary: spec.summary,
    ...(spec.tags !== undefined ? { tags: spec.tags } : {}),
    security: opSecurity,
    ...(spec.parameters !== undefined ? { parameters: spec.parameters } : {}),
    ...(spec.jsonBody !== undefined ? { requestBody: jsonRequestBodyFromSpec(spec.jsonBody) } : {}),
    responses: spec.responses,
  };
}

export function buildOpenApiDocument(secured: boolean): Record<string, unknown> {
  const components = buildComponents(secured);
  const opSecurity = secured ? securedOperation : publicOperation;

  const paths: Record<string, Record<string, unknown>> = {};
  for (const spec of PLATFORM_API_CATALOG) {
    const operation = operationFromSpec(spec, secured);
    const existing = paths[spec.path] ?? {};
    paths[spec.path] = { ...existing, [spec.method]: operation };
  }

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
    paths,
  };
}
