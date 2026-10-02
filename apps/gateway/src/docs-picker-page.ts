import { docsPathForTenant, GATEWAY_AUTH_PATHS } from "./gateway-paths.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderDocsTenantPickerPage(tenantIds: string[]): string {
  const cards = tenantIds
    .map(
      (tenantId) => `
        <a class="tenant-card" href="${escapeHtml(docsPathForTenant(tenantId))}">
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
    .linklike {
      margin: 0 0 2rem;
      padding: 0;
      border: 0;
      background: none;
      color: var(--accent);
      font: inherit;
      font-size: 0.875rem;
      cursor: pointer;
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <main>
    <p class="eyebrow">Backed Platform</p>
    <h1>API documentation</h1>
    <p class="lead">
      Public interactive reference (Scalar). Browse endpoints without signing in; use
      <a href="${GATEWAY_AUTH_PATHS.login}" style="color: var(--accent);">login</a> for Try it out.
    </p>
    <form method="post" action="${GATEWAY_AUTH_PATHS.logout}">
      <button type="submit" class="linklike">Sign out to refresh your workspace list</button>
    </form>
    <div class="grid">${cards}</div>
  </main>
</body>
</html>`;
}
