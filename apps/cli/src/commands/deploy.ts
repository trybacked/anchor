import { readModelYaml } from "@trybacked/core";
import {
  MCP_QUERY_TOOL,
  MCP_SURFACE_TOOLS,
  runStdioMcpServerUntilClose,
  SERVER_NAME,
  TOOL_NAMES as MCP_TOOL_NAMES,
} from "@trybacked/mcp";
import {
  createDatabricksSqlClient,
  databricksConfigFromEnv,
  hasDatabricksEnv,
} from "@trybacked/provider-databricks";
import { loadPublishedOntology } from "@trybacked/registry";
import { buildQueryRuntimeFromEnv } from "@trybacked/runtime";
import type { OntologyQueryRuntime } from "@trybacked/runtime";
import { findWorkspaceRoot } from "../env.js";
import type { CommandHandler } from "../types.js";
import { ANSI, wrap } from "../ui/ansi.js";
import { initUi } from "../ui/index.js";

const DEPLOY_PRIVACY_NOTE =
  "Ontology data stays local — object queries run on your configured warehouse.";

function writeDeployStderr(text: string, style: "dim" | "brand" = "dim"): void {
  console.error(wrap(style === "brand" ? ANSI.brand : ANSI.dim, text));
}

async function buildQueryRuntime(root: string): Promise<OntologyQueryRuntime | undefined> {
  const ontology = loadPublishedOntology(root);
  if (ontology === null || !hasDatabricksEnv(process.env)) {
    return undefined;
  }
  const client = createDatabricksSqlClient(databricksConfigFromEnv(process.env));
  const model = readModelYaml(root);
  const built = await buildQueryRuntimeFromEnv({
    ontology,
    model,
    executor: (sql, parameters) => client.execute(sql, parameters),
    env: process.env,
  });
  if (built.warehouseUnavailableReason !== undefined) {
    writeDeployStderr(built.warehouseUnavailableReason);
  }
  return built.runtime;
}

export const deployCommand: CommandHandler = async () => {
  initUi();
  const root = findWorkspaceRoot(process.cwd());
  const model = readModelYaml(root);
  const ontology = loadPublishedOntology(root);
  const queryRuntime = await buildQueryRuntime(root);
  const warehouseTools =
    queryRuntime !== undefined
      ? [
          MCP_QUERY_TOOL,
          ...(queryRuntime.chunkSearch !== undefined ? [MCP_TOOL_NAMES.searchDocuments] : []),
          ...(queryRuntime.entityProfile !== undefined ? [MCP_TOOL_NAMES.getEntityProfile] : []),
          ...(queryRuntime.graphTraverse !== undefined ? [MCP_TOOL_NAMES.traverseGraph] : []),
        ]
      : [];
  const toolNames = [...MCP_SURFACE_TOOLS, ...warehouseTools];
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
    ...(ontology !== null ? { ontology } : {}),
    ...(queryRuntime !== undefined ? { queryRuntime } : {}),
  });
};
