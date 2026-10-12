import { legacyDocumentTables } from "@trybacked/capability-documents";
import { readModelYaml } from "@trybacked/core";
import {
  createLocalDocumentFileReader,
  createSqlStatementExecutorFromDuckDbPath,
  duckDbPathFromEnv,
  resolveWarehouseDuckDbPath,
  tenantFilesRoot,
} from "@trybacked/infrastructure";
import { runStdioMcpServerUntilClose, SERVER_NAME } from "@trybacked/mcp";
import type { SemanticAskHandler } from "@trybacked/mcp";
import { loadPublishedOntology } from "@trybacked/registry";
import { buildQueryRuntimeFromEnv } from "@trybacked/runtime";
import { attachSemanticAsk } from "@trybacked/semantic-chat";
import { createAnchorService } from "@trybacked/service";
import { findWorkspaceRoot } from "../env.js";
import type { CommandHandler } from "../types.js";
import { ANSI, wrap } from "../ui/ansi.js";
import { initUi } from "../ui/index.js";

const DEPLOY_PRIVACY_NOTE =
  "Ontology data stays local — object SQL uses BACKED_DUCKDB_PATH when set; file preview uses BACKED_FILES_ROOT.";

function writeDeployStderr(text: string, style: "dim" | "brand" = "dim"): void {
  console.error(wrap(style === "brand" ? ANSI.brand : ANSI.dim, text));
}

export const deployCommand: CommandHandler = async (args) => {
  const httpPortArg = args.find((arg) => arg.startsWith("--http="));
  const httpPort =
    httpPortArg !== undefined ? Number.parseInt(httpPortArg.split("=")[1] ?? "", 10) : undefined;
  initUi();
  const root = findWorkspaceRoot(process.cwd());
  process.env["BACKED_PARSED_DIR"] = `${root}/.backed/parsed`;
  const model = readModelYaml(root);
  const ontology = loadPublishedOntology(root);
  let semanticAsk: SemanticAskHandler | undefined;
  let queryRuntime;
  if (ontology !== null) {
    const tenantId = ontology.metadata.id;
    const duckPath = duckDbPathFromEnv(process.env) ?? resolveWarehouseDuckDbPath(process.env);
    const executor = createSqlStatementExecutorFromDuckDbPath(duckPath);
    const built = await buildQueryRuntimeFromEnv({
      ontology,
      model,
      executor,
      env: process.env,
      documentTables: legacyDocumentTables(),
      readVolumeFile: createLocalDocumentFileReader(tenantFilesRoot(process.env, tenantId)),
    });
    queryRuntime = built.runtime;
  }
  const base = createAnchorService({
    model,
    executionProfile: "mcp",
    ...(ontology !== null ? { ontology } : {}),
    ...(queryRuntime !== undefined ? { queryRuntime } : {}),
  });
  if (ontology !== null) {
    const withAsk = attachSemanticAsk(base, { ontology, env: process.env });
    if ("semanticAsk" in withAsk) {
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
  if (httpPort !== undefined && !Number.isNaN(httpPort)) {
    const { runStreamableHttpMcpServer } = await import("@trybacked/mcp");
    await runStreamableHttpMcpServer({ port: httpPort, model, options: mcpOptions });
    return;
  }
  await runStdioMcpServerUntilClose(model, mcpOptions);
};
