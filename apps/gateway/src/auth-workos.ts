import { WorkOS } from "@workos-inc/node";
import type { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { GatewayConfig } from "./config.js";
import { createSessionToken, SESSION_COOKIE_NAME } from "./session.js";
import type { GatewayVariables } from "./types.js";

const OAUTH_STATE_COOKIE = "backed_oauth_state";

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

export function registerWorkOSAuthRoutes(
  app: Hono<{ Variables: GatewayVariables }>,
  config: GatewayConfig,
): void {
  const workos = new WorkOS(config.workosApiKey ?? "");
  const clientId = config.workosClientId ?? "";
  const redirectUri = config.workosRedirectUri ?? "";

  app.get("/login", (c) => {
    const state = crypto.randomUUID();
    setCookie(c, OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: config.cookieSecure,
      sameSite: "Lax",
      path: "/",
      maxAge: 600,
    });
    const url = workos.userManagement.getAuthorizationUrl({
      clientId,
      redirectUri,
      provider: "authkit",
      state,
    });
    return c.redirect(url);
  });

  app.get("/callback", async (c) => {
    const code = c.req.query("code");
    const state = c.req.query("state");
    const savedState = getCookie(c, OAUTH_STATE_COOKIE);
    if (code === undefined || state === undefined || savedState !== state) {
      return c.json({ error: "Invalid OAuth callback" }, 400);
    }
    const auth = await workos.userManagement.authenticateWithCode({
      clientId,
      code,
    });
    const memberships = await workos.userManagement.listOrganizationMemberships({
      userId: auth.user.id,
    });
    const orgIds = memberships.data
      .map((entry) => entry.organizationId)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    const tenants = await fetchTenantsFromControlPlane(config, orgIds);
    const username = auth.user.email.length > 0 ? auth.user.email : auth.user.id;
    const token = await createSessionToken(
      config.sessionSecret,
      { username, tenants },
      config.sessionTtlSeconds,
    );
    setCookie(c, SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: config.cookieSecure,
      sameSite: "Strict",
      path: "/",
      maxAge: config.sessionTtlSeconds,
    });
    return c.redirect("/");
  });
}
