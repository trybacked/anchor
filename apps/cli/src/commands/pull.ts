import {
  applyReview,
  createRunId,
  readWorkspaceConfig,
  writeModelYaml,
  writeRunArtifact,
} from "@trybacked/core";
import {
  discoverFromProfile,
  proposalFromDiscovery,
  profileFromDatasetProvider,
} from "@trybacked/discovery";
import {
  createDatasetProviderFromEnv,
  filesRootFromEnv,
  resolveEngineFromEnv,
} from "@trybacked/infrastructure";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { commandErrorMessage, parseHelpOnlyArgs } from "../args.js";
import { COMMANDS, formatCliCommand } from "../config.js";
import { findWorkspaceRoot } from "../env.js";
import { pullNextSteps } from "../messages.js";
import type { CommandHandler } from "../types.js";
import { initUi } from "../ui/index.js";
const MS_PER_SECOND = 1000;
const AUTO_CONFIRM_CONFIDENCE_THRESHOLD = 0;
function resolveOntologyId(root: string): string {
  try {
    return readWorkspaceConfig(root).ontologyId ?? path.basename(root);
  } catch {
    return path.basename(root);
  }
}
export const pullCommand: CommandHandler = async (args) => {
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
    ui.log(`Usage: ${formatCliCommand(COMMANDS.PULL)}`);
    ui.log(
      "  Pull from the configured source engine and write model.yaml (deterministic, no LLM).",
    );
    ui.log(
      "  Default: BACKED_ENGINE=files and documents under BACKED_FILES_ROOT (or workspace/sources).",
    );
    ui.log(
      "  Default engine is files — documents live under BACKED_FILES_ROOT (see .env.example).",
    );
    return;
  }
  const root = findWorkspaceRoot(process.cwd());
  const runId = createRunId();
  try {
    resolveEngineFromEnv(process.env);
    ui.heading("Pull (files)");
    const filesRoot = filesRootFromEnv(process.env, root);
    if (!existsSync(filesRoot)) {
      mkdirSync(filesRoot, { recursive: true });
      ui.detail(`Created file source folder → ${ui.path(filesRoot)}`);
    }
    ui.step(`${runId} · indexing files under ${filesRoot}`);
    const provider = createDatasetProviderFromEnv(process.env, { workspaceRoot: root });
    const profileStarted = Date.now();
    const profile = await profileFromDatasetProvider(provider);
    const profileMs = Date.now() - profileStarted;
    if (profile.length === 0) {
      throw new Error(
        "No file collections found. Add subfolders with documents under your file source root.",
      );
    }
    const profilePath = writeRunArtifact(root, runId, "profile", profile);
    ui.writeSuccess(`Profile → ${ui.path(profilePath)}`);
    const discovery = discoverFromProfile(profile, { ontologyId: resolveOntologyId(root) });
    const discoveryPath = writeRunArtifact(root, runId, "discovery", discovery);
    ui.writeSuccess(`Discovery → ${ui.path(discoveryPath)}`);
    ui.detail(
      `${String(discovery.ontology.objects.length)} object(s), ${String(discovery.ontology.relationships.length)} relationship(s)`,
    );
    const proposal = proposalFromDiscovery(discovery, {
      runId,
      reviewConfidenceThreshold: AUTO_CONFIRM_CONFIDENCE_THRESHOLD,
    });
    const proposalPath = writeRunArtifact(root, runId, "proposal", proposal);
    ui.writeSuccess(`Proposal → ${ui.path(proposalPath)}`);
    const generatedAt = new Date();
    const { model } = applyReview(
      proposal,
      { runId, answeredAt: generatedAt.toISOString(), answers: [] },
      generatedAt,
      { reviewConfidenceThreshold: AUTO_CONFIRM_CONFIDENCE_THRESHOLD },
    );
    const modelPath = writeModelYaml(root, model);
    ui.writeSuccess(
      `Model → ${ui.path(modelPath)} (${String(model.entities.length)} entities, ${String(model.relations.length)} relations)`,
    );
    ui.blank();
    ui.writeSuccess(`Done in ${String(Math.round(profileMs / MS_PER_SECOND))}s · run ${runId}`);
    ui.step(pullNextSteps());
  } catch (error) {
    ui.writeError(commandErrorMessage(error));
    process.exitCode = 1;
  }
};
