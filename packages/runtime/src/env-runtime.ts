import type { DocumentTablesSpec, Ontology, SemanticModel } from "@trybacked/core";
import {
  missingWarehouseTablesMessage,
  probeWarehouseTableCapabilities,
  warehouseReadersAvailable,
  type WarehouseTableCapabilities,
} from "./capability-probe.js";
import {
  createOntologyQueryRuntime,
  type OntologyQueryRuntime,
  type SqlStatementExecutor,
} from "./execute.js";
import { createDocumentsDatasetResolver } from "./readers/dataset.js";
import type { VolumeFileReader } from "./readers/document-access.js";
export type BuildQueryRuntimeFromEnvOptions = {
  ontology: Ontology;
  model: SemanticModel;
  executor: SqlStatementExecutor;
  env: NodeJS.ProcessEnv;
  catalog?: string | undefined;
  /** Table names from the tenant's document-archive binding. */
  documentTables: DocumentTablesSpec;
  readVolumeFile?: VolumeFileReader | undefined;
};
export type BuiltQueryRuntime = {
  runtime: OntologyQueryRuntime;
  warehouseCapabilities: WarehouseTableCapabilities | undefined;
  warehouseUnavailableReason?: string | undefined;
};
export async function buildQueryRuntimeFromEnv(
  options: BuildQueryRuntimeFromEnvOptions,
): Promise<BuiltQueryRuntime> {
  const catalog =
    options.catalog ?? options.env["BACKED_CATALOG"] ?? options.env["BACKED_DATABRICKS_CATALOG"];
  const documentsSchema = options.env["BACKED_DOCUMENTS_SCHEMA"] ?? "docs";
  const vectorSearchIndex = options.env["BACKED_VECTOR_SEARCH_INDEX"];
  // The resolver falls back to inferring the catalog from the ontology's
  // dataset ids, so document features work without an explicit catalog env.
  const documents = createDocumentsDatasetResolver({
    ontology: options.ontology,
    catalog,
    documentsSchema,
    tables: options.documentTables,
  });
  let tableCapabilities: WarehouseTableCapabilities | undefined;
  if (documents !== undefined) {
    tableCapabilities = await probeWarehouseTableCapabilities(options.executor, documents);
  }
  const runtime = createOntologyQueryRuntime({
    ontology: options.ontology,
    model: options.model,
    executor: options.executor,
    catalog,
    documentsSchema,
    documentTables: options.documentTables,
    vectorSearchIndex,
    tableCapabilities,
    readVolumeFile: options.readVolumeFile,
  });
  const unavailableReason =
    tableCapabilities !== undefined && !warehouseReadersAvailable(tableCapabilities)
      ? missingWarehouseTablesMessage(tableCapabilities)
      : undefined;
  return {
    runtime,
    warehouseCapabilities: tableCapabilities,
    warehouseUnavailableReason: unavailableReason,
  };
}
