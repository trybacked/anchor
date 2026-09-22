import { BACKED_DIR_NAME, CONFIG_FILE_NAME } from "@trybacked/core";

export const CLI_NAME = "backed";
export const CLI_VERSION = "0.1.0";
export const COMMANDS = {
  INIT: "init",
  INSPECT: "inspect",
  DISCOVER: "discover",
  REVIEW: "review",
  PUBLISH: "publish",
  ROLLBACK: "rollback",
  DIFF: "diff",
  VALIDATE: "validate",
  SERVE: "serve",
} as const;
export function formatCliCommand(command: string): string {
  return `${CLI_NAME} ${command}`;
}
export const FLAGS = {
  HELP: "--help",
  HELP_SHORT: "-h",
  ONTOLOGY: "--ontology",
  STATUS: "--status",
  YES: "--yes",
  YES_SHORT: "-y",
} as const;
export function isHelpFlag(arg: string): boolean {
  return arg === FLAGS.HELP || arg === FLAGS.HELP_SHORT;
}
export function isOptionArg(arg: string): boolean {
  return arg.startsWith("--");
}
export const WORKSPACE_ENV_FILE = ".env";
export const CONFIG_RELATIVE_PATH = `${BACKED_DIR_NAME}/${CONFIG_FILE_NAME}`;
