import { readModelYaml } from "@trybacked/core";
import { runStdioMcpServerUntilClose, SERVER_NAME } from "@trybacked/mcp";
import type { SemanticAskHandler } from "@trybacked/mcp";
import {
  createDatabricksSqlClient,
  databricksConfigFromEnv,
  hasDatabricksEnv,
} from "@trybacked/infrastructure";
import { loadPublishedOntology } from "@trybacked/registry";
import { legacyDocumentTables } from "@trybacked/capability-documents";
import { buildQueryRuntimeFromEnv } from "@trybacked/runtime";
import type { OntologyQueryRuntime } from "@trybacked/runtime";
import { attachSemanticAsk } from "@trybacked/semantic-chat";
import { createAnchorService } from "@trybacked/service";
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
    documentTables: legacyDocumentTables(),
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
  let semanticAsk: SemanticAskHandler | undefined;
  if (ontology !== null && queryRuntime !== undefined) {
    const base = createAnchorService({
      model,
      ontology,
      queryRuntime,
      executionProfile: "mcp",
    });
    const withAsk = attachSemanticAsk(base, { ontology, env: process.env });
    if (withAsk.semanticAsk !== undefined) {
      semanticAsk = withAsk.semanticAsk;
    }
  }
  writeDeployStderr(
    `MCP server "${SERVER_NAME}" on stdio — ${String(model.entities.length)} entities, ${String(model.relations.length)} relations`,
    "brand",
  );
  writeDeployStderr(DEPLOY_PRIVACY_NOTE);
  const mcpOptions: Parameters<typeof runStdioMcpServerUntilClose>[1] = {};
  if (ontology !== null) {
    mcpOptions.ontology = ontology;
  }
  if (queryRuntime !== undefined) {
    mcpOptions.queryRuntime = queryRuntime;
  }
  if (semanticAsk !== undefined) {
    mcpOptions.semanticAsk = semanticAsk;
  }
  await runStdioMcpServerUntilClose(model, mcpOptions);
};
