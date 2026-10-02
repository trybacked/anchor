import type {
  GatewayHealth,
  GatewaySession,
  LoginRequest,
  LoginResponse,
  LogoutResponse,
} from "@trybacked/core";
import type { Transport } from "../transport.js";

export type AuthModule = {
  loginWithPassword: (body: LoginRequest) => Promise<LoginResponse>;
  loginUrl: (options?: { next?: string | undefined }) => string;
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
  live: () => Promise<{ ok: true }>;
  status: () => Promise<GatewayHealth>;
};

export function createHealthModule(transport: Transport): HealthModule {
  return {
    live: () => transport.requestJson("GET", transport.buildUrl("/health/live")),
    status: () => transport.requestJson("GET", transport.buildUrl("/health")),
  };
}
