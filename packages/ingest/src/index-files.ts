import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { IngestFileRecord } from "./types.js";
import { mimeFromPath } from "./mime.js";

function sha256File(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function walkFiles(root: string, collection: string, base: string, out: IngestFileRecord[]): void {
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    const full = path.join(base, entry.name);
    if (entry.isDirectory()) {
      walkFiles(root, collection, full, out);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const stat = statSync(full);
    const relativePath = path.relative(root, full).split(path.sep).join("/");
    out.push({
      relativePath,
      collection,
      sha256: sha256File(full),
      mimeType: mimeFromPath(full),
      sizeBytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
    });
  }
}

export function indexFilesRoot(filesRoot: string): IngestFileRecord[] {
  const records: IngestFileRecord[] = [];
  for (const entry of readdirSync(filesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      const full = path.join(filesRoot, entry.name);
      if (!entry.isFile()) {
        continue;
      }
      const stat = statSync(full);
      records.push({
        relativePath: entry.name,
        collection: "_root",
        sha256: sha256File(full),
        mimeType: mimeFromPath(full),
        sizeBytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      });
      continue;
    }
    walkFiles(filesRoot, entry.name, path.join(filesRoot, entry.name), records);
  }
  return records.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

export function diffIngestRecords(
  previous: IngestFileRecord[],
  next: IngestFileRecord[],
): { added: IngestFileRecord[]; changed: IngestFileRecord[]; removed: string[] } {
  const prevMap = new Map(previous.map((r) => [r.relativePath, r]));
  const nextMap = new Map(next.map((r) => [r.relativePath, r]));
  const added: IngestFileRecord[] = [];
  const changed: IngestFileRecord[] = [];
  for (const record of next) {
    const old = prevMap.get(record.relativePath);
    if (old === undefined) {
      added.push(record);
    } else if (old.sha256 !== record.sha256) {
      changed.push(record);
    }
  }
  const removed = previous
    .filter((record) => !nextMap.has(record.relativePath))
    .map((record) => record.relativePath);
  return { added, changed, removed };
}
