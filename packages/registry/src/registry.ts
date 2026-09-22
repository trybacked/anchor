import { BACKED_DIR_NAME, publicationPath } from "@trybacked/core";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { PublicationRecordSchema, type PublicationRecord } from "./publication.js";

export const REGISTRY_FILE_NAME = "registry.json";
export const PUBLICATIONS_DIR_NAME = "publications";

export const OntologyRegistryEntrySchema = z.object({
  version: z.number().int().positive(),
  publishedAt: z.string().datetime(),
  runId: z.string().min(1),
});

export const OntologyRegistrySchema = z.object({
  formatVersion: z.literal(1),
  ontologyId: z.string().min(1),
  currentVersion: z.number().int().positive(),
  entries: z.array(OntologyRegistryEntrySchema),
});

export type OntologyRegistryEntry = z.infer<typeof OntologyRegistryEntrySchema>;

export type OntologyRegistry = z.infer<typeof OntologyRegistrySchema>;

/** Resolves the registry file path inside `.backed/`. */
export function registryPath(root: string): string {
  return path.join(root, BACKED_DIR_NAME, REGISTRY_FILE_NAME);
}

/** Resolves the archive path for one publication version. */
export function publicationArchivePath(root: string, version: number): string {
  return path.join(root, BACKED_DIR_NAME, PUBLICATIONS_DIR_NAME, `v${String(version)}.json`);
}

/** Reads the registry, or null when missing or invalid. */
export function readOntologyRegistry(root: string): OntologyRegistry | null {
  const filePath = registryPath(root);
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    return OntologyRegistrySchema.parse(JSON.parse(readFileSync(filePath, "utf-8")));
  } catch {
    return null;
  }
}

/** Reads one archived publication version, or null when absent. */
export function readPublicationByVersion(root: string, version: number): PublicationRecord | null {
  const archived = publicationArchivePath(root, version);
  if (existsSync(archived)) {
    return PublicationRecordSchema.parse(JSON.parse(readFileSync(archived, "utf-8")));
  }
  const current = readPublicationRecordFromPath(publicationPath(root));
  if (current !== null && current.version === version) {
    return current;
  }
  return null;
}

function readPublicationRecordFromPath(filePath: string): PublicationRecord | null {
  try {
    return PublicationRecordSchema.parse(JSON.parse(readFileSync(filePath, "utf-8")));
  } catch {
    return null;
  }
}

/** Lists publication versions sorted ascending. */
export function listPublicationVersions(root: string): OntologyRegistryEntry[] {
  const registry = readOntologyRegistry(root);
  if (registry !== null) {
    return [...registry.entries].sort((left, right) => left.version - right.version);
  }
  const current = readPublicationRecordFromPath(publicationPath(root));
  if (current === null) {
    return [];
  }
  return [
    {
      version: current.version,
      publishedAt: current.publishedAt,
      runId: current.runId,
    },
  ];
}

/** Archives one publication record under `publications/vN.json`. */
export function archivePublicationRecord(root: string, record: PublicationRecord): void {
  const archivePath = publicationArchivePath(root, record.version);
  mkdirSync(path.dirname(archivePath), { recursive: true });
  writeFileSync(archivePath, `${JSON.stringify(record, null, 2)}\n`, "utf-8");
}

/** Adds a publication entry to the registry and sets the current version. */
export function updateOntologyRegistry(
  root: string,
  record: PublicationRecord,
  ontologyId: string,
): OntologyRegistry {
  const previous = readOntologyRegistry(root);
  const entry: OntologyRegistryEntry = {
    version: record.version,
    publishedAt: record.publishedAt,
    runId: record.runId,
  };
  const entries = previous?.entries ?? [];
  const withoutDuplicate = entries.filter((item) => item.version !== entry.version);
  const registry = OntologyRegistrySchema.parse({
    formatVersion: 1,
    ontologyId,
    currentVersion: record.version,
    entries: [...withoutDuplicate, entry].sort((left, right) => left.version - right.version),
  });
  const filePath = registryPath(root);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(registry, null, 2)}\n`, "utf-8");
  return registry;
}

/** Restores an archived publication version as the active publication. */
export function restorePublicationVersion(root: string, version: number): PublicationRecord {
  const record = readPublicationByVersion(root, version);
  if (record === null) {
    throw new Error(`Publication version ${String(version)} not found.`);
  }
  const currentPath = publicationPath(root);
  const archivePath = publicationArchivePath(root, version);
  mkdirSync(path.dirname(currentPath), { recursive: true });
  if (existsSync(archivePath)) {
    copyFileSync(archivePath, currentPath);
  } else {
    writeFileSync(currentPath, `${JSON.stringify(record, null, 2)}\n`, "utf-8");
  }
  updateOntologyRegistry(root, record, record.ontology.metadata.id);
  return record;
}
