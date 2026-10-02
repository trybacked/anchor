import { WorkOS } from "@workos-inc/node";
import type { Context, Hono } from "hono";
import { getCookie } from "hono/cookie";
import {
  completeOAuthAppRedirect,
  readOAuthPendingCookie,
  registerOAuthAppRoutes,
} from "./auth-oauth-apps.js";
import type { GatewayConfig } from "./config.js";
import {
  OAUTH_RETURN_COOKIE,
  OAUTH_STATE_COOKIE,
  clearOAuthFlowCookies,
  setOAuthCookie,
  setSessionCookie,
} from "./cookies.js";
import { createSessionToken } from "./session.js";
import type { GatewayVariables } from "./types.js";

function safeReturnPath(value: string | undefined): string | undefined {
  if (value === undefined || value.length === 0) {
    return undefined;
  }
  if (!value.startsWith("/") || value.startsWith("//")) {
    return undefined;
  }
  return value;
}

async function fetchTenantsFromControlPlane(
  config: GatewayConfig,
  workosOrganizationIds: string[],
): Promise<string[]> {
  const baseUrl = config.controlPlaneUrl?.replace(/\/+$/, "");
  const token = config.controlPlaneInternalToken;
  if (baseUrl === undefined || token === undefined) {
    return [];
  }
  const response = await fetch(`${baseUrl}/v1/me/tenants`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ workosOrganizationIds }),
  });
  if (!response.ok) {
    return [];
  }
  const payload = (await response.json()) as { tenants?: string[] };
  return Array.isArray(payload.tenants) ? payload.tenants : [];
}

type GatewayContext = Context<{ Variables: GatewayVariables }>;

function beginWorkOSAuthorization(c: GatewayContext, config: GatewayConfig, workos: WorkOS, clientId: string, redirectUri: string): Response {
  const state = crypto.randomUUID();
  setOAuthCookie(c, config, OAUTH_STATE_COOKIE, state);
  const url = workos.userManagement.getAuthorizationUrl({
    clientId,
    redirectUri,
    provider: "authkit",
    state,
  });
  return c.redirect(url);
}

export function registerWorkOSAuthRoutes(
  app: Hono<{ Variables: GatewayVariables }>,
  config: GatewayConfig,
): void {
  const workos = new WorkOS(config.workosApiKey ?? "");
  const clientId = config.workosClientId ?? "";
  const redirectUri = config.workosRedirectUri ?? "";

  const startWorkOSLogin = (c: GatewayContext) =>
    beginWorkOSAuthorization(c, config, workos, clientId, redirectUri);

  registerOAuthAppRoutes(app, config, startWorkOSLogin);

  app.get("/login", (c) => {
    const returnPath = safeReturnPath(c.req.query("next"));
    if (returnPath !== undefined) {
      setOAuthCookie(c, config, OAUTH_RETURN_COOKIE, returnPath);
    }
    return startWorkOSLogin(c);
  });

  app.get("/callback", async (c) => {
    const code = c.req.query("code");
    const state = c.req.query("state");
    const savedState = getCookie(c, OAUTH_STATE_COOKIE);
    if (code === undefined || state === undefined || savedState !== state) {
      return c.json({ error: "Invalid OAuth callback" }, 400);
    }
    let auth;
    try {
      auth = await workos.userManagement.authenticateWithCode({
        clientId,
        code,
      });
    } catch (error) {
      console.error("WorkOS authenticateWithCode failed:", error);
      return c.redirect("/login?error=auth");
    }
    const memberships = await workos.userManagement.listOrganizationMemberships({
      userId: auth.user.id,
    });
    const orgIds = memberships.data
      .map((entry) => entry.organizationId)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    const tenants = await fetchTenantsFromControlPlane(config, orgIds);
    const username = auth.user.email.length > 0 ? auth.user.email : auth.user.id;
    const user = { username, tenants };

    const pendingToken = readOAuthPendingCookie(c);
    if (pendingToken !== undefined) {
      const redirectTarget = await completeOAuthAppRedirect(config, pendingToken, user);
      clearOAuthFlowCookies(c, config);
      if (redirectTarget === undefined) {
        return c.json({ error: "Invalid OAuth app session" }, 400);
      }
      return c.redirect(redirectTarget);
    }

    const token = await createSessionToken(
      config.sessionSecret,
      user,
      config.sessionTtlSeconds,
    );
    setSessionCookie(c, config, token);
    clearOAuthFlowCookies(c, config);
    const returnPath = safeReturnPath(getCookie(c, OAUTH_RETURN_COOKIE)) ?? "/docs";
    return c.redirect(returnPath);
  });
}
