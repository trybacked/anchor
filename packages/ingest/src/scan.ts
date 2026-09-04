import { readdir } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

import {
  createArchiveTempDir,
  extractRarArchive,
  extractZipArchive,
} from "./archive.js";
import type { IngestWarning } from "./types.js";
import type { DatasetFormat } from "./types.js";

const EXTENSION_FORMATS: Readonly<Record<string, DatasetFormat>> = {
  ".csv": "csv",
  ".tsv": "csv",
  ".xlsx": "xlsx",
  ".xls": "xlsx",
  ".parquet": "parquet",
  ".json": "json",
  ".jsonl": "json",
  ".pdf": "pdf",
  ".txt": "text",
  ".md": "text",
  ".log": "text",
  ".docx": "docx",
};

const ARCHIVE_EXTENSIONS = new Set([".zip", ".rar"]);

export interface SourceFile {
  absolutePath: string;
  relativePath: string;
  format: DatasetFormat;
}

export interface FolderScan {
  sources: SourceFile[];
  unsupportedFiles: string[];
  tempDirs: string[];
  scanWarnings: IngestWarning[];
}

async function walkDirectory(
  absoluteDir: string,
  relativePrefix: string,
  root: string,
  sources: SourceFile[],
  unsupportedFiles: string[],
  tempDirs: string[],
  scanWarnings: IngestWarning[],
): Promise<void> {
  const entries = await readdir(absoluteDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const absolutePath = join(absoluteDir, entry.name);
    const relativePath = relativePrefix
      ? join(relativePrefix, entry.name)
      : entry.name;

    if (entry.isDirectory()) {
      await walkDirectory(
        absolutePath,
        relativePath,
        root,
        sources,
        unsupportedFiles,
        tempDirs,
        scanWarnings,
      );
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const extension = extname(entry.name).toLowerCase();

    if (ARCHIVE_EXTENSIONS.has(extension)) {
      const tempDir = await createArchiveTempDir("backed-archive-");
      tempDirs.push(tempDir);
      try {
        if (extension === ".zip") {
          await extractZipArchive(absolutePath, tempDir);
        } else {
          await extractRarArchive(absolutePath, tempDir);
        }
        scanWarnings.push({
          kind: "archive_extracted",
          file: relative(root, absolutePath),
          message: `Archive extracted for ingest (${extension.slice(1)} contents scanned)`,
        });
        await walkDirectory(
          tempDir,
          relative(root, absolutePath),
          root,
          sources,
          unsupportedFiles,
          tempDirs,
          scanWarnings,
        );
      } catch (error) {
        unsupportedFiles.push(relative(root, absolutePath));
        scanWarnings.push({
          kind: "unreadable_file",
          file: relative(root, absolutePath),
          message: `Archive could not be extracted: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
      continue;
    }

    const format = EXTENSION_FORMATS[extension];
    if (format === undefined) {
      unsupportedFiles.push(relativePath);
      continue;
    }

    sources.push({ absolutePath, relativePath, format });
  }
}

export async function scanFolder(folderPath: string): Promise<FolderScan> {
  const root = resolve(folderPath);
  const sources: SourceFile[] = [];
  const unsupportedFiles: string[] = [];
  const tempDirs: string[] = [];
  const scanWarnings: IngestWarning[] = [];

  await walkDirectory(root, "", root, sources, unsupportedFiles, tempDirs, scanWarnings);

  sources.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  unsupportedFiles.sort((a, b) => a.localeCompare(b));

  return { sources, unsupportedFiles, tempDirs, scanWarnings };
}
