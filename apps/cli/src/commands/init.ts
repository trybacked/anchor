import { existsSync } from "node:fs";
import path from "node:path";

import { initWorkspace, workspacePaths } from "@backed/core";

import type { CommandHandler } from "../types.js";

const DEFAULT_SOURCES_DIR = "./sources";

export const initCommand: CommandHandler = async (args) => {
  const root = process.cwd();
  const sourcesDir = args[0] ?? DEFAULT_SOURCES_DIR;

  if (!existsSync(path.resolve(root, sourcesDir))) {
    console.log(
      `Note: sources folder "${sourcesDir}" does not exist yet. Create it and add your files (CSV, Excel, Parquet, JSON) before running "backed model".`,
    );
  }

  const alreadyInitialized = existsSync(workspacePaths(root).configPath);
  const configPath = initWorkspace(root, { sourcesDir });

  console.log(
    alreadyInitialized
      ? `Workspace updated: ${configPath} (sources: ${sourcesDir})`
      : `Workspace initialized: ${configPath} (sources: ${sourcesDir})`,
  );
  console.log('Next step: "backed model" to profile sources and propose the semantic model.');
  return Promise.resolve();
};
