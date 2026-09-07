import { ProfileReportSchema, ProposalSchema, hasRunArtifact, listRunIds, readRunArtifact, writeRunArtifact, } from "@backed/core";
import { diffRuns, formatDiff } from "@backed/diff";
import type { RunSnapshot } from "@backed/diff";
import { findWorkspaceRoot } from "../env.js";
import { diffInsufficientRuns } from "../messages.js";
import { getUi, initUi } from "../ui/index.js";
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
    const ui = initUi();
    const root = findWorkspaceRoot(process.cwd());
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
