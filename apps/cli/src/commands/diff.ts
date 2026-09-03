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
  const root = process.cwd();

  const runIds = listRunIds(root).filter((runId) => hasRunArtifact(root, runId, "profile"));
  if (runIds.length < 2) {
    console.error(
      `Servono almeno due run per un confronto (trovate: ${String(runIds.length)}). Esegui "backed model" di nuovo quando i dati cambiano.`,
    );
    process.exitCode = 1;
    return;
  }

  const previousRunId = runIds[runIds.length - 2];
  const latestRunId = runIds[runIds.length - 1];
  if (!previousRunId || !latestRunId) {
    throw new Error("Run ids inattesi dopo il filtro.");
  }

  const diff = diffRuns(loadSnapshot(root, previousRunId), loadSnapshot(root, latestRunId));
  const diffPath = writeRunArtifact(root, latestRunId, "diff", diff);

  console.log(formatDiff(diff));
  console.log(`\nDiff salvato: ${diffPath}`);
  return Promise.resolve();
};
