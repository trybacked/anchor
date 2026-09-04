import {
  ProfileReportSchema,
  ProposalSchema,
  hasRunArtifact,
  listRunIds,
  readRunArtifact,
  writeRunArtifact,
} from "@backed/core";
import { diffRuns, formatDiff } from "@backed/diff";
import type { RunSnapshot } from "@backed/diff";

import type { CommandHandler } from "../types.js";
import { findWorkspaceRoot } from "../env.js";

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

export const diffCommand: CommandHandler = async () => {
  const root = findWorkspaceRoot(process.cwd());

  const runIds = listRunIds(root).filter((runId) => hasRunArtifact(root, runId, "profile"));
  if (runIds.length < 2) {
    console.error(
      `At least two runs are required for a comparison (found: ${String(runIds.length)}). Run "backed model" again when the data changes.`,
    );
    process.exitCode = 1;
    return;
  }

  const previousRunId = runIds[runIds.length - 2];
  const latestRunId = runIds[runIds.length - 1];
  if (!previousRunId || !latestRunId) {
    throw new Error("Unexpected run ids after filtering.");
  }

  const diff = diffRuns(loadSnapshot(root, previousRunId), loadSnapshot(root, latestRunId));
  const diffPath = writeRunArtifact(root, latestRunId, "diff", diff);

  console.log(formatDiff(diff));
  console.log(`\nDiff saved: ${diffPath}`);
  return Promise.resolve();
};
