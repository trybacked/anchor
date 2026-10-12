import type { ParsedDocument } from "@trybacked/ports";

export type DocumentChunk = {
  chunkId: string;
  documentUri: string;
  index: number;
  text: string;
  charStart: number;
  charEnd: number;
  page?: number;
};

const DEFAULT_MAX_CHARS = 1200;

export function chunkParsedDocument(
  document: ParsedDocument,
  options: { maxChars?: number } = {},
): DocumentChunk[] {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const chunks: DocumentChunk[] = [];
  let buffer = "";
  let bufferStart = 0;
  let index = 0;

  const flush = (charEnd: number) => {
    const trimmed = buffer.trim();
    if (trimmed.length === 0) {
      return;
    }
    const page = document.blocks.find((b) => b.charStart <= bufferStart)?.page;
    chunks.push({
      chunkId: `${document.uri}#${String(index)}`,
      documentUri: document.uri,
      index,
      text: trimmed,
      charStart: bufferStart,
      charEnd,
      ...(page !== undefined ? { page } : {}),
    });
    index += 1;
    buffer = "";
  };

  for (const block of document.blocks) {
    const piece = block.text.trim();
    if (piece.length === 0) {
      continue;
    }
    if (buffer.length === 0) {
      bufferStart = block.charStart;
    }
    const candidate = buffer.length === 0 ? piece : `${buffer}\n${piece}`;
    if (candidate.length > maxChars && buffer.length > 0) {
      flush(block.charStart);
      buffer = piece;
      bufferStart = block.charStart;
    } else {
      buffer = candidate;
    }
  }
  if (buffer.length > 0) {
    flush(document.blocks.at(-1)?.charEnd ?? buffer.length);
  }
  return chunks;
}
