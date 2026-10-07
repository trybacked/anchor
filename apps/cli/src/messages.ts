import { COMMANDS, formatCliCommand } from "./config.js";
export function pullNextSteps(): string {
  return `Run "${formatCliCommand(COMMANDS.SYNC)}", then "${formatCliCommand(COMMANDS.DEPLOY)}".`;
}
export function initNextStep(): string {
  return `Set BACKED_FILES_ROOT in .env, add documents under sources/, then run "${formatCliCommand(COMMANDS.PULL)}".`;
}
