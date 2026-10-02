import "./worker-health.js";
import { resolveTenantCatalog } from "@trybacked/core";
import { provisionTenantCloud } from "@trybacked/platform-admin";
import type { DatabricksProviderConfig } from "@trybacked/provider-databricks";
import { applyControlPlaneSchema } from "./apply-schema.js";
import { readControlPlaneConfig } from "./config.js";
import { createPool } from "./db/pool.js";
import {
  claimNextJob,
  completeJob,
  failJob,
  getOrganizationByTenantId,
  listActiveOrganizations,
  requeueJob,
  updateOrganizationStatus,
} from "./db/repositories.js";
import { buildTenantsRegistry } from "./registry-builder.js";

const config = readControlPlaneConfig(process.env);
const pool = createPool(config.databaseUrl);

const adminConfig: DatabricksProviderConfig = {
  host: config.databricksHost.replace(/^https?:\/\//, "").replace(/\/+$/, ""),
  token: config.databricksToken,
  warehouseId: config.databricksWarehouseId,
};

const MAX_ATTEMPTS = 5;
const POLL_MS = 2000;

async function provisionOrganization(
  organizationId: string,
  tenantId: string,
  issueObo: boolean,
): Promise<Record<string, unknown>> {
  const org = await getOrganizationByTenantId(pool, tenantId);
  if (org === undefined) {
    throw new Error(`Organization ${tenantId} not found`);
  }
  await updateOrganizationStatus(pool, organizationId, "provisioning");
  const orgs = await listActiveOrganizations(pool);
  const registry = buildTenantsRegistry(config, orgs);
  const shared = Array.isArray(org.shared_spaces)
    ? org.shared_spaces.filter((v): v is string => typeof v === "string")
    : ["anac"];

  const result = await provisionTenantCloud({
    tenantId,
    catalog: resolveTenantCatalog(tenantId),
    sharedSpaceKeys: shared,
    registry,
    adminConfig,
    platformPrincipal: config.platformPrincipal,
    issueTenantOboToken: issueObo,
  });

  await updateOrganizationStatus(pool, organizationId, "active", {
    servicePrincipalAppId: result.servicePrincipalAppId,
  });

  return {
    tenantId,
    publicationVersion: result.publicationVersion,
    servicePrincipalAppId: result.servicePrincipalAppId,
    ...(result.tenantOboToken !== undefined ? { tenantOboToken: result.tenantOboToken } : {}),
  };
}

async function processJob(): Promise<boolean> {
  const job = await claimNextJob(pool);
  if (job === undefined) {
    return false;
  }
  try {
    const tenantId = typeof job.payload.tenantId === "string" ? job.payload.tenantId : undefined;
    if (tenantId === undefined) {
      throw new Error("Job payload missing tenantId");
    }
    const issueObo = job.kind === "create_tenant";
    const result = await provisionOrganization(job.organization_id, tenantId, issueObo);
    await completeJob(pool, job.id, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (job.attempts >= MAX_ATTEMPTS) {
      await failJob(pool, job.id, message);
      await updateOrganizationStatus(pool, job.organization_id, "failed");
    } else {
      await requeueJob(pool, job.id);
    }
  }
  return true;
}

async function loop(): Promise<void> {
  for (;;) {
    const processed = await processJob();
    if (!processed) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
  }
}

async function main(): Promise<void> {
  await applyControlPlaneSchema(pool);
  console.error("Control plane worker started");
  await loop();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
