import type { DocumentCatalog, DomainVocabulary, ProfileReport } from "@backed/core";
import { EMPTY_BURST_USAGE, runBurst, sumBurstUsage } from "./burst.js";
import type { BurstUsage } from "./burst.js";
import { withLlmCache, type LlmCacheContext } from "./llm-cache.js";
import { LLM_SCHEMA_NAMES, COLUMN_CLASSIFICATION_CONCURRENCY } from "./constants.js";
import { mapWithConcurrency } from "./concurrency.js";
import type { CompressedTable } from "./compress.js";
import type { SemanticModels } from "./env.js";
import { ColumnClassificationOutputSchema } from "./llm-output.js";
import type { ColumnClassificationOutput } from "./llm-output.js";
import { COLUMN_CLASSIFICATION_SYSTEM_PROMPT, columnClassificationPrompt } from "./prompts.js";
import { classifyMentionTables, classifyTypedDocumentTables } from "./document-ontology.js";
import { classifyLineDocumentTables, classifyPipelineMetadataTables } from "./line-document.js";
import type { TableRouting } from "./table-routing.js";
import { emptyClassification, mergeClassificationOutputs } from "./propose-assembly.js";

async function classifyColumnsInBatches(
    tables: CompressedTable[],
    models: SemanticModels,
    batchSize: number,
    timeoutMs: number,
    llmCache: LlmCacheContext | undefined,
    onProgress?: (message: string) => void,
    onBatchProgress?: (progress: { completed: number; total: number }) => void,
): Promise<{
    output: ColumnClassificationOutput;
    usage: BurstUsage;
}> {
    if (tables.length === 0) {
        return { output: emptyClassification(), usage: EMPTY_BURST_USAGE };
    }
    const batches: CompressedTable[][] = [];
    for (let offset = 0; offset < tables.length; offset += batchSize) {
        batches.push(tables.slice(offset, offset + batchSize));
    }
    const batchCount = batches.length;
    onBatchProgress?.({ completed: 0, total: batchCount });
    let completed = 0;
    const results = await mapWithConcurrency(batches, COLUMN_CLASSIFICATION_CONCURRENCY, async (batch, index) => {
        const batchIndex = index + 1;
        onProgress?.(
            `Column classification batch ${String(batchIndex)}/${String(batchCount)} (${String(batch.length)} tables)...`,
        );
        const result = await runBurst({
            model: models.language,
            system: COLUMN_CLASSIFICATION_SYSTEM_PROMPT,
            prompt: columnClassificationPrompt(batch),
            schema: ColumnClassificationOutputSchema,
            schemaName: LLM_SCHEMA_NAMES.columnClassification,
            timeoutMs,
            ...withLlmCache(llmCache),
        });
        completed += 1;
        onBatchProgress?.({ completed, total: batchCount });
        return result;
    });
    return {
        output: mergeClassificationOutputs(...results.map((result) => result.output)),
        usage: results.reduce((usage, result) => sumBurstUsage(usage, result.usage), EMPTY_BURST_USAGE),
    };
}

export async function classifyAllColumns(
    routing: TableRouting,
    documentCatalog: DocumentCatalog | undefined,
    vocabulary: DomainVocabulary,
    profile: ProfileReport,
    models: SemanticModels,
    batchSize: number,
    timeoutMs: number,
    llmCache: LlmCacheContext | undefined,
    onProgress?: (message: string) => void,
    onBatchProgress?: (progress: { completed: number; total: number }) => void,
): Promise<{
    classification: ColumnClassificationOutput;
    usage: BurstUsage;
}> {
    const lineDocumentClassification =
        documentCatalog !== undefined ? emptyClassification() : classifyLineDocumentTables(routing.lineDocuments);
    const typedDocumentClassification =
        documentCatalog !== undefined ? classifyTypedDocumentTables(documentCatalog) : emptyClassification();
    const metadataClassification = classifyPipelineMetadataTables(routing.pipelineMetadata);
    const mentionClassification =
        documentCatalog !== undefined ? classifyMentionTables(profile, vocabulary) : emptyClassification();
    const structuredClassification =
        routing.llmStructured.length > 0
            ? await classifyColumnsInBatches(
                  routing.llmStructured,
                  models,
                  batchSize,
                  timeoutMs,
                  llmCache,
                  onProgress,
                  onBatchProgress,
              )
            : { output: emptyClassification(), usage: EMPTY_BURST_USAGE };
    return {
        classification: mergeClassificationOutputs(
            lineDocumentClassification,
            typedDocumentClassification,
            mentionClassification,
            metadataClassification,
            structuredClassification.output,
        ),
        usage: structuredClassification.usage,
    };
}
