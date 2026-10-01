import { SESSION_COOKIE_NAME } from "./cookies.js";

/**
 * The gateway serves the platform's own OpenAPI document, adapted for browser use:
 * paths gain the `/t/{tenantId}` prefix the proxy requires (OpenAPI resolves absolute paths
 * against the server root, which would drop it), and the shared security scheme is redefined
 * as a session cookie. Operation-level requirements reference the scheme by name, so renaming
 * nothing keeps them valid.
 */

type OpenApiInfo = Record<string, unknown> & { description?: string };

type OpenApiDoc = {
  paths?: Record<string, unknown>;
  servers?: Array<{ url: string; description?: string }>;
  info?: OpenApiInfo;
  components?: Record<string, unknown> & { securitySchemes?: Record<string, unknown> };
};

const SESSION_COOKIE_SCHEME = {
  type: "apiKey",
  in: "cookie",
  name: SESSION_COOKIE_NAME,
  description:
    "Session cookie set by signing in at /login on this host. Leave any token field empty: " +
    "the browser attaches the cookie automatically once you are signed in.",
} as const;

/**
 * The gateway document describes tenant-scoped operations only. Liveness probes are not
 * tenant-scoped — the gateway serves its own at /health, and the proxy would answer 401 for
 * paths the platform document declares public.
 */
function tenantScopedPaths(
  paths: Record<string, unknown>,
  prefix: string,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(paths)
      .filter(([path]) => !path.startsWith("/health"))
      .map(([path, item]) => [path.startsWith(prefix) ? path : `${prefix}${path}`, item]),
  );
}

/** Redefines every declared scheme as the session cookie, leaving requirement names untouched. */
function cookieSecuritySchemes(
  upstream: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.keys(upstream ?? {}).map((name) => [name, SESSION_COOKIE_SCHEME]),
  );
}

function withGatewayNote(info: OpenApiInfo | undefined, tenantId: string): OpenApiInfo {
  const note =
    `**Tenant \`${tenantId}\`.** Try it out calls \`/t/${tenantId}/v1/…\` on this gateway. ` +
    "Sign in at [/login](/login) on this host first, then send requests — no Bearer token, " +
    "the `backed_session` cookie is enough. [/logout](/logout) refreshes a stale session.";
  const description = info?.description;
  return {
    ...info,
    description:
      description === undefined || description.length === 0 ? note : `${description}\n\n${note}`,
  };
}

export function adaptOpenApiDocumentForGateway(
  doc: OpenApiDoc,
  tenantId: string,
  origin: string,
): OpenApiDoc {
  return {
    ...doc,
    info: withGatewayNote(doc.info, tenantId),
    servers: [{ url: origin, description: `Gateway · tenant ${tenantId}` }],
    paths: tenantScopedPaths(doc.paths ?? {}, `/t/${tenantId}`),
    components: {
      ...doc.components,
      securitySchemes: cookieSecuritySchemes(doc.components?.securitySchemes),
    },
  };
}

/** Passes non-JSON and error responses through untouched. */
export async function adaptOpenApiResponse(
  upstream: Response,
  tenantId: string,
  origin: string,
): Promise<Response> {
  if (!upstream.ok || !(upstream.headers.get("content-type") ?? "").includes("json")) {
    return upstream;
  }
  const doc = (await upstream.json()) as OpenApiDoc;
  return Response.json(adaptOpenApiDocumentForGateway(doc, tenantId, origin));
}
