import { Scalar } from "@scalar/hono-api-reference";
import type { TenantRegistrySource } from "@trybacked/core";
import type { Hono } from "hono";
import type { GatewayConfig } from "./config.js";
import type { GatewayVariables } from "./types.js";
import { GATEWAY_OPENAPI_SESSION_SCHEME } from "./openapi-gateway.js";
import { resolvePublicOrigin } from "./public-origin.js";
import { assertTenantInRegistry } from "./upstreams.js";

/** Synthetic tenant id for public API reference when the registry has no published workspaces yet. */
export const PUBLIC_DOCS_REFERENCE_TENANT = "reference";

export function isPublicDocsReferenceTenant(tenantId: string): boolean {
  return tenantId === PUBLIC_DOCS_REFERENCE_TENANT;
}

async function canOpenTenantDocs(
  registrySource: TenantRegistrySource,
  tenantId: string,
): Promise<boolean> {
  if (isPublicDocsReferenceTenant(tenantId)) {
    return true;
  }
  return assertTenantInRegistry(registrySource, tenantId);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function listRegisteredTenantIds(source: TenantRegistrySource): Promise<string[]> {
  const snapshot = await source.load();
  return Object.keys(snapshot.registry.tenants).sort((a, b) => a.localeCompare(b));
}

function renderTenantPickerPage(tenants: string[]): string {
  const cards = tenants
    .map(
      (tenantId) => `
        <a class="tenant-card" href="/docs/t/${escapeHtml(tenantId)}">
          <span class="tenant-id">${escapeHtml(tenantId)}</span>
          <span class="tenant-cta">Open API reference →</span>
        </a>`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Backed API documentation</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #0b0d10;
      --surface: #141820;
      --border: #252b36;
      --text: #eef1f6;
      --muted: #8b95a8;
      --accent: #5b8def;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      background: radial-gradient(1200px 600px at 10% -10%, #1a2744 0%, var(--bg) 55%);
      color: var(--text);
    }
    main {
      max-width: 720px;
      margin: 0 auto;
      padding: 3rem 1.25rem 4rem;
    }
    .eyebrow {
      font-size: 0.75rem;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--muted);
      margin: 0 0 0.5rem;
    }
    h1 {
      font-size: clamp(1.75rem, 4vw, 2.25rem);
      font-weight: 600;
      margin: 0 0 0.75rem;
      letter-spacing: -0.02em;
    }
    .lead {
      color: var(--muted);
      line-height: 1.55;
      margin: 0 0 2rem;
      max-width: 52ch;
    }
    .grid {
      display: grid;
      gap: 0.75rem;
    }
    .tenant-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 1rem 1.15rem;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--surface);
      color: inherit;
      text-decoration: none;
      transition: border-color 0.15s ease, transform 0.15s ease;
    }
    .tenant-card:hover {
      border-color: var(--accent);
      transform: translateY(-1px);
    }
    .tenant-id {
      font-weight: 600;
      font-size: 1.05rem;
    }
    .tenant-cta {
      font-size: 0.875rem;
      color: var(--accent);
      white-space: nowrap;
    }
  </style>
</head>
<body>
  <main>
    <p class="eyebrow">Backed Platform</p>
    <h1>API documentation</h1>
    <p class="lead">
      Public interactive reference (Scalar). Browse endpoints without signing in; use
      <a href="/login" style="color: var(--accent);">login</a> for Try it out;
      <a href="/logout" style="color: var(--accent);">logout</a> to refresh your session.
    </p>
    <div class="grid">${cards}</div>
  </main>
</body>
</html>`;
}

function scalarConfigForTenant(tenantId: string, publicOrigin: string): Record<string, unknown> {
  const isReference = isPublicDocsReferenceTenant(tenantId);
  const openApiUrl = isReference ? "/openapi.json" : `/t/${tenantId}/openapi.json`;
  // Paths in gateway OpenAPI are prefixed with `/t/{tenantId}`; server URL is the public HTTPS origin.
  const baseServerURL = publicOrigin.replace(/\/$/, "");
  const titleSuffix = isReference ? "Platform" : tenantId;
  return {
    pageTitle: `Backed API · ${titleSuffix}`,
    url: openApiUrl,
    baseServerURL,
    theme: "default",
    layout: "modern",
    authentication: {
      preferredSecurityScheme: GATEWAY_OPENAPI_SESSION_SCHEME,
    },
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

export function registerDocsRoutes(
  app: Hono<{ Variables: GatewayVariables }>,
  config: GatewayConfig,
  registrySource: TenantRegistrySource,
): void {
  app.get("/docs", async (c) => {
    const tenants = await listRegisteredTenantIds(registrySource);
    if (tenants.length === 0) {
      return c.redirect(`/docs/t/${PUBLIC_DOCS_REFERENCE_TENANT}`);
    }
    const defaultTenant = config.defaultTenant;
    if (defaultTenant !== undefined && tenants.includes(defaultTenant)) {
      return c.redirect(`/docs/t/${defaultTenant}`);
    }
    if (tenants.length === 1) {
      const onlyTenant = tenants[0];
      if (onlyTenant !== undefined) {
        return c.redirect(`/docs/t/${onlyTenant}`);
      }
    }
    return c.html(renderTenantPickerPage(tenants));
  });

  app.get("/docs/t/:tenantId", async (c, next) => {
    let tenantId = c.req.param("tenantId");
    if (isPublicDocsReferenceTenant(tenantId)) {
      const registered = await listRegisteredTenantIds(registrySource);
      if (registered.length > 0) {
        const preferred =
          config.defaultTenant !== undefined && registered.includes(config.defaultTenant)
            ? config.defaultTenant
            : registered[0];
        if (preferred !== undefined) {
          return c.redirect(`/docs/t/${preferred}`);
        }
      }
    }
    if (!(await canOpenTenantDocs(registrySource, tenantId))) {
      return c.json({ error: "Tenant not found" }, 404);
    }
    const scalar = Scalar(() => scalarConfigForTenant(tenantId, resolvePublicOrigin(c, config)));
    // Scalar middleware is typed against Hono's default Env; gateway Variables are compatible at runtime.
    // @ts-expect-error — Scalar Context env typing is wider than our GatewayVariables app.
    return scalar(c, next);
  });
}
