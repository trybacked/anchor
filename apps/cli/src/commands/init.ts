import { existsSync } from "node:fs";
import path from "node:path";
import type { WorkspaceConfig } from "@backed/core";
import { initWorkspace, readWorkspaceConfig, workspacePaths, writeWorkspaceConfig, } from "@backed/core";
import { input } from "@inquirer/prompts";
import { promptDocumentTypeHints, summarizeDocumentTypeHints, } from "../document-type-hint-guide.js";
import { DEFAULT_SOURCES_DIR, isOptionArg } from "../config.js";
import { initNextStep, MESSAGES, sourcesFolderMissing } from "../messages.js";
import { createPromptTheme, getUi, initUi, renderLogo } from "../ui/index.js";
import type { CommandHandler } from "../types.js";
async function promptSourcesDir(defaultDir: string, theme: ReturnType<typeof createPromptTheme>) {
    const sourcesDir = await input({
        message: "Sources folder (CSV, Excel, PDF, …):",
        default: defaultDir,
        theme,
    });
    return sourcesDir.trim() || defaultDir;
}
async function buildInteractiveConfig(root: string, sourcesArg: string | undefined, theme: ReturnType<typeof createPromptTheme>): Promise<WorkspaceConfig> {
    let existing: WorkspaceConfig | undefined;
    try {
        existing = readWorkspaceConfig(root);
    }
    catch {
        existing = undefined;
    }
    const ui = getUi();
    const documentTypeHints = await promptDocumentTypeHints(existing?.documentTypeHints ?? [], theme, ui);
    const defaultSources = sourcesArg ?? existing?.sourcesDir ?? DEFAULT_SOURCES_DIR;
    const sourcesDir = await promptSourcesDir(defaultSources, theme);
    return {
        sourcesDir,
        documentTypeHints,
    };
}
export const initCommand: CommandHandler = async (args) => {
    const ui = initUi();
    if (!process.stdin.isTTY) {
        ui.writeError(MESSAGES.initRequiresTty);
        process.exitCode = 1;
        return;
    }
    ui.log(renderLogo());
    ui.blank();
    ui.heading("Initialize workspace");
    ui.hr();
    const theme = createPromptTheme();
    const root = process.cwd();
    const positional = args.find((arg) => !isOptionArg(arg));
    const config = await buildInteractiveConfig(root, positional, theme);
    if (!existsSync(path.resolve(root, config.sourcesDir))) {
        ui.writeWarn(sourcesFolderMissing(config.sourcesDir));
    }
    const alreadyInitialized = existsSync(workspacePaths(root).configPath);
    const configPath = alreadyInitialized
        ? writeWorkspaceConfig(root, config)
        : initWorkspace(root, config);
    ui.blank();
    ui.writeSuccess(alreadyInitialized ? `Workspace updated → ${ui.path(configPath)}` : `Workspace initialized → ${ui.path(configPath)}`);
    ui.log(`  ${ui.label("Sources")}     ${config.sourcesDir}`);
    ui.log(`  ${ui.label("Doc rules")}  ${summarizeDocumentTypeHints(config.documentTypeHints)}`);
    ui.blank();
    ui.step(initNextStep());
};
