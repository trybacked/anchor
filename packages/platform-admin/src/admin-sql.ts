import { mkdirSync } from "node:fs";
import { join } from "node:path";

export function ensureTenantFileLayout(options: {
  filesRoot: string;
  registryRoot: string;
  tenantId: string;
}): void {
  mkdirSync(join(options.filesRoot, options.tenantId), { recursive: true });
  mkdirSync(options.registryRoot, { recursive: true });
}
