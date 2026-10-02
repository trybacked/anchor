import type { GatewaySession, TenantRole } from "@trybacked/core";

export type GatewayUser = GatewaySession;

export type GatewaySessionPayload = {
  sub: string;
  tenants: string[];
  roles?: Record<string, TenantRole> | undefined;
  workosRoles?: string[] | undefined;
  exp: number;
};

export type GatewayVariables = {
  user: GatewayUser;
};
