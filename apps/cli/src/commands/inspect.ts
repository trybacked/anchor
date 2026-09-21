import { openDataSession } from "@backed/ingest";
import { createDatabricksProviderFromEnv } from "@backed/provider-databricks";
import { createDuckDbDatasetProvider, listDuckDbTableNames } from "@backed/provider-duckdb";
import { workspacePaths } from "@trybacked/core";
import { existsSync } from "node:fs";
import { commandErrorMessage, parseInspectArgs } from "../args.js";
import { findWorkspaceRoot } from "../env.js";
import type { CommandHandler } from "../types.js";
import { initUi } from "../ui/index.js";

export const inspectCommand: CommandHandler = async (args) => {
  const ui = initUi();
  const root = findWorkspaceRoot(process.cwd());
  let parsed;
  try {
    parsed = parseInspectArgs(args);
  } catch (error) {
    ui.writeError(commandErrorMessage(error));
    process.exitCode = 1;
    return;
  }
  if (parsed.help) {
    ui.log("Usage: backed inspect [--databricks]");
    ui.log("  Default: local DuckDB snapshot (.backed/data.duckdb).");
    ui.log("  --databricks: Unity Catalog / Hive tables via SQL warehouse.");
    return;
  }

  if (parsed.useDatabricks) {
    try {
      const { provider, config } = createDatabricksProviderFromEnv(process.env);
      const datasets = await provider.listDatasets();
      ui.heading("Databricks dataset inspection");
      ui.detail(`${config.host} · warehouse ${config.warehouseId}`);
      ui.blank();
      for (const dataset of datasets) {
        const schema = await provider.getSchema(dataset);
        const metadata = await provider.getMetadata(dataset);
        ui.log(`${ui.bold(dataset.id)} ${ui.dim(`(${String(metadata.rowCount ?? 0)} rows)`)}`);
        for (const column of schema.columns) {
          ui.log(`  ${column.name} ${ui.dim(column.type)}`);
        }
        ui.blank();
      }
    } catch (error) {
      ui.writeError(commandErrorMessage(error));
      process.exitCode = 1;
    }
    return;
  }

  const { dataPath } = workspacePaths(root);
  if (!existsSync(dataPath)) {
    ui.writeError(`No DuckDB snapshot at ${dataPath}. Run "backed model" or use --databricks.`);
    process.exitCode = 1;
    return;
  }

  const session = await openDataSession(dataPath);
  try {
    const tableNames = await listDuckDbTableNames(session.query);
    const provider = createDuckDbDatasetProvider({
      kind: "query",
      query: session.query,
      tableNames,
    });
    const datasets = await provider.listDatasets();

    ui.heading("Dataset inspection");
    ui.detail(ui.path(dataPath));
    ui.blank();

    for (const dataset of datasets) {
      const schema = await provider.getSchema(dataset);
      const metadata = await provider.getMetadata(dataset);
      ui.log(`${ui.bold(dataset.id)} ${ui.dim(`(${String(metadata.rowCount ?? 0)} rows)`)}`);
      for (const column of schema.columns) {
        ui.log(
          `  ${column.name} ${ui.dim(column.type)}${column.nullable ? ui.dim(" · nullable") : ""}`,
        );
      }
      ui.blank();
    }
  } finally {
    session.close();
  }
};
