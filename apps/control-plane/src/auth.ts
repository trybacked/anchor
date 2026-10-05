import type { Context, Next } from "hono";
import type { ControlPlaneConfig } from "./config.js";
function bearerToken(c: Context): string | undefined {
  const header = c.req.header("Authorization");
  if (header === undefined || !header.startsWith("Bearer ")) {
    return undefined;
  }
  return header.slice("Bearer ".length).trim();
}
export function requireAdmin(config: ControlPlaneConfig) {
  return async (c: Context, next: Next) => {
    const token = bearerToken(c);
    if (token !== config.adminToken) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    return next();
  };
}
export function requireInternal(config: ControlPlaneConfig) {
  return async (c: Context, next: Next) => {
    const token = bearerToken(c);
    if (token !== config.internalToken) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    return next();
  };
}
