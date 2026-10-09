import { readModelYaml, workspacePaths } from "@trybacked/core";
import { loadPublishedOntology } from "@trybacked/registry";
import {
  createAnchorService,
  type AnchorOperationAuditHook,
  type AnchorService,
} from "@trybacked/service";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createAnchorServiceForModel } from "./service-factory.js";

export function findWorkspaceRoot(startDir: string = process.cwd()): string {
  let directory = resolve(startDir);
  for (;;) {
    if (existsSync(workspacePaths(directory).configPath)) {
      return directory;
    }
    const parent = dirname(directory);
    if (parent === directory) {
      return resolve(startDir);
    }
    directory = parent;
  }
}

export function loadWorkspaceEnv(root: string): void {
  const envPath = join(root, ".env");
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

export async function createWorkspaceService(
  root?: string,
  audit?: {
    onOperation?: AnchorOperationAuditHook;
    auditPrincipal?: string;
  },
): Promise<{
  root: string;
  service: AnchorService;
}> {
  const workspaceRoot = root ?? findWorkspaceRoot();
  loadWorkspaceEnv(workspaceRoot);
  const model = readModelYaml(workspaceRoot);
  const ontology = loadPublishedOntology(workspaceRoot);
  if (ontology !== null) {
    const catalog =
      process.env["BACKED_CATALOG"]?.trim();
    const tenantId = ontology.metadata.id;
    const service = await createAnchorServiceForModel({
      model,
      ontology,
      env: process.env,
      tenantId,
      ...(catalog !== undefined && catalog.length > 0 ? { catalog } : {}),
      ...(audit?.onOperation !== undefined ? { onOperation: audit.onOperation } : {}),
      ...(audit?.auditPrincipal !== undefined ? { auditPrincipal: audit.auditPrincipal } : {}),
    });
    return { root: workspaceRoot, service };
  }
  const service = createAnchorService({
    model,
    executionProfile: "api",
    ...(audit?.onOperation !== undefined ? { onOperation: audit.onOperation } : {}),
    ...(audit?.auditPrincipal !== undefined ? { auditPrincipal: audit.auditPrincipal } : {}),
  });
  return { root: workspaceRoot, service };
}
