import { provisionTenantFiles } from "@trybacked/platform-admin";
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  ensureTenantInRegistry,
  loadTenantsRegistry,
  resolveBundleTarget,
  resolveTenantCatalog,
  saveTenantsRegistry,
} from "./registry.js";
import { findBackedRepoRoot } from "./repo-root.js";

export type TenantCreateOptions = {
  tenantId: string;
  sharedSpaceKeys: string[];
  dryRun: boolean;
  skipBundle: boolean;
  repoRoot?: string | undefined;
  filesRoot?: string | undefined;
  registryRoot?: string | undefined;
};

export type TenantCreateResult = {
  tenantId: string;
  catalog: string;
  envFile: string;
  bundleTarget: string;
  servicePrincipalAppId: string;
  registryUpdated: boolean;
  publicationVersion: number;
};

function writeTenantEnvFile(options: {
  envFile: string;
  filesRoot: string;
  registryRoot: string;
  catalog: string;
}): void {
  mkdirSync(dirname(options.envFile), { recursive: true });
  const body = [
    "BACKED_ENGINE=files",
    `BACKED_FILES_ROOT=${options.filesRoot}`,
    `BACKED_FILES_REGISTRY_ROOT=${options.registryRoot}`,
    `BACKED_CATALOG=${options.catalog}`,
    "",
  ].join("\n");
  writeFileSync(options.envFile, body, "utf8");
  try {
    chmodSync(options.envFile, 0o600);
  } catch {
    return;
  }
}

export async function provisionTenant(options: TenantCreateOptions): Promise<TenantCreateResult> {
  const repoRoot = options.repoRoot ?? findBackedRepoRoot();
  const registryPath = join(repoRoot, "tenants.yaml");
  const registry = loadTenantsRegistry(registryPath);
  const catalog = resolveTenantCatalog(options.tenantId);
  const bundleTarget = resolveBundleTarget(options.tenantId, registry.enrollment.bundle_target);
  const filesRoot = options.filesRoot ?? join(repoRoot, "sources");
  const registryRoot = options.registryRoot ?? join(repoRoot, ".backed", "remote-registry");
  const envFile = join(
    process.env["USERPROFILE"] ?? process.env["HOME"] ?? "",
    ".config",
    "backed",
    `${options.tenantId}.env`,
  );
  if (options.dryRun) {
    return {
      tenantId: options.tenantId,
      catalog,
      envFile,
      bundleTarget,
      servicePrincipalAppId: "(dry-run)",
      registryUpdated: false,
      publicationVersion: 0,
    };
  }
  const provisioned = await provisionTenantFiles({
    tenantId: options.tenantId,
    catalog,
    filesRoot,
    registryRoot,
  });
  writeTenantEnvFile({ envFile, filesRoot, registryRoot, catalog });
  const hadTenant = registry.tenants[options.tenantId] !== undefined;
  const updated = ensureTenantInRegistry(
    registry,
    options.tenantId,
    options.sharedSpaceKeys,
    catalog,
  );
  if (!hadTenant) {
    saveTenantsRegistry(registryPath, updated);
  }
  if (!existsSync(join(filesRoot, options.tenantId))) {
    mkdirSync(join(filesRoot, options.tenantId), { recursive: true });
  }
  return {
    tenantId: options.tenantId,
    catalog,
    envFile,
    bundleTarget,
    servicePrincipalAppId: provisioned.servicePrincipalAppId,
    registryUpdated: !hadTenant,
    publicationVersion: 0,
  };
}
