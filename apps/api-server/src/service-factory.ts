import { parseModelYaml, type Ontology, type SemanticModel } from "@trybacked/core";
import {
  createDatabricksFilesClient,
  createDatabricksSqlClient,
  type DatabricksProviderConfig,
} from "@trybacked/provider-databricks";
import { buildQueryRuntimeFromEnv } from "@trybacked/runtime";
import { attachSemanticAsk, type TenantAiAskCapabilities } from "@trybacked/semantic-chat";
import {
  createAnchorService,
  type AnchorOperationAuditHook,
  type AnchorService,
} from "@trybacked/service";

export type TenantRuntimeCapabilities = TenantAiAskCapabilities;

export async function createAnchorServiceForModel(options: {
  model: SemanticModel;
  ontology: Ontology;
  catalog?: string | undefined;
  databricksConfig: DatabricksProviderConfig;
  env: NodeJS.ProcessEnv;
  tenantCapabilities?: TenantRuntimeCapabilities | undefined;
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

  return attachSemanticAsk(service, {
    ontology: options.ontology,
    env: options.env,
    tenantCapabilities: options.tenantCapabilities,
    ...(onOperation !== undefined ? { onOperation } : {}),
    ...(options.audit?.tenant !== undefined ? { tenant: options.audit.tenant } : {}),
  });
}

export function modelFromRemoteYaml(modelYaml: string): SemanticModel {
  return parseModelYaml(modelYaml);
}
