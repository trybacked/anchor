/**
 * Orchestration of the two agentic bursts into a validated proposal.json.
 * Deterministic assembly around the LLM: anything the model references that
 * the profile cannot back (unknown table, entity or column) is dropped and
 * surfaced as an explicit doubt — never silently kept.
 */

import { LOW_CONFIDENCE_THRESHOLD, ProposalSchema } from "@backed/core";
import type {
  ColumnProfile,
  DocumentCatalog,
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
import type { CompressedTable } from "./compress.js";
import type { SemanticModels } from "./env.js";
import {
  resolveClassificationBatchSize,
  resolveReviewConfidenceThreshold,
  resolveSemanticRequestTimeoutMs,
} from "./env.js";
import { ColumnClassificationOutputSchema, OntologyOutputSchema } from "./llm-output.js";
import type { ColumnClassificationOutput, OntologyOutput } from "./llm-output.js";
import {
  COLUMN_CLASSIFICATION_SYSTEM_PROMPT,
  ONTOLOGY_SYSTEM_PROMPT,
  columnClassificationPrompt,
  ontologyPrompt,
} from "./prompts.js";
import { selectReviewQuestions, capReviewQuestions, reviewBudgetDoubts } from "./questions.js";
import { selectDocumentTypeReviewQuestions } from "./document-questions.js";
import {
  buildDocumentCorpusEntities,
  buildDocumentCorpusRelations,
  classifyTypedDocumentTables,
  DOCUMENT_TEXT_ENTITY_ID,
  DOCUMENT_CHUNK_ENTITY_ID,
} from "./document-ontology.js";
import {
  buildLineDocumentEntities,
  classifyLineDocumentTables,
  classifyPipelineMetadataTables,
  isDocumentCorpus,
} from "./line-document.js";
import {
  formatRoutingSummary,
  isDocumentPipelineTable,
  routeTables,
  type TableRouting,
} from "./table-routing.js";

export interface ProposeModelOptions {
  profile: ProfileReport;
  runId: string;
  models: SemanticModels;
  now?: Date;
  reviewConfidenceThreshold?: number;
  /** Materialized document catalog — enables typed document ontology instead of one entity per file. */
  documentCatalog?: DocumentCatalog;
  /** Token usage from document extraction burst (summed into proposal usage). */
  extractionUsage?: BurstUsage;
  /** Optional progress hook (CLI logs batch steps). */
  onProgress?: (message: string) => void;
}

type ColumnClassification =
  ColumnClassificationOutput["tables"][number]["columns"][number];

type OntologyStrategy =
  | { kind: "llm-with-catalog"; tables: CompressedTable[]; catalog: DocumentCatalog }
  | { kind: "deterministic-catalog"; catalog: DocumentCatalog }
  | { kind: "deterministic-corpus"; lineDocumentCount: number }
  | { kind: "llm-full"; tables: CompressedTable[] };

interface OntologyRunResult {
  output: OntologyOutput;
  usage: BurstUsage;
  extraDoubts: Doubt[];
}

interface AssemblyResult {
  entities: Entity[];
  relations: Relation[];
  rules: Rule[];
  doubts: Doubt[];
}

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
    confidence: classification?.confidence ?? 0.3,
    provenance: {
      table: table.table,
      column: column.name,
      evidence: `SQL type ${column.sqlType}, ${String(column.distinctCount)} distinct values in ${String(table.rowCount)} rows`,
    },
  };
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
          `entity ${candidate.id}`,
          `Proposed entity "${candidate.name}" references table "${candidate.sourceTable}", which does not exist in the profile.`,
          "Proposal dropped: unknown source table.",
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
          `relation ${candidate.id}`,
          `Proposed relation "${candidate.name}" references entities or columns not present in the profile.`,
          "Proposal dropped: unverifiable references.",
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
          `rule ${candidate.id}`,
          `Proposed rule "${candidate.name}" applies to entity "${candidate.appliesTo}", which does not exist.`,
          "Proposal dropped: unknown reference entity.",
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

function lowConfidenceDoubts(assembly: AssemblyResult, questionTargets: Set<string>): Doubt[] {
  const doubts: Doubt[] = [];
  const check = (kind: string, id: string, name: string, confidence: number): void => {
    if (confidence < LOW_CONFIDENCE_THRESHOLD && !questionTargets.has(`${kind}:${id}`)) {
      doubts.push({
        topic: `${kind} ${id}`,
        question: `"${name}" has confidence ${confidence.toFixed(2)}, below threshold ${LOW_CONFIDENCE_THRESHOLD.toFixed(2)}.`,
        reason: "Outside review questions by risk ranking: verify manually.",
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

function sumUsageMany(usages: BurstUsage[]): Proposal["usage"] {
  let inputTokens = 0;
  let outputTokens = 0;
  const costs: number[] = [];
  for (const usage of usages) {
    inputTokens += usage.inputTokens;
    outputTokens += usage.outputTokens;
    if (usage.costUsd !== null) {
      costs.push(usage.costUsd);
    }
  }
  return {
    inputTokens,
    outputTokens,
    costUsd: costs.length > 0 ? costs.reduce((total, cost) => total + cost, 0) : null,
  };
}

function documentEntityIds(catalog: DocumentCatalog): Set<string> {
  const ids = new Set<string>([DOCUMENT_TEXT_ENTITY_ID, DOCUMENT_CHUNK_ENTITY_ID]);
  for (const type of catalog.documentTypes) {
    ids.add(
      type.id
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, ""),
    );
  }
  return ids;
}

function mergeBurstUsage(current: BurstUsage, next: BurstUsage): BurstUsage {
  const costs = [current.costUsd, next.costUsd].filter((cost): cost is number => cost !== null);
  return {
    inputTokens: current.inputTokens + next.inputTokens,
    outputTokens: current.outputTokens + next.outputTokens,
    costUsd: costs.length > 0 ? costs.reduce((total, cost) => total + cost, 0) : null,
  };
}

function mergeClassificationOutputs(
  ...outputs: ColumnClassificationOutput[]
): ColumnClassificationOutput {
  return { tables: outputs.flatMap((output) => output.tables) };
}

function emptyClassification(): ColumnClassificationOutput {
  return { tables: [] };
}

function emptyUsage(): BurstUsage {
  return { inputTokens: 0, outputTokens: 0, costUsd: null };
}

async function classifyColumnsInBatches(
  tables: CompressedTable[],
  models: SemanticModels,
  batchSize: number,
  timeoutMs: number,
  onProgress?: (message: string) => void,
): Promise<{ output: ColumnClassificationOutput; usage: BurstUsage }> {
  if (tables.length === 0) {
    return { output: emptyClassification(), usage: emptyUsage() };
  }

  const merged: ColumnClassificationOutput = { tables: [] };
  let usage = emptyUsage();
  const batchCount = Math.ceil(tables.length / batchSize);

  for (let offset = 0; offset < tables.length; offset += batchSize) {
    const batch = tables.slice(offset, offset + batchSize);
    const batchIndex = Math.floor(offset / batchSize) + 1;
    onProgress?.(
      `Column classification batch ${String(batchIndex)}/${String(batchCount)} (${String(batch.length)} tables)...`,
    );
    const result = await runBurst({
      model: models.language,
      system: COLUMN_CLASSIFICATION_SYSTEM_PROMPT,
      prompt: columnClassificationPrompt(batch),
      schema: ColumnClassificationOutputSchema,
      schemaName: `column_classification_${String(batchIndex)}_of_${String(batchCount)}`,
      timeoutMs,
      ...(onProgress !== undefined ? { onWaiting: onProgress } : {}),
    });
    merged.tables.push(...result.output.tables);
    usage = mergeBurstUsage(usage, result.usage);
  }

  return { output: merged, usage };
}

function filterDocumentEntitiesFromOntology(ontology: OntologyOutput): {
  ontology: OntologyOutput;
  doubts: Doubt[];
} {
  const doubts: Doubt[] = [];
  const entities = ontology.entities.filter((candidate) => {
    if (!isDocumentPipelineTable(candidate.sourceTable)) {
      return true;
    }
    doubts.push(
      droppedDoubt(
        `entity ${candidate.id}`,
        `LLM proposed document entity "${candidate.name}" on table "${candidate.sourceTable}" — document entities are built deterministically.`,
        "Proposal dropped: duplicate document entity from LLM.",
      ),
    );
    return false;
  });
  return { ontology: { ...ontology, entities }, doubts };
}

function classificationForTables(
  classification: ColumnClassificationOutput,
  tables: CompressedTable[],
): ColumnClassificationOutput {
  const tableNames = new Set(tables.map((table) => table.table));
  return {
    tables: classification.tables.filter((table) => tableNames.has(table.table)),
  };
}

async function runOntologyBurst(
  models: SemanticModels,
  timeoutMs: number,
  system: string,
  prompt: string,
  onProgress?: (message: string) => void,
): Promise<{ output: OntologyOutput; usage: BurstUsage }> {
  onProgress?.("Ontology proposal...");
  const result = await runBurst({
    model: models.language,
    system,
    prompt,
    schema: OntologyOutputSchema,
    schemaName: "ontology_proposal",
    timeoutMs,
    ...(onProgress !== undefined ? { onWaiting: onProgress } : {}),
  });
  return result;
}

function resolveOntologyStrategy(
  routing: TableRouting,
  documentCatalog: DocumentCatalog | undefined,
): OntologyStrategy {
  const documentCorpus =
    documentCatalog !== undefined ||
    isDocumentCorpus(routing.lineDocuments.length, routing.totalTableCount);

  if (documentCatalog !== undefined && routing.llmStructured.length > 0) {
    return {
      kind: "llm-with-catalog",
      tables: routing.llmStructured,
      catalog: documentCatalog,
    };
  }
  if (documentCatalog !== undefined) {
    return { kind: "deterministic-catalog", catalog: documentCatalog };
  }
  if (routing.businessStructured.length === 0 && documentCorpus) {
    return { kind: "deterministic-corpus", lineDocumentCount: routing.lineDocuments.length };
  }
  return { kind: "llm-full", tables: routing.allTables };
}

async function runOntologyStrategy(
  strategy: OntologyStrategy,
  models: SemanticModels,
  classification: ColumnClassificationOutput,
  timeoutMs: number,
  onProgress?: (message: string) => void,
): Promise<OntologyRunResult> {
  switch (strategy.kind) {
    case "llm-with-catalog": {
      onProgress?.("Ontology proposal for structured tables alongside document catalog...");
      const ontology = await runOntologyBurst(
        models,
        timeoutMs,
        ONTOLOGY_SYSTEM_PROMPT,
        ontologyPrompt(
          strategy.tables,
          classificationForTables(classification, strategy.tables),
          strategy.catalog,
        ),
        onProgress,
      );
      const filtered = filterDocumentEntitiesFromOntology(ontology.output);
      return {
        output: filtered.ontology,
        usage: ontology.usage,
        extraDoubts: filtered.doubts,
      };
    }
    case "deterministic-catalog": {
      onProgress?.("Building typed document ontology (deterministic entities and relations).");
      return {
        output: { entities: [], relations: [], rules: [], doubts: [] },
        usage: emptyUsage(),
        extraDoubts: [],
      };
    }
    case "deterministic-corpus": {
      onProgress?.(
        "Document corpus only — skipping ontology LLM (deterministic entities per source file).",
      );
      return {
        output: {
          entities: [],
          relations: [],
          rules: [],
          doubts: [
            {
              topic: "document corpus",
              question: `How should ${String(strategy.lineDocumentCount)} source documents be grouped into business entity types?`,
              reason:
                "Each line-document table is one extracted file (page/line/text). One entity per file was created deterministically; regroup by document type (determination, notice, publication, etc.) during review.",
            },
          ],
        },
        usage: emptyUsage(),
        extraDoubts: [],
      };
    }
    case "llm-full": {
      const ontology = await runOntologyBurst(
        models,
        timeoutMs,
        ONTOLOGY_SYSTEM_PROMPT,
        ontologyPrompt(strategy.tables, classification),
        onProgress,
      );
      return {
        output: ontology.output,
        usage: ontology.usage,
        extraDoubts: [],
      };
    }
    default: {
      const _exhaustive: never = strategy;
      throw new Error(`Unhandled ontology strategy: ${String(_exhaustive)}`);
    }
  }
}

async function classifyAllColumns(
  routing: TableRouting,
  documentCatalog: DocumentCatalog | undefined,
  models: SemanticModels,
  batchSize: number,
  timeoutMs: number,
  onProgress?: (message: string) => void,
): Promise<{ classification: ColumnClassificationOutput; usage: BurstUsage }> {
  const lineDocumentClassification =
    documentCatalog !== undefined
      ? emptyClassification()
      : classifyLineDocumentTables(routing.lineDocuments);
  const typedDocumentClassification =
    documentCatalog !== undefined ? classifyTypedDocumentTables(documentCatalog) : emptyClassification();
  const metadataClassification = classifyPipelineMetadataTables(routing.pipelineMetadata);
  const structuredClassification =
    routing.llmStructured.length > 0
      ? await classifyColumnsInBatches(
          routing.llmStructured,
          models,
          batchSize,
          timeoutMs,
          onProgress,
        )
      : { output: emptyClassification(), usage: emptyUsage() };

  return {
    classification: mergeClassificationOutputs(
      lineDocumentClassification,
      typedDocumentClassification,
      metadataClassification,
      structuredClassification.output,
    ),
    usage: structuredClassification.usage,
  };
}

function assembleProposal(
  ontologyOutput: OntologyOutput,
  ontologyExtraDoubts: Doubt[],
  classification: ColumnClassificationOutput,
  profile: ProfileReport,
  routing: TableRouting,
  documentCatalog: DocumentCatalog | undefined,
): AssemblyResult {
  const documentCorpus =
    documentCatalog !== undefined ||
    isDocumentCorpus(routing.lineDocuments.length, routing.totalTableCount);

  const doubts: Doubt[] = [...ontologyOutput.doubts, ...ontologyExtraDoubts];
  const llmEntities = assembleEntities(ontologyOutput, profile, classification, doubts);
  const lineDocumentEntities =
    documentCatalog !== undefined
      ? buildDocumentCorpusEntities(documentCatalog, profile)
      : documentCorpus
        ? buildLineDocumentEntities(profile, classification)
        : [];
  const entities = [...llmEntities, ...lineDocumentEntities];
  const documentRelations =
    documentCatalog !== undefined ? buildDocumentCorpusRelations(documentCatalog, entities) : [];
  const relations = [...assembleRelations(ontologyOutput, entities, doubts), ...documentRelations];
  const rules = assembleRules(ontologyOutput, entities, doubts);

  return { entities, relations, rules, doubts };
}

function buildReviewQuestions(
  assembly: AssemblyResult,
  routing: TableRouting,
  documentCatalog: DocumentCatalog | undefined,
  reviewConfidenceThreshold: number,
): Proposal["questions"] {
  const excludedEntityIds =
    documentCatalog !== undefined ? documentEntityIds(documentCatalog) : new Set<string>();

  const standardQuestions = selectReviewQuestions(
    assembly.entities.filter((entity) => !excludedEntityIds.has(entity.id)),
    assembly.relations,
    assembly.rules,
    routing.allTables,
    reviewConfidenceThreshold,
  );
  const documentTypeQuestions =
    documentCatalog !== undefined
      ? selectDocumentTypeReviewQuestions(
          documentCatalog,
          assembly.entities,
          routing.allTables,
          reviewConfidenceThreshold,
        )
      : [];

  return [...documentTypeQuestions, ...standardQuestions].sort(
    (a, b) => b.risk - a.risk || a.id.localeCompare(b.id),
  );
}

function finalizeReviewQuestions(
  assembly: AssemblyResult,
  allQuestions: Proposal["questions"],
): Proposal["questions"] {
  const { questions, dropped } = capReviewQuestions(allQuestions);
  assembly.doubts.push(...reviewBudgetDoubts(dropped));
  return questions;
}

export async function proposeModel(options: ProposeModelOptions): Promise<Proposal> {
  const onProgress = options.onProgress;
  const documentCatalog = options.documentCatalog;
  const timeoutMs = resolveSemanticRequestTimeoutMs();
  const batchSize = resolveClassificationBatchSize();
  const reviewConfidenceThreshold =
    options.reviewConfidenceThreshold ?? resolveReviewConfidenceThreshold();

  const routing = routeTables(compressProfile(options.profile), documentCatalog);
  const routingSummary = formatRoutingSummary(routing, documentCatalog);
  if (routingSummary.length > 0) {
    onProgress?.(routingSummary);
  }

  const { classification, usage: classificationUsage } = await classifyAllColumns(
    routing,
    documentCatalog,
    options.models,
    batchSize,
    timeoutMs,
    onProgress,
  );

  const ontologyStrategy = resolveOntologyStrategy(routing, documentCatalog);
  const { output: ontologyOutput, usage: ontologyUsage, extraDoubts } = await runOntologyStrategy(
    ontologyStrategy,
    options.models,
    classification,
    timeoutMs,
    onProgress,
  );

  const assembly = assembleProposal(
    ontologyOutput,
    extraDoubts,
    classification,
    options.profile,
    routing,
    documentCatalog,
  );

  const allQuestions = buildReviewQuestions(
    assembly,
    routing,
    documentCatalog,
    reviewConfidenceThreshold,
  );
  const questions = finalizeReviewQuestions(assembly, allQuestions);
  const questionTargets = new Set(
    questions.map((question) => `${question.kind}:${question.targetId}`),
  );
  assembly.doubts.push(...lowConfidenceDoubts(assembly, questionTargets));

  return ProposalSchema.parse({
    runId: options.runId,
    generatedAt: (options.now ?? new Date()).toISOString(),
    entities: assembly.entities,
    relations: assembly.relations,
    rules: assembly.rules,
    doubts: assembly.doubts,
    questions,
    usage: sumUsageMany([
      classificationUsage,
      ontologyUsage,
      ...(options.extractionUsage !== undefined ? [options.extractionUsage] : []),
    ]),
  });
}
