/**
 * Review question selection: descending risk, capped at MAX_REVIEW_QUESTIONS.
 * risk = impact (how many tables/relations depend on the element) ×
 * uncertainty (1 - confidence). Every question carries a mini-table of
 * statistical evidence from the profile.
 */

import { MAX_REVIEW_QUESTIONS } from "@backed/core";
import type { Entity, EvidenceTable, Relation, ReviewQuestion, Rule } from "@backed/core";

import type { CompressedTable } from "./compress.js";

interface QuestionCandidate {
  question: ReviewQuestion;
}

function findTable(tables: CompressedTable[], name: string): CompressedTable | undefined {
  return tables.find((table) => table.table === name);
}

function entityEvidence(entity: Entity, tables: CompressedTable[]): EvidenceTable {
  const table = findTable(tables, entity.sourceTable);
  return {
    title: `Tabella "${entity.sourceTable}" (${String(table?.rowCount ?? 0)} righe)`,
    columns: ["Colonna", "Tipo", "Valori distinti", "Esempi"],
    rows: (table?.columns ?? []).map((column) => [
      column.name,
      column.sqlType,
      String(column.distinctCount),
      column.topValues.slice(0, 3).join(", "),
    ]),
  };
}

function columnEvidence(tables: CompressedTable[], tableName: string, columnName: string): string[] {
  const column = findTable(tables, tableName)?.columns.find((c) => c.name === columnName);
  return [
    columnName,
    column ? String(column.distinctCount) : "?",
    column ? column.topValues.slice(0, 3).join(", ") : "",
  ];
}

function relationEvidence(relation: Relation, tables: CompressedTable[]): EvidenceTable {
  return {
    title: `Colonne collegate: ${relation.fromColumn} → ${relation.toColumn}`,
    columns: ["Colonna", "Valori distinti", "Esempi"],
    rows: [
      columnEvidence(tables, relation.provenance.table, relation.fromColumn),
      columnEvidence(tables, relation.toEntity, relation.toColumn),
    ],
  };
}

function ruleEvidence(rule: Rule, tables: CompressedTable[]): EvidenceTable {
  const table = findTable(tables, rule.provenance.table);
  const column = rule.column ? table?.columns.find((c) => c.name === rule.column) : undefined;
  return {
    title: rule.column
      ? `Valori di "${rule.provenance.table}.${rule.column}"`
      : `Evidenza da "${rule.provenance.table}"`,
    columns: ["Valore"],
    rows: column ? column.topValues.map((value) => [value]) : [[rule.provenance.evidence]],
  };
}

function entityImpact(entity: Entity, relations: Relation[], rules: Rule[]): number {
  const dependentRelations = relations.filter(
    (relation) => relation.fromEntity === entity.id || relation.toEntity === entity.id,
  ).length;
  const dependentRules = rules.filter((rule) => rule.appliesTo === entity.id).length;
  return 1 + dependentRelations + dependentRules;
}

function buildQuestion(
  kind: ReviewQuestion["kind"],
  targetId: string,
  question: string,
  impact: number,
  confidence: number,
  evidence: EvidenceTable,
): QuestionCandidate {
  const uncertainty = 1 - confidence;
  return {
    question: {
      id: `q-${kind}-${targetId}`,
      kind,
      targetId,
      question,
      impact,
      uncertainty,
      risk: impact * uncertainty,
      evidence,
    },
  };
}

export function selectReviewQuestions(
  entities: Entity[],
  relations: Relation[],
  rules: Rule[],
  tables: CompressedTable[],
): ReviewQuestion[] {
  const candidates: QuestionCandidate[] = [
    ...entities.map((entity) =>
      buildQuestion(
        "entity",
        entity.id,
        `La tabella "${entity.sourceTable}" rappresenta l'entità "${entity.name}"?`,
        entityImpact(entity, relations, rules),
        entity.confidence,
        entityEvidence(entity, tables),
      ),
    ),
    ...relations.map((relation) =>
      buildQuestion(
        "relation",
        relation.id,
        `Confermi la relazione "${relation.name}" (${relation.fromEntity}.${relation.fromColumn} → ${relation.toEntity}.${relation.toColumn})?`,
        2,
        relation.confidence,
        relationEvidence(relation, tables),
      ),
    ),
    ...rules.map((rule) =>
      buildQuestion(
        "rule",
        rule.id,
        `Confermi la definizione "${rule.name}": ${rule.definition}`,
        1,
        rule.confidence,
        ruleEvidence(rule, tables),
      ),
    ),
  ];

  return candidates
    .map((candidate) => candidate.question)
    .filter((question) => question.risk > 0)
    .sort((a, b) => b.risk - a.risk || a.id.localeCompare(b.id))
    .slice(0, MAX_REVIEW_QUESTIONS);
}
