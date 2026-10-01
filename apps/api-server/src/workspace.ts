import { readModelYaml, workspacePaths } from "@trybacked/core";
import {
  createDatabricksFilesClient,
  createDatabricksSqlClient,
  databricksConfigFromEnv,
  hasDatabricksEnv,
} from "@trybacked/provider-databricks";
import { loadPublishedOntology } from "@trybacked/registry";
import { buildQueryRuntimeFromEnv } from "@trybacked/runtime";
import type { OntologyQueryRuntime } from "@trybacked/runtime";
import type { AnchorOperationAuditHook, AnchorService } from "@trybacked/service";
import { createAnchorService } from "@trybacked/service";
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
  try {
    process.loadEnvFile(envPath);
  } catch {
    // optional
  }
}

export async function buildQueryRuntime(root: string): Promise<OntologyQueryRuntime | undefined> {
  const ontology = loadPublishedOntology(root);
  if (ontology === null || !hasDatabricksEnv(process.env)) {
    return undefined;
  }
  const databricksConfig = databricksConfigFromEnv(process.env);
  const client = createDatabricksSqlClient(databricksConfig);
  const filesClient = createDatabricksFilesClient(databricksConfig);
  const model = readModelYaml(root);
  const built = await buildQueryRuntimeFromEnv({
    ontology,
    model,
    executor: (sql, parameters) => client.execute(sql, parameters),
    env: process.env,
    readVolumeFile: (path, init) => filesClient.readFile(path, init),
  });
  return built.runtime;
}

export async function createWorkspaceService(
  root?: string,
  audit?: { onOperation?: AnchorOperationAuditHook; auditPrincipal?: string },
): Promise<{
  root: string;
  service: AnchorService;
}> {
  const workspaceRoot = root ?? findWorkspaceRoot();
  loadWorkspaceEnv(workspaceRoot);
  const model = readModelYaml(workspaceRoot);
  const ontology = loadPublishedOntology(workspaceRoot);

  if (ontology !== null && hasDatabricksEnv(process.env)) {
    const catalog = process.env["BACKED_DATABRICKS_CATALOG"]?.trim();
    const service = await createAnchorServiceForModel({
      model,
      ontology,
      databricksConfig: databricksConfigFromEnv(process.env),
      env: process.env,
      ...(catalog !== undefined && catalog.length > 0 ? { catalog } : {}),
      ...(audit?.onOperation !== undefined ? { onOperation: audit.onOperation } : {}),
      ...(audit?.auditPrincipal !== undefined ? { auditPrincipal: audit.auditPrincipal } : {}),
    });
    return { root: workspaceRoot, service };
  }

  const service = createAnchorService({
    model,
    executionProfile: "api",
    ...(ontology !== null ? { ontology } : {}),
    ...(audit?.onOperation !== undefined ? { onOperation: audit.onOperation } : {}),
    ...(audit?.auditPrincipal !== undefined ? { auditPrincipal: audit.auditPrincipal } : {}),
  });

  return { root: workspaceRoot, service };
}
