/**
 * Document catalog extraction: deterministic pipeline first, LLM only when needed.
 *
 * - Strong type hints from table slugs → skip LLM, extract header fields via regex
 * - Ambiguous documents → one LLM call each, run in parallel
 */

import type { DocumentCatalog, DocumentCatalogEntry, DocumentTypeHintConfig } from "@backed/core";
import { DocumentCatalogSchema } from "@backed/core";
import { z } from "zod";

import { runBurst } from "./burst.js";
import type { BurstUsage } from "./burst.js";
import { mapWithConcurrency } from "./concurrency.js";
import type { DocumentTypeHint } from "./document-type-hints.js";
import { inferDocumentTypeHint } from "./document-type-hints.js";
import type { SemanticModels } from "./env.js";
import { resolveSemanticRequestTimeoutMs } from "./env.js";
import { extractHeaderFields } from "./extract-header-fields.js";
import {
  documentExtractionPrompt,
  DOCUMENT_EXTRACTION_SYSTEM_PROMPT,
} from "./prompts.js";

/** Skip LLM when slug type hint reaches this confidence (pipeline path). */
export const DOCUMENT_EXTRACTION_LLM_SKIP_CONFIDENCE = 0.85;

/** Parallel LLM calls for documents that cannot be classified deterministically. */
export const DOCUMENT_EXTRACTION_CONCURRENCY = 8;

/** @deprecated Always 1 LLM call per ambiguous document; kept for exports. */
export const DOCUMENT_EXTRACTION_BATCH_SIZE = 1;

export const SingleDocumentExtractionSchema = z.object({
  documentType: z
    .string()
    .min(1)
    .describe("Stable slug in English, e.g. determination, notice, resolution, publication, unknown"),
  documentTypeLabel: z.string().min(1).describe("Singular business name in English, e.g. Determination"),
  protocolNumber: z.string().nullable(),
  publishedDate: z.string().nullable().describe("ISO date YYYY-MM-DD when found, else null"),
  subject: z.string().nullable(),
  issuingOffice: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export type SingleDocumentExtraction = z.infer<typeof SingleDocumentExtractionSchema>;

/** @deprecated Use SingleDocumentExtractionSchema — kept for test imports only. */
export const DocumentExtractionOutputSchema = z.object({
  documents: z.array(
    SingleDocumentExtractionSchema.extend({
      sourceTable: z.string().min(1),
    }),
  ),
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
  /** Workspace slug rules from .backed/config.yaml (required for deterministic classification). */
  documentTypeHints?: DocumentTypeHintConfig[];
}

function fieldFromValue(
  value: string | null,
  confidence: number,
): DocumentCatalogEntry["protocolNumber"] {
  return {
    value,
    confidence,
  };
}

function mergeBurstUsage(current: BurstUsage, next: BurstUsage): BurstUsage {
  const costs = [current.costUsd, next.costUsd].filter((cost): cost is number => cost !== null);
  return {
    inputTokens: current.inputTokens + next.inputTokens,
    outputTokens: current.outputTokens + next.outputTokens,
    costUsd: costs.length > 0 ? costs.reduce((total, cost) => total + cost, 0) : null,
  };
}

function normalizeDocumentTypeSlug(raw: string): string {
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized.length > 0 ? normalized : "unknown";
}

function shouldSkipLlm(typeHint: DocumentTypeHint | null): typeHint is DocumentTypeHint {
  return typeHint !== null && typeHint.confidence >= DOCUMENT_EXTRACTION_LLM_SKIP_CONFIDENCE;
}

function buildDeterministicCatalogEntry(
  sample: DocumentExtractionSample,
  typeHint: DocumentTypeHint,
): DocumentCatalogEntry {
  const fields = extractHeaderFields(sample.sourceTable, sample.headerLines);
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

function toCatalogEntry(
  sourceTable: string,
  extracted: SingleDocumentExtraction,
  sample: DocumentExtractionSample,
): DocumentCatalogEntry {
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

async function extractOneDocumentWithLlm(
  sample: DocumentExtractionSample,
  options: {
    models: SemanticModels;
    timeoutMs: number;
    documentTypeHints?: DocumentTypeHintConfig[];
  },
): Promise<{ entry: DocumentCatalogEntry; usage: BurstUsage }> {
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

export async function extractDocumentCatalog(
  options: ExtractDocumentCatalogOptions,
): Promise<{ catalog: Omit<DocumentCatalog, "documentTypes">; usage: BurstUsage }> {
  const timeoutMs = resolveSemanticRequestTimeoutMs();
  const deterministicEntries: DocumentCatalogEntry[] = [];
  const llmSamples: DocumentExtractionSample[] = [];

  for (const sample of options.samples) {
  const typeHint = inferDocumentTypeHint(sample.sourceTable, options.documentTypeHints);
    if (shouldSkipLlm(typeHint)) {
      deterministicEntries.push(buildDeterministicCatalogEntry(sample, typeHint));
    } else {
      llmSamples.push(sample);
    }
  }

  options.onProgress?.(
    `Documents: ${String(deterministicEntries.length)} classified from filename, ${String(llmSamples.length)} need LLM...`,
  );

  let usage: BurstUsage = { inputTokens: 0, outputTokens: 0, costUsd: null };

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

  const llmResults =
    llmTotal > 0
      ? await mapWithConcurrency(
          llmSamples,
          DOCUMENT_EXTRACTION_CONCURRENCY,
          async (sample, index) => {
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
            } catch (error) {
              const detail = error instanceof Error ? error.message : String(error);
              throw new Error(
                `Document extraction failed for "${sample.sourceTable}" (${String(index + 1)}/${String(llmTotal)}). ${detail}`,
              );
            } finally {
              llmInFlight -= 1;
              llmCompleted += 1;
              reportLlmProgress();
            }
          },
        )
      : [];

  for (const result of llmResults) {
    usage = mergeBurstUsage(usage, result.usage);
  }

  const documents = [...deterministicEntries, ...llmResults.map((result) => result.entry)];

  const catalog = DocumentCatalogSchema.omit({ documentTypes: true }).parse({
    runId: options.runId,
    generatedAt: (options.now ?? new Date()).toISOString(),
    documents,
  });

  return { catalog, usage };
}
