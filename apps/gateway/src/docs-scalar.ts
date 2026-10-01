import { isPublicDocsReferenceTenant } from "./docs-reference-tenant.js";

export function scalarConfigForTenant(
  tenantId: string,
  publicOrigin: string,
): Record<string, unknown> {
  const isReference = isPublicDocsReferenceTenant(tenantId);
  const titleSuffix = isReference ? "Platform" : tenantId;
  return {
    pageTitle: `Backed API · ${titleSuffix}`,
    url: isReference ? "/openapi.json" : `/t/${tenantId}/openapi.json`,
    baseServerURL: publicOrigin,
    theme: "default",
    layout: "modern",
    metaData: {
      title: `Backed API · ${titleSuffix}`,
      description:
        "Sign in at /login on this host before Try it out. POST bodies include examples; auth is the backed_session cookie, not Bearer.",
    },
    customCss: `
          .light-mode { --scalar-color-accent: #5b8def; }
          .dark-mode { --scalar-color-accent: #7ba3f7; }
        `,
  };
}
