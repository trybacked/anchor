import type { TenantsRegistry } from "@trybacked/core";
import {
  createDatabricksSqlClient,
  type DatabricksProviderConfig,
} from "@trybacked/provider-databricks";

export type AdminSqlClient = {
  execute: (statement: string) => Promise<void>;
};

export function createAdminSqlClient(config: DatabricksProviderConfig): AdminSqlClient {
  const sql = createDatabricksSqlClient(config);
  return {
    execute: async (statement: string) => {
      await sql.execute(statement);
    },
  };
}

export async function ensureRegistryVolume(admin: AdminSqlClient, catalog: string): Promise<void> {
  await admin.execute(`CREATE SCHEMA IF NOT EXISTS \`${catalog}\`.\`backed\``);
  await admin.execute(`CREATE VOLUME IF NOT EXISTS \`${catalog}\`.\`backed\`.\`registry\``);
}

export async function ensureDocsRawVolume(admin: AdminSqlClient, catalog: string): Promise<void> {
  await admin.execute(`CREATE SCHEMA IF NOT EXISTS \`${catalog}\`.\`docs\``);
  await admin.execute(`CREATE VOLUME IF NOT EXISTS \`${catalog}\`.\`docs\`.\`raw\``);
}

export async function createTenantCatalog(
  admin: AdminSqlClient,
  catalog: string,
  tenantId: string,
): Promise<void> {
  await admin.execute(
    `CREATE CATALOG IF NOT EXISTS \`${catalog}\` COMMENT 'Backed tenant: ${tenantId}'`,
  );
}

export async function grantTenantCatalogToPrincipal(
  admin: AdminSqlClient,
  catalog: string,
  applicationId: string,
): Promise<void> {
  await admin.execute(`GRANT ALL PRIVILEGES ON CATALOG \`${catalog}\` TO \`${applicationId}\``);
}

export async function grantSharedSpacesToPrincipal(
  admin: AdminSqlClient,
  registry: TenantsRegistry,
  catalog: string,
  applicationId: string,
  sharedKeys: string[],
): Promise<void> {
  for (const key of sharedKeys) {
    const space = registry.shared_spaces[key];
    if (space === undefined) {
      throw new Error(`Unknown shared space "${key}" in registry shared_spaces.`);
    }
    if (space.catalog === catalog) {
      continue;
    }
    await admin.execute(
      `GRANT USE CATALOG ON CATALOG \`${space.catalog}\` TO \`${applicationId}\``,
    );
    await admin.execute(
      `GRANT USE SCHEMA ON SCHEMA \`${space.catalog}\`.\`${space.schema}\` TO \`${applicationId}\``,
    );
    await admin.execute(
      `GRANT SELECT ON SCHEMA \`${space.catalog}\`.\`${space.schema}\` TO \`${applicationId}\``,
    );
  }
}

async function grantDocsRawVolumeAccess(
  admin: AdminSqlClient,
  catalog: string,
  platformPrincipal: string,
): Promise<void> {
  await admin.execute(
    `GRANT USE SCHEMA ON SCHEMA \`${catalog}\`.\`docs\` TO \`${platformPrincipal}\``,
  );
  await admin.execute(
    `GRANT READ VOLUME, WRITE VOLUME ON VOLUME \`${catalog}\`.\`docs\`.\`raw\` TO \`${platformPrincipal}\``,
  );
}

export async function grantPlatformPrincipalOnTenant(
  admin: AdminSqlClient,
  registry: TenantsRegistry,
  catalog: string,
  platformPrincipal: string,
  sharedKeys: string[],
): Promise<void> {
  await admin.execute(`GRANT USE CATALOG ON CATALOG \`${catalog}\` TO \`${platformPrincipal}\``);
  await admin.execute(
    `GRANT USE SCHEMA ON SCHEMA \`${catalog}\`.\`backed\` TO \`${platformPrincipal}\``,
  );
  await admin.execute(
    `GRANT READ VOLUME ON VOLUME \`${catalog}\`.\`backed\`.\`registry\` TO \`${platformPrincipal}\``,
  );
  await grantDocsRawVolumeAccess(admin, catalog, platformPrincipal);
  for (const key of sharedKeys) {
    const space = registry.shared_spaces[key];
    if (space === undefined) {
      throw new Error(`Unknown shared space "${key}" in registry shared_spaces.`);
    }
    if (space.catalog === catalog) {
      continue;
    }
    await admin.execute(
      `GRANT USE CATALOG ON CATALOG \`${space.catalog}\` TO \`${platformPrincipal}\``,
    );
    await admin.execute(
      `GRANT USE SCHEMA ON SCHEMA \`${space.catalog}\`.\`${space.schema}\` TO \`${platformPrincipal}\``,
    );
    await admin.execute(
      `GRANT SELECT ON SCHEMA \`${space.catalog}\`.\`${space.schema}\` TO \`${platformPrincipal}\``,
    );
  }
}
