import type {
  GatewayHealth,
  GatewaySession,
  LoginRequest,
  LoginResponse,
  LogoutResponse,
  OAuthTokenResponse,
} from "@trybacked/core";
import type { Transport } from "../transport.js";
export type OAuthAuthorizeParams = {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod?: "S256" | undefined;
};
export type OAuthTokenExchangeParams = {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  clientSecret?: string | undefined;
};
export type AuthModule = {
  loginWithPassword: (body: LoginRequest) => Promise<LoginResponse>;
  loginUrl: (options?: { next?: string | undefined }) => string;
  authorizeUrl: (params: OAuthAuthorizeParams) => string;
  exchangeAuthorizationCode: (params: OAuthTokenExchangeParams) => Promise<OAuthTokenResponse>;
  logout: () => Promise<LogoutResponse>;
  me: () => Promise<GatewaySession>;
  session: () => Promise<GatewaySession | null>;
};
export function createAuthModule(transport: Transport): AuthModule {
  return {
    loginWithPassword: (body) =>
      transport.requestJson<LoginResponse>("POST", transport.buildUrl("/login"), { body }),
    loginUrl: (options) => {
      const base = transport.buildUrl("/login");
      if (options?.next === undefined || options.next.length === 0) {
        return base;
      }
      const url = new URL(base);
      url.searchParams.set("next", options.next);
      return url.toString();
    },
    authorizeUrl: (params) => {
      const url = new URL(transport.buildUrl("/oauth/authorize"));
      url.searchParams.set("response_type", "code");
      url.searchParams.set("client_id", params.clientId);
      url.searchParams.set("redirect_uri", params.redirectUri);
      url.searchParams.set("state", params.state);
      url.searchParams.set("code_challenge", params.codeChallenge);
      url.searchParams.set("code_challenge_method", params.codeChallengeMethod ?? "S256");
      return url.toString();
    },
    exchangeAuthorizationCode: (params) =>
      transport.requestJson<OAuthTokenResponse>("POST", transport.buildUrl("/oauth/token"), {
        body: {
          grant_type: "authorization_code",
          code: params.code,
          client_id: params.clientId,
          redirect_uri: params.redirectUri,
          code_verifier: params.codeVerifier,
          ...(params.clientSecret !== undefined ? { client_secret: params.clientSecret } : {}),
        },
      }),
    logout: () => transport.requestJson<LogoutResponse>("POST", transport.buildUrl("/logout"), {}),
    me: () => transport.requestJson<GatewaySession>("GET", transport.buildUrl("/me")),
    session: async () => {
      try {
        return await transport.requestJson<GatewaySession>("GET", transport.buildUrl("/me"));
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "status" in error &&
          (error.status === 401 || error.status === 403)
        ) {
          return null;
        }
        throw error;
      }
    },
  };
}
export type HealthModule = {
  live: () => Promise<{
    ok: true;
  }>;
  status: () => Promise<GatewayHealth>;
};
export function createHealthModule(transport: Transport): HealthModule {
  return {
    live: () => transport.requestJson("GET", transport.buildUrl("/health/live")),
    status: () => transport.requestJson("GET", transport.buildUrl("/health")),
  };
}
