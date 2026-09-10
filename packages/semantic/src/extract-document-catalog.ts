import type { DocumentCatalog, DocumentCatalogEntry, DocumentTypeHintConfig, DomainVocabulary, } from "@backed/core";
import { DocumentCatalogSchema, EMPTY_DOMAIN_VOCABULARY } from "@backed/core";
import { z } from "zod";
import { runBurst, sumBurstUsage } from "./burst.js";
import type { BurstUsage } from "./burst.js";
import { withLlmCache, type LlmCacheContext } from "./llm-cache.js";
import { LLM_SCHEMA_NAMES } from "./constants.js";
import { mapWithConcurrency } from "./concurrency.js";
import { DOCUMENT_EXTRACTION_BATCH_SIZE, DOCUMENT_EXTRACTION_CONCURRENCY, DOCUMENT_EXTRACTION_LLM_SKIP_CONFIDENCE, } from "./constants.js";
import { hashDocumentSample } from "./document-sample-fingerprint.js";
import type { DocumentTypeHint } from "./document-type-hints.js";
import { inferDocumentTypeHint } from "./document-type-hints.js";
import type { SemanticModels } from "./env.js";
import { resolveSemanticRequestTimeoutMs } from "./env.js";
import { extractHeaderFields, filterHeaderLinesForLlm, findRecurringLines } from "./extract-header-fields.js";
import type { HeaderFieldContext } from "./extract-header-fields.js";
import { documentBatchExtractionPrompt, DOCUMENT_EXTRACTION_SYSTEM_PROMPT, } from "./prompts.js";
import { slugify } from "./string-utils.js";
export { DOCUMENT_EXTRACTION_BATCH_SIZE, DOCUMENT_EXTRACTION_CONCURRENCY, DOCUMENT_EXTRACTION_LLM_SKIP_CONFIDENCE, } from "./constants.js";
export const SingleDocumentExtractionSchema = z.object({
    documentType: z
        .string()
        .min(1)
        .describe("Stable English slug for the kind of document, or \"unknown\""),
    documentTypeLabel: z.string().min(1).describe("Singular English business name for that kind"),
    protocolNumber: z.string().nullable(),
    publishedDate: z.string().nullable().describe("ISO date YYYY-MM-DD when found, else null"),
    subject: z.string().nullable(),
    issuingOffice: z.string().nullable(),
    confidence: z.number().min(0).max(1),
});
export type SingleDocumentExtraction = z.infer<typeof SingleDocumentExtractionSchema>;
export const DocumentExtractionOutputSchema = z.object({
    documents: z.array(SingleDocumentExtractionSchema.extend({
        sourceTable: z.string().min(1),
    })),
});
export type DocumentExtractionOutput = z.infer<typeof DocumentExtractionOutputSchema>;
export interface DocumentExtractionSample {
    sourceTable: string;
    headerLines: string[];
    pageCount: number;
}
export interface DocumentCatalogCacheEntry {
    entry: DocumentCatalogEntry;
    headerFingerprint: string;
}
export interface DocumentLlmProgress {
    completed: number;
    total: number;
    inFlight: number;
}
export interface ExtractDocumentCatalogOptions {
    runId: string;
    models: SemanticModels;
    samples: DocumentExtractionSample[];
    now?: Date;
    onProgress?: (message: string) => void;
    onLlmProgress?: (progress: DocumentLlmProgress) => void;
    documentTypeHints?: DocumentTypeHintConfig[];
    vocabulary?: DomainVocabulary | Promise<DomainVocabulary>;
    catalogCache?: Map<string, DocumentCatalogCacheEntry>;
    llmCache?: LlmCacheContext;
}
function fieldFromValue(value: string | null, confidence: number): DocumentCatalogEntry["protocolNumber"] {
    return {
        value,
        confidence,
    };
}
function normalizeDocumentTypeSlug(raw: string): string {
    const normalized = slugify(raw.trim());
    return normalized.length > 0 ? normalized : "unknown";
}
function shouldSkipLlm(typeHint: DocumentTypeHint | null): typeHint is DocumentTypeHint {
    return typeHint !== null && typeHint.confidence >= DOCUMENT_EXTRACTION_LLM_SKIP_CONFIDENCE;
}
function buildDeterministicCatalogEntry(sample: DocumentExtractionSample, typeHint: DocumentTypeHint, headerContext: HeaderFieldContext, headerFingerprint: string): DocumentCatalogEntry {
    const fields = extractHeaderFields(sample.sourceTable, sample.headerLines, headerContext);
    const fieldConfidence = typeHint.confidence;
    return {
        sourceTable: sample.sourceTable,
        documentType: typeHint.documentType,
        documentTypeLabel: typeHint.documentTypeLabel,
        confidence: typeHint.confidence,
        pageCount: sample.pageCount,
        headerFingerprint,
        ...(fields.protocolNumber !== null
            ? { protocolNumber: fieldFromValue(fields.protocolNumber, fieldConfidence) }
            : {}),
        ...(fields.publishedDate !== null
            ? { publishedDate: fieldFromValue(fields.publishedDate, fieldConfidence) }
            : {}),
        ...(fields.subject !== null ? { subject: fieldFromValue(fields.subject, fieldConfidence) } : {}),
        ...(fields.issuingOffice !== null
            ? { issuingOffice: fieldFromValue(fields.issuingOffice, fieldConfidence) }
            : {}),
    };
}
function toCatalogEntry(sourceTable: string, extracted: SingleDocumentExtraction, sample: DocumentExtractionSample, headerFingerprint: string): DocumentCatalogEntry {
    const fieldConfidence = extracted.confidence;
    const documentType = normalizeDocumentTypeSlug(extracted.documentType);
    return {
        sourceTable,
        documentType,
        documentTypeLabel: extracted.documentTypeLabel,
        confidence: extracted.confidence,
        pageCount: sample.pageCount,
        headerFingerprint,
        ...(extracted.protocolNumber !== null
            ? { protocolNumber: fieldFromValue(extracted.protocolNumber, fieldConfidence) }
            : {}),
        ...(extracted.publishedDate !== null
            ? { publishedDate: fieldFromValue(extracted.publishedDate, fieldConfidence) }
            : {}),
        ...(extracted.subject !== null ? { subject: fieldFromValue(extracted.subject, fieldConfidence) } : {}),
        ...(extracted.issuingOffice !== null
            ? { issuingOffice: fieldFromValue(extracted.issuingOffice, fieldConfidence) }
            : {}),
    };
}
function filteredSample(sample: DocumentExtractionSample, recurringLines: Set<string>): DocumentExtractionSample {
    return {
        ...sample,
        headerLines: filterHeaderLinesForLlm(sample.headerLines, recurringLines),
    };
}
function chunkSamples<TItem>(items: TItem[], size: number): TItem[][] {
    if (size <= 1) {
        return items.map((item) => [item]);
    }
    const batches: TItem[][] = [];
    for (let index = 0; index < items.length; index += size) {
        batches.push(items.slice(index, index + size));
    }
    return batches;
}
async function extractDocumentBatchWithLlm(samples: DocumentExtractionSample[], options: {
    models: SemanticModels;
    timeoutMs: number;
    documentTypeHints?: DocumentTypeHintConfig[];
    recurringLines: Set<string>;
    llmCache?: LlmCacheContext;
}): Promise<{
    entries: DocumentCatalogEntry[];
    usage: BurstUsage;
}> {
    try {
        return await extractDocumentBatchWithLlmOnce(samples, options);
    }
    catch (error) {
        if (samples.length <= 1) {
            throw error;
        }
        const entries: DocumentCatalogEntry[] = [];
        let usage: BurstUsage = { inputTokens: 0, outputTokens: 0, costUsd: null };
        for (const sample of samples) {
            const single = await extractDocumentBatchWithLlmOnce([sample], options);
            entries.push(...single.entries);
            usage = sumBurstUsage(usage, single.usage);
        }
        return { entries, usage };
    }
}
async function extractDocumentBatchWithLlmOnce(samples: DocumentExtractionSample[], options: {
    models: SemanticModels;
    timeoutMs: number;
    documentTypeHints?: DocumentTypeHintConfig[];
    recurringLines: Set<string>;
    llmCache?: LlmCacheContext;
}): Promise<{
    entries: DocumentCatalogEntry[];
    usage: BurstUsage;
}> {
    const items = samples.map((sample) => ({
        sample: filteredSample(sample, options.recurringLines),
        typeHint: inferDocumentTypeHint(sample.sourceTable, options.documentTypeHints),
    }));
    const schema = samples.length === 1 ? SingleDocumentExtractionSchema : DocumentExtractionOutputSchema;
    const result = await runBurst({
        model: options.models.language,
        system: DOCUMENT_EXTRACTION_SYSTEM_PROMPT,
        prompt: documentBatchExtractionPrompt(items),
        schema,
        schemaName: LLM_SCHEMA_NAMES.documentExtraction,
        timeoutMs: options.timeoutMs,
        ...withLlmCache(options.llmCache),
    });
    if (samples.length === 1) {
        const sample = samples[0];
        if (sample === undefined) {
            throw new Error("Document extraction batch was empty.");
        }
        const extracted = result.output as SingleDocumentExtraction;
        return {
            entries: [toCatalogEntry(sample.sourceTable, extracted, sample, hashDocumentSample(sample, options.recurringLines))],
            usage: result.usage,
        };
    }
    const output = result.output as DocumentExtractionOutput;
    const bySourceTable = new Map(output.documents.map((document) => [document.sourceTable, document]));
    const entries: DocumentCatalogEntry[] = [];
    for (const sample of samples) {
        const extracted = bySourceTable.get(sample.sourceTable);
        if (extracted === undefined) {
            throw new Error(`Document extraction batch missing result for "${sample.sourceTable}".`);
        }
        entries.push(toCatalogEntry(sample.sourceTable, extracted, sample, hashDocumentSample(sample, options.recurringLines)));
    }
    return { entries, usage: result.usage };
}
async function resolveVocabulary(vocabulary: DomainVocabulary | Promise<DomainVocabulary> | undefined): Promise<DomainVocabulary> {
    if (vocabulary === undefined) {
        return EMPTY_DOMAIN_VOCABULARY;
    }
    return vocabulary instanceof Promise ? vocabulary : Promise.resolve(vocabulary);
}
export async function extractDocumentCatalog(options: ExtractDocumentCatalogOptions): Promise<{
    catalog: Omit<DocumentCatalog, "documentTypes">;
    usage: BurstUsage;
}> {
    const timeoutMs = resolveSemanticRequestTimeoutMs();
    const recurringLines = findRecurringLines(options.samples.map((sample) => sample.headerLines));
    const cachedEntries: DocumentCatalogEntry[] = [];
    const deterministicSamples: DocumentExtractionSample[] = [];
    const llmSamples: DocumentExtractionSample[] = [];
    let cacheHits = 0;
    for (const sample of options.samples) {
        const headerFingerprint = hashDocumentSample(sample, recurringLines);
        const cached = options.catalogCache?.get(sample.sourceTable);
        if (cached !== undefined && cached.headerFingerprint === headerFingerprint) {
            cachedEntries.push({
                ...cached.entry,
                headerFingerprint,
            });
            cacheHits += 1;
            continue;
        }
        const typeHint = inferDocumentTypeHint(sample.sourceTable, options.documentTypeHints);
        if (shouldSkipLlm(typeHint)) {
            deterministicSamples.push(sample);
        }
        else {
            llmSamples.push(sample);
        }
    }
    const vocabularyPromise = resolveVocabulary(options.vocabulary);
    const llmBatches = chunkSamples(llmSamples, DOCUMENT_EXTRACTION_BATCH_SIZE);
    const llmTotal = llmSamples.length;
    let llmCompleted = 0;
    let llmInFlight = 0;
    const reportLlmProgress = (): void => {
        options.onLlmProgress?.({
            completed: llmCompleted,
            total: llmTotal,
            inFlight: llmInFlight,
        });
    };
    if (llmTotal > 0) {
        reportLlmProgress();
    }
    const llmPromise = llmTotal > 0
        ? mapWithConcurrency(llmBatches, DOCUMENT_EXTRACTION_CONCURRENCY, async (batch) => {
            llmInFlight += batch.length;
            reportLlmProgress();
            try {
                return await extractDocumentBatchWithLlm(batch, {
                    models: options.models,
                    timeoutMs,
                    recurringLines,
                    ...(options.documentTypeHints !== undefined
                        ? { documentTypeHints: options.documentTypeHints }
                        : {}),
                    ...(options.llmCache !== undefined ? { llmCache: options.llmCache } : {}),
                });
            }
            catch (error) {
                const detail = error instanceof Error ? error.message : String(error);
                const label = batch.map((sample) => sample.sourceTable).join(", ");
                throw new Error(`Document extraction failed for batch [${label}]. ${detail}`);
            }
            finally {
                llmInFlight -= batch.length;
                llmCompleted += batch.length;
                reportLlmProgress();
            }
        })
        : Promise.resolve([]);
    const vocabulary = await vocabularyPromise;
    const headerContext: HeaderFieldContext = {
        vocabulary,
        recurringLines,
    };
    const deterministicEntries = deterministicSamples.map((sample) => {
        const typeHint = inferDocumentTypeHint(sample.sourceTable, options.documentTypeHints);
        if (!shouldSkipLlm(typeHint)) {
            throw new Error(`Internal error: "${sample.sourceTable}" was routed to deterministic extraction without a type hint.`);
        }
        return buildDeterministicCatalogEntry(sample, typeHint, headerContext, hashDocumentSample(sample, recurringLines));
    });
    const llmBatchResults = await llmPromise;
    const llmEntries = llmBatchResults.flatMap((result) => result.entries);
    const usage = sumBurstUsage(...llmBatchResults.map((result) => result.usage));
    options.onProgress?.([
        `${String(cachedEntries.length)} unchanged`,
        `${String(deterministicEntries.length)} from filename`,
        `${String(llmEntries.length)} via LLM`,
        cacheHits > 0 ? `${String(cacheHits)} cache hit(s)` : null,
    ].filter((part): part is string => part !== null).join(", "));
    const documents = [...cachedEntries, ...deterministicEntries, ...llmEntries];
    const catalog = DocumentCatalogSchema.omit({ documentTypes: true }).parse({
        runId: options.runId,
        generatedAt: (options.now ?? new Date()).toISOString(),
        documents,
    });
    return { catalog, usage };
}
