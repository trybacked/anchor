import { existsSync } from "node:fs";
import path from "node:path";
import type { WorkspaceConfig } from "@backed/core";
import { DEFAULT_SOURCES_DIR, readWorkspaceConfig, workspacePaths, writeWorkspaceConfig, } from "@backed/core";
import { input } from "@inquirer/prompts";
import { commandErrorMessage, parseInitArgs, wantsHeadlessInit } from "../args.js";
import { promptDocumentTypeHints, summarizeDocumentTypeHints, } from "../document-type-hint-guide.js";
import { buildHeadlessInitConfig } from "../init-config.js";
import { initNextStep, sourcesFolderMissing } from "../messages.js";
import { createPromptTheme, getUi, initUi, renderLogo } from "../ui/index.js";
import type { CommandHandler } from "../types.js";
import type { Ui } from "../ui/index.js";

async function promptSourcesDir(defaultDir: string, theme: ReturnType<typeof createPromptTheme>): Promise<string> {
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
        domain: existing?.domain,
    };
}

function writeWorkspace(root: string, config: WorkspaceConfig): string {
    return writeWorkspaceConfig(root, config);
}

function reportInitResult(ui: Ui, config: WorkspaceConfig, configPath: string, alreadyInitialized: boolean, styled: boolean): void {
    const action = alreadyInitialized ? "updated" : "initialized";
    if (styled) {
        ui.blank();
        ui.writeSuccess(`Workspace ${action} → ${ui.path(configPath)}`);
        ui.log(`  ${ui.label("Sources")}     ${config.sourcesDir}`);
        ui.log(`  ${ui.label("Doc rules")}  ${summarizeDocumentTypeHints(config.documentTypeHints)}`);
        ui.blank();
        ui.step(initNextStep());
        return;
    }
    ui.writeSuccess(`Workspace ${action} → ${configPath}`);
    ui.log(`  Sources: ${config.sourcesDir}`);
    ui.log(`  Doc rules: ${summarizeDocumentTypeHints(config.documentTypeHints)}`);
}

export const initCommand: CommandHandler = async (args) => {
    const ui = initUi();
    const root = process.cwd();
    if (wantsHeadlessInit(args)) {
        let parsed;
        try {
            parsed = parseInitArgs(args);
        }
        catch (error) {
            ui.writeError(commandErrorMessage(error));
            process.exitCode = 1;
            return;
        }
        if (parsed.help) {
            ui.log("Usage: backed init [--sources <dir>] [--rules <json>] [-y]");
            return;
        }
        const config = buildHeadlessInitConfig(
            parsed.sourcesDir ?? DEFAULT_SOURCES_DIR,
            parsed.rulesJson,
        );
        if (!existsSync(path.resolve(root, config.sourcesDir))) {
            ui.writeWarn(sourcesFolderMissing(config.sourcesDir));
        }
        const alreadyInitialized = existsSync(workspacePaths(root).configPath);
        const configPath = writeWorkspace(root, config);
        reportInitResult(ui, config, configPath, alreadyInitialized, false);
        return;
    }
    ui.log(renderLogo());
    ui.blank();
    ui.heading("Initialize workspace");
    ui.hr();
    const theme = createPromptTheme();
    const parsed = parseInitArgs(args);
    const config = await buildInteractiveConfig(root, parsed.sourcesDir, theme);
    if (!existsSync(path.resolve(root, config.sourcesDir))) {
        ui.writeWarn(sourcesFolderMissing(config.sourcesDir));
    }
    const alreadyInitialized = existsSync(workspacePaths(root).configPath);
    const configPath = writeWorkspace(root, config);
    reportInitResult(ui, config, configPath, alreadyInitialized, true);
};
