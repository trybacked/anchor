import type { Context, Next } from "hono";
import { timingSafeEqual } from "node:crypto";
function safeEqualToken(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(providedBuffer, expectedBuffer);
}
export function createBearerAuthMiddleware(expectedToken: string) {
  return async (c: Context, next: Next) => {
    const header = c.req.header("Authorization");
    if (header === undefined || !header.startsWith("Bearer ")) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const token = header.slice("Bearer ".length).trim();
    if (!safeEqualToken(token, expectedToken)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    return next();
  };
}
