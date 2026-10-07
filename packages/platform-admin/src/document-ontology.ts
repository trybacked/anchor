import { resolveTenantCatalog, serializeModelYaml, type SemanticModel } from "@trybacked/core";
import { buildCovSemanticModel } from "@trybacked/ontology-authoring";
import type { DatabricksProviderConfig } from "@trybacked/provider-databricks";
import { createDatabricksBlobStore } from "@trybacked/provider-databricks";
import {
  buildPublicationRecord,
  createVolumeOntologyStore,
  type OntologyStore,
} from "@trybacked/registry";

export function buildTenantDocumentOntologyModel(tenantId: string): SemanticModel {
  const catalog = resolveTenantCatalog(tenantId);
  return buildCovSemanticModel(catalog, {
    runId: `cloud-doc-${tenantId}-${Date.now().toString(36)}`,
    generatedAt: new Date().toISOString(),
  });
}

export function tenantDocumentOntologyYaml(tenantId: string): string {
  return serializeModelYaml(buildTenantDocumentOntologyModel(tenantId));
}

export async function publishTenantDocumentOntologyToVolume(options: {
  tenantId: string;
  catalog: string;
  adminConfig: DatabricksProviderConfig;
  ontologyStore?: OntologyStore;
}): Promise<{ version: number; runId: string }> {
  const store =
    options.ontologyStore ??
    createVolumeOntologyStore(createDatabricksBlobStore(options.adminConfig));
  const remote = await store.loadCurrent(options.catalog);
  const nextVersion = (remote?.version ?? 0) + 1;
  const model = buildTenantDocumentOntologyModel(options.tenantId);
  const record = buildPublicationRecord(model, {
    ontologyId: options.tenantId,
    version: nextVersion,
  });
  const modelYaml = serializeModelYaml(model);
  await store.publish(options.catalog, record, modelYaml);
  return { version: nextVersion, runId: model.metadata.runId };
}
