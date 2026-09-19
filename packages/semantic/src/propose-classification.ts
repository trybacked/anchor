import type { DocumentCatalog, DomainVocabulary, ProfileReport } from "@trybacked/core";
import { EMPTY_BURST_USAGE, type BurstUsage } from "./burst.js";
import type { CompressedTable } from "./compress.js";
import { LLM_SCHEMA_NAMES, COLUMN_CLASSIFICATION_CONCURRENCY } from "./constants.js";
import { classifyMentionTables, classifyTypedDocumentTables } from "./document-ontology.js";
import type { SemanticModels } from "./env.js";
import { classifyLineDocumentTables, classifyPipelineMetadataTables } from "./line-document.js";
import { withLlmCache, type LlmCacheContext } from "./llm-cache.js";
import { ColumnClassificationOutputSchema } from "./llm-output.js";
import type { ColumnClassificationOutput } from "./llm-output.js";
import { COLUMN_CLASSIFICATION_SYSTEM_PROMPT, columnClassificationPrompt } from "./prompts.js";
import { emptyClassification, mergeClassificationOutputs } from "./propose-assembly.js";
import { chunkBySize, mapBurstBatches, sumBurstResults } from "./run-batched-burst.js";
import type { TableRouting } from "./table-routing.js";

async function classifyColumnsInBatches(
  tables: CompressedTable[],
  models: SemanticModels,
  batchSize: number,
  timeoutMs: number,
  llmCache: LlmCacheContext | undefined,
  onProgress?: (message: string) => void,
  onBatchProgress?: (progress: { completed: number; total: number }) => void,
  signal?: AbortSignal,
): Promise<{
  output: ColumnClassificationOutput;
  usage: BurstUsage;
}> {
  if (tables.length === 0) {
    return { output: emptyClassification(), usage: EMPTY_BURST_USAGE };
  }
  const batches = chunkBySize(tables, batchSize);
  const results = await mapBurstBatches({
    batches,
    concurrency: COLUMN_CLASSIFICATION_CONCURRENCY,
    ...(signal !== undefined ? { signal } : {}),
    onBatchStart: (batchIndex, batchCount) => {
      const batch = batches[batchIndex - 1];
      onProgress?.(
        `Column classification batch ${String(batchIndex)}/${String(batchCount)} (${String(batch?.length ?? 0)} tables)...`,
      );
    },
    onBatchComplete: (completed, total) => {
      onBatchProgress?.({ completed, total });
    },
    buildRequest: (batch) => ({
      model: models.language,
      system: COLUMN_CLASSIFICATION_SYSTEM_PROMPT,
      prompt: columnClassificationPrompt(batch),
      schema: ColumnClassificationOutputSchema,
      schemaName: LLM_SCHEMA_NAMES.columnClassification,
      timeoutMs,
      ...withLlmCache(llmCache),
      ...(signal !== undefined ? { signal } : {}),
    }),
  });
  return {
    output: mergeClassificationOutputs(...results.map((result) => result.output)),
    usage: sumBurstResults(results),
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
  signal?: AbortSignal,
): Promise<{
  classification: ColumnClassificationOutput;
  usage: BurstUsage;
}> {
  const lineDocumentClassification =
    documentCatalog !== undefined
      ? emptyClassification()
      : classifyLineDocumentTables(routing.lineDocuments);
  const typedDocumentClassification =
    documentCatalog !== undefined
      ? classifyTypedDocumentTables(documentCatalog, profile)
      : emptyClassification();
  const metadataClassification = classifyPipelineMetadataTables(routing.pipelineMetadata);
  const mentionClassification =
    documentCatalog !== undefined
      ? classifyMentionTables(profile, vocabulary)
      : emptyClassification();
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
          signal,
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
