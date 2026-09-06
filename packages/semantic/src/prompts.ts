/**
 * Prompts for the two bursts. Both prompts demand declared uncertainty
 * over invention.
 */

import type { DocumentCatalog } from "@backed/core";

import type { CompressedTable } from "./compress.js";
import type { DocumentTypeHint } from "./document-type-hints.js";
import type { DocumentExtractionSample } from "./extract-document-catalog.js";
import type { ColumnClassificationOutput } from "./llm-output.js";

const SHARED_RULES = `Rules you must follow:
- The input is a statistical profile of tables from a small business. No raw rows are available.
- All human-readable output (names, labels, descriptions, definitions, questions) MUST be in English.
- Never invent facts the evidence does not support. If you are not sure, lower the confidence score honestly.
- Saying "I don't know" is a valid and welcome answer: prefer declaring a doubt over guessing.`;

export const COLUMN_CLASSIFICATION_SYSTEM_PROMPT = `You classify columns of tabular business data from small businesses.
For every table and column in the profile, assign:
- "label": a short human-readable name (e.g. "VAT number", "Company name");
- "semanticType": the business meaning of the column;
- "role": "primary_key" if the column uniquely identifies rows (candidate keys are marked in the profile), "foreign_key" if it references another table's key, otherwise "attribute";
- "confidence": how sure you are (0..1).
${SHARED_RULES}`;

export const ONTOLOGY_SYSTEM_PROMPT = `You extract the semantic model (ontology) of a small business from statistical profiles of its tables.
Propose:
- "entities": one business entity per table that represents a real business object (id = stable slug like "customer", name = singular like "Customer"). Expect 4-15 entities at most; fewer is fine.
- "relations": links between entities, anchored to concrete column pairs (fromColumn on the source table, toColumn on the target table). Prefer foreignKeyCandidates from the profile when present. Only propose a relation when the evidence (column names, candidate keys, overlapping value ranges) supports it.
- "rules": business definitions for low-cardinality "category" columns or evident business concepts (e.g. what "overdue invoice" means). Only when the evidence suggests them.
- "doubts": everything you cannot decide from the evidence. Declare doubts explicitly instead of inventing.
Every entity, relation and rule needs an honest "confidence" (0..1) and an English "evidence" sentence citing the statistics that support it.
${SHARED_RULES}`;

const TYPED_DOCUMENT_HEADER_COLUMNS = [
  "document_id",
  "source_file",
  "protocol_number",
  "published_date",
  "subject",
  "issuing_office",
  "page_count",
] as const;

export function columnClassificationPrompt(tables: CompressedTable[]): string {
  return `Statistical profile of the tables (JSON):

${JSON.stringify(tables, null, 2)}

Classify every column of every table.`;
}

export function ontologyPrompt(
  tables: CompressedTable[],
  classification: ColumnClassificationOutput,
  documentCatalog?: DocumentCatalog,
): string {
  const sections = [
    `Statistical profile of the tables (JSON):

${JSON.stringify(tables, null, 2)}`,
    `Column classification produced by a previous step (JSON):

${JSON.stringify(classification, null, 2)}`,
  ];

  if (documentCatalog !== undefined) {
    const documentTypeSummary = documentCatalog.documentTypes.map((type) => ({
      id: type.id,
      name: type.name,
      tableName: type.tableName,
      documentCount: type.documentCount,
      headerColumns: [...TYPED_DOCUMENT_HEADER_COLUMNS],
    }));

    sections.push(`Materialized document types (JSON):

${JSON.stringify(documentTypeSummary, null, 2)}

Document entities for doc_* tables, document_lines, and document_chunks are already built deterministically.
Do NOT propose entities for those tables. You may propose relations between structured entities and document types when column evidence supports it (e.g. a structured protocol column linked to document protocol_number).`);
  }

  sections.push("Propose the semantic model (entities, relations, rules) and declare your doubts.");

  return sections.join("\n\n");
}

export const DOCUMENT_EXTRACTION_SYSTEM_PROMPT = `You classify one official document from exported PDF/OCR corpora.
The input is page-1 header lines extracted from PDF/OCR (columns page, line, text in the source system).

Infer:
- documentType: stable English slug (e.g. determination, notice, resolution, deliberation, publication, ordinance, unknown)
- documentTypeLabel: singular English business name (e.g. Determination, Public Notice)
- protocolNumber: protocol/registry number if visible, else null
- publishedDate: ISO date YYYY-MM-DD if visible, else null
- subject: short subject/title in English if inferable, else null
- issuingOffice: issuing body/office if visible, else null
- confidence: 0..1 for the overall classification

Rules:
- When a typeHint is provided, confirm it from header text or override with evidence.
- Prefer header text over filename hints.
- Prefer "unknown" with low confidence over inventing fields.
- All labels and subjects in English.
- Never invent protocol numbers or dates not supported by the header text.`;

export function documentExtractionPrompt(
  sample: DocumentExtractionSample,
  typeHint: DocumentTypeHint | null,
): string {
  const sections = [
    "Classify this document and extract standard header fields.",
    "",
    "Document (JSON):",
    JSON.stringify(
      {
        sourceTable: sample.sourceTable,
        pageCount: sample.pageCount,
        headerLines: sample.headerLines,
        ...(typeHint !== null
          ? {
              typeHint: {
                documentType: typeHint.documentType,
                documentTypeLabel: typeHint.documentTypeLabel,
                confidence: typeHint.confidence,
                evidence: typeHint.evidence,
              },
            }
          : {}),
      },
      null,
      2,
    ),
  ];

  return sections.join("\n");
}
