import { COMMANDS, formatCliCommand } from "./config.js";

export const MESSAGES = {
  noProposal: `No proposal to review. Run "${formatCliCommand(COMMANDS.DISCOVER)}" first.`,
} as const;

export function diffInsufficientRuns(count: number): string {
  return `At least two runs are required (found: ${String(count)}). Run "${formatCliCommand(COMMANDS.DISCOVER)}" again when the data changes.`;
}

export function reviewNextSteps(): string {
  return `Run "${formatCliCommand(COMMANDS.PUBLISH)}" to version the ontology, "${formatCliCommand(COMMANDS.SERVE)}" to expose it to agents.`;
}

export function initNextStep(): string {
  return `Set BACKED_DATABRICKS_* in .env, then run "${formatCliCommand(COMMANDS.DISCOVER)}".`;
}
