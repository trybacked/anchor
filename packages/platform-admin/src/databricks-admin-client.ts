import type { DatabricksProviderConfig } from "@trybacked/adapter-databricks";
export type DatabricksAdminClientDeps = {
  fetchImpl?: typeof fetch;
};
type ServicePrincipalResource = {
  id?: string;
  applicationId?: string;
  displayName?: string;
};
type ScimListResponse = {
  Resources?: ServicePrincipalResource[];
  totalResults?: number;
};
function apiBase(host: string): string {
  const normalized = host.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return `https://${normalized}`;
}
async function apiRequest<T>(
  config: DatabricksProviderConfig,
  method: string,
  path: string,
  body?: unknown,
  deps: DatabricksAdminClientDeps = {},
): Promise<T> {
  const fetchFn = deps.fetchImpl ?? fetch;
  const response = await fetchFn(`${apiBase(config.host)}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Databricks ${method} ${path} failed (${String(response.status)}): ${text}`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  const text = await response.text();
  if (text.length === 0) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}
async function listServicePrincipals(
  config: DatabricksProviderConfig,
  deps: DatabricksAdminClientDeps,
): Promise<ServicePrincipalResource[]> {
  const payload = await apiRequest<ScimListResponse>(
    config,
    "GET",
    "/api/2.0/preview/scim/v2/ServicePrincipals?attributes=id,applicationId,displayName",
    undefined,
    deps,
  );
  return payload.Resources ?? [];
}
export async function ensureServicePrincipal(
  config: DatabricksProviderConfig,
  spName: string,
  deps: DatabricksAdminClientDeps = {},
): Promise<{
  applicationId: string;
  scimId: string;
}> {
  const sps = await listServicePrincipals(config, deps);
  let existing = sps.find((sp) => sp.displayName === spName);
  if (existing?.applicationId === undefined || existing.applicationId.length === 0) {
    await apiRequest<ServicePrincipalResource>(
      config,
      "POST",
      "/api/2.0/preview/scim/v2/ServicePrincipals",
      {
        displayName: spName,
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServicePrincipal"],
      },
      deps,
    );
    const refreshed = await listServicePrincipals(config, deps);
    existing = refreshed.find((sp) => sp.displayName === spName);
  }
  const applicationId = existing?.applicationId;
  const scimId = existing?.id;
  if (applicationId === undefined || applicationId.length === 0) {
    throw new Error(`Could not resolve application id for service principal ${spName}.`);
  }
  if (scimId === undefined || scimId.length === 0) {
    throw new Error(`Could not resolve SCIM id for service principal ${spName}.`);
  }
  await apiRequest(
    config,
    "PATCH",
    `/api/2.0/preview/scim/v2/ServicePrincipals/${scimId}`,
    {
      schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
      Operations: [
        {
          op: "add",
          path: "entitlements",
          value: [{ value: "databricks-sql-access" }],
        },
      ],
    },
    deps,
  );
  return { applicationId, scimId };
}
export async function grantTokenCanUse(
  config: DatabricksProviderConfig,
  applicationId: string,
  deps: DatabricksAdminClientDeps = {},
): Promise<void> {
  await apiRequest(
    config,
    "PATCH",
    "/api/2.0/permissions/authorization/tokens",
    {
      access_control_list: [{ service_principal_name: applicationId, permission_level: "CAN_USE" }],
    },
    deps,
  );
}
export async function createOboToken(
  config: DatabricksProviderConfig,
  applicationId: string,
  comment: string,
  deps: DatabricksAdminClientDeps = {},
): Promise<string> {
  await grantTokenCanUse(config, applicationId, deps);
  const response = await apiRequest<{
    token_value?: string;
  }>(
    config,
    "POST",
    "/api/2.0/token-management/on-behalf-of/tokens",
    {
      application_id: applicationId,
      comment,
      lifetime_seconds: 7776000,
    },
    deps,
  );
  const token = response.token_value;
  if (token === undefined || token.length === 0) {
    throw new Error("Databricks OBO token response missing token_value.");
  }
  return token;
}
export async function patchWarehousePermissions(
  config: DatabricksProviderConfig,
  warehouseId: string,
  applicationId: string,
  permissionLevel: "CAN_USE" | "CAN_MANAGE",
  deps: DatabricksAdminClientDeps = {},
): Promise<void> {
  await apiRequest(
    config,
    "PATCH",
    `/api/2.0/permissions/sql/warehouses/${warehouseId}`,
    {
      access_control_list: [
        { service_principal_name: applicationId, permission_level: permissionLevel },
      ],
    },
    deps,
  );
}
