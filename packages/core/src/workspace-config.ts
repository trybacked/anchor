import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import {
    DEFAULT_SOURCES_DIR,
    DEFAULT_WORKSPACE_CONFIG,
    WorkspaceConfigSchema,
    workspacePaths,
} from "./workspace.js";
import type { WorkspaceConfig } from "./workspace.js";

export function writeWorkspaceConfig(root: string, config: WorkspaceConfig): string {
    const paths = workspacePaths(root);
    mkdirSync(paths.runsDir, { recursive: true });
    const parsed = WorkspaceConfigSchema.parse(config);
    writeFileSync(paths.configPath, stringifyYaml(parsed), "utf-8");
    return paths.configPath;
}

export function patchWorkspaceConfig(root: string, patch: Partial<WorkspaceConfig>): string {
    let existing: WorkspaceConfig;
    try {
        existing = readWorkspaceConfig(root);
    }
    catch {
        existing = DEFAULT_WORKSPACE_CONFIG;
    }
    return writeWorkspaceConfig(root, { ...existing, ...patch });
}

export function readWorkspaceConfig(root: string): WorkspaceConfig {
    const paths = workspacePaths(root);
    let raw: string;
    try {
        raw = readFileSync(paths.configPath, "utf-8");
    }
    catch {
        throw new Error(`Workspace not initialized: missing ${paths.configPath}. Run "backed init" first.`);
    }
    return WorkspaceConfigSchema.parse(parseYaml(raw));
}
