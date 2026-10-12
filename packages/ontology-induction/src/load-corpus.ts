import { PARSED_ARTIFACTS_DIR, type DocumentChunk } from "@trybacked/ingest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  type CorpusExcerpt,
  excerptsFromParsedChunks,
  sampleCorpusExcerpts,
} from "./corpus-sample.js";

type ParsedArtifact = {
  record: { relativePath: string; collection: string; mimeType: string };
  chunks?: DocumentChunk[];
  parsed: { uri: string; plainText: string };
};

export function loadSampledCorpus(workspaceRoot: string): CorpusExcerpt[] {
  const parsedDir = path.join(workspaceRoot, PARSED_ARTIFACTS_DIR);
  if (!existsSync(parsedDir)) {
    return [];
  }
  const raw: CorpusExcerpt[] = [];
  for (const name of readdirSync(parsedDir).filter((entry) => entry.endsWith(".json"))) {
    const artifact = JSON.parse(readFileSync(path.join(parsedDir, name), "utf8")) as ParsedArtifact;
    if (artifact.chunks !== undefined && artifact.chunks.length > 0) {
      raw.push(
        ...excerptsFromParsedChunks(artifact.chunks, {
          collection: artifact.record.collection,
          mimeType: artifact.record.mimeType,
        }),
      );
    } else {
      raw.push({
        uri: artifact.parsed.uri,
        excerpt: artifact.parsed.plainText,
        collection: artifact.record.collection,
        mimeType: artifact.record.mimeType,
      });
    }
  }
  return sampleCorpusExcerpts(raw);
}
