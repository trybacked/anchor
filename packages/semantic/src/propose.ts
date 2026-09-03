/**
 * Orchestration of the two agentic bursts into a validated proposal.json.
 * Deterministic assembly around the LLM: anything the model references that
 * the profile cannot back (unknown table, entity or column) is dropped and
 * surfaced as an explicit doubt — never silently kept.
 */

import { LOW_CONFIDENCE_THRESHOLD, ProposalSchema } from "@backed/core";
import type {
  ColumnProfile,
  Doubt,
  Entity,
  ProfileReport,
  Property,
  Proposal,
  Relation,
  Rule,
  SemanticType,
  TableProfile,
} from "@backed/core";

import { runBurst } from "./burst.js";
import type { BurstUsage } from "./burst.js";
import { compressProfile } from "./compress.js";
import type { SemanticModels } from "./env.js";
import { ColumnClassificationOutputSchema, OntologyOutputSchema } from "./llm-output.js";
import type { ColumnClassificationOutput, OntologyOutput } from "./llm-output.js";
import {
  COLUMN_CLASSIFICATION_SYSTEM_PROMPT,
  ONTOLOGY_SYSTEM_PROMPT,
  columnClassificationPrompt,
  ontologyPrompt,
} from "./prompts.js";
import { selectReviewQuestions } from "./questions.js";

export interface ProposeModelOptions {
  profile: ProfileReport;
  runId: string;
  models: SemanticModels;
  now?: Date;
}

type ColumnClassification =
  ColumnClassificationOutput["tables"][number]["columns"][number];

function classificationLookup(
  output: ColumnClassificationOutput,
): Map<string, Map<string, ColumnClassification>> {
  const byTable = new Map<string, Map<string, ColumnClassification>>();
  for (const table of output.tables) {
    byTable.set(table.table, new Map(table.columns.map((column) => [column.column, column])));
  }
  return byTable;
}

const FALLBACK_TYPE_BY_PATTERN: Record<string, SemanticType> = {
  date: "date",
  email: "email",
  amount: "amount",
  vat_number: "vat_number",
  fiscal_code: "fiscal_code",
};

function fallbackSemanticType(column: ColumnProfile): SemanticType {
  const pattern = column.patterns[0];
  if (pattern) {
    const mapped = FALLBACK_TYPE_BY_PATTERN[pattern.kind];
    if (mapped) {
      return mapped;
    }
  }
  if (column.sqlType.startsWith("BOOLEAN")) {
    return "boolean";
  }
  if (/^(DATE|TIMESTAMP)/.test(column.sqlType)) {
    return "date";
  }
  if (/^(BIGINT|INTEGER|SMALLINT|TINYINT|DOUBLE|FLOAT|DECIMAL|HUGEINT)/.test(column.sqlType)) {
    return "number";
  }
  return "text";
}

function buildProperty(
  table: TableProfile,
  column: ColumnProfile,
  classification: ColumnClassification | undefined,
): Property {
  return {
    name: classification?.label ?? column.name,
    columnName: column.name,
    semanticType: classification?.semanticType ?? fallbackSemanticType(column),
    role: classification?.role ?? "attribute",
    nullable: column.nullCount > 0,
    // Without an LLM classification we only trust deterministic evidence.
    confidence: classification?.confidence ?? 0.3,
    provenance: {
      table: table.table,
      column: column.name,
      evidence: `tipo SQL ${column.sqlType}, ${String(column.distinctCount)} valori distinti su ${String(table.rowCount)} righe`,
    },
  };
}

interface AssemblyResult {
  entities: Entity[];
  relations: Relation[];
  rules: Rule[];
  doubts: Doubt[];
}

function droppedDoubt(topic: string, question: string, reason: string): Doubt {
  return { topic, question, reason };
}

function assembleEntities(
  ontology: OntologyOutput,
  profile: ProfileReport,
  classification: ColumnClassificationOutput,
  doubts: Doubt[],
): Entity[] {
  const profileByTable = new Map(profile.map((table) => [table.table, table]));
  const lookup = classificationLookup(classification);
  const entities: Entity[] = [];

  for (const candidate of ontology.entities) {
    const table = profileByTable.get(candidate.sourceTable);
    if (!table) {
      doubts.push(
        droppedDoubt(
          `entità ${candidate.id}`,
          `L'entità proposta "${candidate.name}" fa riferimento alla tabella "${candidate.sourceTable}", che non esiste nel profilo.`,
          "Proposta scartata: tabella sorgente sconosciuta.",
        ),
      );
      continue;
    }
    const columnClassifications = lookup.get(table.table);
    entities.push({
      id: candidate.id,
      name: candidate.name,
      description: candidate.description,
      sourceTable: candidate.sourceTable,
      status: "proposed",
      confidence: candidate.confidence,
      provenance: { table: candidate.sourceTable, evidence: candidate.evidence },
      properties: table.columns.map((column) =>
        buildProperty(table, column, columnClassifications?.get(column.name)),
      ),
    });
  }

  return entities;
}

function assembleRelations(
  ontology: OntologyOutput,
  entities: Entity[],
  doubts: Doubt[],
): Relation[] {
  const entitiesById = new Map(entities.map((entity) => [entity.id, entity]));
  const relations: Relation[] = [];

  for (const candidate of ontology.relations) {
    const fromEntity = entitiesById.get(candidate.fromEntity);
    const toEntity = entitiesById.get(candidate.toEntity);
    const fromColumnExists = fromEntity?.properties.some(
      (property) => property.columnName === candidate.fromColumn,
    );
    const toColumnExists = toEntity?.properties.some(
      (property) => property.columnName === candidate.toColumn,
    );

    if (!fromEntity || !toEntity || !fromColumnExists || !toColumnExists) {
      doubts.push(
        droppedDoubt(
          `relazione ${candidate.id}`,
          `La relazione proposta "${candidate.name}" fa riferimento a entità o colonne non presenti nel profilo.`,
          "Proposta scartata: riferimenti non verificabili.",
        ),
      );
      continue;
    }

    relations.push({
      id: candidate.id,
      name: candidate.name,
      fromEntity: candidate.fromEntity,
      toEntity: candidate.toEntity,
      fromColumn: candidate.fromColumn,
      toColumn: candidate.toColumn,
      cardinality: candidate.cardinality,
      status: "proposed",
      confidence: candidate.confidence,
      provenance: {
        table: fromEntity.sourceTable,
        column: candidate.fromColumn,
        evidence: candidate.evidence,
      },
    });
  }

  return relations;
}

function assembleRules(ontology: OntologyOutput, entities: Entity[], doubts: Doubt[]): Rule[] {
  const entitiesById = new Map(entities.map((entity) => [entity.id, entity]));
  const rules: Rule[] = [];

  for (const candidate of ontology.rules) {
    const entity = entitiesById.get(candidate.appliesTo);
    if (!entity) {
      doubts.push(
        droppedDoubt(
          `regola ${candidate.id}`,
          `La regola proposta "${candidate.name}" si applica all'entità "${candidate.appliesTo}", che non esiste.`,
          "Proposta scartata: entità di riferimento sconosciuta.",
        ),
      );
      continue;
    }

    rules.push({
      id: candidate.id,
      name: candidate.name,
      definition: candidate.definition,
      appliesTo: candidate.appliesTo,
      ...(candidate.column !== undefined ? { column: candidate.column } : {}),
      status: "proposed",
      confidence: candidate.confidence,
      provenance: {
        table: entity.sourceTable,
        ...(candidate.column !== undefined ? { column: candidate.column } : {}),
        evidence: candidate.evidence,
      },
    });
  }

  return rules;
}

/** Low-confidence proposals not covered by a review question become explicit doubts. */
function lowConfidenceDoubts(assembly: AssemblyResult, questionTargets: Set<string>): Doubt[] {
  const doubts: Doubt[] = [];
  const check = (kind: string, id: string, name: string, confidence: number): void => {
    if (confidence < LOW_CONFIDENCE_THRESHOLD && !questionTargets.has(`${kind}:${id}`)) {
      doubts.push({
        topic: `${kind} ${id}`,
        question: `"${name}" ha confidenza ${confidence.toFixed(2)}, sotto la soglia ${LOW_CONFIDENCE_THRESHOLD.toFixed(2)}.`,
        reason: "Fuori dalle domande di review per rischio: verificare manualmente.",
      });
    }
  };

  for (const entity of assembly.entities) {
    check("entity", entity.id, entity.name, entity.confidence);
  }
  for (const relation of assembly.relations) {
    check("relation", relation.id, relation.name, relation.confidence);
  }
  for (const rule of assembly.rules) {
    check("rule", rule.id, rule.name, rule.confidence);
  }
  return doubts;
}

function sumUsage(first: BurstUsage, second: BurstUsage): Proposal["usage"] {
  const costs = [first.costUsd, second.costUsd].filter((cost): cost is number => cost !== null);
  return {
    inputTokens: first.inputTokens + second.inputTokens,
    outputTokens: first.outputTokens + second.outputTokens,
    costUsd: costs.length > 0 ? costs.reduce((total, cost) => total + cost, 0) : null,
  };
}

export async function proposeModel(options: ProposeModelOptions): Promise<Proposal> {
  const tables = compressProfile(options.profile);

  const classification = await runBurst({
    model: options.models.cheap,
    system: COLUMN_CLASSIFICATION_SYSTEM_PROMPT,
    prompt: columnClassificationPrompt(tables),
    schema: ColumnClassificationOutputSchema,
    schemaName: "column_classification",
  });

  const ontology = await runBurst({
    model: options.models.frontier,
    system: ONTOLOGY_SYSTEM_PROMPT,
    prompt: ontologyPrompt(tables, classification.output),
    schema: OntologyOutputSchema,
    schemaName: "ontology_proposal",
  });

  const doubts: Doubt[] = [...ontology.output.doubts];
  const entities = assembleEntities(
    ontology.output,
    options.profile,
    classification.output,
    doubts,
  );
  const relations = assembleRelations(ontology.output, entities, doubts);
  const rules = assembleRules(ontology.output, entities, doubts);
  const assembly: AssemblyResult = { entities, relations, rules, doubts };

  const questions = selectReviewQuestions(entities, relations, rules, tables);
  const questionTargets = new Set(
    questions.map((question) => `${question.kind}:${question.targetId}`),
  );
  doubts.push(...lowConfidenceDoubts(assembly, questionTargets));

  return ProposalSchema.parse({
    runId: options.runId,
    generatedAt: (options.now ?? new Date()).toISOString(),
    entities,
    relations,
    rules,
    doubts,
    questions,
    usage: sumUsage(classification.usage, ontology.usage),
  });
}
