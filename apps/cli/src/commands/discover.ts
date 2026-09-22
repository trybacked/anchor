import {
  discoverFromProfile,
  proposalFromDiscovery,
  profileFromDatasetProvider,
} from "@backed/discovery";
import { createDatabricksProviderFromEnv } from "@backed/provider-databricks";
import { createRunId, readWorkspaceConfig, writeRunArtifact } from "@trybacked/core";
import path from "node:path";
import { commandErrorMessage, parseHelpOnlyArgs } from "../args.js";
import { findWorkspaceRoot } from "../env.js";
import type { CommandHandler } from "../types.js";
import { initUi } from "../ui/index.js";

const MS_PER_SECOND = 1000;

function resolveOntologyId(root: string): string {
  try {
    return readWorkspaceConfig(root).ontologyId ?? path.basename(root);
  } catch {
    return path.basename(root);
  }
}

export const discoverCommand: CommandHandler = async (args) => {
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
    ui.log("Usage: backed discover");
    ui.log("  Profiles curated Databricks datasets and proposes an ontology (no LLM).");
    ui.log("  Requires BACKED_DATABRICKS_HOST, _TOKEN, _WAREHOUSE_ID.");
    return;
  }
  const root = findWorkspaceRoot(process.cwd());
  const runId = createRunId();
  try {
    ui.heading("Discover run (Databricks)");
    ui.step(`${runId} · listing tables from Databricks SQL warehouse`);
    const { provider } = createDatabricksProviderFromEnv(process.env);
    const profileStarted = Date.now();
    const profile = await profileFromDatasetProvider(provider);
    const profileMs = Date.now() - profileStarted;
    if (profile.length === 0) {
      throw new Error("No datasets returned from Databricks. Check catalog/schema env vars.");
    }
    const profilePath = writeRunArtifact(root, runId, "profile", profile);
    ui.writeSuccess(`Profile → ${ui.path(profilePath)}`);

    const discovery = discoverFromProfile(profile, { ontologyId: resolveOntologyId(root) });
    const discoveryPath = writeRunArtifact(root, runId, "discovery", discovery);
    ui.writeSuccess(`Discovery → ${ui.path(discoveryPath)}`);
    ui.detail(
      `${String(discovery.ontology.objects.length)} object(s), ${String(discovery.ontology.relationships.length)} relationship(s) (proposed)`,
    );

    const proposal = proposalFromDiscovery(discovery, { runId });
    const proposalPath = writeRunArtifact(root, runId, "proposal", proposal);
    ui.writeSuccess(`Proposal → ${ui.path(proposalPath)}`);
    ui.blank();
    ui.writeSuccess(
      `Done in ${String(Math.round(profileMs / MS_PER_SECOND))}s · run ${runId} · ${String(proposal.questions.length)} review question(s)`,
    );
  } catch (error) {
    ui.writeError(commandErrorMessage(error));
    process.exitCode = 1;
  }
};
