import { join } from "node:path";
import { runDatabricksCliOrThrow } from "../tenant/databricks-cli.js";
import { loadTenantsRegistry, saveTenantsRegistry } from "../tenant/registry.js";
import { findBackedRepoRoot } from "../tenant/repo-root.js";
import { ensureServicePrincipal, createOboToken } from "../tenant/service-principal.js";
import { initUi } from "../ui/index.js";

function normalizeHost(hostUrl: string): string {
  return hostUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

export function platformBootstrapCommand(args: string[]): void {
  const ui = initUi();
  if (args.some((arg) => arg === "--help" || arg === "-h")) {
    ui.log("Usage: backed platform bootstrap");
    ui.log("  Create or reuse the backed-platform service principal and print deploy env.");
    return;
  }

  const repoRoot = findBackedRepoRoot();
  const registryPath = join(repoRoot, "tenants.yaml");
  const registry = loadTenantsRegistry(registryPath);
  const profile = registry.enrollment.profile;
  const warehouseId = registry.enrollment.warehouse_id;
  const hostUrl = registry.enrollment.host.startsWith("http")
    ? registry.enrollment.host
    : `https://${registry.enrollment.host}`;
  const host = normalizeHost(hostUrl);
  const spName = "backed-platform";

  const { applicationId } = ensureServicePrincipal(profile, spName);

  runDatabricksCliOrThrow(
    [
      "api",
      "patch",
      `/api/2.0/permissions/sql/warehouses/${warehouseId}`,
      "--json",
      JSON.stringify({
        access_control_list: [
          { service_principal_name: applicationId, permission_level: "CAN_USE" },
        ],
      }),
    ],
    { profile, label: "warehouse CAN_USE (platform)" },
  );

  const token = createOboToken(profile, applicationId, "platform");

  const updated = {
    ...registry,
    enrollment: {
      ...registry.enrollment,
      platform_principal: applicationId,
    },
  };
  saveTenantsRegistry(registryPath, updated);

  ui.heading("Platform bootstrap");
  ui.writeSuccess(`Service principal ${spName} → ${applicationId}`);
  ui.blank();
  ui.log("Add to anchor/deploy/.env (platform api-server + gateway):");
  ui.log(`BACKED_DATABRICKS_HOST=${host}`);
  ui.log(`BACKED_DATABRICKS_TOKEN=${token}`);
  ui.log(`BACKED_DATABRICKS_WAREHOUSE_ID=${warehouseId}`);
  ui.log("ANCHOR_API_TOKEN=<generate-a-secret>");
  ui.log("GATEWAY_PLATFORM_TOKEN=<same as ANCHOR_API_TOKEN>");
  ui.detail("platform_principal saved in tenants.yaml enrollment");
}

export async function platformStatusCommand(args: string[]): Promise<void> {
  const ui = initUi();
  if (args.some((arg) => arg === "--help" || arg === "-h")) {
    ui.log("Usage: backed platform status [--remote]");
    ui.log("  Remote ontology publication version per tenant catalog.");
    return;
  }

  if (args.includes("--remote")) {
    const { listOrganizationsRemote, readControlPlaneClientFromEnv } =
      await import("../tenant/control-plane-client.js");
    try {
      const client = readControlPlaneClientFromEnv();
      const orgs = await listOrganizationsRemote(client);
      ui.heading("Platform status (control plane)");
      for (const org of orgs) {
        ui.log(`  ${org.tenant_id} · catalog ${org.catalog} · ${org.status}`);
      }
    } catch (error) {
      ui.writeError(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
    return;
  }

  const repoRoot = findBackedRepoRoot();
  const registry = loadTenantsRegistry(join(repoRoot, "tenants.yaml"));
  const { canPublishRemoteOntology, loadRemoteCurrent } =
    await import("../tenant/remote-ontology.js");

  if (!canPublishRemoteOntology()) {
    ui.writeError(
      "Set BACKED_DATABRICKS_HOST, BACKED_DATABRICKS_TOKEN, BACKED_DATABRICKS_WAREHOUSE_ID.",
    );
    process.exitCode = 1;
    return;
  }

  ui.heading("Platform status");
  for (const [tenantId, entry] of Object.entries(registry.tenants)) {
    const remote = await loadRemoteCurrent(entry.catalog);
    if (remote === null) {
      ui.log(`  ${tenantId} · catalog ${entry.catalog} · ${ui.warn("no remote publication")}`);
      continue;
    }
    const ontologyId = remote.ontology.metadata.id;
    ui.log(
      `  ${tenantId} · catalog ${entry.catalog} · v${String(remote.version)} · ontology ${ontologyId}`,
    );
  }
}
