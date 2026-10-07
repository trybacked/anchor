import type {
  Dataset,
  DatasetIdentifier,
  DatasetMetadata,
  DatasetProvider,
  DatasetSample,
  DatasetSchema,
  DatasetStatistics,
  SampleOptions,
} from "@trybacked/core";
import { readdir, stat } from "node:fs/promises";
import { join, relative, extname, basename } from "node:path";

const FILE_COLUMNS = [
  { name: "relative_path", type: "string", nullable: false, primaryKeyCandidate: true },
  { name: "file_name", type: "string", nullable: false },
  { name: "extension", type: "string", nullable: true },
  { name: "size_bytes", type: "bigint", nullable: false },
  { name: "modified_at", type: "string", nullable: false },
] as const;

export type FileIndexEntry = {
  relativePath: string;
  fileName: string;
  extension: string;
  sizeBytes: number;
  modifiedAt: string;
};

export type FileCollection = {
  id: string;
  entries: FileIndexEntry[];
};

async function listFilesRecursive(dir: string, base: string): Promise<FileIndexEntry[]> {
  const entries: FileIndexEntry[] = [];
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return entries;
  }
  for (const name of names) {
    if (name.startsWith(".")) {
      continue;
    }
    const full = join(dir, name);
    const info = await stat(full);
    if (info.isDirectory()) {
      entries.push(...(await listFilesRecursive(full, base)));
      continue;
    }
    if (!info.isFile()) {
      continue;
    }
    const relativePath = relative(base, full).replace(/\\/g, "/");
    entries.push({
      relativePath,
      fileName: basename(full),
      extension: extname(full).replace(/^\./, "").toLowerCase(),
      sizeBytes: info.size,
      modifiedAt: info.mtime.toISOString(),
    });
  }
  return entries;
}

async function loadCollections(root: string): Promise<Map<string, FileCollection>> {
  const collections = new Map<string, FileCollection>();
  let topNames: string[];
  try {
    topNames = await readdir(root);
  } catch {
    return collections;
  }
  const rootFiles: FileIndexEntry[] = [];
  for (const name of topNames) {
    if (name.startsWith(".")) {
      continue;
    }
    const full = join(root, name);
    const info = await stat(full);
    if (info.isDirectory()) {
      const entries = await listFilesRecursive(full, root);
      if (entries.length > 0) {
        collections.set(name, { id: name, entries });
      }
      continue;
    }
    if (info.isFile()) {
      rootFiles.push({
        relativePath: name,
        fileName: name,
        extension: extname(name).replace(/^\./, "").toLowerCase(),
        sizeBytes: info.size,
        modifiedAt: info.mtime.toISOString(),
      });
    }
  }
  if (rootFiles.length > 0) {
    collections.set("_root", { id: "_root", entries: rootFiles });
  }
  return collections;
}

function entryToRow(entry: FileIndexEntry): unknown[] {
  return [
    entry.relativePath,
    entry.fileName,
    entry.extension.length > 0 ? entry.extension : null,
    entry.sizeBytes,
    entry.modifiedAt,
  ];
}

function columnStats(
  entries: FileIndexEntry[],
  column: string,
): {
  nullCount: number;
  distinctCount: number;
  min?: string;
  max?: string;
} {
  const values = entries.map((entry) => {
    switch (column) {
      case "relative_path":
        return entry.relativePath;
      case "file_name":
        return entry.fileName;
      case "extension":
        return entry.extension.length > 0 ? entry.extension : null;
      case "size_bytes":
        return String(entry.sizeBytes);
      case "modified_at":
        return entry.modifiedAt;
      default:
        return null;
    }
  });
  const nullCount = values.filter((value) => value === null || value === "").length;
  const distinct = new Set(values.filter((value) => value !== null && value !== ""));
  let min: string | undefined;
  let max: string | undefined;
  if (column === "size_bytes" || column === "modified_at") {
    const sorted = [...distinct].sort();
    min = sorted[0] ?? undefined;
    max = sorted[sorted.length - 1] ?? undefined;
  }
  return {
    nullCount,
    distinctCount: distinct.size,
    ...(min !== undefined ? { min } : {}),
    ...(max !== undefined ? { max } : {}),
  };
}

export function createFileIndexDatasetProvider(options: { root: string }): DatasetProvider {
  let cache: Map<string, FileCollection> | null = null;
  async function collections(): Promise<Map<string, FileCollection>> {
    cache = await loadCollections(options.root);
    return cache;
  }
  return {
    listDatasets: async (): Promise<Dataset[]> => {
      const map = await collections();
      return [...map.values()].map((collection) => ({
        id: collection.id,
        name: collection.id === "_root" ? "files (root)" : collection.id,
        description: `File collection under ${options.root}`,
      }));
    },
    getSchema: (): Promise<DatasetSchema> =>
      Promise.resolve({
        columns: FILE_COLUMNS.map((column) => ({ ...column })),
        primaryKey: ["relative_path"],
      }),
    getMetadata: async (dataset: DatasetIdentifier): Promise<DatasetMetadata> => {
      const map = await collections();
      const collection = map.get(dataset.id);
      return {
        rowCount: collection?.entries.length ?? 0,
        upstreamProvenance: options.root,
        tags: { source: "files" },
      };
    },
    getStatistics: async (dataset: DatasetIdentifier): Promise<DatasetStatistics> => {
      const map = await collections();
      const collection = map.get(dataset.id);
      const entries = collection?.entries ?? [];
      return {
        columns: FILE_COLUMNS.map((column) => {
          const stats = columnStats(entries, column.name);
          return { name: column.name, ...stats };
        }),
      };
    },
    sample: async (dataset: DatasetIdentifier, options?: SampleOptions): Promise<DatasetSample> => {
      const map = await collections();
      const collection = map.get(dataset.id);
      const limit = options?.limit ?? 20;
      const rows = (collection?.entries ?? []).slice(0, limit).map(entryToRow);
      return {
        columns: FILE_COLUMNS.map((column) => column.name),
        rows,
      };
    },
  };
}
