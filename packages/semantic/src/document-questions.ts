/**
 * Review questions for materialized document types — one question per type
 * instead of one per source file.
 */

import type { DocumentCatalog, Entity, EvidenceTable, ReviewQuestion } from "@backed/core";

import type { CompressedTable } from "./compress.js";

function findTable(tables: CompressedTable[], name: string): CompressedTable | undefined {
  return tables.find((table) => table.table === name);
}

export function selectDocumentTypeReviewQuestions(
  catalog: DocumentCatalog,
  entities: Entity[],
  tables: CompressedTable[],
  reviewConfidenceThreshold: number,
): ReviewQuestion[] {
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  const questions: ReviewQuestion[] = [];

  for (const type of catalog.documentTypes) {
    if (type.confidence >= reviewConfidenceThreshold) {
      continue;
    }

    const entityId = type.id
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    const entity = entityById.get(entityId);
    const uncertainty = 1 - type.confidence;
    const impact = 2 + type.documentCount;

    const evidence: EvidenceTable = {
      title: `${String(type.documentCount)} documents classified as "${type.name}"`,
      columns: ["Example source", "Rows in profile"],
      rows: type.sampleSourceTables.map((sourceTable) => [
        sourceTable,
        String(findTable(tables, type.tableName)?.rowCount ?? type.documentCount),
      ]),
    };

    questions.push({
      id: `q-document-type-${entityId}`,
      kind: "entity",
      targetId: entity?.id ?? entityId,
      question: `Confirm document type "${type.name}": ${String(type.documentCount)} source documents were classified with this business type (examples: ${type.sampleSourceTables.join(", ")}).`,
      impact,
      uncertainty,
      risk: impact * uncertainty,
      evidence,
    });
  }

  return questions.sort((a, b) => b.risk - a.risk || a.id.localeCompare(b.id));
}
