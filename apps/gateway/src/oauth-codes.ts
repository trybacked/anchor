import { sign, verify } from "hono/jwt";

const AUTH_CODE_TYP = "oauth_auth_code";

export type OAuthPendingContext = {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge?: string | undefined;
  codeChallengeMethod?: string | undefined;
};

export type AuthorizationCodePayload = {
  typ: typeof AUTH_CODE_TYP;
  sub: string;
  tenants: string[];
  client_id: string;
  redirect_uri: string;
  code_challenge?: string | undefined;
  code_challenge_method?: string | undefined;
  exp: number;
};

export async function signOAuthPending(
  secret: string,
  pending: OAuthPendingContext,
  ttlSeconds: number,
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return sign({ ...pending, typ: "oauth_pending", exp }, secret, "HS256");
}

export async function verifyOAuthPending(
  secret: string,
  token: string,
): Promise<OAuthPendingContext | undefined> {
  try {
    const payload = await verify(token, secret, "HS256");
    if (typeof payload !== "object" || payload === null) {
      return undefined;
    }
    if (!("typ" in payload) || payload.typ !== "oauth_pending") {
      return undefined;
    }
    const clientId =
      "clientId" in payload && typeof payload.clientId === "string" ? payload.clientId : undefined;
    const redirectUri =
      "redirectUri" in payload && typeof payload.redirectUri === "string"
        ? payload.redirectUri
        : undefined;
    const state = "state" in payload && typeof payload.state === "string" ? payload.state : undefined;
    if (clientId === undefined || redirectUri === undefined || state === undefined) {
      return undefined;
    }
    const codeChallenge =
      "codeChallenge" in payload && typeof payload.codeChallenge === "string"
        ? payload.codeChallenge
        : undefined;
    const codeChallengeMethod =
      "codeChallengeMethod" in payload && typeof payload.codeChallengeMethod === "string"
        ? payload.codeChallengeMethod
        : undefined;
    return {
      clientId,
      redirectUri,
      state,
      ...(codeChallenge !== undefined ? { codeChallenge } : {}),
      ...(codeChallengeMethod !== undefined ? { codeChallengeMethod } : {}),
    };
  } catch {
    return undefined;
  }
}

export async function createAuthorizationCode(
  secret: string,
  input: {
    username: string;
    tenants: string[];
    clientId: string;
    redirectUri: string;
    codeChallenge?: string | undefined;
    codeChallengeMethod?: string | undefined;
  },
  ttlSeconds: number,
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload: AuthorizationCodePayload = {
    typ: AUTH_CODE_TYP,
    sub: input.username,
    tenants: input.tenants,
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    exp,
    ...(input.codeChallenge !== undefined ? { code_challenge: input.codeChallenge } : {}),
    ...(input.codeChallengeMethod !== undefined
      ? { code_challenge_method: input.codeChallengeMethod }
      : {}),
  };
  return sign(payload, secret, "HS256");
}

export async function verifyAuthorizationCode(
  secret: string,
  code: string,
): Promise<AuthorizationCodePayload | undefined> {
  try {
    const payload = await verify(code, secret, "HS256");
    if (typeof payload !== "object" || payload === null) {
      return undefined;
    }
    if (!("typ" in payload) || payload.typ !== AUTH_CODE_TYP) {
      return undefined;
    }
    const sub = "sub" in payload && typeof payload.sub === "string" ? payload.sub : undefined;
    const clientId =
      "client_id" in payload && typeof payload.client_id === "string"
        ? payload.client_id
        : undefined;
    const redirectUri =
      "redirect_uri" in payload && typeof payload.redirect_uri === "string"
        ? payload.redirect_uri
        : undefined;
    const tenantsRaw = "tenants" in payload ? payload.tenants : undefined;
    if (sub === undefined || clientId === undefined || redirectUri === undefined) {
      return undefined;
    }
    const tenants = Array.isArray(tenantsRaw)
      ? tenantsRaw.filter((value): value is string => typeof value === "string")
      : [];
    const codeChallenge =
      "code_challenge" in payload && typeof payload.code_challenge === "string"
        ? payload.code_challenge
        : undefined;
    const codeChallengeMethod =
      "code_challenge_method" in payload && typeof payload.code_challenge_method === "string"
        ? payload.code_challenge_method
        : undefined;
    const exp = "exp" in payload && typeof payload.exp === "number" ? payload.exp : undefined;
    if (exp === undefined) {
      return undefined;
    }
    return {
      typ: AUTH_CODE_TYP,
      sub,
      tenants,
      client_id: clientId,
      redirect_uri: redirectUri,
      exp,
      ...(codeChallenge !== undefined ? { code_challenge: codeChallenge } : {}),
      ...(codeChallengeMethod !== undefined ? { code_challenge_method: codeChallengeMethod } : {}),
    };
  } catch {
    return undefined;
  }
}
