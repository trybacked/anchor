import type { Context } from "hono";
import type { GatewayConfig } from "./config.js";
import type { GatewayVariables } from "./types.js";
export function resolvePublicOrigin(
  c: Context<{
    Variables: GatewayVariables;
  }>,
  config: GatewayConfig,
): string {
  return config.publicOrigin ?? new URL(c.req.url).origin;
}
