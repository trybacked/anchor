import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { registerSource } from "./register.js";
import { PdfNoExtractableTextError } from "./errors.js";
import { beginPdfIngestNoiseFilter, endPdfIngestNoiseFilter } from "./pdf-ingest-noise.js";
import { terminateOcrWorker } from "./pdf-ocr.js";
import { scanFolder } from "./scan.js";
import { createDuckDbSession } from "./session.js";
import { toTableName, uniqueTableName } from "./table-names.js";
import type { Dataset, IngestSession, IngestWarning } from "./types.js";
export { quoteIdentifier, quoteString, dropTableIfExists, sqlNullableString, sqlNullableNumber } from "./sql.js";
export { createRowReader } from "./row-reader.js";
export { createAggregateReader } from "./aggregate-reader.js";
export { createObjectQueryReader } from "./object-query-reader.js";
export { createChunkSearcher } from "./chunk-search.js";
export { createEntityProfileReader } from "./entity-profile-reader.js";
export type { ChunkSearcherOptions } from "./chunk-search.js";
export { ensureChunkEmbeddingColumn, fetchChunkTextsForEmbedding, storeChunkEmbeddings, documentChunksHaveEmbeddings, capturePreservedChunkEmbeddings, restorePreservedChunkEmbeddings, formatEmbeddingLiteral, chunkEmbeddingColumnRef, } from "./chunk-embeddings.js";
export type { StoredChunkEmbedding, ChunkTextRow } from "./chunk-embeddings.js";
export { DOCUMENT_HEADER_LINE_LIMIT, CORPUS_SAMPLE_LINE_LIMIT, applyDocumentTopics, fetchCorpusSampleLines, fetchDocumentHeaderText, fetchDocumentHeaderSamples, materializeDocumentTables, } from "./materialize-documents.js";
export type { DocumentTopicUpdate } from "./materialize-documents.js";
export { fetchAllDocumentLines, materializeDocumentMentions, } from "./materialize-document-mentions.js";
export type { MaterializedMentionInput, MaterializedEntityInput, MaterializeDocumentMentionsInput, MaterializeDocumentMentionsResult, } from "./materialize-document-mentions.js";
export { materializeFacts } from "./materialize-facts.js";
export type { MaterializedFactInput, MaterializeFactsResult } from "./materialize-facts.js";
export { materializeEntityProfiles } from "./materialize-entity-profiles.js";
export type { MaterializeEntityProfilesOptions, MaterializeEntityProfilesResult, } from "./materialize-entity-profiles.js";
export { chunkDocumentLines, chunkDocumentLineRows } from "./chunk-document-lines.js";
export type { DocumentHeaderSample, MaterializeDocumentsResult, } from "./materialize-documents.js";
export type { DocumentLineRow, DocumentChunkRow, ChunkDocumentLinesOptions, } from "./chunk-document-lines.js";
export type { CsvDialect, CsvEncoding, Dataset, DatasetFormat, DecimalSeparator, IngestResult, IngestSession, IngestWarning, IngestWarningKind, SqlQuery, } from "./types.js";
export { toTableName, uniqueTableName } from "./table-names.js";
export type { DuckDbSession, DuckDbSessionOptions } from "./session.js";
export interface IngestFolderOptions {
    databasePath?: string;
}
export async function openDataSession(databasePath: string) {
    return createDuckDbSession({ databasePath, readOnly: true });
}
export async function ingestFolder(folderPath: string, options: IngestFolderOptions = {}): Promise<IngestSession> {
    const { databasePath } = options;
    if (databasePath !== undefined) {
        await rm(databasePath, { force: true });
        await mkdir(path.dirname(databasePath), { recursive: true });
    }
    const scan = await scanFolder(folderPath);
    const session = await createDuckDbSession(databasePath !== undefined ? { databasePath } : {});
    const datasets: Dataset[] = [];
    const warnings: IngestWarning[] = [
        ...scan.scanWarnings,
        ...scan.unsupportedFiles.map((file) => ({
            kind: "unsupported_format" as const,
            file,
            message: "Unsupported format: file ignored",
        })),
    ];
    const usedNames = new Set<string>();
    beginPdfIngestNoiseFilter();
    try {
        for (const source of scan.sources) {
            const tableName = uniqueTableName(toTableName(source.relativePath), usedNames);
            try {
                const registration = await registerSource(session.query, source, tableName);
                datasets.push(registration.dataset);
                warnings.push(...registration.warnings);
            }
            catch (error) {
                if (error instanceof PdfNoExtractableTextError) {
                    warnings.push({
                        kind: "pdf_no_extractable_text",
                        file: source.relativePath,
                        message: "PDF has no extractable text after native parse and OCR (empty or OCR disabled)",
                    });
                    continue;
                }
                warnings.push({
                    kind: "unreadable_file",
                    file: source.relativePath,
                    message: `Unreadable file: ${error instanceof Error ? error.message : String(error)}`,
                });
            }
        }
    }
    finally {
        await endPdfIngestNoiseFilter();
    }
    const tempDirs = scan.tempDirs;
    return {
        datasets,
        warnings,
        query: session.query,
        close: () => {
            session.close();
            void terminateOcrWorker();
            for (const tempDir of tempDirs) {
                void rm(tempDir, { recursive: true, force: true });
            }
        },
    };
}
