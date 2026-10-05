import { SESSION_COOKIE_NAME } from "./cookies.js";
import type { OpenApiDocument } from "./openapi-types.js";
export const GATEWAY_OAUTH_TAG = "Gateway · OAuth & session";
export const BEARER_SECURITY_SCHEME = {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
  description:
    "Access token from `POST /oauth/token` after the authorization code flow (third-party SPAs). " +
    "Send `Authorization: Bearer {access_token}`. Register apps on the control plane; see deploy/env/OAUTH_APPS.md in the anchor repo.",
} as const;
export const SESSION_COOKIE_SCHEME = {
  type: "apiKey",
  in: "cookie",
  name: SESSION_COOKIE_NAME,
  description:
    "First-party session on this host: sign in at `GET /login`, then the browser sends the cookie on Try it out. " +
    "Third-party apps on other origins should use OAuth + Bearer instead.",
} as const;
export function gatewayAuthOpenApiPaths(): NonNullable<OpenApiDocument["paths"]> {
  return {
    "/oauth/authorize": {
      get: {
        tags: [GATEWAY_OAUTH_TAG],
        summary: "Start OAuth authorization (third-party apps)",
        description:
          "Public clients must send PKCE (`code_challenge` + `code_challenge_method=S256`). " +
          "Redirects to WorkOS AuthKit, then back to your registered `redirect_uri` with `?code=&state=`. " +
          "WorkOS callback remains `{gateway}/callback`.",
        parameters: [
          {
            name: "response_type",
            in: "query",
            required: true,
            schema: { type: "string", enum: ["code"] },
          },
          { name: "client_id", in: "query", required: true, schema: { type: "string" } },
          {
            name: "redirect_uri",
            in: "query",
            required: true,
            schema: { type: "string", format: "uri" },
          },
          { name: "state", in: "query", required: true, schema: { type: "string" } },
          { name: "code_challenge", in: "query", required: false, schema: { type: "string" } },
          {
            name: "code_challenge_method",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["S256"] },
          },
        ],
        responses: {
          "302": { description: "Redirect to WorkOS sign-in" },
          "400": { description: "Invalid request (e.g. pkce_required)" },
          "401": { description: "Unknown client_id" },
        },
      },
    },
    "/oauth/token": {
      post: {
        tags: [GATEWAY_OAUTH_TAG],
        summary: "Exchange authorization code for access token",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["grant_type", "code", "client_id", "redirect_uri"],
                properties: {
                  grant_type: { type: "string", enum: ["authorization_code"] },
                  code: { type: "string" },
                  client_id: { type: "string" },
                  redirect_uri: { type: "string", format: "uri" },
                  code_verifier: {
                    type: "string",
                    description: "Required for public clients (PKCE)",
                  },
                  client_secret: { type: "string", description: "Confidential clients only" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Bearer access token (same JWT as session cookie payload)",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["access_token", "token_type", "expires_in"],
                  properties: {
                    access_token: { type: "string" },
                    token_type: { type: "string", enum: ["Bearer"] },
                    expires_in: { type: "integer" },
                  },
                },
              },
            },
          },
          "400": { description: "invalid_grant" },
          "401": { description: "invalid_client" },
        },
      },
    },
    "/login": {
      get: {
        tags: [GATEWAY_OAUTH_TAG],
        summary: "Sign in (first-party, cookie session)",
        description:
          "Starts WorkOS AuthKit for interactive docs on this host. Optional `next` must be a **relative** path (e.g. `/docs`).",
        parameters: [{ name: "next", in: "query", required: false, schema: { type: "string" } }],
        responses: {
          "302": { description: "Redirect to WorkOS" },
        },
      },
    },
    "/logout": {
      get: {
        tags: [GATEWAY_OAUTH_TAG],
        summary: "Sign out (clear session cookie)",
        responses: { "302": { description: "Redirect to /login" } },
      },
      post: {
        tags: [GATEWAY_OAUTH_TAG],
        summary: "Sign out (JSON or redirect)",
        responses: {
          "200": {
            description: "JSON when Accept is not HTML",
            content: {
              "application/json": {
                schema: { type: "object", properties: { ok: { type: "boolean" } } },
              },
            },
          },
          "302": { description: "Redirect to /login when Accept includes text/html" },
        },
      },
    },
    "/me": {
      get: {
        tags: [GATEWAY_OAUTH_TAG],
        summary: "Current session",
        description:
          "Requires `backed_session` cookie **or** `Authorization: Bearer` from `/oauth/token`.",
        security: [{ backedSession: [] }, { backedBearer: [] }],
        responses: {
          "200": {
            description: "Gateway user and tenant ids",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["username", "tenants"],
                  properties: {
                    username: { type: "string" },
                    tenants: { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
          },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/health": {
      get: {
        tags: [GATEWAY_OAUTH_TAG],
        summary: "Gateway health",
        security: [],
        responses: {
          "200": { description: "Gateway status" },
        },
      },
    },
    "/health/live": {
      get: {
        tags: [GATEWAY_OAUTH_TAG],
        summary: "Liveness probe",
        security: [],
        responses: {
          "200": { description: "OK" },
        },
      },
    },
  };
}
export function mergeGatewayAuthOpenApi(doc: OpenApiDocument): OpenApiDocument {
  const authPaths = gatewayAuthOpenApiPaths();
  const upstreamSchemes = doc.components?.securitySchemes ?? {};
  const tenantApiSchemes = Object.fromEntries(
    Object.keys(upstreamSchemes).map((name) => [name, SESSION_COOKIE_SCHEME]),
  );
  return {
    ...doc,
    paths: {
      ...authPaths,
      ...(doc.paths ?? {}),
    },
    components: {
      ...doc.components,
      securitySchemes: {
        backedSession: SESSION_COOKIE_SCHEME,
        backedBearer: BEARER_SECURITY_SCHEME,
        ...tenantApiSchemes,
      },
    },
  };
}
