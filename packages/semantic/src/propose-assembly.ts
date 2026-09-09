import { LOW_CONFIDENCE_THRESHOLD } from "@backed/core";
import type {
    ColumnProfile,
    DocumentCatalog,
    DomainVocabulary,
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
import type { ColumnClassificationOutput, OntologyOutput } from "./llm-output.js";
import { selectReviewQuestions, capReviewQuestions, reviewBudgetDoubts } from "./questions.js";
import { selectDocumentTypeReviewQuestions } from "./document-questions.js";
import {
    buildDocumentCorpusEntities,
    buildDocumentCorpusRelations,
    materializedEntityIds,
} from "./document-ontology.js";
import { slugify } from "./string-utils.js";
import { buildLineDocumentEntities, isDocumentCorpus } from "./line-document.js";
import type { TableRouting } from "./table-routing.js";

type ColumnClassification = ColumnClassificationOutput["tables"][number]["columns"][number];

export interface AssemblyResult {
    entities: Entity[];
    relations: Relation[];
    rules: Rule[];
    doubts: Doubt[];
}

export function classificationLookup(
    output: ColumnClassificationOutput,
): Map<string, Map<string, ColumnClassification>> {
    const byTable = new Map<string, Map<string, ColumnClassification>>();
    for (const table of output.tables) {
        byTable.set(table.table, new Map(table.columns.map((column) => [column.column, column])));
    }
    return byTable;
}

export const FALLBACK_TYPE_BY_PATTERN: Record<string, SemanticType> = {
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

export function droppedDoubt(topic: string, question: string, reason: string): Doubt {
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

function assembleRelations(ontology: OntologyOutput, entities: Entity[], doubts: Doubt[]): Relation[] {
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

export function lowConfidenceDoubts(assembly: AssemblyResult, questionTargets: Set<string>): Doubt[] {
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

export function documentEntityIds(catalog: DocumentCatalog, vocabulary: DomainVocabulary): Set<string> {
    const ids = new Set<string>(materializedEntityIds(vocabulary));
    for (const type of catalog.documentTypes) {
        ids.add(slugify(type.id));
    }
    return ids;
}

export function mergeClassificationOutputs(...outputs: ColumnClassificationOutput[]): ColumnClassificationOutput {
    return { tables: outputs.flatMap((output) => output.tables) };
}

export function emptyClassification(): ColumnClassificationOutput {
    return { tables: [] };
}

export function assembleProposal(
    ontologyOutput: OntologyOutput,
    ontologyExtraDoubts: Doubt[],
    classification: ColumnClassificationOutput,
    profile: ProfileReport,
    routing: TableRouting,
    documentCatalog: DocumentCatalog | undefined,
    vocabulary: DomainVocabulary,
): AssemblyResult {
    const documentCorpus =
        documentCatalog !== undefined ||
        isDocumentCorpus(routing.lineDocuments.length, routing.totalTableCount);
    const doubts: Doubt[] = [...ontologyOutput.doubts, ...ontologyExtraDoubts];
    const llmEntities = assembleEntities(ontologyOutput, profile, classification, doubts);
    const lineDocumentEntities =
        documentCatalog !== undefined
            ? buildDocumentCorpusEntities(documentCatalog, profile, vocabulary)
            : documentCorpus
              ? buildLineDocumentEntities(profile, classification)
              : [];
    const entities = [...llmEntities, ...lineDocumentEntities];
    const documentRelations =
        documentCatalog !== undefined
            ? buildDocumentCorpusRelations(documentCatalog, entities, vocabulary)
            : [];
    const relations = [...assembleRelations(ontologyOutput, entities, doubts), ...documentRelations];
    const rules = assembleRules(ontologyOutput, entities, doubts);
    return { entities, relations, rules, doubts };
}

export function buildReviewQuestions(
    assembly: AssemblyResult,
    routing: TableRouting,
    documentCatalog: DocumentCatalog | undefined,
    vocabulary: DomainVocabulary,
    reviewConfidenceThreshold: number,
): Proposal["questions"] {
    const excludedEntityIds =
        documentCatalog !== undefined
            ? documentEntityIds(documentCatalog, vocabulary)
            : new Set<string>();
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

export function finalizeReviewQuestions(
    assembly: AssemblyResult,
    allQuestions: Proposal["questions"],
): Proposal["questions"] {
    const { questions, dropped } = capReviewQuestions(allQuestions);
    assembly.doubts.push(...reviewBudgetDoubts(dropped));
    return questions;
}
