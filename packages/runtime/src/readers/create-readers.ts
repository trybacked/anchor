import type { ObjectQuery } from "@trybacked/compiler";
import type { Ontology, SemanticModel } from "@trybacked/core";
import type { WarehouseTableCapabilities } from "../capability-probe.js";
import type { ObjectQueryResult, SqlStatementExecutor } from "../execute.js";
import { createChunkSearchReader } from "./chunk-search.js";
import { createDocumentsDatasetResolver } from "./dataset.js";
import { createEntityProfileReader } from "./entity-profile.js";
import { createGraphTraverseReader } from "./graph-traverse.js";

export type WarehouseReadersOptions = {
  model: SemanticModel;
  ontology: Ontology;
  executor: SqlStatementExecutor;
  catalog?: string | undefined;
  documentsSchema?: string | undefined;
  vectorSearchIndex?: string | undefined;
  tableCapabilities: WarehouseTableCapabilities;
  queryObjects: (query: ObjectQuery) => Promise<ObjectQueryResult>;
};

export type WarehouseReaders = {
  chunkSearch: ReturnType<typeof createChunkSearchReader>;
  entityProfile: ReturnType<typeof createEntityProfileReader>;
  graphTraverse: ReturnType<typeof createGraphTraverseReader>;
};

export function createWarehouseReaders(options: WarehouseReadersOptions): WarehouseReaders | undefined {
  const documents = createDocumentsDatasetResolver({
    ontology: options.ontology,
    catalog: options.catalog,
    documentsSchema: options.documentsSchema,
  });
  if (documents === undefined) {
    return undefined;
  }
  if (!options.tableCapabilities.documents || !options.tableCapabilities.documentElements) {
    return undefined;
  }

  const graphTraverse = createGraphTraverseReader({
    model: options.model,
    ontology: options.ontology,
    executor: options.executor,
    documents,
  });

  const chunkSearch = createChunkSearchReader({
    executor: options.executor,
    documents,
    vectorSearchIndex: options.vectorSearchIndex,
  });

  const entityProfile = createEntityProfileReader({
    ontology: options.ontology,
    model: options.model,
    executor: options.executor,
    documents,
    entityProfilesAvailable: options.tableCapabilities.entityProfiles,
    queryObjects: options.queryObjects,
    graphTraverse,
    chunkSearch,
  });

  return {
    chunkSearch,
    entityProfile,
    graphTraverse,
  };
}
