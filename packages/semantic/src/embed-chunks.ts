import { embedMany } from "ai";
import type { EmbeddingModel } from "ai";
import { EMBEDDING_BATCH_SIZE } from "./constants.js";
export { EMBEDDING_BATCH_SIZE } from "./constants.js";
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
export async function embedTexts(model: EmbeddingModel, texts: string[], onProgress?: (message: string) => void, onBatchProgress?: (progress: EmbedBatchProgress) => void): Promise<EmbedTextsResult> {
    if (texts.length === 0) {
        return { embeddings: [], usage: { tokens: 0 } };
    }
    const embeddings: number[][] = [];
    let tokens = 0;
    const batchCount = Math.ceil(texts.length / EMBEDDING_BATCH_SIZE);
    onBatchProgress?.({ completed: 0, total: batchCount });
    for (let offset = 0; offset < texts.length; offset += EMBEDDING_BATCH_SIZE) {
        const batch = texts.slice(offset, offset + EMBEDDING_BATCH_SIZE);
        const batchIndex = Math.floor(offset / EMBEDDING_BATCH_SIZE) + 1;
        onProgress?.(`Embedding batch ${String(batchIndex)}/${String(batchCount)} (${String(batch.length)} chunks)...`);
        const result = await embedMany({
            model,
            values: batch,
        });
        for (const embedding of result.embeddings) {
            embeddings.push([...embedding]);
        }
        tokens += result.usage.tokens ?? 0;
        onBatchProgress?.({ completed: batchIndex, total: batchCount });
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
