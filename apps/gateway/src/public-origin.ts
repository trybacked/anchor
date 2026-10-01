import type { Context } from "hono";
import type { GatewayConfig } from "./config.js";
import type { GatewayVariables } from "./types.js";

/**
 * Browser-facing origin for OpenAPI `servers` and Scalar. `publicOrigin` is required whenever
 * cookies are secure, so the request fallback only applies to plain-HTTP local development.
 */
export function resolvePublicOrigin(
  c: Context<{ Variables: GatewayVariables }>,
  config: GatewayConfig,
): string {
  return config.publicOrigin ?? new URL(c.req.url).origin;
}
