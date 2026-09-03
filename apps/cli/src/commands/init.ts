import { existsSync } from "node:fs";
import path from "node:path";

import { initWorkspace, workspacePaths } from "@backed/core";

import type { CommandHandler } from "../types.js";

const DEFAULT_SOURCES_DIR = "./sorgenti";

export const initCommand: CommandHandler = async (args) => {
  const root = process.cwd();
  const sourcesDir = args[0] ?? DEFAULT_SOURCES_DIR;

  if (!existsSync(path.resolve(root, sourcesDir))) {
    console.log(
      `Attenzione: la cartella sorgenti "${sourcesDir}" non esiste ancora. Creala e mettici i file (CSV, Excel, Parquet, JSON) prima di eseguire "backed model".`,
    );
  }

  const alreadyInitialized = existsSync(workspacePaths(root).configPath);
  const configPath = initWorkspace(root, { sourcesDir });

  console.log(
    alreadyInitialized
      ? `Workspace aggiornato: ${configPath} (sorgenti: ${sourcesDir})`
      : `Workspace inizializzato: ${configPath} (sorgenti: ${sourcesDir})`,
  );
  console.log('Prossimo passo: "backed model" per profilare le sorgenti e proporre il modello.');
  return Promise.resolve();
};
