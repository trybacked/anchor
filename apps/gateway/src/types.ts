export type GatewayUser = {
  username: string;
  tenants: string[];
};

export type GatewaySessionPayload = {
  sub: string;
  tenants: string[];
  exp: number;
};

export type GatewayVariables = {
  user: GatewayUser;
};
