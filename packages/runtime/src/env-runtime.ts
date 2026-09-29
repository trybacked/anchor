import type { Ontology, SemanticModel } from "@trybacked/core";
import {
  missingWarehouseTablesMessage,
  probeWarehouseTableCapabilities,
  warehouseReadersAvailable,
  type WarehouseTableCapabilities,
} from "./capability-probe.js";
import { createOntologyQueryRuntime, type OntologyQueryRuntime, type SqlStatementExecutor } from "./execute.js";
import { createDocumentsDatasetResolver } from "./readers/dataset.js";

export type BuildQueryRuntimeFromEnvOptions = {
  ontology: Ontology;
  model: SemanticModel;
  executor: SqlStatementExecutor;
  env: NodeJS.ProcessEnv;
};

export type BuiltQueryRuntime = {
  runtime: OntologyQueryRuntime;
  warehouseCapabilities: WarehouseTableCapabilities | undefined;
  warehouseUnavailableReason?: string | undefined;
};

export async function buildQueryRuntimeFromEnv(
  options: BuildQueryRuntimeFromEnvOptions,
): Promise<BuiltQueryRuntime> {
  const catalog = options.env["BACKED_DATABRICKS_CATALOG"];
  const documentsSchema = options.env["BACKED_DOCUMENTS_SCHEMA"] ?? "docs";
  const vectorSearchIndex = options.env["BACKED_VECTOR_SEARCH_INDEX"];

  const documents =
    catalog !== undefined
      ? createDocumentsDatasetResolver({
          ontology: options.ontology,
          catalog,
          documentsSchema,
        })
      : undefined;

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
    vectorSearchIndex,
    tableCapabilities,
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
