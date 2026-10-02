import { parseModelYaml, type Ontology, type SemanticModel } from "@trybacked/core";
import {
  createDatabricksFilesClient,
  createDatabricksSqlClient,
  type DatabricksProviderConfig,
} from "@trybacked/provider-databricks";
import { buildQueryRuntimeFromEnv } from "@trybacked/runtime";
import { createSemanticChatEngine, renderAnswer } from "@trybacked/semantic-chat";
import { createVercelAiTranslatorFromEnv } from "@trybacked/semantic-chat/adapters/vercel-ai";
import {
  createAnchorService,
  type AnchorOperationAuditHook,
  type AnchorService,
  type SemanticAskResponse,
} from "@trybacked/service";

export async function createAnchorServiceForModel(options: {
  model: SemanticModel;
  ontology: Ontology;
  catalog?: string | undefined;
  databricksConfig: DatabricksProviderConfig;
  env: NodeJS.ProcessEnv;
  audit?: { onOperation?: AnchorOperationAuditHook; auditPrincipal?: string; tenant?: string };
}): Promise<AnchorService> {
  const client = createDatabricksSqlClient(options.databricksConfig);
  const filesClient = createDatabricksFilesClient(options.databricksConfig);
  const built = await buildQueryRuntimeFromEnv({
    ontology: options.ontology,
    model: options.model,
    executor: (sql, parameters) => client.execute(sql, parameters),
    env: options.env,
    ...(options.catalog !== undefined ? { catalog: options.catalog } : {}),
    readVolumeFile: (path, init) => filesClient.readFile(path, init),
  });

  const wrapAudit = options.audit?.onOperation;
  const onOperation =
    wrapAudit !== undefined
      ? (event: Parameters<AnchorOperationAuditHook>[0]) => {
          wrapAudit({
            ...event,
            ...(options.audit?.tenant !== undefined ? { tenant: options.audit.tenant } : {}),
          });
        }
      : undefined;

  const service = createAnchorService({
    model: options.model,
    ontology: options.ontology,
    queryRuntime: built.runtime,
    executionProfile: "api",
    ...(onOperation !== undefined ? { onOperation } : {}),
    ...(options.audit?.auditPrincipal !== undefined
      ? { auditPrincipal: options.audit.auditPrincipal }
      : {}),
  });

  const translator = createVercelAiTranslatorFromEnv(options.env);
  if (translator === undefined) {
    return service;
  }

  const engine = createSemanticChatEngine({
    ontology: options.ontology,
    queryRuntime: built.runtime,
    translate: translator,
  });

  return Object.assign(service, {
    capabilities: () => ({ ...service.capabilities(), semanticChat: true }),
    semanticAsk: async (body: { question: string; evidence?: boolean | undefined }) => {
      const answer = await engine.ask(body.question, { evidence: body.evidence });
      const response: SemanticAskResponse = {
        ...answer,
        plan: answer.plan,
        text: renderAnswer(answer),
      };
      return response;
    },
  });
}

export function modelFromRemoteYaml(modelYaml: string): SemanticModel {
  return parseModelYaml(modelYaml);
}
