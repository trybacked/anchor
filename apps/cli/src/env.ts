import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { BACKED_DIR_NAME, CONFIG_FILE_NAME } from "@backed/core";
import { WORKSPACE_ENV_FILE } from "./config.js";
export function workspaceConfigPath(directory: string): string {
    return join(directory, BACKED_DIR_NAME, CONFIG_FILE_NAME);
}
export function workspaceEnvPath(root: string): string {
    return join(root, WORKSPACE_ENV_FILE);
}
export function findWorkspaceRoot(startDir: string = process.cwd()): string {
    let directory = resolve(startDir);
    while (true) {
        if (existsSync(workspaceConfigPath(directory))) {
            return directory;
        }
        const parent = dirname(directory);
        if (parent === directory) {
            return resolve(startDir);
        }
        directory = parent;
    }
}
export function loadWorkspaceDotEnv(startDir: string = process.cwd()): string {
    const root = findWorkspaceRoot(startDir);
    const envPath = workspaceEnvPath(root);
    try {
        process.loadEnvFile(envPath);
    }
    catch {
    }
    return root;
}
