import { BACKED_DIR_NAME, CONFIG_FILE_NAME } from "@trybacked/core";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
function readCliVersion(): string {
  const packagePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../package.json");
  const raw = readFileSync(packagePath, "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "version" in parsed &&
    typeof parsed.version === "string"
  ) {
    return parsed.version;
  }
  throw new Error(`Invalid package.json at ${packagePath}`);
}
export const CLI_NAME = "backed";
export const CLI_VERSION = readCliVersion();
export const SERVICES = {
  ANCHOR: "anchor",
  FALCON: "falcon",
} as const;
export const COMMANDS = {
  INIT: "init",
  SYNC: "sync",
  DEPLOY: "deploy",
  MIGRATE: "migrate",
  INGEST: "ingest",
  REVIEW: "review",
  EXTRACT: "extract",
  EVAL: "eval",
  RUN: "run",
  DOCTOR: "doctor",
  STATUS: "status",
  ROLLBACK: "rollback",
  DIFF: "diff",
  EXPORT: "export",
} as const;
export function formatCliCommand(command: string): string {
  return `${CLI_NAME} ${SERVICES.ANCHOR} ${command}`;
}
export function isVersionFlag(arg: string): boolean {
  return arg === "--version" || arg === "-V" || arg === "version";
}
export const FLAGS = {
  HELP: "--help",
  HELP_SHORT: "-h",
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
