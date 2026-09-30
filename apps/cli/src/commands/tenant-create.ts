import { initUi } from "../ui/index.js";
import { provisionTenant } from "../tenant/provision.js";
import { validateTenantId } from "../tenant/registry.js";
import type { CommandHandler } from "../types.js";

function parseTenantCreateArgs(args: string[]): {
  tenantId: string;
  dryRun: boolean;
  skipBundle: boolean;
  shared: string[];
  help: boolean;
} {
  let tenantId = "";
  let dryRun = false;
  let skipBundle = false;
  const shared: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (arg.length === 0) {
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      return { tenantId: "", dryRun: false, skipBundle: false, shared: [], help: true };
    }
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--skip-bundle") {
      skipBundle = true;
      continue;
    }
    if (arg === "--shared") {
      const sharedKey = args[index + 1];
      if (sharedKey === undefined || sharedKey.startsWith("--")) {
        throw new Error("--shared requires a shared_spaces key (e.g. anac)");
      }
      shared.push(sharedKey);
      index += 1;
      continue;
    }
    if (arg.startsWith("--")) {
      throw new Error(`Unknown flag: ${arg}`);
    }
    if (tenantId.length === 0) {
      tenantId = arg;
    }
  }
  return { tenantId, dryRun, skipBundle, shared, help: false };
}

export const tenantCreateCommand: CommandHandler = async (args) => {
  const ui = initUi();
  let parsed;
  try {
    parsed = parseTenantCreateArgs(args);
  } catch (error) {
    ui.writeError(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  if (parsed.help) {
    ui.log("Usage: backed tenant create <tenant-id> [--shared anac] [--dry-run] [--skip-bundle]");
    ui.log("  Provisions UC catalog, bundle deploy, SP token, env file, ontology bootstrap, tenants.yaml.");
    ui.log("  Requires databricks CLI + admin profile from tenants.yaml enrollment.");
    return;
  }

  if (parsed.tenantId.length === 0) {
    ui.writeError("Missing tenant id. Example: backed tenant create gerace");
    process.exitCode = 1;
    return;
  }

  try {
    validateTenantId(parsed.tenantId);
  } catch (error) {
    ui.writeError(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  const sharedSpaceKeys = parsed.shared.length > 0 ? parsed.shared : ["anac"];

  if (parsed.dryRun) {
    ui.heading("Dry run");
    ui.log(`Tenant: ${parsed.tenantId}`);
    ui.log(`Shared: ${sharedSpaceKeys.join(", ")}`);
    ui.log("Would run catalog, bundle, SP, grants, env, ontology bootstrap, tenants.yaml.");
    return;
  }

  ui.heading(`Tenant ${parsed.tenantId}`);
  try {
    const result = await provisionTenant({
      tenantId: parsed.tenantId,
      sharedSpaceKeys,
      dryRun: false,
      skipBundle: parsed.skipBundle,
    });
    ui.writeSuccess(`Catalog ${result.catalog} · SP ${result.servicePrincipalAppId}`);
    ui.detail(`Env: ${ui.path(result.envFile)}`);
    ui.detail(`Ontology: ${ui.path(result.ontologyDir)} (publication v${String(result.publicationVersion)})`);
    if (result.registryUpdated) {
      ui.detail("Updated tenants.yaml");
    }
    ui.blank();
    ui.log("Next: ./scripts/sync-claude-mcp-runtime.sh and register MCP " + ui.command(`backed-${parsed.tenantId}`));
  } catch (error) {
    ui.writeError(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
};
