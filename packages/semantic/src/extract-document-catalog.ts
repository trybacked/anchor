/**
 * LLM extraction burst for line-document corpora: classify document type and
 * extract standard header fields from page-1 text samples.
 */

import type { DocumentCatalog, DocumentCatalogEntry } from "@backed/core";
import { DocumentCatalogSchema } from "@backed/core";
import { z } from "zod";

import { runBurst } from "./burst.js";
import type { BurstUsage } from "./burst.js";
import type { SemanticModels } from "./env.js";
import { resolveSemanticRequestTimeoutMs } from "./env.js";
import { documentExtractionPrompt, DOCUMENT_EXTRACTION_SYSTEM_PROMPT } from "./prompts.js";

export const DOCUMENT_EXTRACTION_BATCH_SIZE = 10;

export const DocumentExtractionOutputSchema = z.object({
  documents: z.array(
    z.object({
      sourceTable: z.string().min(1),
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
    }),
  ),
});

export type DocumentExtractionOutput = z.infer<typeof DocumentExtractionOutputSchema>;

export interface DocumentExtractionSample {
  sourceTable: string;
  headerLines: string[];
  pageCount: number;
}

export interface ExtractDocumentCatalogOptions {
  runId: string;
  models: SemanticModels;
  samples: DocumentExtractionSample[];
  now?: Date;
  onProgress?: (message: string) => void;
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

function toCatalogEntry(
  extracted: DocumentExtractionOutput["documents"][number],
  sample: DocumentExtractionSample,
): DocumentCatalogEntry {
  const fieldConfidence = extracted.confidence;
  return {
    sourceTable: extracted.sourceTable,
    documentType: extracted.documentType,
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

export async function extractDocumentCatalog(
  options: ExtractDocumentCatalogOptions,
): Promise<{ catalog: Omit<DocumentCatalog, "documentTypes">; usage: BurstUsage }> {
  const timeoutMs = resolveSemanticRequestTimeoutMs();
  const sampleByTable = new Map(options.samples.map((sample) => [sample.sourceTable, sample]));
  const merged: DocumentExtractionOutput["documents"] = [];
  let usage: BurstUsage = { inputTokens: 0, outputTokens: 0, costUsd: null };
  const batchCount = Math.ceil(options.samples.length / DOCUMENT_EXTRACTION_BATCH_SIZE);

  for (let offset = 0; offset < options.samples.length; offset += DOCUMENT_EXTRACTION_BATCH_SIZE) {
    const batch = options.samples.slice(offset, offset + DOCUMENT_EXTRACTION_BATCH_SIZE);
    const batchIndex = Math.floor(offset / DOCUMENT_EXTRACTION_BATCH_SIZE) + 1;
    options.onProgress?.(
      `Document extraction batch ${String(batchIndex)}/${String(batchCount)} (${String(batch.length)} files)...`,
    );

    const result = await runBurst({
      model: options.models.cheap,
      system: DOCUMENT_EXTRACTION_SYSTEM_PROMPT,
      prompt: documentExtractionPrompt(batch),
      schema: DocumentExtractionOutputSchema,
      schemaName: `document_extraction_${String(batchIndex)}_of_${String(batchCount)}`,
      timeoutMs,
      ...(options.onProgress !== undefined ? { onWaiting: options.onProgress } : {}),
    });

    merged.push(...result.output.documents);
    usage = mergeBurstUsage(usage, result.usage);
  }

  const documents = merged.map((extracted) => {
    const sample = sampleByTable.get(extracted.sourceTable);
    if (!sample) {
      throw new Error(`Missing header sample for table "${extracted.sourceTable}"`);
    }
    return toCatalogEntry(extracted, sample);
  });

  const catalog = DocumentCatalogSchema.omit({ documentTypes: true }).parse({
    runId: options.runId,
    generatedAt: (options.now ?? new Date()).toISOString(),
    documents,
  });

  return { catalog, usage };
}
