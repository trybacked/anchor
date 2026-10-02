import { databricksJson, runDatabricksCliOrThrow } from "./databricks-cli.js";

type ServicePrincipalListItem = {
  id?: string;
  applicationId?: string;
  displayName?: string;
};

export function ensureServicePrincipal(
  profile: string,
  spName: string,
): { applicationId: string; scimId: string } {
  const listed = databricksJson(["service-principals", "list"], {
    profile,
    label: "service-principals list",
  }) as ServicePrincipalListItem[] | { Resources?: ServicePrincipalListItem[] };
  const sps = Array.isArray(listed) ? listed : (listed.Resources ?? []);
  const existing = sps.find((sp) => sp.displayName === spName);
  let applicationId = existing?.applicationId;
  if (applicationId === undefined || applicationId.length === 0) {
    const created = databricksJson(["service-principals", "create", "--display-name", spName], {
      profile,
      label: "service-principals create",
    }) as { applicationId: string; id: string };
    applicationId = created.applicationId;
  }
  const refreshed = databricksJson(["service-principals", "list"], { profile }) as
    ServicePrincipalListItem[] | { Resources?: ServicePrincipalListItem[] };
  const all = Array.isArray(refreshed) ? refreshed : (refreshed.Resources ?? []);
  const match = all.find((sp) => sp.applicationId === applicationId);
  const scimId = match?.id;
  if (scimId === undefined || scimId.length === 0) {
    throw new Error(`Could not resolve SCIM id for service principal ${spName}.`);
  }

  runDatabricksCliOrThrow(
    [
      "api",
      "patch",
      `/api/2.0/preview/scim/v2/ServicePrincipals/${scimId}`,
      "--json",
      JSON.stringify({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
        Operations: [
          {
            op: "add",
            path: "entitlements",
            value: [{ value: "databricks-sql-access" }],
          },
        ],
      }),
    ],
    { profile, label: "SP SQL entitlement" },
  );

  return { applicationId, scimId };
}

export function createOboToken(profile: string, applicationId: string, label: string): string {
  runDatabricksCliOrThrow(
    [
      "api",
      "patch",
      "/api/2.0/permissions/authorization/tokens",
      "--json",
      JSON.stringify({
        access_control_list: [
          { service_principal_name: applicationId, permission_level: "CAN_USE" },
        ],
      }),
    ],
    { profile, label: "token CAN_USE" },
  );
  const tokenResponse = databricksJson(
    ["token-management", "create-obo-token", applicationId, "--comment", `backed ${label}`],
    { profile, label: "create-obo-token" },
  ) as { token_value: string };
  return tokenResponse.token_value;
}
