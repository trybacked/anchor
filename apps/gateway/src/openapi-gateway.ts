import { SESSION_COOKIE_NAME } from "./cookies.js";
import { tenantBasePath } from "./gateway-paths.js";
import {
  PLATFORM_PUBLIC_HEALTH_PREFIX,
  type OpenApiDocument,
  type OpenApiInfo,
} from "./openapi-types.js";

const SESSION_COOKIE_SCHEME = {
  type: "apiKey",
  in: "cookie",
  name: SESSION_COOKIE_NAME,
  description:
    "Session cookie set by signing in at /login on this host. Leave any token field empty: " +
    "the browser attaches the cookie automatically once you are signed in.",
} as const;

export type GatewayOpenApiTarget = { kind: "platform" } | { kind: "tenant"; tenantId: string };

function pathsWithoutHealth(paths: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(paths).filter(([path]) => !path.startsWith(PLATFORM_PUBLIC_HEALTH_PREFIX)),
  );
}

function tenantScopedPaths(
  paths: Record<string, unknown>,
  prefix: string,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(pathsWithoutHealth(paths)).map(([path, item]) => [
      path.startsWith(prefix) ? path : `${prefix}${path}`,
      item,
    ]),
  );
}

function cookieSecuritySchemes(
  upstream: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.keys(upstream ?? {}).map((name) => [name, SESSION_COOKIE_SCHEME]),
  );
}

function withPlatformBrowseNote(info: OpenApiInfo | undefined): OpenApiInfo {
  const note =
    "**Platform API shape (browse only).** No workspace is published yet, so paths stay " +
    "as on platform-api (`/v1/…`). Try it out against live data opens after a tenant is " +
    "provisioned at `/docs/t/{tenantId}`. Sign in at [/login](/login) before Try it out when " +
    "using tenant docs. Liveness: `GET /health` on this gateway.";
  const description = info?.description;
  return {
    ...info,
    description:
      description === undefined || description.length === 0 ? note : `${description}\n\n${note}`,
  };
}

function withTenantNote(info: OpenApiInfo | undefined, tenantId: string): OpenApiInfo {
  const note =
    `**Tenant \`${tenantId}\`.** Try it out calls \`/t/${tenantId}/v1/…\` on this gateway. ` +
    "Sign in at [/login](/login) on this host first, then send requests — no Bearer token, " +
    "the `backed_session` cookie is enough. [/logout](/logout) refreshes a stale session. " +
    `Liveness probes: \`GET /health\` on this gateway (not under \`/t/${tenantId}\`).`;
  const description = info?.description;
  return {
    ...info,
    description:
      description === undefined || description.length === 0 ? note : `${description}\n\n${note}`,
  };
}

type OpenApiComponents = NonNullable<OpenApiDocument["components"]>;

function adaptComponents(doc: OpenApiDocument): OpenApiComponents {
  return {
    ...doc.components,
    securitySchemes: cookieSecuritySchemes(doc.components?.securitySchemes),
  };
}

export function adaptOpenApiDocumentForGateway(
  doc: OpenApiDocument,
  target: GatewayOpenApiTarget,
  origin: string,
): OpenApiDocument {
  if (target.kind === "platform") {
    return {
      ...doc,
      info: withPlatformBrowseNote(doc.info),
      servers: [{ url: origin, description: "Gateway · platform browse" }],
      paths: pathsWithoutHealth(doc.paths ?? {}),
      components: adaptComponents(doc),
    };
  }

  return {
    ...doc,
    info: withTenantNote(doc.info, target.tenantId),
    servers: [{ url: origin, description: `Gateway · tenant ${target.tenantId}` }],
    paths: tenantScopedPaths(doc.paths ?? {}, tenantBasePath(target.tenantId)),
    components: adaptComponents(doc),
  };
}

export async function adaptOpenApiResponse(
  upstream: Response,
  target: GatewayOpenApiTarget,
  origin: string,
): Promise<Response> {
  if (!upstream.ok || !(upstream.headers.get("content-type") ?? "").includes("json")) {
    return upstream;
  }
  const doc = (await upstream.json()) as OpenApiDocument;
  return Response.json(adaptOpenApiDocumentForGateway(doc, target, origin));
}
