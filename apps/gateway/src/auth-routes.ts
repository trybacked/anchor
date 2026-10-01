import { zValidator } from "@hono/zod-validator";
import type { Hono } from "hono";
import { z } from "zod";
import type { GatewayConfig } from "./config.js";
import { setSessionCookie } from "./cookies.js";
import { createSessionToken } from "./session.js";
import type { GatewayVariables } from "./types.js";
import { authenticateUser, type UserRecord } from "./users.js";

const LoginBodySchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export function registerAuthRoutes(
  app: Hono<{ Variables: GatewayVariables }>,
  config: GatewayConfig,
  getUsers: () => UserRecord[],
): void {
  app.post("/login", zValidator("json", LoginBodySchema), async (c) => {
    const body = c.req.valid("json");
    const user = authenticateUser(getUsers(), body.username, body.password);
    if (user === undefined) {
      return c.json({ error: "Invalid credentials" }, 401);
    }
    const token = await createSessionToken(config.sessionSecret, user, config.sessionTtlSeconds);
    setSessionCookie(c, config, token);
    return c.json({ username: user.username, tenants: user.tenants });
  });
}
