import {
    BACKED_DIR_NAME,
    CONFIG_FILE_NAME,
    DATA_FILE_NAME,
} from "@backed/core";

export const CLI_NAME = "backed";
export const CLI_VERSION = "0.1.0";
export const COMMANDS = {
    INIT: "init",
    GATEWAY: "gateway",
    LOGIN: "login",
    LOGOUT: "logout",
    MODEL: "model",
    REVIEW: "review",
    DIFF: "diff",
    SERVE: "serve",
} as const;
export function formatCliCommand(command: string): string {
    return `${CLI_NAME} ${command}`;
}
export const FLAGS = {
    HELP: "--help",
    HELP_SHORT: "-h",
    FULL: "--full",
    NO_EMBED: "--no-embed",
    KEY: "--key",
    KEY_SHORT: "-k",
    TOKEN: "--token",
    STATUS: "--status",
    NO_BROWSER: "--no-browser",
    YES: "--yes",
    YES_SHORT: "-y",
    SOURCES: "--sources",
    RULES: "--rules",
} as const;
export function isHelpFlag(arg: string): boolean {
    return arg === FLAGS.HELP || arg === FLAGS.HELP_SHORT;
}
export function isOptionArg(arg: string): boolean {
    return arg.startsWith("--");
}
export const WORKSPACE_ENV_FILE = ".env";
export const GATEWAY_DOCS_URL = "https://vercel.com/ai-gateway";
export const CONFIG_RELATIVE_PATH = `${BACKED_DIR_NAME}/${CONFIG_FILE_NAME}`;
export const DATA_SNAPSHOT_LABEL = `${BACKED_DIR_NAME}/${DATA_FILE_NAME}`;
