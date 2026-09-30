import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { registerAuthRoutes } from "./auth-routes.js";
import { countConfiguredTenants, type GatewayConfig } from "./config.js";
import { handleSingleModeProxy, handleTenantProxy, type ProxyDeps } from "./proxy.js";
import { createRateLimiter } from "./rate-limit.js";
import { createRequireAuthMiddleware } from "./require-auth.js";
import type { GatewayVariables } from "./types.js";
import { loadUsersFile, type UserRecord } from "./users.js";

export type CreateGatewayAppOptions = {
  config: GatewayConfig;
  users?: UserRecord[];
  proxyDeps?: ProxyDeps;
};

export function createGatewayApp(options: CreateGatewayAppOptions): Hono<{ Variables: GatewayVariables }> {
  const { config } = options;
  const users = options.users ?? loadUsersFile(config.usersFilePath);
  const proxyDeps = options.proxyDeps ?? {};
  const requireAuth = createRequireAuthMiddleware(config);
  const rateLimit = createRateLimiter({
    capacity: config.rateLimitPerMinute,
    refillPerSecond: config.rateLimitPerMinute / 60,
  });

  const rateLimitMiddleware: MiddlewareHandler<{ Variables: GatewayVariables }> = async (c, next) => {
    const user = c.get("user");
    const result = rateLimit(user.username);
    if (!result.allowed) {
      if (result.retryAfterSeconds !== undefined) {
        c.header("Retry-After", String(result.retryAfterSeconds));
      }
      return c.json({ error: "Too many requests" }, 429);
    }
    return next();
  };

  const app = new Hono<{ Variables: GatewayVariables }>();

  app.get("/health/live", (c) => c.json({ ok: true as const }));

  app.get("/health", (c) =>
    c.json({
      ok: true as const,
      mode: config.multiTenant ? ("multi" as const) : ("single" as const),
      tenants: countConfiguredTenants(config),
    }),
  );

  registerAuthRoutes(app, config, () => users);

  app.get("/me", requireAuth, (c) => {
    const user = c.get("user");
    return c.json(user);
  });

  if (config.multiTenant) {
    app.all("/t/:tenantId/*", requireAuth, rateLimitMiddleware, async (c) => {
      const tenantId = c.req.param("tenantId");
      return handleTenantProxy(c, config, tenantId, proxyDeps);
    });
  } else {
    app.all("/v1/*", requireAuth, rateLimitMiddleware, async (c) => {
      return handleSingleModeProxy(c, config, proxyDeps);
    });
  }

  return app;
}
