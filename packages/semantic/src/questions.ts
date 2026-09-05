/**
 * Review question selection: every element below the confidence threshold gets
 * a question, sorted by descending risk. risk = impact × uncertainty (1 - confidence).
 * Every question carries a mini-table of statistical evidence from the profile.
 */

import { DEFAULT_REVIEW_CONFIDENCE_THRESHOLD, MAX_REVIEW_QUESTIONS } from "@backed/core";
import type { Doubt, Entity, EvidenceTable, Relation, ReviewQuestion, Rule } from "@backed/core";

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
    title: `Table "${entity.sourceTable}" (${String(table?.rowCount ?? 0)} rows)`,
    columns: ["Column", "Type", "Distinct values", "Samples"],
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
    title: `Linked columns: ${relation.fromColumn} → ${relation.toColumn}`,
    columns: ["Column", "Distinct values", "Samples"],
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
      ? `Values of "${rule.provenance.table}.${rule.column}"`
      : `Evidence from "${rule.provenance.table}"`,
    columns: ["Value"],
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
  reviewConfidenceThreshold: number = DEFAULT_REVIEW_CONFIDENCE_THRESHOLD,
): ReviewQuestion[] {
  const needsReview = (confidence: number): boolean => confidence < reviewConfidenceThreshold;

  const candidates: QuestionCandidate[] = [
    ...entities
      .filter((entity) => needsReview(entity.confidence))
      .map((entity) =>
      buildQuestion(
        "entity",
        entity.id,
        `Does table "${entity.sourceTable}" represent the entity "${entity.name}"?`,
        entityImpact(entity, relations, rules),
        entity.confidence,
        entityEvidence(entity, tables),
      ),
    ),
    ...relations
      .filter((relation) => needsReview(relation.confidence))
      .map((relation) =>
      buildQuestion(
        "relation",
        relation.id,
        `Confirm relation "${relation.name}" (${relation.fromEntity}.${relation.fromColumn} → ${relation.toEntity}.${relation.toColumn})?`,
        2,
        relation.confidence,
        relationEvidence(relation, tables),
      ),
    ),
    ...rules
      .filter((rule) => needsReview(rule.confidence))
      .map((rule) =>
      buildQuestion(
        "rule",
        rule.id,
        `Confirm definition "${rule.name}": ${rule.definition}`,
        1,
        rule.confidence,
        ruleEvidence(rule, tables),
      ),
    ),
  ];

  return candidates
    .map((candidate) => candidate.question)
    .filter((question) => question.risk > 0)
    .sort((a, b) => b.risk - a.risk || a.id.localeCompare(b.id));
}

export interface CappedReviewQuestions {
  questions: ReviewQuestion[];
  dropped: ReviewQuestion[];
}

/** Apply the per-folder review question budget after risk sorting. */
export function capReviewQuestions(
  questions: ReviewQuestion[],
  maxQuestions: number = MAX_REVIEW_QUESTIONS,
): CappedReviewQuestions {
  const sorted = [...questions].sort((a, b) => b.risk - a.risk || a.id.localeCompare(b.id));
  return {
    questions: sorted.slice(0, maxQuestions),
    dropped: sorted.slice(maxQuestions),
  };
}

export function reviewBudgetDoubts(dropped: ReviewQuestion[]): Doubt[] {
  return dropped.map((question) => ({
    topic: `${question.kind} ${question.targetId}`,
    question: question.question,
    reason: "Outside question budget, verify manually.",
  }));
}
