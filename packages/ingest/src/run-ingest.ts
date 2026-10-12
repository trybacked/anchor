import { duckDbPathFromEnv, resolveWarehouseDuckDbPath } from "@trybacked/infrastructure";
import type { ArtifactStore } from "@trybacked/ports";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chunkParsedDocument } from "./chunk.js";
import { upsertDocumentChunks } from "./hybrid-index.js";
import { diffIngestRecords, indexFilesRoot } from "./index-files.js";
import {
  PARSED_ARTIFACTS_DIR,
  manifestIndex,
  readIngestManifest,
  writeIngestManifest,
} from "./manifest.js";
import { createDocumentParserFromEnv } from "./parse/create-parser.js";
import type { IngestProgressEvent } from "./types.js";

export type RunIngestOptions = {
  workspaceRoot: string;
  filesRoot: string;
  tenantId: string;
  env?: NodeJS.ProcessEnv;
  artifactStore?: ArtifactStore;
  duckDbPath?: string;
  onProgress?: (event: IngestProgressEvent) => void;
  parseOnlyPaths?: string[];
};

export type RunIngestResult = {
  manifestPath: string;
  parsedCount: number;
  chunkCount: number;
  skippedCount: number;
};

export async function runIngest(options: RunIngestOptions): Promise<RunIngestResult> {
  const env = options.env ?? process.env;
  const parser = createDocumentParserFromEnv(env);
  const duckDbPath =
    options.duckDbPath ?? duckDbPathFromEnv(env) ?? resolveWarehouseDuckDbPath(env);
  const indexed = indexFilesRoot(options.filesRoot);
  const previous = readIngestManifest(options.workspaceRoot);
  const diff =
    previous === null
      ? { added: indexed, changed: [] as typeof indexed, removed: [] as string[] }
      : diffIngestRecords(previous.files, indexed);

  const toParse = [...diff.added, ...diff.changed];
  const filterSet =
    options.parseOnlyPaths !== undefined ? new Set(options.parseOnlyPaths) : undefined;
  const parsedDir = path.join(options.workspaceRoot, PARSED_ARTIFACTS_DIR);
  mkdirSync(parsedDir, { recursive: true });

  let parsedCount = 0;
  let skippedCount = 0;
  let chunkCount = 0;

  for (let i = 0; i < toParse.length; i++) {
    const record = toParse[i]!;
    if (filterSet !== undefined && !filterSet.has(record.relativePath)) {
      skippedCount += 1;
      continue;
    }
    options.onProgress?.({ stage: "index", indexed: i + 1, total: toParse.length });
    const absolute = path.join(options.filesRoot, record.relativePath);
    try {
      const bytes = readFileSync(absolute);
      const parsed = await parser.parse({
        uri: record.relativePath,
        mimeType: record.mimeType,
        bytes,
      });
      const chunks = chunkParsedDocument(parsed);
      chunkCount += chunks.length;
      const artifact = {
        record,
        parsed,
        chunks,
      };
      const outPath = path.join(parsedDir, `${record.sha256}.json`);
      writeFileSync(outPath, JSON.stringify(artifact), "utf8");
      await upsertDocumentChunks(duckDbPath, record, parsed.uri, chunks);
      if (options.artifactStore !== undefined) {
        await options.artifactStore.write(`parsed/${record.sha256}.json`, Buffer.from(JSON.stringify(artifact)));
      }
      parsedCount += 1;
      options.onProgress?.({ stage: "parse", path: record.relativePath, status: "ok" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      options.onProgress?.({ stage: "parse", path: record.relativePath, status: "error", message });
    }
  }

  const manifest = {
    version: 1 as const,
    tenantId: options.tenantId,
    updatedAt: new Date().toISOString(),
    files: indexed,
  };
  const manifestPath = writeIngestManifest(options.workspaceRoot, manifest);
  options.onProgress?.({ stage: "chunk", chunks: chunkCount });
  options.onProgress?.({ stage: "done", manifestPath });

  void manifestIndex(manifest);
  return { manifestPath, parsedCount, chunkCount, skippedCount };
}
