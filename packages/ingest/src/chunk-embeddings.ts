import { DEFAULT_EMBEDDING_DIMENSION, DOCUMENT_CHUNKS_TABLE } from "@backed/core";
import { quoteIdentifier, quoteString } from "./sql.js";
import type { SqlQuery } from "./types.js";
export interface StoredChunkEmbedding {
    document_id: string;
    chunk_index: number;
    embedding: number[];
}
export interface ChunkTextRow {
    document_id: string;
    chunk_index: number;
    text: string;
}
const STORE_BATCH_SIZE = 100;
const CHUNK_EMBEDDING_COLUMN = "embedding";
export function formatEmbeddingLiteral(values: number[], dimension: number = DEFAULT_EMBEDDING_DIMENSION): string {
    if (values.length !== dimension) {
        throw new Error(`Embedding dimension ${String(values.length)} does not match expected ${String(dimension)}.`);
    }
    return `[${values.map((value) => String(value)).join(", ")}]::FLOAT[${String(dimension)}]`;
}
export function chunkEmbeddingColumnRef(dimension: number = DEFAULT_EMBEDDING_DIMENSION): string {
    return `CAST(${quoteIdentifier(CHUNK_EMBEDDING_COLUMN)} AS FLOAT[${String(dimension)}])`;
}
function preservationKey(documentId: string, text: string): string {
    return `${documentId}\0${text}`;
}
export async function ensureChunkEmbeddingColumn(query: SqlQuery): Promise<void> {
    const columns = await query(`SELECT column_name FROM information_schema.columns WHERE table_name = ${quoteString(DOCUMENT_CHUNKS_TABLE)} AND column_name = ${quoteString(CHUNK_EMBEDDING_COLUMN)}`);
    if (columns.length === 0) {
        await query(`ALTER TABLE ${quoteIdentifier(DOCUMENT_CHUNKS_TABLE)} ADD COLUMN ${quoteIdentifier(CHUNK_EMBEDDING_COLUMN)} FLOAT[${String(DEFAULT_EMBEDDING_DIMENSION)}]`);
    }
}
export async function capturePreservedChunkEmbeddings(query: SqlQuery): Promise<Map<string, number[]>> {
    try {
        await ensureChunkEmbeddingColumn(query);
        const rows = await query(`SELECT ${quoteIdentifier("document_id")}, ${quoteIdentifier("text")}, ${quoteIdentifier(CHUNK_EMBEDDING_COLUMN)} FROM ${quoteIdentifier(DOCUMENT_CHUNKS_TABLE)} WHERE ${quoteIdentifier(CHUNK_EMBEDDING_COLUMN)} IS NOT NULL`);
        const preserved = new Map<string, number[]>();
        for (const row of rows) {
            const documentId = String(row["document_id"] ?? "");
            const text = String(row["text"] ?? "");
            const embedding = row[CHUNK_EMBEDDING_COLUMN];
            if (!Array.isArray(embedding) || embedding.length === 0) {
                continue;
            }
            preserved.set(preservationKey(documentId, text), embedding.map(Number));
        }
        return preserved;
    }
    catch {
        return new Map();
    }
}
export async function restorePreservedChunkEmbeddings(query: SqlQuery, preserved: Map<string, number[]>): Promise<number> {
    if (preserved.size === 0) {
        return 0;
    }
    await ensureChunkEmbeddingColumn(query);
    const rows = await query(`SELECT ${quoteIdentifier("document_id")}, ${quoteIdentifier("chunk_index")}, ${quoteIdentifier("text")} FROM ${quoteIdentifier(DOCUMENT_CHUNKS_TABLE)} WHERE ${quoteIdentifier(CHUNK_EMBEDDING_COLUMN)} IS NULL`);
    const toRestore: StoredChunkEmbedding[] = [];
    for (const row of rows) {
        const documentId = String(row["document_id"] ?? "");
        const chunkIndex = Number(row["chunk_index"] ?? 0);
        const text = String(row["text"] ?? "");
        const embedding = preserved.get(preservationKey(documentId, text));
        if (embedding !== undefined) {
            toRestore.push({ document_id: documentId, chunk_index: chunkIndex, embedding });
        }
    }
    if (toRestore.length > 0) {
        await storeChunkEmbeddings(query, toRestore);
    }
    return toRestore.length;
}
export async function fetchChunkTextsForEmbedding(query: SqlQuery): Promise<ChunkTextRow[]> {
    await ensureChunkEmbeddingColumn(query);
    const rows = await query(`SELECT ${quoteIdentifier("document_id")}, ${quoteIdentifier("chunk_index")}, ${quoteIdentifier("text")} FROM ${quoteIdentifier(DOCUMENT_CHUNKS_TABLE)} WHERE ${quoteIdentifier(CHUNK_EMBEDDING_COLUMN)} IS NULL ORDER BY ${quoteIdentifier("document_id")}, ${quoteIdentifier("chunk_index")}`);
    return rows.map((row) => ({
        document_id: String(row["document_id"] ?? ""),
        chunk_index: Number(row["chunk_index"] ?? 0),
        text: String(row["text"] ?? ""),
    }));
}
export async function storeChunkEmbeddings(query: SqlQuery, items: StoredChunkEmbedding[]): Promise<void> {
    if (items.length === 0) {
        return;
    }
    await ensureChunkEmbeddingColumn(query);
    for (let offset = 0; offset < items.length; offset += STORE_BATCH_SIZE) {
        const batch = items.slice(offset, offset + STORE_BATCH_SIZE);
        const values = batch
            .map((item) => `(${quoteString(item.document_id)}, ${String(item.chunk_index)}, ${formatEmbeddingLiteral(item.embedding)})`)
            .join(", ");
        await query(`UPDATE ${quoteIdentifier(DOCUMENT_CHUNKS_TABLE)} AS c SET ${quoteIdentifier(CHUNK_EMBEDDING_COLUMN)} = v.${CHUNK_EMBEDDING_COLUMN} FROM (VALUES ${values}) AS v(document_id, chunk_index, ${CHUNK_EMBEDDING_COLUMN}) WHERE c.${quoteIdentifier("document_id")} = v.document_id AND c.${quoteIdentifier("chunk_index")} = v.chunk_index`);
    }
}
export async function documentChunksHaveEmbeddings(query: SqlQuery): Promise<boolean> {
    try {
        await ensureChunkEmbeddingColumn(query);
        const rows = await query(`SELECT 1 FROM ${quoteIdentifier(DOCUMENT_CHUNKS_TABLE)} WHERE ${quoteIdentifier(CHUNK_EMBEDDING_COLUMN)} IS NOT NULL LIMIT 1`);
        return rows.length > 0;
    }
    catch {
        return false;
    }
}
