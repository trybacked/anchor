import { zodToJsonSchema } from "zod-to-json-schema";
import {
  AUTH_SCHEME,
  openApiParametersForRoute,
  openApiTagsFromRoutes,
  type PlatformApiRouteSpec,
} from "./platform-api-route-meta.js";
import { platformApiRouteSpecs } from "./platform-api-routes.js";

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

function buildComponents(
  secured: boolean,
  routes: PlatformApiRouteSpec[],
): Record<string, unknown> {
  const schemas = Object.fromEntries(
    routes.flatMap((route) => {
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
  const parameters = openApiParametersForRoute(spec);
  return {
    operationId: spec.operationId,
    summary: spec.summary,
    ...(spec.tags !== undefined ? { tags: spec.tags } : {}),
    security: opSecurity,
    ...(parameters !== undefined ? { parameters } : {}),
    ...(spec.jsonBody !== undefined ? { requestBody: jsonRequestBodyFromSpec(spec.jsonBody) } : {}),
    responses: spec.responses,
  };
}

export function buildOpenApiDocument(secured: boolean): Record<string, unknown> {
  const routes = platformApiRouteSpecs();
  const components = buildComponents(secured, routes);
  const opSecurity = secured ? securedOperation : publicOperation;

  const paths: Record<string, Record<string, unknown>> = {};
  for (const spec of routes) {
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
    tags: openApiTagsFromRoutes(routes),
    ...(secured ? { components, security: opSecurity } : { components }),
    paths,
  };
}
