import { Scalar } from "@scalar/hono-api-reference";
import type { TenantRegistrySource } from "@trybacked/core";
import type { Hono } from "hono";
import type { GatewayConfig } from "./config.js";
import { canOpenTenantDocs, resolveDocsLanding } from "./docs-landing.js";
import { renderDocsTenantPickerPage } from "./docs-picker-page.js";
import {
  isPublicDocsReferenceTenant,
  PUBLIC_DOCS_REFERENCE_TENANT,
} from "./docs-reference-tenant.js";
import { scalarConfigForTenant } from "./docs-scalar.js";
import { docsPathForTenant, GATEWAY_AUTH_PATHS } from "./gateway-paths.js";
import { resolvePublicOrigin } from "./public-origin.js";
import type { GatewayVariables } from "./types.js";

export {
  PUBLIC_DOCS_REFERENCE_TENANT,
  isPublicDocsReferenceTenant,
} from "./docs-reference-tenant.js";

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
      case "reference":
        return c.redirect(docsPathForTenant(PUBLIC_DOCS_REFERENCE_TENANT));
      case "picker":
        return c.html(renderDocsTenantPickerPage(landing.tenants));
      default: {
        const unhandled: never = landing;
        return unhandled;
      }
    }
  });

  app.get("/docs/t/:tenantId", async (c, next) => {
    const tenantId = c.req.param("tenantId");
    if (isPublicDocsReferenceTenant(tenantId)) {
      const landing = await resolveDocsLanding(registrySource, config);
      if (landing.kind !== "reference") {
        return c.redirect(GATEWAY_AUTH_PATHS.docs);
      }
    }
    if (!(await canOpenTenantDocs(registrySource, tenantId))) {
      return c.json({ error: "Tenant not found" }, 404);
    }
    const scalar = Scalar(() => scalarConfigForTenant(tenantId, resolvePublicOrigin(c, config)));
    // @ts-expect-error — Scalar Context env typing is wider than our GatewayVariables app.
    return scalar(c, next);
  });
}
