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
} as const;
export function isHelpFlag(arg: string): boolean {
    return arg === FLAGS.HELP || arg === FLAGS.HELP_SHORT;
}
export function isOptionArg(arg: string): boolean {
    return arg.startsWith("--");
}
export const WORKSPACE_ENV_FILE = ".env";
export const DEFAULT_SOURCES_DIR = "./sources";
export const MCP_SERVER_NAME = "backed-model";
export const MCP_SURFACE_TOOLS = [
    "list_entities",
    "get_entity",
    "list_relations",
    "search_model",
    "get_definition",
] as const;
export const CORPUS_SAMPLE_LINES_PER_TABLE = 25;
export const MS_PER_SECOND = 1000;
export const GATEWAY_DOCS_URL = "https://vercel.com/ai-gateway";
export const PROPOSAL_ONTOLOGY_PREFIX = "Building ontology";
export const DATA_SNAPSHOT_LABEL = ".backed/data.duckdb";
export const CONFIG_RELATIVE_PATH = ".backed/config.yaml";
export const MODEL_FILE_LABEL = "model.yaml";
