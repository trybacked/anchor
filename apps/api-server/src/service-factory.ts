import { legacyDocumentTables } from "@trybacked/capability-documents";
import { parseModelYaml, type Ontology, type SemanticModel } from "@trybacked/core";
import { createDocumentFileReaderFromEnv } from "@trybacked/infrastructure";
import { buildQueryRuntimeFromEnv } from "@trybacked/runtime";
import { attachSemanticAsk, type TenantAiAskCapabilities } from "@trybacked/semantic-chat";
import {
  createAnchorService,
  type AnchorOperationAuditHook,
  type AnchorService,
} from "@trybacked/service";

export type TenantRuntimeCapabilities = TenantAiAskCapabilities;

const filesSqlUnavailable = (): never => {
  throw new Error(
    "Object SQL queries are not available on the files engine. Publish mappings for future warehouse adapters or use workspace tools.",
  );
};

export async function createAnchorServiceForModel(options: {
  model: SemanticModel;
  ontology: Ontology;
  catalog?: string | undefined;
  tenantId?: string | undefined;
  env: NodeJS.ProcessEnv;
  tenantCapabilities?: TenantRuntimeCapabilities | undefined;
  audit?: {
    onOperation?: AnchorOperationAuditHook;
    auditPrincipal?: string;
    tenant?: string;
  };
}): Promise<AnchorService> {
  const tenantId = options.tenantId ?? options.ontology.metadata.id;
  const readVolumeFile = createDocumentFileReaderFromEnv(options.env, tenantId);
  const built = await buildQueryRuntimeFromEnv({
    ontology: options.ontology,
    model: options.model,
    executor: filesSqlUnavailable,
    env: options.env,
    documentTables: legacyDocumentTables(),
    ...(options.catalog !== undefined ? { catalog: options.catalog } : {}),
    readVolumeFile,
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
