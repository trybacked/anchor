import type { TenantsRegistry } from "@trybacked/core";
import {
  type DatabricksProviderConfig,
} from "@trybacked/adapter-databricks";
import { grantDocsRefreshJobRunIfPresent } from "./admin-jobs.js";
import {
  createAdminSqlClient,
  createTenantCatalog,
  ensureDocsRawVolume,
  ensureRegistryVolume,
  grantPlatformPrincipalOnTenant,
  grantSharedSpacesToPrincipal,
  grantTenantCatalogToPrincipal,
} from "./admin-sql.js";
import {
  createOboToken,
  ensureServicePrincipal,
  patchWarehousePermissions,
  type DatabricksAdminClientDeps,
} from "./databricks-admin-client.js";
export type CloudProvisionTenantOptions = {
  tenantId: string;
  catalog: string;
  sharedSpaceKeys: string[];
  registry: TenantsRegistry;
  adminConfig: DatabricksProviderConfig;
  platformPrincipal?: string | undefined;
  issueTenantOboToken?: boolean | undefined;
  deps?: DatabricksAdminClientDeps | undefined;
};
export type CloudProvisionTenantResult = {
  tenantId: string;
  catalog: string;
  servicePrincipalAppId: string;
  tenantOboToken?: string | undefined;
};
export async function provisionTenantCloud(
  options: CloudProvisionTenantOptions,
): Promise<CloudProvisionTenantResult> {
  const { adminConfig, registry, catalog, tenantId, sharedSpaceKeys } = options;
  const deps = options.deps ?? {};
  const warehouseId = registry.enrollment.warehouse_id;
  const admin = createAdminSqlClient(adminConfig);
  await createTenantCatalog(admin, catalog, tenantId);
  await ensureRegistryVolume(admin, catalog);
  await ensureDocsRawVolume(admin, catalog);
  const spName = `backed-tenant-${tenantId}`;
  const { applicationId } = await ensureServicePrincipal(adminConfig, spName, deps);
  await grantTenantCatalogToPrincipal(admin, catalog, applicationId);
  await grantSharedSpacesToPrincipal(admin, registry, catalog, applicationId, sharedSpaceKeys);
  const platformPrincipal = options.platformPrincipal ?? registry.enrollment.platform_principal;
  if (platformPrincipal !== undefined && platformPrincipal.length > 0) {
    await grantPlatformPrincipalOnTenant(
      admin,
      registry,
      catalog,
      platformPrincipal,
      sharedSpaceKeys,
    );
    await grantDocsRefreshJobRunIfPresent(adminConfig, catalog, platformPrincipal);
  }
  await patchWarehousePermissions(adminConfig, warehouseId, applicationId, "CAN_USE", deps);
  // Bootstrap ships an empty ontology: the AI proposal pipeline (ontology-ai)
  // seeds object types from the registered sources (Plan Fase 7).
  let tenantOboToken: string | undefined;
  if (options.issueTenantOboToken === true) {
    tenantOboToken = await createOboToken(adminConfig, applicationId, `backed ${tenantId}`, deps);
  }
  return {
    tenantId,
    catalog,
    servicePrincipalAppId: applicationId,
    ...(tenantOboToken !== undefined ? { tenantOboToken } : {}),
  };
}
