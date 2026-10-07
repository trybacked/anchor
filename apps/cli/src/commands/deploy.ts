import { legacyDocumentTables } from "@trybacked/capability-documents";
import { readModelYaml } from "@trybacked/core";
import { createLocalDocumentFileReader, tenantFilesRoot } from "@trybacked/infrastructure";
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
  "Ontology data stays local — object SQL needs a warehouse engine; file preview uses BACKED_FILES_ROOT.";

function writeDeployStderr(text: string, style: "dim" | "brand" = "dim"): void {
  console.error(wrap(style === "brand" ? ANSI.brand : ANSI.dim, text));
}

const filesSqlUnavailable = (): never => {
  throw new Error("Object SQL queries are not available on the files engine.");
};

export const deployCommand: CommandHandler = async () => {
  initUi();
  const root = findWorkspaceRoot(process.cwd());
  const model = readModelYaml(root);
  const ontology = loadPublishedOntology(root);
  let semanticAsk: SemanticAskHandler | undefined;
  let queryRuntime;
  if (ontology !== null) {
    const tenantId = ontology.metadata.id;
    const built = await buildQueryRuntimeFromEnv({
      ontology,
      model,
      executor: filesSqlUnavailable,
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
  await runStdioMcpServerUntilClose(model, mcpOptions);
};
