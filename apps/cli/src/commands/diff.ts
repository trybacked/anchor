import { diffRuns, formatDiff } from "@backed/diff";
import type { RunSnapshot } from "@backed/diff";
import { listPublicationVersions, readPublicationByVersion } from "@backed/registry";
import {
  ProfileReportSchema,
  ProposalSchema,
  diffOntology,
  formatOntologyDiff,
  hasBreakingOntologyChanges,
  hasRunArtifact,
  listRunIds,
  readRunArtifact,
  writeRunArtifact,
} from "@trybacked/core";
import { parseDiffArgs } from "../args.js";
import { findWorkspaceRoot } from "../env.js";
import { diffInsufficientRuns } from "../messages.js";
import type { CommandHandler } from "../types.js";
import { initUi } from "../ui/index.js";

function loadSnapshot(root: string, runId: string): RunSnapshot {
  const profile = readRunArtifact(root, runId, "profile", ProfileReportSchema);
  if (!hasRunArtifact(root, runId, "proposal")) {
    return { runId, profile };
  }
  const proposal = readRunArtifact(root, runId, "proposal", ProposalSchema);
  return {
    runId,
    profile,
    model: {
      entities: proposal.entities,
      relations: proposal.relations,
      rules: proposal.rules,
    },
  };
}

export const diffCommand: CommandHandler = (args) => {
  const ui = initUi();
  const root = findWorkspaceRoot(process.cwd());
  let parsed;
  try {
    parsed = parseDiffArgs(args);
  } catch (error) {
    ui.writeError(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }
  if (parsed.help) {
    ui.log("Usage: backed diff [--ontology]");
    ui.log("  Default: diff last two pipeline runs.");
    ui.log("  --ontology: diff last two published ontology versions.");
    return;
  }

  if (parsed.ontology) {
    const versions = listPublicationVersions(root);
    if (versions.length < 2) {
      ui.writeError(`Need at least two publication versions; found ${String(versions.length)}.`);
      process.exitCode = 1;
      return;
    }
    const [fromEntry, toEntry] = versions.slice(-2);
    if (fromEntry === undefined || toEntry === undefined) {
      throw new Error("Unexpected publication version list.");
    }
    const fromRecord = readPublicationByVersion(root, fromEntry.version);
    const toRecord = readPublicationByVersion(root, toEntry.version);
    if (fromRecord === null || toRecord === null) {
      ui.writeError("Failed to load publication versions for diff.");
      process.exitCode = 1;
      return;
    }
    const diff = diffOntology(fromRecord.ontology, toRecord.ontology, {
      fromVersion: fromEntry.version,
      toVersion: toEntry.version,
    });
    ui.heading("Ontology diff");
    ui.blank();
    ui.log(ui.colorizeDiff(formatOntologyDiff(diff)));
    if (hasBreakingOntologyChanges(diff)) {
      ui.blank();
      ui.writeWarn("Breaking ontology changes detected.");
    }
    return;
  }

  const runIds = listRunIds(root).filter((runId) => hasRunArtifact(root, runId, "profile"));
  if (runIds.length < 2) {
    ui.writeError(diffInsufficientRuns(runIds.length));
    process.exitCode = 1;
    return;
  }
  const [previousRunId, latestRunId] = runIds.slice(-2);
  if (previousRunId === undefined || latestRunId === undefined) {
    throw new Error("Unexpected run ids after filtering.");
  }
  const diff = diffRuns(loadSnapshot(root, previousRunId), loadSnapshot(root, latestRunId));
  const diffPath = writeRunArtifact(root, latestRunId, "diff", diff);
  ui.heading("Run diff");
  ui.detail(`${ui.dim("from")} ${previousRunId} ${ui.dim("→")} ${latestRunId}`);
  ui.blank();
  ui.log(ui.colorizeDiff(formatDiff(diff)));
  ui.blank();
  ui.writeSuccess(`Diff saved → ${ui.path(diffPath)}`);
};
