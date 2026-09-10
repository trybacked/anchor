import { CONFIG_RELATIVE_PATH, COMMANDS, DATA_SNAPSHOT_LABEL, formatCliCommand, } from "./config.js";

export const MESSAGES = {
    noDataSnapshot: `No data snapshot (${DATA_SNAPSHOT_LABEL}). Run "${formatCliCommand(COMMANDS.MODEL)}" first.`,
    noDataSnapshotServe: `No data snapshot (${DATA_SNAPSHOT_LABEL}). Data tools disabled until you run "${formatCliCommand(COMMANDS.MODEL)}".`,
    noProposal: `No proposal to review. Run "${formatCliCommand(COMMANDS.MODEL)}" first.`,
    noDocumentTypeHints: `No documentTypeHints in config — all documents use LLM classification. Run "${formatCliCommand(COMMANDS.INIT)}" or edit ${CONFIG_RELATIVE_PATH}.`,
} as const;

export function diffInsufficientRuns(count: number): string {
    return `At least two runs are required (found: ${String(count)}). Run "${formatCliCommand(COMMANDS.MODEL)}" again when the data changes.`;
}

export function sourcesFolderMissing(path: string): string {
    return `Sources folder "${path}" does not exist yet. Create it before running "${formatCliCommand(COMMANDS.MODEL)}".`;
}

export function reviewNextSteps(): string {
    return `Run "${formatCliCommand(COMMANDS.SERVE)}" to expose the model to agents, "${formatCliCommand(COMMANDS.DIFF)}" after the next run.`;
}

export function initNextStep(): string {
    return `Review \`${CONFIG_RELATIVE_PATH}\` if needed, then run "${formatCliCommand(COMMANDS.MODEL)}".`;
}
