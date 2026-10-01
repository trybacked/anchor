import type { TenantRegistrySource } from "@trybacked/core";
import type { Context, MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { registerAuthRoutes } from "./auth-routes.js";
import { registerWorkOSAuthRoutes } from "./auth-workos.js";
import type { GatewayConfig } from "./config.js";
import { clearSessionCookies } from "./cookies.js";
import { registerDocsRoutes } from "./docs-routes.js";
import {
  GATEWAY_AUTH_PATHS,
  PLATFORM_OPENAPI_UPSTREAM_TENANT,
  TENANT_OPENAPI_ROUTE,
} from "./gateway-paths.js";
import { normalizeTrailingSlashMiddleware } from "./normalize-trailing-slash.js";
import { adaptOpenApiResponse } from "./openapi-gateway.js";
import {
  forwardToPlatform,
  handleDefaultTenantProxy,
  handleTenantProxy,
  type ProxyDeps,
} from "./proxy.js";
import { resolvePublicOrigin } from "./public-origin.js";
import { createRateLimiter } from "./rate-limit.js";
import { createRequireAuthMiddleware } from "./require-auth.js";
import type { GatewayVariables } from "./types.js";
import { assertTenantInRegistry, countConfiguredTenants } from "./upstreams.js";
import { loadUsersFile, type UserRecord } from "./users.js";

export type CreateGatewayAppOptions = {
  config: GatewayConfig;
  registrySource: TenantRegistrySource;
  users?: UserRecord[];
  proxyDeps?: ProxyDeps;
};

export function createGatewayApp(
  options: CreateGatewayAppOptions,
): Hono<{ Variables: GatewayVariables }> {
  const { config, registrySource } = options;
  const users =
    options.users ?? (config.authMode === "file" ? loadUsersFile(config.usersFilePath) : []);
  const proxyDeps = options.proxyDeps ?? {};
  const requireAuth = createRequireAuthMiddleware(config);
  const rateLimit = createRateLimiter({
    capacity: config.rateLimitPerMinute,
    refillPerSecond: config.rateLimitPerMinute / 60,
  });

  const rateLimitMiddleware: MiddlewareHandler<{ Variables: GatewayVariables }> = async (
    c,
    next,
  ) => {
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

  app.use("*", normalizeTrailingSlashMiddleware);

  app.get("/health/live", (c) => c.json({ ok: true as const }));

  app.get("/health", async (c) =>
    c.json({
      ok: true as const,
      mode: "platform" as const,
      authMode: config.authMode,
      tenants: await countConfiguredTenants(registrySource),
    }),
  );

  if (config.authMode === "workos") {
    registerWorkOSAuthRoutes(app, config);
  } else {
    registerAuthRoutes(app, config, () => users);
  }

  app.get("/logout", (c) => {
    clearSessionCookies(c, config);
    return c.redirect(GATEWAY_AUTH_PATHS.login);
  });

  app.post("/logout", (c) => {
    clearSessionCookies(c, config);
    return (c.req.header("Accept") ?? "").includes("text/html")
      ? c.redirect(GATEWAY_AUTH_PATHS.login)
      : c.json({ ok: true as const });
  });

  app.get("/me", requireAuth, (c) => {
    const user = c.get("user");
    return c.json(user);
  });

  registerDocsRoutes(app, config, registrySource);

  const fetchPlatformOpenApi = () =>
    forwardToPlatform(
      config,
      PLATFORM_OPENAPI_UPSTREAM_TENANT,
      "public-docs",
      new Request("http://gateway/openapi.json"),
      "/openapi.json",
      proxyDeps,
    );

  const serveOpenApi = async (
    c: Context<{ Variables: GatewayVariables }>,
    target: Parameters<typeof adaptOpenApiResponse>[1],
    upstreamTenantId: string,
  ): Promise<Response> =>
    adaptOpenApiResponse(
      await forwardToPlatform(
        config,
        upstreamTenantId,
        "public-docs",
        c.req.raw,
        "/openapi.json",
        proxyDeps,
      ),
      target,
      resolvePublicOrigin(c, config),
    );

  app.get(GATEWAY_AUTH_PATHS.platformOpenApi, async (c) =>
    adaptOpenApiResponse(
      await fetchPlatformOpenApi(),
      { kind: "platform" },
      resolvePublicOrigin(c, config),
    ),
  );

  app.get(TENANT_OPENAPI_ROUTE, async (c) => {
    const tenantId = c.req.param("tenantId");
    if (!(await assertTenantInRegistry(registrySource, tenantId))) {
      return c.json({ error: "Tenant not found" }, 404);
    }
    return serveOpenApi(c, { kind: "tenant", tenantId }, tenantId);
  });

  app.all("/t/:tenantId/*", requireAuth, rateLimitMiddleware, async (c) => {
    const tenantId = c.req.param("tenantId");
    return handleTenantProxy(c, config, registrySource, tenantId, proxyDeps);
  });

  if (config.defaultTenant !== undefined) {
    app.all("/v1/*", requireAuth, rateLimitMiddleware, async (c) => {
      return handleDefaultTenantProxy(c, config, registrySource, proxyDeps);
    });
  }

  return app;
}
