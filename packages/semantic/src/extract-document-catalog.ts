import type { DocumentCatalog, DocumentCatalogEntry, DocumentTypeHintConfig, DomainVocabulary, } from "@backed/core";
import { DocumentCatalogSchema, EMPTY_DOMAIN_VOCABULARY } from "@backed/core";
import { z } from "zod";
import { runBurst, sumBurstUsage } from "./burst.js";
import type { BurstUsage } from "./burst.js";
import { mapWithConcurrency } from "./concurrency.js";
import { DOCUMENT_EXTRACTION_BATCH_SIZE, DOCUMENT_EXTRACTION_CONCURRENCY, DOCUMENT_EXTRACTION_LLM_SKIP_CONFIDENCE, } from "./constants.js";
import type { DocumentTypeHint } from "./document-type-hints.js";
import { inferDocumentTypeHint } from "./document-type-hints.js";
import type { SemanticModels } from "./env.js";
import { resolveSemanticRequestTimeoutMs } from "./env.js";
import { extractHeaderFields, findRecurringLines } from "./extract-header-fields.js";
import type { HeaderFieldContext } from "./extract-header-fields.js";
import { documentExtractionPrompt, DOCUMENT_EXTRACTION_SYSTEM_PROMPT, } from "./prompts.js";
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
    vocabulary?: DomainVocabulary;
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
function buildDeterministicCatalogEntry(sample: DocumentExtractionSample, typeHint: DocumentTypeHint, headerContext: HeaderFieldContext): DocumentCatalogEntry {
    const fields = extractHeaderFields(sample.sourceTable, sample.headerLines, headerContext);
    const fieldConfidence = typeHint.confidence;
    return {
        sourceTable: sample.sourceTable,
        documentType: typeHint.documentType,
        documentTypeLabel: typeHint.documentTypeLabel,
        confidence: typeHint.confidence,
        pageCount: sample.pageCount,
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
function toCatalogEntry(sourceTable: string, extracted: SingleDocumentExtraction, sample: DocumentExtractionSample): DocumentCatalogEntry {
    const fieldConfidence = extracted.confidence;
    const documentType = normalizeDocumentTypeSlug(extracted.documentType);
    return {
        sourceTable,
        documentType,
        documentTypeLabel: extracted.documentTypeLabel,
        confidence: extracted.confidence,
        pageCount: sample.pageCount,
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
async function extractOneDocumentWithLlm(sample: DocumentExtractionSample, options: {
    models: SemanticModels;
    timeoutMs: number;
    documentTypeHints?: DocumentTypeHintConfig[];
}): Promise<{
    entry: DocumentCatalogEntry;
    usage: BurstUsage;
}> {
    const typeHint = inferDocumentTypeHint(sample.sourceTable, options.documentTypeHints);
    const result = await runBurst({
        model: options.models.language,
        system: DOCUMENT_EXTRACTION_SYSTEM_PROMPT,
        prompt: documentExtractionPrompt(sample, typeHint),
        schema: SingleDocumentExtractionSchema,
        schemaName: "document_extraction",
        timeoutMs: options.timeoutMs,
    });
    return {
        entry: toCatalogEntry(sample.sourceTable, result.output, sample),
        usage: result.usage,
    };
}
export async function extractDocumentCatalog(options: ExtractDocumentCatalogOptions): Promise<{
    catalog: Omit<DocumentCatalog, "documentTypes">;
    usage: BurstUsage;
}> {
    const timeoutMs = resolveSemanticRequestTimeoutMs();
    const deterministicEntries: DocumentCatalogEntry[] = [];
    const llmSamples: DocumentExtractionSample[] = [];
    const headerContext: HeaderFieldContext = {
        vocabulary: options.vocabulary ?? EMPTY_DOMAIN_VOCABULARY,
        recurringLines: findRecurringLines(options.samples.map((sample) => sample.headerLines)),
    };
    for (const sample of options.samples) {
        const typeHint = inferDocumentTypeHint(sample.sourceTable, options.documentTypeHints);
        if (shouldSkipLlm(typeHint)) {
            deterministicEntries.push(buildDeterministicCatalogEntry(sample, typeHint, headerContext));
        }
        else {
            llmSamples.push(sample);
        }
    }
    options.onProgress?.(`Documents: ${String(deterministicEntries.length)} classified from filename, ${String(llmSamples.length)} need LLM...`);
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
    const llmResults = llmTotal > 0
        ? await mapWithConcurrency(llmSamples, DOCUMENT_EXTRACTION_CONCURRENCY, async (sample, index) => {
            llmInFlight += 1;
            reportLlmProgress();
            try {
                return await extractOneDocumentWithLlm(sample, {
                    models: options.models,
                    timeoutMs,
                    ...(options.documentTypeHints !== undefined
                        ? { documentTypeHints: options.documentTypeHints }
                        : {}),
                });
            }
            catch (error) {
                const detail = error instanceof Error ? error.message : String(error);
                throw new Error(`Document extraction failed for "${sample.sourceTable}" (${String(index + 1)}/${String(llmTotal)}). ${detail}`);
            }
            finally {
                llmInFlight -= 1;
                llmCompleted += 1;
                reportLlmProgress();
            }
        })
        : [];
    const usage = sumBurstUsage(...llmResults.map((result) => result.usage));
    const documents = [...deterministicEntries, ...llmResults.map((result) => result.entry)];
    const catalog = DocumentCatalogSchema.omit({ documentTypes: true }).parse({
        runId: options.runId,
        generatedAt: (options.now ?? new Date()).toISOString(),
        documents,
    });
    return { catalog, usage };
}
