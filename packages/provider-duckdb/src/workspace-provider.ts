import { openDataSession } from "@backed/ingest";
import { workspacePaths } from "@trybacked/core";
import type { DatasetProvider } from "@trybacked/core";
import { existsSync } from "node:fs";
import { createDuckDbDatasetProvider, listDuckDbTableNames } from "./duckdb-dataset-provider.js";

export type WorkspaceDuckDbProvider = DatasetProvider & {
  close: () => void;
};

/** Opens the workspace DuckDB snapshot as a {@link DatasetProvider}. */
export async function createWorkspaceDuckDbProvider(
  workspaceRoot: string,
): Promise<WorkspaceDuckDbProvider> {
  const { dataPath } = workspacePaths(workspaceRoot);
  if (!existsSync(dataPath)) {
    throw new Error(`No DuckDB snapshot at ${dataPath}`);
  }
  const session = await openDataSession(dataPath);
  const tableNames = await listDuckDbTableNames(session.query);
  const provider = createDuckDbDatasetProvider({
    kind: "query",
    query: session.query,
    tableNames,
  });
  return {
    ...provider,
    close() {
      session.close();
    },
  };
}
