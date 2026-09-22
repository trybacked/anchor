import { compileObjectQuery } from "@backed/compiler";
import type { ObjectQuery, SqlParameter } from "@backed/compiler";
import type { Ontology } from "@trybacked/core";

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
};

export type OntologyQueryRuntime = {
  queryObjects: (query: ObjectQuery) => Promise<ObjectQueryResult>;
};

/**
 * Binds a published ontology to a SQL executor.
 * The compiler resolves mappings; the executor (e.g. Databricks) runs the statement.
 */
export function createOntologyQueryRuntime(
  options: OntologyQueryRuntimeOptions,
): OntologyQueryRuntime {
  const { ontology, executor } = options;
  return {
    async queryObjects(query: ObjectQuery): Promise<ObjectQueryResult> {
      const compiled = compileObjectQuery(ontology, query);
      const rows = await executor(compiled.sql, compiled.parameters);
      return {
        objectId: compiled.objectId,
        columns: compiled.columns,
        rows,
        rowCount: rows.length,
        sql: compiled.sql,
      };
    },
  };
}
