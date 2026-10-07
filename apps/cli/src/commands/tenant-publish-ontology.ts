import { resolveTenantCatalog } from "@trybacked/core";
import { publishTenantDocumentOntologyToVolume } from "@trybacked/platform-admin";
import { join } from "node:path";
import { findBackedRepoRoot } from "../tenant/repo-root.js";
import { loadTenantsRegistry } from "../tenant/registry.js";
import { databricksConfigFromEnrollment } from "../tenant/remote-ontology.js";
import type { CommandHandler } from "../types.js";
import { initUi } from "../ui/index.js";

export const tenantPublishOntologyCommand: CommandHandler = async (args) => {
  const ui = initUi();
  const tenantId = args[0]?.trim();
  if (tenantId === undefined || tenantId.length === 0 || args[0] === "--help" || args[0] === "-h") {
    ui.log("Usage: backed tenant publish-ontology <tenant-id>");
    ui.log("  Publishes the in-memory document ontology to the tenant UC registry (no model.yaml).");
    return;
  }
  const repoRoot = findBackedRepoRoot();
  const registry = loadTenantsRegistry(join(repoRoot, "tenants.yaml"));
  const entry = registry.tenants[tenantId];
  if (entry === undefined) {
    ui.writeError(`Tenant "${tenantId}" is not in tenants.yaml.`);
    process.exitCode = 1;
    return;
  }
  const catalog = entry.catalog ?? resolveTenantCatalog(tenantId);
  const adminConfig = databricksConfigFromEnrollment(registry);
  const { version, runId } = await publishTenantDocumentOntologyToVolume({
    tenantId,
    catalog,
    adminConfig,
  });
  ui.log(ui.success(`Published ontology v${String(version)} → catalog ${catalog} (run ${runId})`));
};
