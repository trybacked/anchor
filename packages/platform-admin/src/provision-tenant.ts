import { mkdirSync } from "node:fs";
import { join } from "node:path";

export type FilesProvisionTenantOptions = {
  tenantId: string;
  catalog: string;
  filesRoot: string;
  registryRoot: string;
};

export type FilesProvisionTenantResult = {
  tenantId: string;
  catalog: string;
  servicePrincipalAppId: string;
};

export function provisionTenantFiles(
  options: FilesProvisionTenantOptions,
): Promise<FilesProvisionTenantResult> {
  mkdirSync(join(options.filesRoot, options.tenantId), { recursive: true });
  mkdirSync(options.registryRoot, { recursive: true });
  return Promise.resolve({
    tenantId: options.tenantId,
    catalog: options.catalog,
    servicePrincipalAppId: "local-files",
  });
}
