import {
  MCP_QUERY_TOOL,
  MCP_SURFACE_TOOLS,
  runStdioMcpServerUntilClose,
  SERVER_NAME,
} from "@backed/mcp";
import {
  createDatabricksSqlClient,
  databricksConfigFromEnv,
  hasDatabricksEnv,
} from "@backed/provider-databricks";
import { loadPublishedOntology } from "@backed/registry";
import { createOntologyQueryRuntime } from "@backed/runtime";
import type { OntologyQueryRuntime } from "@backed/runtime";
import { readModelYaml } from "@trybacked/core";
import { findWorkspaceRoot } from "../env.js";
import type { CommandHandler } from "../types.js";
import { ANSI, wrap } from "../ui/ansi.js";
import { initUi } from "../ui/index.js";

const SERVE_PRIVACY_NOTE =
  "Ontology data stays local — object queries run on your configured warehouse.";

function writeServeStderr(text: string, style: "dim" | "brand" = "dim"): void {
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

export const serveCommand: CommandHandler = async () => {
  initUi();
  const root = findWorkspaceRoot(process.cwd());
  const model = readModelYaml(root);
  const queryRuntime = buildQueryRuntime(root);
  const toolNames = [...MCP_SURFACE_TOOLS, ...(queryRuntime !== undefined ? [MCP_QUERY_TOOL] : [])];
  writeServeStderr(
    `MCP server "${SERVER_NAME}" on stdio — ${String(model.entities.length)} entities, ${String(model.relations.length)} relations`,
    "brand",
  );
  writeServeStderr(`Tools: ${toolNames.join(", ")} · Ctrl+C to exit`);
  if (queryRuntime === undefined) {
    writeServeStderr(
      "Object queries disabled — publish an ontology and set BACKED_DATABRICKS_* to enable query_objects.",
    );
  }
  writeServeStderr(SERVE_PRIVACY_NOTE);
  await runStdioMcpServerUntilClose(model, {
    ...(queryRuntime !== undefined ? { queryRuntime } : {}),
  });
};
