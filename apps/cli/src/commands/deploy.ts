import {
  MCP_QUERY_TOOL,
  MCP_SURFACE_TOOLS,
  runStdioMcpServerUntilClose,
  SERVER_NAME,
} from "@trybacked/mcp";
import {
  createDatabricksSqlClient,
  databricksConfigFromEnv,
  hasDatabricksEnv,
} from "@trybacked/provider-databricks";
import { loadPublishedOntology } from "@trybacked/registry";
import { createOntologyQueryRuntime } from "@trybacked/runtime";
import type { OntologyQueryRuntime } from "@trybacked/runtime";
import { readModelYaml } from "@trybacked/core";
import { findWorkspaceRoot } from "../env.js";
import type { CommandHandler } from "../types.js";
import { ANSI, wrap } from "../ui/ansi.js";
import { initUi } from "../ui/index.js";

const DEPLOY_PRIVACY_NOTE =
  "Ontology data stays local — object queries run on your configured warehouse.";

function writeDeployStderr(text: string, style: "dim" | "brand" = "dim"): void {
  console.error(wrap(style === "brand" ? ANSI.brand : ANSI.dim, text));
}

function buildQueryRuntime(root: string): OntologyQueryRuntime | undefined {
  const ontology = loadPublishedOntology(root);
  if (ontology === null || !hasDatabricksEnv(process.env)) {
    return undefined;
  }
  const client = createDatabricksSqlClient(databricksConfigFromEnv(process.env));
  return createOntologyQueryRuntime({
    ontology,
    executor: (sql, parameters) => client.execute(sql, parameters),
  });
}

export const deployCommand: CommandHandler = async () => {
  initUi();
  const root = findWorkspaceRoot(process.cwd());
  const model = readModelYaml(root);
  const queryRuntime = buildQueryRuntime(root);
  const toolNames = [...MCP_SURFACE_TOOLS, ...(queryRuntime !== undefined ? [MCP_QUERY_TOOL] : [])];
  writeDeployStderr(
    `MCP server "${SERVER_NAME}" on stdio — ${String(model.entities.length)} entities, ${String(model.relations.length)} relations`,
    "brand",
  );
  writeDeployStderr(`Tools: ${toolNames.join(", ")} · Ctrl+C to exit`);
  if (queryRuntime === undefined) {
    writeDeployStderr(
      "Object queries disabled — run sync and set BACKED_DATABRICKS_* to enable query_objects.",
    );
  }
  writeDeployStderr(DEPLOY_PRIVACY_NOTE);
  await runStdioMcpServerUntilClose(model, {
    ...(queryRuntime !== undefined ? { queryRuntime } : {}),
  });
};
