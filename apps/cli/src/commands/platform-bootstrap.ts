import { join } from "node:path";
import { loadTenantsRegistry } from "../tenant/registry.js";
import { findBackedRepoRoot } from "../tenant/repo-root.js";
import { initUi } from "../ui/index.js";

export function platformBootstrapCommand(args: string[]): void {
  const ui = initUi();
  if (args.some((arg) => arg === "--help" || arg === "-h")) {
    ui.log("Usage: backed platform bootstrap");
    ui.log("  Print recommended files-engine env for platform api-server + gateway.");
    return;
  }
  const repoRoot = findBackedRepoRoot();
  loadTenantsRegistry(join(repoRoot, "tenants.yaml"));
  const filesRoot = join(repoRoot, "sources");
  const registryRoot = join(repoRoot, ".backed", "remote-registry");
  ui.heading("Platform bootstrap (files engine)");
  ui.blank();
  ui.log("Add to anchor/deploy/.env (platform api-server + gateway + control-plane):");
  ui.log("BACKED_ENGINE=files");
  ui.log(`BACKED_FILES_ROOT=${filesRoot}`);
  ui.log(`BACKED_FILES_REGISTRY_ROOT=${registryRoot}`);
  ui.log("ANCHOR_API_TOKEN=<generate-a-secret>");
  ui.log("GATEWAY_PLATFORM_TOKEN=<same as ANCHOR_API_TOKEN>");
  ui.detail(
    "Tenant catalogs map to subfolders under BACKED_FILES_ROOT and registry paths under BACKED_FILES_REGISTRY_ROOT.",
  );
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
      "Set BACKED_FILES_REGISTRY_ROOT (or run from anchor with default .backed/remote-registry).",
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
