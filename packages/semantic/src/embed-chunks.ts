import { embedMany } from "ai";
import type { EmbeddingModel } from "ai";
import { mapWithConcurrency } from "./concurrency.js";
import { EMBEDDING_BATCH_SIZE, EMBEDDING_CONCURRENCY } from "./constants.js";
export { EMBEDDING_BATCH_SIZE, EMBEDDING_CONCURRENCY } from "./constants.js";
export interface EmbedTextsUsage {
    tokens: number;
}
export interface EmbedTextsResult {
    embeddings: number[][];
    usage: EmbedTextsUsage;
}
export interface EmbedBatchProgress {
    completed: number;
    total: number;
}
function chunkTexts(texts: string[], size: number): string[][] {
    const batches: string[][] = [];
    for (let offset = 0; offset < texts.length; offset += size) {
        batches.push(texts.slice(offset, offset + size));
    }
    return batches;
}
export async function embedTexts(model: EmbeddingModel, texts: string[], onProgress?: (message: string) => void, onBatchProgress?: (progress: EmbedBatchProgress) => void): Promise<EmbedTextsResult> {
    if (texts.length === 0) {
        return { embeddings: [], usage: { tokens: 0 } };
    }
    const batches = chunkTexts(texts, EMBEDDING_BATCH_SIZE);
    const batchCount = batches.length;
    onBatchProgress?.({ completed: 0, total: batchCount });
    let completed = 0;
    const batchResults = await mapWithConcurrency(batches, EMBEDDING_CONCURRENCY, async (batch, index) => {
        const batchIndex = index + 1;
        onProgress?.(`Embedding batch ${String(batchIndex)}/${String(batchCount)} (${String(batch.length)} chunks)...`);
        const result = await embedMany({
            model,
            values: batch,
        });
        completed += 1;
        onBatchProgress?.({ completed, total: batchCount });
        return result;
    });
    const embeddings: number[][] = [];
    let tokens = 0;
    for (const result of batchResults) {
        for (const embedding of result.embeddings) {
            embeddings.push([...embedding]);
        }
        tokens += result.usage.tokens;
    }
    return { embeddings, usage: { tokens } };
}
export async function embedQuery(model: EmbeddingModel, text: string): Promise<number[]> {
    const result = await embedMany({
        model,
        values: [text],
    });
    const vector = result.embeddings[0];
    if (!vector) {
        throw new Error("Embedding model returned no vector for query text.");
    }
    return [...vector];
}
