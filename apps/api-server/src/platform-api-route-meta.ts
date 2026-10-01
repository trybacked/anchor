import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const AUTH_SCHEME = "backedAuth";
export const V1_PATH_PREFIX = "/v1";

export type HttpMethod = "get" | "post";

export type JsonBodySpec<Name extends string, Schema extends z.ZodTypeAny = z.ZodTypeAny> = {
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
  responses: Record<string, { description: string }>;
  jsonBody?: JsonBodySpec<string>;
  paramSchema?: z.ZodObject<z.ZodRawShape>;
  querySchema?: z.ZodType;
};

export const HTTP_OK = { "200": { description: "OK" } } as const;
export const HTTP_OK_OR_UNAVAILABLE = {
  "200": { description: "OK" },
  "503": { description: "Unavailable" },
} as const;

export function jsonBody<Name extends string, Schema extends z.ZodTypeAny>(
  componentName: Name,
  schema: Schema,
  example: z.input<Schema>,
): JsonBodySpec<Name, Schema> {
  return { componentName, schema, example };
}

export function honoPathFromCatalogPath(catalogPath: string): string {
  const withoutV1 = catalogPath.startsWith(`${V1_PATH_PREFIX}/`)
    ? catalogPath.slice(V1_PATH_PREFIX.length)
    : catalogPath;
  return withoutV1.replace(/\{([^}]+)\}/g, ":$1");
}

export function isV1CatalogPath(path: string): boolean {
  return path.startsWith(`${V1_PATH_PREFIX}/`);
}

export function openApiParametersForRoute(
  spec: Pick<PlatformApiRouteSpec, "paramSchema" | "querySchema">,
): Array<Record<string, unknown>> | undefined {
  const parameters: Array<Record<string, unknown>> = [];

  if (spec.paramSchema !== undefined) {
    for (const name of Object.keys(spec.paramSchema.shape)) {
      parameters.push({ name, in: "path", required: true, schema: { type: "string" } });
    }
  }

  if (spec.querySchema !== undefined) {
    const querySchema = zodToJsonSchema(spec.querySchema, {
      $refStrategy: "none",
      target: "openApi3",
    }) as { properties?: Record<string, Record<string, unknown>> };
    for (const [name, schema] of Object.entries(querySchema.properties ?? {})) {
      parameters.push({ name, in: "query", schema });
    }
  }

  return parameters.length > 0 ? parameters : undefined;
}

export const OPENAPI_TAG_DESCRIPTIONS: Record<string, string> = {
  model: "Ontology entities, relations, and definitions",
  "object-query-reader": "Curated warehouse object queries",
  "entity-search": "Entity text search across the model",
  documents: "Document metadata and PDF preview",
  "chunk-search": "Semantic search over document chunks",
  "entity-profile-reader": "Enriched entity profiles",
  "graph-traverse": "Multi-hop graph traversal",
  "semantic-chat": "Natural-language answers over governed data",
};

export function openApiTagsFromRoutes(routes: PlatformApiRouteSpec[]): Array<{
  name: string;
  description: string;
}> {
  const names = [...new Set(routes.flatMap((route) => route.tags ?? []))].sort();
  return names.map((name) => ({
    name,
    description: OPENAPI_TAG_DESCRIPTIONS[name] ?? name,
  }));
}
