import type { z } from "zod";
import { LLM_SCHEMA_NAMES, type BurstRequest, type BurstResult } from "@backed/semantic";
import { GERACE_DOMAIN_VOCABULARY } from "./gerace-vocabulary.js";

const MOCK_USAGE = { inputTokens: 12, outputTokens: 6, costUsd: 0.0001 };

interface PromptDocument {
    sourceTable: string;
    headerLines: string[];
}

interface PromptTable {
    table: string;
    columns: Array<{ name: string; sqlType: string }>;
}

function extractJsonBlock<T>(prompt: string, marker: string): T {
    const index = prompt.indexOf(marker);
    if (index === -1) {
        throw new Error(`Prompt marker not found: ${marker}`);
    }
    const remainder = prompt.slice(index + marker.length).trim();
    const start = remainder.search(/[\[{]/);
    if (start === -1) {
        throw new Error(`JSON block not found after marker: ${marker}`);
    }
    const opener = remainder[start];
    const closer = opener === "[" ? "]" : "}";
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let offset = start; offset < remainder.length; offset += 1) {
        const char = remainder[offset];
        if (inString) {
            if (escaped) {
                escaped = false;
                continue;
            }
            if (char === "\\") {
                escaped = true;
                continue;
            }
            if (char === "\"") {
                inString = false;
            }
            continue;
        }
        if (char === "\"") {
            inString = true;
            continue;
        }
        if (char === opener) {
            depth += 1;
            continue;
        }
        if (char === closer) {
            depth -= 1;
            if (depth === 0) {
                return JSON.parse(remainder.slice(start, offset + 1)) as T;
            }
        }
    }
    throw new Error(`Unterminated JSON block after marker: ${marker}`);
}

function parseDocumentsFromPrompt(prompt: string): PromptDocument[] {
    if (!prompt.includes("Documents (JSON):")) {
        return [];
    }
    return extractJsonBlock<PromptDocument[]>(prompt, "Documents (JSON):");
}

function parseTablesFromPrompt(prompt: string): PromptTable[] {
    if (!prompt.includes("Statistical profile of the tables (JSON):")) {
        return [];
    }
    return extractJsonBlock<PromptTable[]>(prompt, "Statistical profile of the tables (JSON):");
}

function slugifyLabel(label: string): string {
    const slug = label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
    return slug.length > 0 ? slug : "unknown";
}

function documentTypeFromHeaderLines(headerLines: string[]): { documentType: string; documentTypeLabel: string } {
    for (const line of headerLines) {
        const separator = line.indexOf(":");
        if (separator === -1) {
            continue;
        }
        const label = line.slice(separator + 1).trim();
        if (label.length === 0) {
            continue;
        }
        return {
            documentType: slugifyLabel(label),
            documentTypeLabel: label,
        };
    }
    return { documentType: "unknown", documentTypeLabel: "Unknown" };
}

function buildDocumentExtraction(documents: PromptDocument[]): unknown {
    if (documents.length === 1) {
        const [document] = documents;
        if (document === undefined) {
            throw new Error("Document extraction batch was empty.");
        }
        const mapped = documentTypeFromHeaderLines(document.headerLines);
        return {
            documentType: mapped.documentType,
            documentTypeLabel: mapped.documentTypeLabel,
            fields: [
                { key: "effective_date", value: "2026-08-26" },
                { key: "title", value: "Test document subject" },
                { key: "issuer", value: "Sample issuing body" },
            ],
            confidence: 0.92,
        };
    }
    return {
        documents: documents.map((document) => {
            const mapped = documentTypeFromHeaderLines(document.headerLines);
            return {
                sourceTable: document.sourceTable,
                documentType: mapped.documentType,
                documentTypeLabel: mapped.documentTypeLabel,
                fields: [
                    { key: "effective_date", value: "2026-08-26" },
                    { key: "title", value: "Test document subject" },
                    { key: "issuer", value: "Sample issuing body" },
                ],
                confidence: 0.92,
            };
        }),
    };
}

function inferColumnRole(columnName: string): "primary_key" | "foreign_key" | "attribute" {
    if (columnName === "id" || columnName.endsWith("_id")) {
        return columnName.endsWith("_id") ? "foreign_key" : "primary_key";
    }
    return "attribute";
}

function inferSemanticType(columnName: string): string {
    if (columnName.includes("data") || columnName.includes("date")) {
        return "date";
    }
    if (columnName.includes("importo") || columnName.includes("amount")) {
        return "amount";
    }
    if (columnName.endsWith("_id") || columnName === "id") {
        return "identifier";
    }
    return "text";
}

function buildColumnClassification(tables: PromptTable[]): unknown {
    return {
        tables: tables.map((table) => ({
            table: table.table,
            columns: table.columns.map((column) => ({
                column: column.name,
                label: column.name.replace(/_/g, " "),
                semanticType: inferSemanticType(column.name),
                role: inferColumnRole(column.name),
                confidence: 0.9,
            })),
        })),
    };
}

function buildOntologyProposal(prompt: string): unknown {
    const entities = [
        {
            id: "protocol_record",
            name: "Protocol record",
            description: "Index row for a municipal act publication",
            sourceTable: "atti_albo",
            confidence: 0.95,
            evidence: "Structured CSV index of municipal acts",
        },
        {
            id: "party",
            name: "Party",
            description: "Company or organization mentioned in procurement extracts",
            sourceTable: "enti_extract",
            confidence: 0.9,
            evidence: "Structured CSV of companies and contract metadata",
        },
    ];
    return {
        entities: entities.filter((entity) => prompt.includes(entity.sourceTable)),
        relations: [],
        rules: [],
        doubts: [],
    };
}

function parseDocumentIdsFromEnrichmentPrompt(prompt: string): string[] {
    return [...prompt.matchAll(/^documentId: (.+)$/gm)].map((match) => match[1]?.trim() ?? "").filter((id) => id.length > 0);
}

function parseEntityIdsFromEnrichmentPrompt(prompt: string): string[] {
    return [...prompt.matchAll(/^entityId: (.+)$/gm)].map((match) => match[1]?.trim() ?? "").filter((id) => id.length > 0);
}

function buildDocumentEnrichment(prompt: string): unknown {
    const topicId = GERACE_DOMAIN_VOCABULARY.documentTopics[0]?.id ?? "altro";
    return {
        documents: parseDocumentIdsFromEnrichmentPrompt(prompt).map((documentId) => ({
            documentId,
            topics: [topicId],
            summary: "Administrative act issued by the municipality.",
        })),
    };
}

function buildEntityEnrichment(prompt: string): unknown {
    return {
        entities: parseEntityIdsFromEnrichmentPrompt(prompt).map((entityId) => ({
            entityId,
            sector: "altro",
            role: "altro",
            summary: "Company referenced in municipal documents.",
            confidence: 0.85,
        })),
    };
}

export async function handleGeraceBurst<TSchema extends z.ZodTypeAny>(
    request: BurstRequest<TSchema>,
): Promise<BurstResult<z.infer<TSchema>>> {
    let rawOutput: unknown;
    switch (request.schemaName) {
        case LLM_SCHEMA_NAMES.domainVocabulary:
            rawOutput = GERACE_DOMAIN_VOCABULARY;
            break;
        case LLM_SCHEMA_NAMES.documentExtraction: {
            const documents = parseDocumentsFromPrompt(request.prompt);
            rawOutput = buildDocumentExtraction(documents);
            break;
        }
        case LLM_SCHEMA_NAMES.columnClassification: {
            const tables = parseTablesFromPrompt(request.prompt);
            rawOutput = buildColumnClassification(tables);
            break;
        }
        case LLM_SCHEMA_NAMES.ontologyProposal:
            rawOutput = buildOntologyProposal(request.prompt);
            break;
        case LLM_SCHEMA_NAMES.ontologyEntities:
            rawOutput = {
                entities: buildOntologyProposal(request.prompt).entities,
                doubts: [],
            };
            break;
        case LLM_SCHEMA_NAMES.ontologyRelations:
            rawOutput = {
                relations: [],
                rules: [],
                doubts: [],
            };
            break;
        case LLM_SCHEMA_NAMES.documentEnrichment:
            rawOutput = buildDocumentEnrichment(request.prompt);
            break;
        case LLM_SCHEMA_NAMES.entityEnrichment:
            rawOutput = buildEntityEnrichment(request.prompt);
            break;
        default:
            throw new Error(`Unhandled schema in Gerace golden mock: ${request.schemaName}`);
    }
    const output = request.schema.parse(rawOutput);
    return { output, usage: MOCK_USAGE };
}
