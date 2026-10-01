import { Scalar } from "@scalar/hono-api-reference";
import type { TenantRegistrySource } from "@trybacked/core";
import type { Hono } from "hono";
import type { GatewayConfig } from "./config.js";
import { canOpenTenantDocs, resolveDocsLanding } from "./docs-landing.js";
import { renderDocsTenantPickerPage } from "./docs-picker-page.js";
import { scalarConfigForPlatform, scalarConfigForTenant } from "./docs-scalar.js";
import { DOCS_PLATFORM_PATH, docsPathForTenant, GATEWAY_AUTH_PATHS } from "./gateway-paths.js";
import { resolvePublicOrigin } from "./public-origin.js";
import type { GatewayVariables } from "./types.js";

/** Legacy URL from the removed synthetic `reference` tenant id. */
const LEGACY_REFERENCE_DOCS_PATH = "/docs/t/reference";

export function registerDocsRoutes(
  app: Hono<{ Variables: GatewayVariables }>,
  config: GatewayConfig,
  registrySource: TenantRegistrySource,
): void {
  app.get("/docs", async (c) => {
    const landing = await resolveDocsLanding(registrySource, config);
    switch (landing.kind) {
      case "tenant":
        return c.redirect(docsPathForTenant(landing.tenantId));
      case "platform":
        return c.redirect(DOCS_PLATFORM_PATH);
      case "picker":
        return c.html(renderDocsTenantPickerPage(landing.tenants));
      default: {
        const unhandled: never = landing;
        return unhandled;
      }
    }
  });

  app.get(LEGACY_REFERENCE_DOCS_PATH, (c) => c.redirect(DOCS_PLATFORM_PATH));

  app.get(DOCS_PLATFORM_PATH, async (c, next) => {
    const landing = await resolveDocsLanding(registrySource, config);
    if (landing.kind !== "platform") {
      return c.redirect(GATEWAY_AUTH_PATHS.docs);
    }
    const scalar = Scalar(() => scalarConfigForPlatform(resolvePublicOrigin(c, config)));
    // @ts-expect-error — Scalar Context env typing is wider than our GatewayVariables app.
    return scalar(c, next);
  });

  app.get("/docs/t/:tenantId", async (c, next) => {
    const tenantId = c.req.param("tenantId");
    if (!(await canOpenTenantDocs(registrySource, tenantId))) {
      return c.json({ error: "Tenant not found" }, 404);
    }
    const scalar = Scalar(() => scalarConfigForTenant(tenantId, resolvePublicOrigin(c, config)));
    // @ts-expect-error — Scalar Context env typing is wider than our GatewayVariables app.
    return scalar(c, next);
  });
}
