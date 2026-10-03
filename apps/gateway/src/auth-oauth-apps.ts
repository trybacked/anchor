import { zValidator } from "@hono/zod-validator";
import { OAuthTokenRequestSchema } from "@trybacked/core";
import type { Context, Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { GatewayConfig } from "./config.js";
import { OAUTH_PENDING_COOKIE, setOAuthCookie } from "./cookies.js";
import { getRegisteredOAuthClient, verifyRegisteredClientSecret } from "./oauth-client-store.js";
import {
  createAuthorizationCode,
  signOAuthPending,
  verifyAuthorizationCode,
  verifyOAuthPending,
} from "./oauth-codes.js";
import { isValidCodeVerifier, verifyPkceChallenge } from "./oauth-pkce.js";
import { createSessionToken } from "./session.js";
import type { GatewayVariables } from "./types.js";

const AUTH_CODE_TTL_SECONDS = 120;
const OAUTH_PENDING_TTL_SECONDS = 600;

type GatewayContext = Context<{ Variables: GatewayVariables }>;

function redirectUriMatches(allowed: string[], candidate: string): boolean {
  return allowed.some((entry) => entry === candidate);
}

function appendQuery(url: string, params: Record<string, string>): string {
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    parsed.searchParams.set(key, value);
  }
  return parsed.toString();
}

export function readOAuthPendingCookie(c: GatewayContext): string | undefined {
  return getCookie(c, OAUTH_PENDING_COOKIE);
}

export async function completeOAuthAppRedirect(
  config: GatewayConfig,
  pendingToken: string,
  user: { username: string; tenants: string[] },
): Promise<string | undefined> {
  const pending = await verifyOAuthPending(config.sessionSecret, pendingToken);
  if (pending === undefined) {
    return undefined;
  }
  const code = await createAuthorizationCode(
    config.sessionSecret,
    {
      username: user.username,
      tenants: user.tenants,
      clientId: pending.clientId,
      redirectUri: pending.redirectUri,
      ...(pending.codeChallenge !== undefined ? { codeChallenge: pending.codeChallenge } : {}),
      ...(pending.codeChallengeMethod !== undefined
        ? { codeChallengeMethod: pending.codeChallengeMethod }
        : {}),
    },
    AUTH_CODE_TTL_SECONDS,
  );
  return appendQuery(pending.redirectUri, { code, state: pending.state });
}

export type StartWorkOSLogin = (
  c: GatewayContext,
  options?: { screenHint?: "sign-in" | "sign-up" },
) => Response;

export function registerOAuthAppRoutes(
  app: Hono<{ Variables: GatewayVariables }>,
  config: GatewayConfig,
  startWorkOSLogin: StartWorkOSLogin,
): void {
  app.get("/oauth/authorize", async (c) => {
    const responseType = c.req.query("response_type");
    const clientId = c.req.query("client_id");
    const redirectUri = c.req.query("redirect_uri");
    const state = c.req.query("state");
    const codeChallenge = c.req.query("code_challenge");
    const codeChallengeMethod = c.req.query("code_challenge_method") ?? "S256";

    if (responseType !== "code") {
      return c.json({ error: "unsupported_response_type" }, 400);
    }
    if (clientId === undefined || redirectUri === undefined || state === undefined) {
      return c.json({ error: "invalid_request" }, 400);
    }
    if (state.length === 0 || state.length > 512) {
      return c.json({ error: "invalid_state" }, 400);
    }

    const client = await getRegisteredOAuthClient(config, clientId);
    if (client === undefined) {
      return c.json({ error: "invalid_client" }, 401);
    }
    if (!redirectUriMatches(client.redirectUris, redirectUri)) {
      return c.json({ error: "invalid_redirect_uri" }, 400);
    }

    const isPublic = client.clientSecretHash === null;
    if (isPublic) {
      if (codeChallenge === undefined || codeChallenge.length === 0) {
        return c.json({ error: "pkce_required" }, 400);
      }
      if (codeChallengeMethod !== "S256") {
        return c.json({ error: "invalid_code_challenge_method" }, 400);
      }
    }

    const pendingToken = await signOAuthPending(
      config.sessionSecret,
      {
        clientId,
        redirectUri,
        state,
        ...(codeChallenge !== undefined ? { codeChallenge } : {}),
        ...(codeChallenge !== undefined ? { codeChallengeMethod } : {}),
      },
      OAUTH_PENDING_TTL_SECONDS,
    );
    setOAuthCookie(c, config, OAUTH_PENDING_COOKIE, pendingToken);
    const prompt = c.req.query("prompt");
    const screenHint = prompt === "login" ? ("sign-in" as const) : undefined;
    return startWorkOSLogin(c, ...(screenHint !== undefined ? [{ screenHint }] : []));
  });

  app.post("/oauth/token", zValidator("json", OAuthTokenRequestSchema), async (c) => {
    const body = c.req.valid("json");
    const client = await getRegisteredOAuthClient(config, body.client_id);
    if (client === undefined) {
      return c.json({ error: "invalid_client" }, 401);
    }
    if (!redirectUriMatches(client.redirectUris, body.redirect_uri)) {
      return c.json({ error: "invalid_redirect_uri" }, 400);
    }

    const isPublic = client.clientSecretHash === null;
    if (isPublic) {
      if (body.code_verifier === undefined || !isValidCodeVerifier(body.code_verifier)) {
        return c.json({ error: "invalid_grant" }, 400);
      }
    } else {
      const secret = body.client_secret;
      const pepper = config.controlPlaneInternalToken ?? "";
      if (secret === undefined || !verifyRegisteredClientSecret(client, secret, pepper)) {
        return c.json({ error: "invalid_client" }, 401);
      }
    }

    const codePayload = await verifyAuthorizationCode(config.sessionSecret, body.code);
    if (codePayload === undefined) {
      return c.json({ error: "invalid_grant" }, 400);
    }
    if (
      codePayload.client_id !== body.client_id ||
      codePayload.redirect_uri !== body.redirect_uri
    ) {
      return c.json({ error: "invalid_grant" }, 400);
    }

    if (codePayload.code_challenge !== undefined) {
      const verifier = body.code_verifier;
      if (verifier === undefined) {
        return c.json({ error: "invalid_grant" }, 400);
      }
      const method = codePayload.code_challenge_method ?? "S256";
      if (!verifyPkceChallenge(verifier, codePayload.code_challenge, method)) {
        return c.json({ error: "invalid_grant" }, 400);
      }
    }

    const accessToken = await createSessionToken(
      config.sessionSecret,
      { username: codePayload.sub, tenants: codePayload.tenants },
      config.sessionTtlSeconds,
    );

    return c.json({
      access_token: accessToken,
      token_type: "Bearer" as const,
      expires_in: config.sessionTtlSeconds,
    });
  });
}
