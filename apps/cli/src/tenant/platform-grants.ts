import { executeAdminSql } from "./databricks-cli.js";
import type { TenantsRegistry } from "./registry.js";
export async function ensureRegistryVolume(
  profile: string,
  warehouseId: string,
  catalog: string,
): Promise<void> {
  await executeAdminSql({
    profile,
    warehouseId,
    statement: `CREATE SCHEMA IF NOT EXISTS \`${catalog}\`.\`backed\``,
  });
  await executeAdminSql({
    profile,
    warehouseId,
    statement: `CREATE VOLUME IF NOT EXISTS \`${catalog}\`.\`backed\`.\`registry\``,
  });
}
export async function grantPlatformPrincipalOnTenant(options: {
  profile: string;
  warehouseId: string;
  registry: TenantsRegistry;
  catalog: string;
  platformPrincipal: string;
  sharedKeys: string[];
}): Promise<void> {
  const { profile, warehouseId, catalog, platformPrincipal, registry, sharedKeys } = options;
  const tasks: Promise<void>[] = [
    executeAdminSql({
      profile,
      warehouseId,
      statement: `GRANT USE CATALOG ON CATALOG \`${catalog}\` TO \`${platformPrincipal}\``,
    }),
    executeAdminSql({
      profile,
      warehouseId,
      statement: `GRANT USE SCHEMA ON SCHEMA \`${catalog}\`.\`backed\` TO \`${platformPrincipal}\``,
    }),
    executeAdminSql({
      profile,
      warehouseId,
      statement: `GRANT READ VOLUME ON VOLUME \`${catalog}\`.\`backed\`.\`registry\` TO \`${platformPrincipal}\``,
    }),
  ];
  tasks.push(
    executeAdminSql({
      profile,
      warehouseId,
      statement: `GRANT USE SCHEMA ON SCHEMA \`${catalog}\`.\`docs\` TO \`${platformPrincipal}\``,
    }),
    executeAdminSql({
      profile,
      warehouseId,
      statement: `GRANT READ VOLUME, WRITE VOLUME ON VOLUME \`${catalog}\`.\`docs\`.\`raw\` TO \`${platformPrincipal}\``,
    }),
  );
  for (const key of sharedKeys) {
    const space = registry.shared_spaces[key];
    if (space === undefined) {
      throw new Error(`Unknown shared space "${key}" in tenants.yaml shared_spaces.`);
    }
    if (space.catalog === catalog) {
      continue;
    }
    tasks.push(
      executeAdminSql({
        profile,
        warehouseId,
        statement: `GRANT USE CATALOG ON CATALOG \`${space.catalog}\` TO \`${platformPrincipal}\``,
      }),
      executeAdminSql({
        profile,
        warehouseId,
        statement: `GRANT USE SCHEMA ON SCHEMA \`${space.catalog}\`.\`${space.schema}\` TO \`${platformPrincipal}\``,
      }),
      executeAdminSql({
        profile,
        warehouseId,
        statement: `GRANT SELECT ON SCHEMA \`${space.catalog}\`.\`${space.schema}\` TO \`${platformPrincipal}\``,
      }),
    );
  }
  await Promise.all(tasks);
}
