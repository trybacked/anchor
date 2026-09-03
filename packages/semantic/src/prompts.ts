/**
 * Prompts for the two bursts. Instructions in English (code), all output copy
 * requested in Italian (product language). Both prompts demand declared
 * uncertainty over invention.
 */

import type { CompressedTable } from "./compress.js";
import type { ColumnClassificationOutput } from "./llm-output.js";

const SHARED_RULES = `Rules you must follow:
- The input is a statistical profile of tables from an Italian SME (small business). No raw rows are available.
- All human-readable output (names, labels, descriptions, definitions, questions) MUST be in Italian.
- Never invent facts the evidence does not support. If you are not sure, lower the confidence score honestly.
- Saying "I don't know" is a valid and welcome answer: prefer declaring a doubt over guessing.`;

export const COLUMN_CLASSIFICATION_SYSTEM_PROMPT = `You classify columns of tabular business data from Italian SMEs.
For every table and column in the profile, assign:
- "label": a short Italian human-readable name (e.g. "Partita IVA", "Ragione sociale");
- "semanticType": the business meaning of the column;
- "role": "primary_key" if the column uniquely identifies rows (candidate keys are marked in the profile), "foreign_key" if it references another table's key, otherwise "attribute";
- "confidence": how sure you are (0..1).
${SHARED_RULES}`;

export const ONTOLOGY_SYSTEM_PROMPT = `You extract the semantic model (ontology) of an Italian SME from statistical profiles of its tables.
Propose:
- "entities": one business entity per table that represents a real business object (id = Italian slug like "cliente", name = Italian singular like "Cliente"). Expect 4-15 entities at most; fewer is fine.
- "relations": links between entities, anchored to concrete column pairs (fromColumn on the source table, toColumn on the target table). Only propose a relation when the evidence (column names, candidate keys, overlapping value ranges) supports it.
- "rules": business definitions in Italian for low-cardinality "category" columns or evident business concepts (e.g. what "fattura insoluta" means). Only when the evidence suggests them.
- "doubts": everything you cannot decide from the evidence. Declare doubts explicitly instead of inventing.
Every entity, relation and rule needs an honest "confidence" (0..1) and an Italian "evidence" sentence citing the statistics that support it.
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
