import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { IngestManifestSchema, type IngestFileRecord, type IngestManifest } from "./types.js";

export const INGEST_MANIFEST = ".backed/ingest-manifest.yaml";
export const PARSED_ARTIFACTS_DIR = ".backed/parsed";

export function ingestManifestPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, INGEST_MANIFEST);
}

export function readIngestManifest(workspaceRoot: string): IngestManifest | null {
  const filePath = ingestManifestPath(workspaceRoot);
  if (!existsSync(filePath)) {
    return null;
  }
  return IngestManifestSchema.parse(parseYaml(readFileSync(filePath, "utf8")));
}

export function writeIngestManifest(workspaceRoot: string, manifest: IngestManifest): string {
  const filePath = ingestManifestPath(workspaceRoot);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, stringifyYaml(manifest), "utf8");
  return filePath;
}

export function manifestIndex(manifest: IngestManifest): Map<string, IngestFileRecord> {
  return new Map(manifest.files.map((file) => [file.relativePath, file]));
}
