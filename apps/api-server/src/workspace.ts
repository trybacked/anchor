import { readModelYaml, workspacePaths } from "@trybacked/core";
import {
  createDatabricksSqlClient,
  databricksConfigFromEnv,
  hasDatabricksEnv,
} from "@trybacked/provider-databricks";
import { loadPublishedOntology } from "@trybacked/registry";
import { buildQueryRuntimeFromEnv } from "@trybacked/runtime";
import type { OntologyQueryRuntime } from "@trybacked/runtime";
import { createSemanticChatEngine, renderAnswer } from "@trybacked/semantic-chat";
import { createVercelAiTranslatorFromEnv } from "@trybacked/semantic-chat/adapters/vercel-ai";
import {
  createAnchorService,
  type AnchorOperationAuditHook,
  type AnchorService,
} from "@trybacked/service";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

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
  const client = createDatabricksSqlClient(databricksConfigFromEnv(process.env));
  const model = readModelYaml(root);
  const built = await buildQueryRuntimeFromEnv({
    ontology,
    model,
    executor: (sql, parameters) => client.execute(sql, parameters),
    env: process.env,
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
  const queryRuntime = await buildQueryRuntime(workspaceRoot);
  const model = readModelYaml(workspaceRoot);
  const ontology = loadPublishedOntology(workspaceRoot);
  const service = createAnchorService({
    model,
    executionProfile: "api",
    ...(ontology !== null ? { ontology } : {}),
    ...(queryRuntime !== undefined ? { queryRuntime } : {}),
    ...(audit?.onOperation !== undefined ? { onOperation: audit.onOperation } : {}),
    ...(audit?.auditPrincipal !== undefined ? { auditPrincipal: audit.auditPrincipal } : {}),
  });

  const translator = createVercelAiTranslatorFromEnv(process.env);
  if (ontology !== null && queryRuntime !== undefined && translator !== undefined) {
    const engine = createSemanticChatEngine({
      ontology,
      queryRuntime,
      translate: translator,
    });
    return {
      root: workspaceRoot,
      service: Object.assign(service, {
        capabilities: () => ({ ...service.capabilities(), semanticChat: true }),
        semanticAsk: async (body: { question: string; evidence?: boolean | undefined }) => {
          const answer = await engine.ask(body.question, { evidence: body.evidence });
          return { ...answer, text: renderAnswer(answer) };
        },
      }),
    };
  }

  return { root: workspaceRoot, service };
}
