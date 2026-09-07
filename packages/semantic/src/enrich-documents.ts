import { describeTerms } from "@backed/core";
import type { DocumentCatalogEntry, DomainVocabulary } from "@backed/core";
import type { LanguageModel } from "ai";
import { z } from "zod";
import { EMPTY_BURST_USAGE, runBurst, sumBurstUsage, type BurstUsage } from "./burst.js";
import { mapWithConcurrency } from "./concurrency.js";
import { BOILERPLATE_DOCUMENT_RATIO, BOILERPLATE_MIN_DOCUMENTS, DOCUMENT_ENRICHMENT_BATCH_SIZE, DOCUMENT_ENRICHMENT_CONCURRENCY, DOCUMENT_ENRICHMENT_MAX_SAMPLE_CHARS, DOCUMENT_ENRICHMENT_MAX_SUMMARY_CHARS, DOCUMENT_ENRICHMENT_MAX_TOPICS, DOCUMENT_ENRICHMENT_SAMPLE_LINE_LIMIT, } from "./constants.js";
import { resolveSemanticRequestTimeoutMs } from "./env.js";
import type { DocumentLineRow } from "./extract-document-mentions.js";
export { BOILERPLATE_DOCUMENT_RATIO, BOILERPLATE_MIN_DOCUMENTS, DOCUMENT_ENRICHMENT_BATCH_SIZE, DOCUMENT_ENRICHMENT_CONCURRENCY, } from "./constants.js";
function buildEnrichmentSchema(vocabulary: DomainVocabulary) {
    const topicIds = vocabulary.documentTopics.map((topic) => topic.id);
    return z.object({
        documents: z.array(z.object({
            documentId: z.string(),
            topics: (topicIds.length > 0
                ? z.array(z.enum(topicIds as [
                    string,
                    ...string[]
                ]))
                : z.array(z.string().min(1)))
                .min(1)
                .max(DOCUMENT_ENRICHMENT_MAX_TOPICS),
            summary: z.string().max(DOCUMENT_ENRICHMENT_MAX_SUMMARY_CHARS),
        })),
    });
}
function buildSystemPrompt(vocabulary: DomainVocabulary): string {
    return `You tag documents from a corpus with its topics.

Corpus: ${vocabulary.corpusSummary}

For each document assign:
- topics: 1 to ${String(DOCUMENT_ENRICHMENT_MAX_TOPICS)} topics from the list below, most relevant first
- summary: one concise sentence in ${vocabulary.language} describing what the document decides or announces

Topics:
${describeTerms(vocabulary.documentTopics)}

Use only the provided text. Assign a topic only when the text supports it, and prefer the catch-all over a guess.`;
}
export interface DocumentEnrichmentInput {
    documentId: string;
    documentTypeLabel: string;
    sample: string;
}
export interface EnrichDocumentsOptions {
    model: LanguageModel;
    documents: DocumentCatalogEntry[];
    sampleByDocument: Map<string, string>;
    vocabulary: DomainVocabulary;
    onProgress?: (message: string) => void;
    onBatchProgress?: (progress: {
        completed: number;
        total: number;
    }) => void;
}
export interface EnrichDocumentsResult {
    documents: DocumentCatalogEntry[];
    usage: BurstUsage;
}
function boilerplateKey(line: string): string {
    return line
        .trim()
        .toLowerCase()
        .replace(/\d+/g, "#")
        .replace(/\s+/g, " ");
}
export function findBoilerplateLines(rows: DocumentLineRow[]): Set<string> {
    const documentsByLine = new Map<string, Set<string>>();
    const documentIds = new Set<string>();
    for (const row of rows) {
        const key = boilerplateKey(row.text);
        if (key.length === 0) {
            continue;
        }
        documentIds.add(row.document_id);
        const documents = documentsByLine.get(key) ?? new Set<string>();
        documents.add(row.document_id);
        documentsByLine.set(key, documents);
    }
    if (documentIds.size < BOILERPLATE_MIN_DOCUMENTS) {
        return new Set();
    }
    const threshold = documentIds.size * BOILERPLATE_DOCUMENT_RATIO;
    return new Set([...documentsByLine.entries()]
        .filter(([, documents]) => documents.size >= threshold)
        .map(([key]) => key));
}
export function buildDocumentTopicSample(lines: string[], boilerplate: Set<string>): string {
    const substantive = lines
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !boilerplate.has(boilerplateKey(line)));
    return substantive
        .slice(0, DOCUMENT_ENRICHMENT_SAMPLE_LINE_LIMIT)
        .join(" ")
        .slice(0, DOCUMENT_ENRICHMENT_MAX_SAMPLE_CHARS);
}
export function buildDocumentTopicSamples(rows: DocumentLineRow[]): Map<string, string> {
    const boilerplate = findBoilerplateLines(rows);
    const linesByDocument = new Map<string, string[]>();
    for (const row of rows) {
        const lines = linesByDocument.get(row.document_id) ?? [];
        lines.push(row.text);
        linesByDocument.set(row.document_id, lines);
    }
    return new Map([...linesByDocument.entries()].map(([documentId, lines]) => [
        documentId,
        buildDocumentTopicSample(lines, boilerplate),
    ]));
}
export function buildDocumentEnrichmentPrompt(inputs: DocumentEnrichmentInput[]): string {
    const blocks = inputs.map((input) => [
        `documentId: ${input.documentId}`,
        `type: ${input.documentTypeLabel}`,
        `text: ${input.sample.length > 0 ? input.sample : "(no body text)"}`,
    ].join("\n"));
    return `Tag each document:\n\n${blocks.join("\n\n---\n\n")}`;
}
function toEnrichmentInput(document: DocumentCatalogEntry, sampleByDocument: Map<string, string>): DocumentEnrichmentInput {
    return {
        documentId: document.sourceTable,
        documentTypeLabel: document.documentTypeLabel,
        sample: sampleByDocument.get(document.sourceTable) ?? document.subject?.value ?? "",
    };
}
interface EnrichedDocument {
    documentId: string;
    topics: string[];
    summary: string;
}
function applyEnrichment(documents: DocumentCatalogEntry[], enriched: Map<string, EnrichedDocument>): DocumentCatalogEntry[] {
    return documents.map((document) => {
        const entry = enriched.get(document.sourceTable);
        if (entry === undefined) {
            return document;
        }
        return { ...document, topics: entry.topics, summary: entry.summary };
    });
}
function chunkDocuments(inputs: DocumentEnrichmentInput[], size: number): DocumentEnrichmentInput[][] {
    const batches: DocumentEnrichmentInput[][] = [];
    for (let index = 0; index < inputs.length; index += size) {
        batches.push(inputs.slice(index, index + size));
    }
    return batches;
}
export async function enrichDocuments(options: EnrichDocumentsOptions): Promise<EnrichDocumentsResult> {
    if (options.documents.length === 0 || options.vocabulary.documentTopics.length === 0) {
        return { documents: options.documents, usage: EMPTY_BURST_USAGE };
    }
    const inputs = options.documents.map((document) => toEnrichmentInput(document, options.sampleByDocument));
    const batches = chunkDocuments(inputs, DOCUMENT_ENRICHMENT_BATCH_SIZE);
    const schema = buildEnrichmentSchema(options.vocabulary);
    const system = buildSystemPrompt(options.vocabulary);
    options.onProgress?.(`Tagging ${String(inputs.length)} document(s) in ${String(batches.length)} batch(es)...`);
    let completed = 0;
    const results = await mapWithConcurrency(batches, DOCUMENT_ENRICHMENT_CONCURRENCY, async (batch) => {
        const result = await runBurst({
            model: options.model,
            system,
            prompt: buildDocumentEnrichmentPrompt(batch),
            schema,
            schemaName: "document_enrichment",
            timeoutMs: resolveSemanticRequestTimeoutMs(),
        });
        completed += 1;
        options.onBatchProgress?.({ completed, total: batches.length });
        return result;
    });
    const enriched = new Map<string, EnrichedDocument>();
    for (const result of results) {
        const output = result.output as {
            documents: EnrichedDocument[];
        };
        for (const document of output.documents) {
            enriched.set(document.documentId, document);
        }
    }
    return {
        documents: applyEnrichment(options.documents, enriched),
        usage: sumBurstUsage(...results.map((result) => result.usage)),
    };
}
