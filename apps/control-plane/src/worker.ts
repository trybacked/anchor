import "./worker-health.js";
import { provisionTenantFiles } from "@trybacked/platform-admin";
import { applyControlPlaneSchema } from "./apply-schema.js";
import { readControlPlaneConfig } from "./config.js";
import { createPool } from "./db/pool.js";
import {
  claimNextJob,
  completeJob,
  failJob,
  getOrganizationByTenantId,
  requeueJob,
  updateOrganizationStatus,
} from "./db/repositories.js";
import { runPublishOntologyJob } from "./jobs/publish-ontology.js";

const config = readControlPlaneConfig(process.env);
const pool = createPool(config.databaseUrl);
const MAX_ATTEMPTS = 5;
const POLL_MS = 2000;

async function provisionOrganization(
  organizationId: string,
  tenantId: string,
): Promise<Record<string, unknown>> {
  const org = await getOrganizationByTenantId(pool, tenantId);
  if (org === undefined) {
    throw new Error(`Organization ${tenantId} not found`);
  }
  await updateOrganizationStatus(pool, organizationId, "provisioning");
  const result = await provisionTenantFiles({
    tenantId,
    catalog: org.catalog,
    filesRoot: config.filesRoot,
    registryRoot: config.filesRegistryRoot,
  });
  await updateOrganizationStatus(pool, organizationId, "active", {
    servicePrincipalAppId: result.servicePrincipalAppId,
  });
  return {
    tenantId,
    servicePrincipalAppId: result.servicePrincipalAppId,
  };
}

function failureMarksOrganizationFailed(kind: string): boolean {
  return kind !== "publish_ontology";
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
    if (job.kind === "publish_ontology") {
      const catalog = typeof job.payload.catalog === "string" ? job.payload.catalog : undefined;
      const actor = typeof job.payload.actor === "string" ? job.payload.actor : "system";
      const notes = typeof job.payload.notes === "string" ? job.payload.notes : undefined;
      const method =
        job.payload.method === "rollback" ? ("rollback" as const) : ("publish" as const);
      const derivedFromVersion =
        typeof job.payload.derivedFromVersion === "number" &&
        Number.isFinite(job.payload.derivedFromVersion)
          ? job.payload.derivedFromVersion
          : undefined;
      if (catalog === undefined) {
        throw new Error("publish_ontology payload missing catalog");
      }
      const result = await runPublishOntologyJob(pool, config, {
        tenantId,
        catalog,
        actor,
        notes,
        method,
        ...(derivedFromVersion !== undefined ? { derivedFromVersion } : {}),
      });
      await completeJob(pool, job.id, result);
      return true;
    }
    const result = await provisionOrganization(job.organization_id, tenantId);
    await completeJob(pool, job.id, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (job.attempts >= MAX_ATTEMPTS) {
      await failJob(pool, job.id, message);
      if (failureMarksOrganizationFailed(job.kind)) {
        await updateOrganizationStatus(pool, job.organization_id, "failed");
      }
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
  console.error("Control plane worker started (files engine)");
  await loop();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
