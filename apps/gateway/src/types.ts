import type { GatewaySession } from "@trybacked/core";

export type GatewayUser = GatewaySession;

export type GatewaySessionPayload = {
  sub: string;
  tenants: string[];
  exp: number;
};

export type GatewayVariables = {
  user: GatewayUser;
};
