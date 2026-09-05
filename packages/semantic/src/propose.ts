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
  DOCUMENT_CORPUS_ONTOLOGY_SYSTEM_PROMPT,
  ONTOLOGY_SYSTEM_PROMPT,
  columnClassificationPrompt,
  documentCorpusOntologyPrompt,
  ontologyPrompt,
} from "./prompts.js";
import { selectReviewQuestions } from "./questions.js";
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
  partitionStructuredTables,
  splitTablesByKind,
  summarizeLineDocumentCorpus,
} from "./line-document.js";

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
      evidence: `SQL type ${column.sqlType}, ${String(column.distinctCount)} distinct values in ${String(table.rowCount)} rows`,
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

/** Low-confidence proposals not covered by a review question become explicit doubts. */
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

async function classifyColumnsInBatches(
  tables: CompressedTable[],
  models: SemanticModels,
  batchSize: number,
  timeoutMs: number,
  onProgress?: (message: string) => void,
): Promise<{ output: ColumnClassificationOutput; usage: BurstUsage }> {
  if (tables.length === 0) {
    return { output: { tables: [] }, usage: { inputTokens: 0, outputTokens: 0, costUsd: null } };
  }

  const merged: ColumnClassificationOutput = { tables: [] };
  let usage: BurstUsage = { inputTokens: 0, outputTokens: 0, costUsd: null };
  const batchCount = Math.ceil(tables.length / batchSize);

  for (let offset = 0; offset < tables.length; offset += batchSize) {
    const batch = tables.slice(offset, offset + batchSize);
    const batchIndex = Math.floor(offset / batchSize) + 1;
    onProgress?.(`Column classification batch ${String(batchIndex)}/${String(batchCount)} (${String(batch.length)} tables)...`);
    const result = await runBurst({
      model: models.cheap,
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

async function runOntologyBurst(
  models: SemanticModels,
  timeoutMs: number,
  system: string,
  prompt: string,
  onProgress?: (message: string) => void,
): Promise<{ output: OntologyOutput; usage: BurstUsage }> {
  onProgress?.("Ontology proposal...");
  const result = await runBurst({
    model: models.frontier,
    system,
    prompt,
    schema: OntologyOutputSchema,
    schemaName: "ontology_proposal",
    timeoutMs,
    ...(onProgress !== undefined ? { onWaiting: onProgress } : {}),
  });
  return result;
}

export async function proposeModel(options: ProposeModelOptions): Promise<Proposal> {
  const tables = compressProfile(options.profile);
  const timeoutMs = resolveSemanticRequestTimeoutMs();
  const batchSize = resolveClassificationBatchSize();
  const onProgress = options.onProgress;
  const documentCatalog = options.documentCatalog;

  const { lineDocuments, structured } = splitTablesByKind(tables);
  const { pipelineMetadata, business: businessStructured } = partitionStructuredTables(structured);
  const documentCorpus =
    documentCatalog !== undefined ||
    isDocumentCorpus(lineDocuments.length, tables.length);

  if (documentCatalog !== undefined) {
    onProgress?.(
      `Document corpus materialized: ${String(documentCatalog.documentTypes.length)} type(s), ${String(documentCatalog.documents.length)} document(s).`,
    );
  } else if (lineDocuments.length > 0) {
    onProgress?.(
      `${String(lineDocuments.length)} line-document table(s) — deterministic column classification (no LLM).`,
    );
  }
  if (pipelineMetadata.length > 0) {
    onProgress?.(
      `${String(pipelineMetadata.length)} pipeline metadata table(s) — deterministic classification (no LLM).`,
    );
  }

  const lineDocumentClassification =
    documentCatalog !== undefined
      ? { tables: [] as ColumnClassificationOutput["tables"] }
      : classifyLineDocumentTables(lineDocuments);
  const typedDocumentClassification =
    documentCatalog !== undefined ? classifyTypedDocumentTables(documentCatalog) : { tables: [] };
  const metadataClassification = classifyPipelineMetadataTables(pipelineMetadata);
  const structuredClassification =
    businessStructured.length > 0
      ? await classifyColumnsInBatches(
          businessStructured,
          options.models,
          batchSize,
          timeoutMs,
          onProgress,
        )
      : {
          output: { tables: [] as ColumnClassificationOutput["tables"] },
          usage: { inputTokens: 0, outputTokens: 0, costUsd: null },
        };

  const classification = mergeClassificationOutputs(
    lineDocumentClassification,
    typedDocumentClassification,
    metadataClassification,
    structuredClassification.output,
  );

  let ontologyOutput: OntologyOutput;
  let ontologyUsage: BurstUsage;

  if (documentCatalog !== undefined) {
    onProgress?.("Building typed document ontology (deterministic entities and relations).");
    ontologyOutput = {
      entities: [],
      relations: [],
      rules: [],
      doubts: [],
    };
    ontologyUsage = { inputTokens: 0, outputTokens: 0, costUsd: null };
  } else if (businessStructured.length === 0 && documentCorpus) {
    onProgress?.("Document corpus only — skipping ontology LLM (deterministic entities per source file).");
    ontologyOutput = {
      entities: [],
      relations: [],
      rules: [],
      doubts: [
        {
          topic: "document corpus",
          question: `How should ${String(lineDocuments.length)} source documents be grouped into business entity types?`,
          reason:
            "Each line-document table is one extracted file (page/line/text). One entity per file was created deterministically; regroup by document type (determination, notice, publication, etc.) during review.",
        },
      ],
    };
    ontologyUsage = { inputTokens: 0, outputTokens: 0, costUsd: null };
  } else if (documentCorpus) {
    const corpus = summarizeLineDocumentCorpus(lineDocuments);
    const ontology = await runOntologyBurst(
      options.models,
      timeoutMs,
      DOCUMENT_CORPUS_ONTOLOGY_SYSTEM_PROMPT,
      documentCorpusOntologyPrompt(businessStructured, classification, corpus),
      onProgress,
    );
    ontologyOutput = ontology.output;
    ontologyUsage = ontology.usage;
  } else {
    const ontology = await runOntologyBurst(
      options.models,
      timeoutMs,
      ONTOLOGY_SYSTEM_PROMPT,
      ontologyPrompt(tables, classification),
      onProgress,
    );
    ontologyOutput = ontology.output;
    ontologyUsage = ontology.usage;
  }

  const doubts: Doubt[] = [...ontologyOutput.doubts];
  const llmEntities = assembleEntities(
    ontologyOutput,
    options.profile,
    classification,
    doubts,
  );
  const lineDocumentEntities =
    documentCatalog !== undefined
      ? buildDocumentCorpusEntities(documentCatalog, options.profile)
      : documentCorpus
        ? buildLineDocumentEntities(options.profile, classification)
        : [];
  const entities = [...llmEntities, ...lineDocumentEntities];
  const documentRelations =
    documentCatalog !== undefined
      ? buildDocumentCorpusRelations(documentCatalog, entities)
      : [];
  const relations = [...assembleRelations(ontologyOutput, entities, doubts), ...documentRelations];
  const rules = assembleRules(ontologyOutput, entities, doubts);
  const assembly: AssemblyResult = { entities, relations, rules, doubts };

  const reviewConfidenceThreshold =
    options.reviewConfidenceThreshold ?? resolveReviewConfidenceThreshold();

  const excludedEntityIds =
    documentCatalog !== undefined ? documentEntityIds(documentCatalog) : new Set<string>();

  const standardQuestions = selectReviewQuestions(
    entities.filter((entity) => !excludedEntityIds.has(entity.id)),
    relations,
    rules,
    tables,
    reviewConfidenceThreshold,
  );
  const documentTypeQuestions =
    documentCatalog !== undefined
      ? selectDocumentTypeReviewQuestions(
          documentCatalog,
          entities,
          tables,
          reviewConfidenceThreshold,
        )
      : [];
  const questions = [...documentTypeQuestions, ...standardQuestions].sort(
    (a, b) => b.risk - a.risk || a.id.localeCompare(b.id),
  );
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
    usage: sumUsageMany([
      structuredClassification.usage,
      ontologyUsage,
      ...(options.extractionUsage !== undefined ? [options.extractionUsage] : []),
    ]),
  });
}
