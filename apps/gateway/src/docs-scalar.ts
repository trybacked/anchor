import { GATEWAY_AUTH_PATHS, tenantOpenApiPath } from "./gateway-paths.js";
export function scalarConfigForPlatform(publicOrigin: string): Record<string, unknown> {
  return {
    pageTitle: "Backed API · Platform",
    url: GATEWAY_AUTH_PATHS.platformOpenApi,
    baseServerURL: publicOrigin,
    theme: "default",
    layout: "modern",
    metaData: {
      title: "Backed API · Platform",
      description:
        "Browse the platform API shape. Try it out against live tenant data at /docs/t/{tenantId} once a workspace is published.",
    },
    customCss: `
          .light-mode { --scalar-color-accent: #5b8def; }
          .dark-mode { --scalar-color-accent: #7ba3f7; }
        `,
  };
}
export function scalarConfigForTenant(
  tenantId: string,
  publicOrigin: string,
): Record<string, unknown> {
  return {
    pageTitle: `Backed API · ${tenantId}`,
    url: tenantOpenApiPath(tenantId),
    baseServerURL: publicOrigin,
    theme: "default",
    layout: "modern",
    metaData: {
      title: `Backed API · ${tenantId}`,
      description: `Sign in at ${GATEWAY_AUTH_PATHS.login} on this host for Try it out (cookie), or use OAuth Bearer (see Gateway · OAuth & session in the spec).`,
    },
    customCss: `
          .light-mode { --scalar-color-accent: #5b8def; }
          .dark-mode { --scalar-color-accent: #7ba3f7; }
        `,
  };
}
