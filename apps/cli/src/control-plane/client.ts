export type ControlPlaneClientOptions = {
  baseUrl: string;
  token: string;
  actor?: string;
};

export function readControlPlaneEnv(): ControlPlaneClientOptions | undefined {
  const baseUrl = process.env["BACKED_CONTROL_PLANE_URL"]?.replace(/\/+$/, "");
  const token = process.env["CONTROL_PLANE_INTERNAL_TOKEN"]?.trim();
  if (baseUrl === undefined || baseUrl.length === 0 || token === undefined || token.length === 0) {
    return undefined;
  }
  return { baseUrl, token, actor: process.env["BACKED_CONTROL_PLANE_ACTOR"]?.trim() ?? "cli" };
}

export async function controlPlaneFetch(
  options: ControlPlaneClientOptions,
  tenantId: string,
  path: string,
  init: RequestInit & { revision?: number } = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${options.token}`);
  headers.set("X-Backed-User", options.actor ?? "cli");
  if (init.revision !== undefined) {
    headers.set("If-Match", String(init.revision));
  }
  const url = `${options.baseUrl}/v1/tenants/${encodeURIComponent(tenantId)}${path}`;
  return fetch(url, { ...init, headers });
}
