import { postgresDialect } from "@trybacked/compiler";
import type { DatasetProvider } from "@trybacked/core";
import type { SqlExecutor, WarehouseConnector } from "@trybacked/ports";
import { createFileIndexDatasetProvider } from "./file-index-provider.js";

function filesSqlExecutor(): SqlExecutor {
  return {
    execute: () =>
      Promise.reject(
        new Error(
          "Object SQL queries are not available on the files engine. Work from model.yaml in workspace mode or add a warehouse adapter when available.",
        ),
      ),
  };
}

export function createFilesWarehouseConnector(options: { root: string }): WarehouseConnector {
  const provider: DatasetProvider = createFileIndexDatasetProvider(options);
  return {
    provider,
    executor: filesSqlExecutor(),
    dialect: postgresDialect,
  };
}
