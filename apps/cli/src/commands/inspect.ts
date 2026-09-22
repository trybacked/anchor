import { createDatabricksProviderFromEnv } from "@backed/provider-databricks";
import { commandErrorMessage, parseHelpOnlyArgs } from "../args.js";
import type { CommandHandler } from "../types.js";
import { initUi } from "../ui/index.js";

export const inspectCommand: CommandHandler = async (args) => {
  const ui = initUi();
  let parsed;
  try {
    parsed = parseHelpOnlyArgs(args);
  } catch (error) {
    ui.writeError(commandErrorMessage(error));
    process.exitCode = 1;
    return;
  }
  if (parsed.help) {
    ui.log("Usage: backed inspect");
    ui.log("  Lists Unity Catalog / Hive tables via the Databricks SQL warehouse.");
    ui.log("  Requires BACKED_DATABRICKS_HOST, _TOKEN, _WAREHOUSE_ID.");
    return;
  }
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
};
