import type { DocumentChunk } from "@trybacked/ingest";

export type CorpusExcerpt = {
  uri: string;
  excerpt: string;
  collection?: string;
  mimeType?: string;
};

/** Lost-in-the-middle (2307.03172): keep prompts compact with diverse, high-signal excerpts. */
export function sampleCorpusExcerpts(
  items: CorpusExcerpt[],
  options: { maxDocuments?: number; maxCharsPerDoc?: number } = {},
): CorpusExcerpt[] {
  const maxDocuments = options.maxDocuments ?? 10;
  const maxCharsPerDoc = options.maxCharsPerDoc ?? 2200;
  const byCollection = new Map<string, CorpusExcerpt[]>();
  for (const item of items) {
    const key = item.collection ?? "_default";
    const bucket = byCollection.get(key) ?? [];
    bucket.push(item);
    byCollection.set(key, bucket);
  }
  const roundRobin: CorpusExcerpt[] = [];
  const keys = [...byCollection.keys()].sort();
  while (roundRobin.length < maxDocuments) {
    let added = false;
    for (const key of keys) {
      const bucket = byCollection.get(key);
      if (bucket === undefined || bucket.length === 0) {
        continue;
      }
      const next = bucket.shift();
      if (next !== undefined) {
        roundRobin.push(next);
        added = true;
        if (roundRobin.length >= maxDocuments) {
          break;
        }
      }
    }
    if (!added) {
      break;
    }
  }
  return roundRobin.map((item) => ({
    ...item,
    excerpt: item.excerpt.slice(0, maxCharsPerDoc),
  }));
}

export function excerptsFromParsedChunks(
  chunks: DocumentChunk[],
  meta: { collection?: string; mimeType?: string },
): CorpusExcerpt[] {
  const byDoc = new Map<string, string[]>();
  for (const chunk of chunks) {
    const list = byDoc.get(chunk.documentUri) ?? [];
    list.push(chunk.text);
    byDoc.set(chunk.documentUri, list);
  }
  return [...byDoc.entries()].map(([uri, texts]) => ({
    uri,
    excerpt: texts.slice(0, 3).join("\n\n"),
    ...(meta.collection !== undefined ? { collection: meta.collection } : {}),
    ...(meta.mimeType !== undefined ? { mimeType: meta.mimeType } : {}),
  }));
}
