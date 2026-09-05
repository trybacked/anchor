/**
 * Prompts for the two bursts. Both prompts demand declared uncertainty
 * over invention.
 */

import type { CompressedTable } from "./compress.js";
import type { DocumentExtractionSample } from "./extract-document-catalog.js";
import type { ColumnClassificationOutput } from "./llm-output.js";
import type { LineDocumentCorpusSummary } from "./line-document.js";

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

export const DOCUMENT_CORPUS_ONTOLOGY_SYSTEM_PROMPT = `You extract a semantic model from a mix of structured business tables and a corpus of line-document tables.
Line-document tables have columns page, line, text — each table is one extracted document (PDF, scan, or text file), not a normalized business entity row set.
For line-document corpora:
- Do NOT propose one entity per document table when documentCount is large (15+). Instead declare doubts about document typing and propose entities only for structured (non line-document) tables.
- Propose at most 4-15 entities total. Prefer document-type entities over file-level entities.
For structured tables, propose entities, relations, and rules as usual.
${SHARED_RULES}`;

export function columnClassificationPrompt(tables: CompressedTable[]): string {
  return `Statistical profile of the tables (JSON):

${JSON.stringify(tables, null, 2)}

Classify every column of every table.`;
}

export function ontologyPrompt(
  tables: CompressedTable[],
  classification: ColumnClassificationOutput,
): string {
  return `Statistical profile of the tables (JSON):

${JSON.stringify(tables, null, 2)}

Column classification produced by a previous step (JSON):

${JSON.stringify(classification, null, 2)}

Propose the semantic model (entities, relations, rules) and declare your doubts.`;
}

export function documentCorpusOntologyPrompt(
  structuredTables: CompressedTable[],
  structuredClassification: ColumnClassificationOutput,
  corpus: LineDocumentCorpusSummary,
): string {
  const structuredClassificationFiltered = {
    tables: structuredClassification.tables.filter((table) =>
      structuredTables.some((candidate) => candidate.table === table.table),
    ),
  };

  return `Structured business tables (JSON):

${JSON.stringify(structuredTables, null, 2)}

Column classification for structured tables (JSON):

${JSON.stringify(structuredClassificationFiltered, null, 2)}

Line-document corpus summary (each omitted table is one source document with page/line/text columns):

${JSON.stringify(corpus, null, 2)}

Propose the semantic model for structured tables only. Use doubts to explain how the document corpus should be grouped — do not list one entity per document table.`;
}

export const DOCUMENT_EXTRACTION_SYSTEM_PROMPT = `You classify official documents from Italian public administration and small-business exports.
Each input item is one source document represented as page-1 header lines extracted from PDF/OCR (columns page, line, text in the source system).

For each document, infer:
- documentType: stable English slug (e.g. determination, notice, resolution, deliberation, publication, ordinance, announcement, unknown)
- documentTypeLabel: singular English business name (e.g. Determination, Public Notice)
- protocolNumber: protocol/registry number if visible, else null
- publishedDate: ISO date YYYY-MM-DD if visible, else null
- subject: short subject/title in English if inferable, else null
- issuingOffice: issuing body/office if visible, else null
- confidence: 0..1 for the overall classification

Rules:
- Use filename/table slug as a weak hint only; prefer header text.
- Group similar administrative acts under the same documentType slug.
- Prefer "unknown" with low confidence over inventing fields.
- All labels and subjects in English.
- Never invent protocol numbers or dates not supported by the header text.`;

export function documentExtractionPrompt(samples: DocumentExtractionSample[]): string {
  return `Classify each document and extract standard header fields.

Documents (JSON):
${JSON.stringify(
  samples.map((sample) => ({
    sourceTable: sample.sourceTable,
    pageCount: sample.pageCount,
    headerLines: sample.headerLines,
  })),
  null,
  2,
)}

Return one entry per sourceTable.`;
}
