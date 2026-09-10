import type { DocumentCatalog, DocumentCatalogEntry, DocumentTypeHintConfig, DomainVocabulary, } from "@backed/core";
import { DocumentCatalogSchema, EMPTY_DOMAIN_VOCABULARY, fieldsFromRecord, normalizeDocumentFieldKey, } from "@backed/core";
import { z } from "zod";
import { runBurst, sumBurstUsage } from "./burst.js";
import type { BurstUsage } from "./burst.js";
import { withLlmCache, type LlmCacheContext } from "./llm-cache.js";
import { LLM_SCHEMA_NAMES } from "./constants.js";
import { mapWithConcurrency } from "./concurrency.js";
import { DOCUMENT_EXTRACTION_BATCH_SIZE, DOCUMENT_EXTRACTION_CONCURRENCY, DOCUMENT_EXTRACTION_LLM_SKIP_CONFIDENCE, } from "./constants.js";
import { hashDocumentSample, hashHeaderContent } from "./document-sample-fingerprint.js";
import type { DocumentTypeHint, DocumentTypeRegistryEntry } from "./document-type-hints.js";
import { inferDocumentTypeHint } from "./document-type-hints.js";
import type { SemanticModels } from "./env.js";
import { resolveSemanticRequestTimeoutMs } from "./env.js";
import { extractVocabularyFields, filterHeaderLinesForLlm, findRecurringLines } from "./extract-header-fields.js";
import { documentBatchExtractionPrompt, DOCUMENT_EXTRACTION_SYSTEM_PROMPT, } from "./prompts.js";
import { slugify } from "./string-utils.js";
export { DOCUMENT_EXTRACTION_BATCH_SIZE, DOCUMENT_EXTRACTION_CONCURRENCY, DOCUMENT_EXTRACTION_LLM_SKIP_CONFIDENCE, } from "./constants.js";

const ExtractedFieldSchema = z.object({
    key: z.string().min(1).describe("Stable English snake_case field name"),
    value: z.string().nullable(),
});

export const SingleDocumentExtractionSchema = z.object({
    documentType: z
        .string()
        .min(1)
        .describe("Stable English slug for the kind of document, or \"unknown\""),
    documentTypeLabel: z.string().min(1).describe("Singular English business name for that kind"),
    fields: z.array(ExtractedFieldSchema).default([]),
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
    typeRegistry?: Map<string, DocumentTypeRegistryEntry>;
    llmCache?: LlmCacheContext;
}

function fieldsFromExtraction(
    extracted: Array<{ key: string; value: string | null }>,
    confidence: number,
): Record<string, DocumentCatalogEntry["fields"][string]> {
    const record: Record<string, string | null> = {};
    for (const field of extracted) {
        record[normalizeDocumentFieldKey(field.key)] = field.value;
    }
    return fieldsFromRecord(record, confidence);
}

function normalizeDocumentTypeSlug(raw: string): string {
    const normalized = slugify(raw.trim());
    return normalized.length > 0 ? normalized : "unknown";
}

function shouldSkipLlm(typeHint: DocumentTypeHint | null): typeHint is DocumentTypeHint {
    return typeHint !== null && typeHint.confidence >= DOCUMENT_EXTRACTION_LLM_SKIP_CONFIDENCE;
}

function buildDeterministicCatalogEntry(
    sample: DocumentExtractionSample,
    typeHint: DocumentTypeHint,
    vocabulary: DomainVocabulary,
    headerFingerprint: string,
    headerContentFingerprint: string,
): DocumentCatalogEntry {
    const vocabularyFields = extractVocabularyFields(sample.headerLines, vocabulary);
    return {
        sourceTable: sample.sourceTable,
        documentType: typeHint.documentType,
        documentTypeLabel: typeHint.documentTypeLabel,
        confidence: typeHint.confidence,
        pageCount: sample.pageCount,
        headerFingerprint,
        headerContentFingerprint,
        fields: fieldsFromRecord(vocabularyFields, typeHint.confidence),
    };
}

function toCatalogEntry(
    sourceTable: string,
    extracted: SingleDocumentExtraction,
    sample: DocumentExtractionSample,
    headerFingerprint: string,
    headerContentFingerprint: string,
): DocumentCatalogEntry {
    return {
        sourceTable,
        documentType: normalizeDocumentTypeSlug(extracted.documentType),
        documentTypeLabel: extracted.documentTypeLabel,
        confidence: extracted.confidence,
        pageCount: sample.pageCount,
        headerFingerprint,
        headerContentFingerprint,
        fields: fieldsFromExtraction(extracted.fields, extracted.confidence),
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
        const headerContentFingerprint = hashHeaderContent(sample.headerLines, options.recurringLines);
        return {
            entries: [toCatalogEntry(
                sample.sourceTable,
                extracted,
                sample,
                hashDocumentSample(sample, options.recurringLines),
                headerContentFingerprint,
            )],
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
        entries.push(toCatalogEntry(
            sample.sourceTable,
            extracted,
            sample,
            hashDocumentSample(sample, options.recurringLines),
            hashHeaderContent(sample.headerLines, options.recurringLines),
        ));
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
    const registrySamples: Array<{
        sample: DocumentExtractionSample;
        registryType: DocumentTypeRegistryEntry;
    }> = [];
    const deterministicSamples: Array<{
        sample: DocumentExtractionSample;
        typeHint: DocumentTypeHint;
    }> = [];
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
        const registryType = options.typeRegistry?.get(sample.sourceTable);
        if (registryType !== undefined) {
            registrySamples.push({ sample, registryType });
            continue;
        }
        const typeHint = inferDocumentTypeHint(sample.sourceTable, options.documentTypeHints);
        if (shouldSkipLlm(typeHint)) {
            if (typeHint === null) {
                throw new Error(`Internal error: "${sample.sourceTable}" was routed to deterministic extraction without a type hint.`);
            }
            deterministicSamples.push({ sample, typeHint });
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
    const registryEntries = registrySamples.map(({ sample, registryType }) => buildDeterministicCatalogEntry(
        sample,
        {
            documentType: registryType.documentType,
            documentTypeLabel: registryType.documentTypeLabel,
            confidence: 0.98,
            evidence: `Canonical document type preserved for sourceTable "${sample.sourceTable}"`,
        },
        vocabulary,
        hashDocumentSample(sample, recurringLines),
        hashHeaderContent(sample.headerLines, recurringLines),
    ));
    const deterministicEntries = deterministicSamples.map(({ sample, typeHint }) => buildDeterministicCatalogEntry(
        sample,
        typeHint,
        vocabulary,
        hashDocumentSample(sample, recurringLines),
        hashHeaderContent(sample.headerLines, recurringLines),
    ));
    const llmBatchResults = await llmPromise;
    const llmEntries = llmBatchResults.flatMap((result) => result.entries);
    const usage = sumBurstUsage(...llmBatchResults.map((result) => result.usage));
    options.onProgress?.([
        `${String(cachedEntries.length)} unchanged`,
        `${String(registryEntries.length)} from registry`,
        `${String(deterministicEntries.length)} from hints`,
        `${String(llmEntries.length)} via LLM`,
        cacheHits > 0 ? `${String(cacheHits)} cache hit(s)` : null,
    ].filter((part): part is string => part !== null).join(", "));
    const documents = [...cachedEntries, ...registryEntries, ...deterministicEntries, ...llmEntries];
    const catalog = DocumentCatalogSchema.omit({ documentTypes: true }).parse({
        runId: options.runId,
        generatedAt: (options.now ?? new Date()).toISOString(),
        documents,
    });
    return { catalog, usage };
}
