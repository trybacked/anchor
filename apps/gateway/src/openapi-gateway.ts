import { SESSION_COOKIE_NAME } from "./session.js";

/** OpenAPI 3 resolves absolute paths against the server URL root, dropping `/t/{tenant}`. Prefix paths for gateway Try it out. */

type OpenApiDoc = {
  paths?: Record<string, unknown>;
  servers?: Array<{ url: string; description?: string }>;
  info?: { description?: string };
  components?: Record<string, unknown>;
  security?: Array<Record<string, unknown>>;
};

export const GATEWAY_OPENAPI_SESSION_SCHEME = "backedSession";

function replaceSecurityRequirement(
  requirement: unknown,
): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(requirement)) {
    return undefined;
  }
  if (requirement.length === 0) {
    return [];
  }
  return [{ [GATEWAY_OPENAPI_SESSION_SCHEME]: [] }];
}

function adaptPathItemSecurity(pathItem: unknown): unknown {
  if (pathItem === null || typeof pathItem !== "object") {
    return pathItem;
  }
  const record = pathItem as Record<string, unknown>;
  const methods = ["get", "post", "put", "patch", "delete", "options", "head"] as const;
  const next: Record<string, unknown> = { ...record };
  for (const method of methods) {
    const operation = record[method];
    if (operation === null || typeof operation !== "object") {
      continue;
    }
    const op = operation as Record<string, unknown>;
    if ("security" in op) {
      next[method] = {
        ...op,
        security: replaceSecurityRequirement(op.security),
      };
    }
  }
  return next;
}

function adaptSecurityForGateway(doc: OpenApiDoc): OpenApiDoc {
  const components = { ...(doc.components ?? {}) };
  const securitySchemes = {
    [GATEWAY_OPENAPI_SESSION_SCHEME]: {
      type: "apiKey",
      in: "cookie",
      name: SESSION_COOKIE_NAME,
      description:
        "Session cookie set after sign-in at /login on this host. Leave Bearer empty in Try it out — the browser sends the cookie automatically when you are logged in.",
    },
  };
  components.securitySchemes = securitySchemes;

  const paths = doc.paths ?? {};
  const adaptedPaths: Record<string, unknown> = {};
  for (const [key, pathItem] of Object.entries(paths)) {
    adaptedPaths[key] = adaptPathItemSecurity(pathItem);
  }

  return {
    ...doc,
    components,
    security: [{ [GATEWAY_OPENAPI_SESSION_SCHEME]: [] }],
    paths: adaptedPaths,
  };
}

export function adaptOpenApiDocumentForGateway(
  doc: OpenApiDoc,
  tenantId: string,
  origin: string,
): OpenApiDoc {
  const withSecurity = adaptSecurityForGateway(doc);
  const prefix = `/t/${tenantId}`;
  const paths = withSecurity.paths ?? {};
  const rewritten: Record<string, unknown> = {};

  for (const [pathKey, pathItem] of Object.entries(paths)) {
    if (pathKey.startsWith(`${prefix}/`) || pathKey === prefix) {
      rewritten[pathKey] = pathItem;
      continue;
    }
    if (pathKey.startsWith("/")) {
      rewritten[`${prefix}${pathKey}`] = pathItem;
      continue;
    }
    rewritten[pathKey] = pathItem;
  }

  const gatewayNote =
    `**Tenant \`${tenantId}\`.** Try it out calls \`/t/${tenantId}/v1/…\` on this gateway. ` +
    "1) Open [/login](/login) on the same host and sign in. " +
    "2) Expand a POST endpoint — the JSON body is prefilled. " +
    "3) Execute — no Bearer token; the `backed_session` cookie is enough.";

  const description = withSecurity.info?.description;
  const info =
    withSecurity.info === undefined
      ? { description: gatewayNote }
      : {
          ...withSecurity.info,
          description:
            description === undefined || description.length === 0
              ? gatewayNote
              : `${description}\n\n${gatewayNote}`,
        };

  return {
    ...withSecurity,
    info,
    servers: [{ url: origin.replace(/\/$/, ""), description: `Gateway · tenant ${tenantId}` }],
    paths: rewritten,
  };
}

export async function readJsonResponse(response: Response): Promise<OpenApiDoc> {
  const text = await response.text();
  return JSON.parse(text) as OpenApiDoc;
}

export async function forwardGatewayOpenApi(
  forward: () => Promise<Response>,
  tenantId: string,
  requestUrl: string,
): Promise<Response> {
  const upstream = await forward();
  if (!upstream.ok) {
    return upstream;
  }
  const contentType = upstream.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) {
    return upstream;
  }
  const origin = new URL(requestUrl).origin;
  const doc = await readJsonResponse(upstream);
  const adapted = adaptOpenApiDocumentForGateway(doc, tenantId, origin);
  return Response.json(adapted);
}
