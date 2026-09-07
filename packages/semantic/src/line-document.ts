import type { Entity, ProfileReport } from "@backed/core";
import type { CompressedTable } from "./compress.js";
import { DOCUMENT_CORPUS_LINE_TABLE_RATIO, DOCUMENT_CORPUS_LINE_TABLE_THRESHOLD, LINE_DOCUMENT_COLUMN_CONFIDENCE, LINE_DOCUMENT_ENTITY_CONFIDENCE, PIPELINE_METADATA_COLUMN_CONFIDENCE, PIPELINE_METADATA_DEFAULT_CONFIDENCE, } from "./constants.js";
import type { ColumnClassificationOutput } from "./llm-output.js";
import { titleCaseFromSlug } from "./string-utils.js";
export { LINE_DOCUMENT_ENTITY_CONFIDENCE, DOCUMENT_CORPUS_LINE_TABLE_THRESHOLD } from "./constants.js";
const LINE_DOCUMENT_COLUMN_NAMES = ["page", "line", "text"] as const;
const LINE_DOCUMENT_COLUMN_CLASSIFICATION: ColumnClassificationOutput["tables"][number]["columns"] = [
    {
        column: "page",
        label: "Page number",
        semanticType: "number",
        role: "attribute",
        confidence: LINE_DOCUMENT_COLUMN_CONFIDENCE,
    },
    {
        column: "line",
        label: "Line number",
        semanticType: "number",
        role: "attribute",
        confidence: LINE_DOCUMENT_COLUMN_CONFIDENCE,
    },
    {
        column: "text",
        label: "Text content",
        semanticType: "text",
        role: "attribute",
        confidence: LINE_DOCUMENT_COLUMN_CONFIDENCE,
    },
];
export function isLineDocumentTable(columns: ReadonlyArray<{
    name: string;
}>): boolean {
    if (columns.length !== LINE_DOCUMENT_COLUMN_NAMES.length) {
        return false;
    }
    const names = columns.map((column) => column.name).sort();
    const expected = [...LINE_DOCUMENT_COLUMN_NAMES].sort();
    return names.every((name, index) => name === expected[index]);
}
export function splitTablesByKind(tables: CompressedTable[]): {
    lineDocuments: CompressedTable[];
    structured: CompressedTable[];
} {
    const lineDocuments: CompressedTable[] = [];
    const structured: CompressedTable[] = [];
    for (const table of tables) {
        if (isLineDocumentTable(table.columns)) {
            lineDocuments.push(table);
        }
        else {
            structured.push(table);
        }
    }
    return { lineDocuments, structured };
}
const PIPELINE_METADATA_COLUMN_NAMES = [
    "entity",
    "pdfcount",
    "scope",
    "scrapedat",
    "source",
] as const;
export function isPipelineMetadataTable(table: CompressedTable): boolean {
    if (table.table === "manifest") {
        return true;
    }
    if (table.columns.length !== PIPELINE_METADATA_COLUMN_NAMES.length) {
        return false;
    }
    const names = table.columns.map((column) => column.name.toLowerCase()).sort();
    const expected = [...PIPELINE_METADATA_COLUMN_NAMES].sort();
    return names.every((name, index) => name === expected[index]);
}
export function partitionStructuredTables(tables: CompressedTable[]): {
    pipelineMetadata: CompressedTable[];
    business: CompressedTable[];
} {
    const pipelineMetadata: CompressedTable[] = [];
    const business: CompressedTable[] = [];
    for (const table of tables) {
        if (isPipelineMetadataTable(table)) {
            pipelineMetadata.push(table);
        }
        else {
            business.push(table);
        }
    }
    return { pipelineMetadata, business };
}
function classifyColumnByName(columnName: string): ColumnClassificationOutput["tables"][number]["columns"][number] {
    const normalized = columnName.toLowerCase();
    if (normalized === "scrapedat" || normalized === "scraped_at") {
        return {
            column: columnName,
            label: "Scraped at",
            semanticType: "date",
            role: "attribute",
            confidence: PIPELINE_METADATA_COLUMN_CONFIDENCE,
        };
    }
    if (normalized === "pdfcount" || normalized === "pdf_count" || normalized.endsWith("count")) {
        return {
            column: columnName,
            label: "Count",
            semanticType: "number",
            role: "attribute",
            confidence: PIPELINE_METADATA_COLUMN_CONFIDENCE,
        };
    }
    if (normalized === "source") {
        return {
            column: columnName,
            label: "Source URL",
            semanticType: "text",
            role: "attribute",
            confidence: PIPELINE_METADATA_COLUMN_CONFIDENCE,
        };
    }
    return {
        column: columnName,
        label: columnName,
        semanticType: "text",
        role: "attribute",
        confidence: PIPELINE_METADATA_DEFAULT_CONFIDENCE,
    };
}
export function classifyPipelineMetadataTables(tables: CompressedTable[]): ColumnClassificationOutput {
    return {
        tables: tables.map((table) => ({
            table: table.table,
            columns: table.columns.map((column) => classifyColumnByName(column.name)),
        })),
    };
}
export function classifyLineDocumentTables(tables: CompressedTable[]): ColumnClassificationOutput {
    return {
        tables: tables.map((table) => ({
            table: table.table,
            columns: LINE_DOCUMENT_COLUMN_CLASSIFICATION,
        })),
    };
}
export function isDocumentCorpus(lineDocumentCount: number, totalTableCount: number): boolean {
    return (lineDocumentCount >= DOCUMENT_CORPUS_LINE_TABLE_THRESHOLD ||
        (totalTableCount > 0 && lineDocumentCount / totalTableCount >= DOCUMENT_CORPUS_LINE_TABLE_RATIO));
}
export function buildLineDocumentEntities(profile: ProfileReport, classification: ColumnClassificationOutput): Entity[] {
    const classificationByTable = new Map(classification.tables.map((table) => [table.table, table.columns]));
    return profile
        .filter((table) => isLineDocumentTable(table.columns))
        .map((table) => {
        const columnClassifications = classificationByTable.get(table.table);
        return {
            id: table.table,
            name: titleCaseFromSlug(table.table),
            description: "Official document extracted as line-level text from a source file",
            sourceTable: table.table,
            status: "proposed" as const,
            confidence: LINE_DOCUMENT_ENTITY_CONFIDENCE,
            provenance: {
                table: table.table,
                evidence: `Line-document table with ${String(table.rowCount)} rows (columns page, line, text)`,
            },
            properties: table.columns.map((column) => {
                const classified = columnClassifications?.find((entry) => entry.column === column.name);
                return {
                    name: classified?.label ?? column.name,
                    columnName: column.name,
                    semanticType: classified?.semanticType ?? "text",
                    role: classified?.role ?? "attribute",
                    nullable: column.nullCount > 0,
                    confidence: classified?.confidence ?? LINE_DOCUMENT_COLUMN_CONFIDENCE,
                    provenance: {
                        table: table.table,
                        column: column.name,
                        evidence: `Line-document column "${column.name}" (${column.sqlType})`,
                    },
                };
            }),
        };
    });
}
export interface LineDocumentCorpusSummary {
    kind: "line_document_corpus";
    documentCount: number;
    columnSchema: typeof LINE_DOCUMENT_COLUMN_NAMES;
    samples: Array<{
        table: string;
        rowCount: number;
        textTopValues: string[];
    }>;
    otherDocumentTables: string[];
}
export function summarizeLineDocumentCorpus(lineDocuments: CompressedTable[], sampleCount = 5): LineDocumentCorpusSummary {
    const sorted = [...lineDocuments].sort((a, b) => b.rowCount - a.rowCount);
    const samples = sorted.slice(0, sampleCount).map((table) => {
        const textColumn = table.columns.find((column) => column.name === "text");
        return {
            table: table.table,
            rowCount: table.rowCount,
            textTopValues: textColumn?.topValues.slice(0, 3) ?? [],
        };
    });
    const sampledNames = new Set(samples.map((sample) => sample.table));
    const otherDocumentTables = lineDocuments
        .map((table) => table.table)
        .filter((name) => !sampledNames.has(name));
    return {
        kind: "line_document_corpus",
        documentCount: lineDocuments.length,
        columnSchema: LINE_DOCUMENT_COLUMN_NAMES,
        samples,
        otherDocumentTables: otherDocumentTables.length > 20
            ? [...otherDocumentTables.slice(0, 20), `…and ${String(otherDocumentTables.length - 20)} more`]
            : otherDocumentTables,
    };
}
