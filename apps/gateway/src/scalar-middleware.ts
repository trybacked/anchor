import { Scalar } from "@scalar/hono-api-reference";
import type { Context, Next } from "hono";
import type { GatewayVariables } from "./types.js";

type GatewayContext = Context<{ Variables: GatewayVariables }>;

export function scalarMiddleware(
  config: () => Record<string, unknown>,
): (c: GatewayContext, next: Next) => ReturnType<ReturnType<typeof Scalar>> {
  const scalar = Scalar(config);
  return (c, next) => scalar(c as Parameters<typeof scalar>[0], next);
}
