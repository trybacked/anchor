import { compileObjectQuery } from "@trybacked/compiler";
import type { ObjectQuery, SqlParameter } from "@trybacked/compiler";
import type { Ontology, SemanticModel } from "@trybacked/core";
import type { WarehouseTableCapabilities } from "./capability-probe.js";
import type { ChunkSearchInput } from "./readers/chunk-search.js";
import { createWarehouseReaders, type WarehouseReaders } from "./readers/create-readers.js";
import type { EntityProfileInput, EntityProfileResult } from "./readers/entity-profile.js";
import type { GraphTraverseInput } from "./readers/graph-traverse.js";

/** Executes one parameterized statement against the backing warehouse. */
export type SqlStatementExecutor = (
  sql: string,
  parameters: SqlParameter[],
) => Promise<Record<string, unknown>[]>;

export type ObjectQueryResult = {
  objectId: string;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  sql: string;
};

export type OntologyQueryRuntimeOptions = {
  ontology: Ontology;
  executor: SqlStatementExecutor;
  model?: SemanticModel | undefined;
  catalog?: string | undefined;
  documentsSchema?: string | undefined;
  vectorSearchIndex?: string | undefined;
  tableCapabilities?: WarehouseTableCapabilities | undefined;
};

export type OntologyQueryRuntime = {
  queryObjects: (query: ObjectQuery) => Promise<ObjectQueryResult>;
  chunkSearch?: (input: ChunkSearchInput) => Promise<Record<string, unknown>[]>;
  entityProfile?: (input: EntityProfileInput) => Promise<EntityProfileResult>;
  graphTraverse?: (input: GraphTraverseInput) => Promise<Record<string, unknown>[]>;
  readers?: WarehouseReaders | undefined;
  warehouseCapabilities?: WarehouseTableCapabilities | undefined;
};

/**
 * Binds a published ontology to a SQL executor.
 * The compiler resolves mappings; the executor (e.g. Databricks) runs the statement.
 * When `model` is provided and docs tables are probed, document readers are attached.
 */
export function createOntologyQueryRuntime(
  options: OntologyQueryRuntimeOptions,
): OntologyQueryRuntime {
  const {
    ontology,
    executor,
    model,
    catalog,
    documentsSchema,
    vectorSearchIndex,
    tableCapabilities,
  } = options;

  const queryObjects = async (query: ObjectQuery): Promise<ObjectQueryResult> => {
    const compiled = compileObjectQuery(ontology, query);
    const rows = await executor(compiled.sql, compiled.parameters);
    return {
      objectId: compiled.objectId,
      columns: compiled.columns,
      rows,
      rowCount: rows.length,
      sql: compiled.sql,
    };
  };

  const readers =
    model !== undefined && tableCapabilities !== undefined
      ? createWarehouseReaders({
          model,
          ontology,
          executor,
          catalog,
          documentsSchema,
          vectorSearchIndex,
          tableCapabilities,
          queryObjects,
        })
      : undefined;

  return {
    queryObjects,
    warehouseCapabilities: tableCapabilities,
    ...(readers !== undefined
      ? {
          readers,
          chunkSearch: readers.chunkSearch,
          entityProfile: readers.entityProfile,
          graphTraverse: readers.graphTraverse,
        }
      : {}),
  };
}
