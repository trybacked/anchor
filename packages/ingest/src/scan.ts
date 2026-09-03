import { readdir } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

import type { DatasetFormat } from "./types.js";

const EXTENSION_FORMATS: Readonly<Record<string, DatasetFormat>> = {
  ".csv": "csv",
  ".xlsx": "xlsx",
  ".parquet": "parquet",
  ".json": "json",
};

export interface SourceFile {
  absolutePath: string;
  relativePath: string;
  format: DatasetFormat;
}

export interface FolderScan {
  sources: SourceFile[];
  unsupportedFiles: string[];
}

export async function scanFolder(folderPath: string): Promise<FolderScan> {
  const root = resolve(folderPath);
  const entries = await readdir(root, { recursive: true, withFileTypes: true });

  const sources: SourceFile[] = [];
  const unsupportedFiles: string[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith(".")) {
      continue;
    }
    const absolutePath = join(entry.parentPath, entry.name);
    const relativePath = relative(root, absolutePath);
    const format = EXTENSION_FORMATS[extname(entry.name).toLowerCase()];
    if (format === undefined) {
      unsupportedFiles.push(relativePath);
      continue;
    }
    sources.push({ absolutePath, relativePath, format });
  }

  // Ordine deterministico: le run devono essere riproducibili.
  sources.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  unsupportedFiles.sort((a, b) => a.localeCompare(b));

  return { sources, unsupportedFiles };
}
