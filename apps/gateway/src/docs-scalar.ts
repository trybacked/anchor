import { isPublicDocsReferenceTenant } from "./docs-reference-tenant.js";
import { GATEWAY_AUTH_PATHS, tenantOpenApiPath } from "./gateway-paths.js";

export function scalarConfigForTenant(
  tenantId: string,
  publicOrigin: string,
): Record<string, unknown> {
  const isReference = isPublicDocsReferenceTenant(tenantId);
  const titleSuffix = isReference ? "Platform" : tenantId;
  const openApiUrl = isReference ? GATEWAY_AUTH_PATHS.platformOpenApi : tenantOpenApiPath(tenantId);
  return {
    pageTitle: `Backed API · ${titleSuffix}`,
    url: openApiUrl,
    baseServerURL: publicOrigin,
    theme: "default",
    layout: "modern",
    metaData: {
      title: `Backed API · ${titleSuffix}`,
      description: `Sign in at ${GATEWAY_AUTH_PATHS.login} on this host before Try it out. POST bodies include examples; auth is the backed_session cookie, not Bearer.`,
    },
    customCss: `
          .light-mode { --scalar-color-accent: #5b8def; }
          .dark-mode { --scalar-color-accent: #7ba3f7; }
        `,
  };
}
