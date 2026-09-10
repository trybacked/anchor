import { DOCUMENT_CHUNKS_TABLE, DOCUMENT_ENTITIES_TABLE, DOCUMENT_FACTS_TABLE, DOCUMENT_LINES_TABLE, DOCUMENT_MENTIONS_TABLE, EMPTY_DOMAIN_VOCABULARY, ENTITY_PROFILES_TABLE, documentTypeTableName, } from "@backed/core";
import type { ColumnProfile, DocumentCatalog, DomainVocabulary, Entity, ProfileReport, Property, Relation, } from "@backed/core";
import { ONTOLOGY_ENTITY_CONFIDENCE, ONTOLOGY_HIGH_CONFIDENCE, ONTOLOGY_PROFILE_CONFIDENCE, } from "./constants.js";
import type { ColumnClassificationOutput } from "./llm-output.js";
import {
    documentTypeEntityId,
    documentTypeStableKey,
    documentTypeStableKeyEvidence,
} from "./document-type-identity.js";
import { slugify, titleize } from "./string-utils.js";

const NUMERIC_SQL_TYPES = /int|double|float|decimal|numeric|real|bigint|hugeint/i;
const DATE_SQL_TYPES = /date|timestamp|time/i;
interface MaterializedColumn {
    column: string;
    label: string;
    semanticType: "identifier" | "text" | "number" | "date";
    role: "primary_key" | "foreign_key" | "attribute";
}
function inferColumnSemanticType(column: ColumnProfile): MaterializedColumn["semanticType"] {
    if (DATE_SQL_TYPES.test(column.sqlType)) {
        return "date";
    }
    if (NUMERIC_SQL_TYPES.test(column.sqlType)) {
        return "number";
    }
    return column.name.endsWith("_id") ? "identifier" : "text";
}

function inferColumnRole(columnName: string): MaterializedColumn["role"] {
    if (columnName === "document_id") {
        return "primary_key";
    }
    if (columnName.endsWith("_id")) {
        return "foreign_key";
    }
    return "attribute";
}

function deriveDocumentTypeColumns(profile: ProfileReport, tableName: string): MaterializedColumn[] {
    const table = profile.find((entry) => entry.table === tableName);
    if (table === undefined) {
        return [];
    }
    return table.columns.map((column) => ({
        column: column.name,
        label: titleize(column.name),
        semanticType: inferColumnSemanticType(column),
        role: inferColumnRole(column.name),
    }));
}
const DOCUMENT_LINES_COLUMNS: MaterializedColumn[] = [
    { column: "document_id", label: "Document ID", semanticType: "identifier", role: "foreign_key" },
    { column: "page", label: "Page number", semanticType: "number", role: "attribute" },
    { column: "line", label: "Line number", semanticType: "number", role: "attribute" },
    { column: "text", label: "Text content", semanticType: "text", role: "attribute" },
];
const DOCUMENT_CHUNK_COLUMNS: MaterializedColumn[] = [
    { column: "document_id", label: "Document ID", semanticType: "identifier", role: "foreign_key" },
    { column: "chunk_index", label: "Chunk index", semanticType: "number", role: "attribute" },
    { column: "page_start", label: "Start page", semanticType: "number", role: "attribute" },
    { column: "page_end", label: "End page", semanticType: "number", role: "attribute" },
    { column: "text", label: "Chunk text", semanticType: "text", role: "attribute" },
];
const ENTITY_COLUMNS: MaterializedColumn[] = [
    { column: "entity_id", label: "Entity ID", semanticType: "identifier", role: "primary_key" },
    { column: "name", label: "Name", semanticType: "text", role: "attribute" },
    { column: "normalized_name", label: "Normalized name", semanticType: "text", role: "attribute" },
    { column: "mention_count", label: "Mention count", semanticType: "number", role: "attribute" },
    { column: "document_count", label: "Document count", semanticType: "number", role: "attribute" },
    { column: "sector", label: "Sector", semanticType: "text", role: "attribute" },
    { column: "role", label: "Role", semanticType: "text", role: "attribute" },
    { column: "summary", label: "Summary", semanticType: "text", role: "attribute" },
    {
        column: "enrichment_confidence",
        label: "Enrichment confidence",
        semanticType: "number",
        role: "attribute",
    },
];
const DOCUMENT_MENTION_COLUMNS: MaterializedColumn[] = [
    { column: "mention_id", label: "Mention ID", semanticType: "identifier", role: "primary_key" },
    { column: "document_id", label: "Document ID", semanticType: "identifier", role: "foreign_key" },
    { column: "entity_id", label: "Entity ID", semanticType: "identifier", role: "foreign_key" },
    { column: "mention_type", label: "Mention type", semanticType: "text", role: "attribute" },
    { column: "text", label: "Mention text", semanticType: "text", role: "attribute" },
    { column: "normalized_value", label: "Normalized value", semanticType: "text", role: "attribute" },
    { column: "page", label: "Page number", semanticType: "number", role: "attribute" },
    { column: "line", label: "Line number", semanticType: "number", role: "attribute" },
    { column: "confidence", label: "Confidence", semanticType: "number", role: "attribute" },
    { column: "context", label: "Context", semanticType: "text", role: "attribute" },
];
const DOCUMENT_FACT_COLUMNS: MaterializedColumn[] = [
    { column: "fact_id", label: "Fact ID", semanticType: "identifier", role: "primary_key" },
    { column: "document_id", label: "Document ID", semanticType: "identifier", role: "foreign_key" },
    { column: "entity_id", label: "Entity ID", semanticType: "identifier", role: "foreign_key" },
    {
        column: "identifier_type",
        label: "Identifier type",
        semanticType: "text",
        role: "attribute",
    },
    {
        column: "identifier_value",
        label: "Identifier value",
        semanticType: "identifier",
        role: "attribute",
    },
    { column: "fact_type", label: "Quantity type", semanticType: "text", role: "attribute" },
    { column: "amount", label: "Value", semanticType: "number", role: "attribute" },
    { column: "raw_text", label: "Raw text", semanticType: "text", role: "attribute" },
    { column: "page", label: "Page number", semanticType: "number", role: "attribute" },
    { column: "line", label: "Line number", semanticType: "number", role: "attribute" },
];
export const DOCUMENT_TEXT_ENTITY_ID = "document_text";
export const DOCUMENT_CHUNK_ENTITY_ID = "document_chunk";
export const DOCUMENT_MENTION_ENTITY_ID = "document_mention";
export const DOCUMENT_FACT_ENTITY_ID = "document_fact";
export function entityIdFor(vocabulary: DomainVocabulary): string {
    const slug = slugify(vocabulary.entityLabel);
    return slug.length > 0 ? slug : "entity";
}
export function profileEntityIdFor(vocabulary: DomainVocabulary): string {
    return `${entityIdFor(vocabulary)}_profile`;
}
function entityNameFor(vocabulary: DomainVocabulary): string {
    return titleize(entityIdFor(vocabulary));
}
export function materializedEntityIds(vocabulary: DomainVocabulary): string[] {
    return [
        DOCUMENT_TEXT_ENTITY_ID,
        DOCUMENT_CHUNK_ENTITY_ID,
        DOCUMENT_MENTION_ENTITY_ID,
        DOCUMENT_FACT_ENTITY_ID,
        entityIdFor(vocabulary),
        profileEntityIdFor(vocabulary),
    ];
}
function inferSemanticType(column: ColumnProfile): MaterializedColumn["semanticType"] {
    return inferColumnSemanticType(column);
}
function labelRollupColumn(name: string, vocabulary: DomainVocabulary): string {
    const parts = /^(total|max|min|avg)_(.+)$/.exec(name);
    if (parts !== null) {
        const factType = vocabulary.factTypes.find((candidate) => candidate.id === parts[2]);
        if (factType !== undefined) {
            return `${titleize(parts[1] ?? "")} ${factType.label.toLowerCase()}`;
        }
    }
    const coded = /^(.+)_(count|list)$/.exec(name);
    if (coded !== null) {
        const format = vocabulary.identifierFormats.find((candidate) => candidate.id === coded[1]);
        if (format !== undefined) {
            return coded[2] === "count"
                ? `${format.label} count`
                : `${format.label}s in the entity's documents`;
        }
    }
    return titleize(name);
}
function deriveProfileColumns(profile: ProfileReport, vocabulary: DomainVocabulary): MaterializedColumn[] {
    const table = profile.find((entry) => entry.table === ENTITY_PROFILES_TABLE);
    if (table === undefined) {
        return [];
    }
    return table.columns.map((column) => ({
        column: column.name,
        label: labelRollupColumn(column.name, vocabulary),
        semanticType: inferSemanticType(column),
        role: column.name === "entity_id" ? ("primary_key" as const) : ("attribute" as const),
    }));
}
interface MaterializedEntitySpec {
    entityId: string;
    name: string;
    description: string;
    table: string;
    tableLabel: string;
    confidence: number;
    columns: MaterializedColumn[];
    evidence: (rowCount: number) => string;
    nullableColumns: readonly string[];
}
function columnProperty(tableName: string, columnDef: MaterializedColumn, column: ColumnProfile | undefined, confidence: number, nullable: boolean, evidence: string): Property {
    return {
        name: columnDef.label,
        columnName: columnDef.column,
        semanticType: columnDef.semanticType,
        role: columnDef.role,
        nullable,
        confidence,
        provenance: { table: tableName, column: columnDef.column, evidence },
    };
}
function buildMaterializedEntity(spec: MaterializedEntitySpec, profile: ProfileReport): Entity | null {
    const table = profile.find((entry) => entry.table === spec.table);
    if (table === undefined || table.rowCount === 0 || spec.columns.length === 0) {
        return null;
    }
    return {
        id: spec.entityId,
        name: spec.name,
        description: spec.description,
        sourceTable: spec.table,
        status: "proposed",
        confidence: spec.confidence,
        provenance: {
            table: spec.table,
            evidence: spec.evidence(table.rowCount),
        },
        properties: spec.columns.map((columnDef) => {
            const column = table.columns.find((entry) => entry.name === columnDef.column);
            const nullable = column?.nullCount !== undefined && column.nullCount > 0
                ? true
                : spec.nullableColumns.includes(columnDef.column);
            const evidence = column
                ? `${columnDef.label} column (${column.sqlType})`
                : `${columnDef.label} on ${spec.tableLabel}`;
            return columnProperty(spec.table, columnDef, column, spec.confidence, nullable, evidence);
        }),
    };
}
function mentionEntitySpecs(profile: ProfileReport, vocabulary: DomainVocabulary): MaterializedEntitySpec[] {
    const entityId = entityIdFor(vocabulary);
    const entityName = entityNameFor(vocabulary);
    const plural = `${entityName.toLowerCase()}s`;
    return [
        {
            entityId,
            name: entityName,
            description: `Named ${plural} mentioned in document body text`,
            table: DOCUMENT_ENTITIES_TABLE,
            tableLabel: "entity table",
            confidence: ONTOLOGY_ENTITY_CONFIDENCE,
            columns: ENTITY_COLUMNS,
            evidence: (rowCount) => `Entity table with ${String(rowCount)} deduplicated ${plural} from body-text extraction`,
            nullableColumns: ["sector", "role", "summary", "enrichment_confidence"],
        },
        {
            entityId: DOCUMENT_MENTION_ENTITY_ID,
            name: "Document Mention",
            description: `Occurrences of ${plural} and coded identifiers in document body text`,
            table: DOCUMENT_MENTIONS_TABLE,
            tableLabel: "document mention table",
            confidence: ONTOLOGY_ENTITY_CONFIDENCE,
            columns: DOCUMENT_MENTION_COLUMNS,
            evidence: (rowCount) => `Mention table with ${String(rowCount)} extracted mentions from document lines`,
            nullableColumns: ["entity_id"],
        },
        {
            entityId: DOCUMENT_FACT_ENTITY_ID,
            name: "Document Fact",
            description: `Quantities stated in the documents${vocabulary.factTypes.length > 0
                ? `: ${vocabulary.factTypes.map((factType) => factType.label.toLowerCase()).join(", ")}`
                : ""}`,
            table: DOCUMENT_FACTS_TABLE,
            tableLabel: "document facts table",
            confidence: ONTOLOGY_HIGH_CONFIDENCE,
            columns: DOCUMENT_FACT_COLUMNS,
            evidence: (rowCount) => `Fact table with ${String(rowCount)} quantities extracted from document lines`,
            nullableColumns: ["entity_id", "identifier_type", "identifier_value", "amount"],
        },
        {
            entityId: profileEntityIdFor(vocabulary),
            name: `${entityName} Profile`,
            description: `Precomputed rollup per ${entityName.toLowerCase()}: documents, aggregated quantities, coded identifiers, related ${plural}, and topics. Answers single-${entityName.toLowerCase()} questions from one row instead of joining mentions and facts.`,
            table: ENTITY_PROFILES_TABLE,
            tableLabel: "entity profile table",
            confidence: ONTOLOGY_HIGH_CONFIDENCE,
            columns: deriveProfileColumns(profile, vocabulary),
            evidence: (rowCount) => `Rollup with ${String(rowCount)} rows aggregating mentions, facts, and co-occurring ${plural}`,
            nullableColumns: ["sector", "role", "summary", "document_ids", "related_names", "topics"],
        },
    ];
}
export function classifyTypedDocumentTables(catalog: DocumentCatalog, profile: ProfileReport): ColumnClassificationOutput {
    return {
        tables: [
            ...catalog.documentTypes.map((type) => ({
                table: type.tableName,
                columns: deriveDocumentTypeColumns(profile, type.tableName).map((column) => ({
                    ...column,
                    confidence: type.confidence,
                })),
            })),
            {
                table: DOCUMENT_LINES_TABLE,
                columns: DOCUMENT_LINES_COLUMNS.map((column) => ({ ...column, confidence: ONTOLOGY_HIGH_CONFIDENCE })),
            },
            {
                table: DOCUMENT_CHUNKS_TABLE,
                columns: DOCUMENT_CHUNK_COLUMNS.map((column) => ({ ...column, confidence: ONTOLOGY_HIGH_CONFIDENCE })),
            },
        ],
    };
}
function buildTypedEntity(
    type: DocumentCatalog["documentTypes"][number],
    profile: ProfileReport,
    catalog: DocumentCatalog,
): Entity {
    const table = profile.find((entry) => entry.table === type.tableName);
    const stableKey = documentTypeStableKey(type.id);
    const entityId = documentTypeEntityId(type.id);
    const detail = `${String(type.documentCount)} documents classified as "${type.name}" from header extraction (examples: ${type.sampleSourceTables.join(", ")})`;
    return {
        id: entityId,
        name: type.name,
        description: `${type.name} documents extracted from source files`,
        sourceTable: type.tableName,
        status: "proposed",
        confidence: type.confidence,
        provenance: {
            table: type.tableName,
            evidence: documentTypeStableKeyEvidence(stableKey, detail),
        },
        properties: deriveDocumentTypeColumns(profile, type.tableName).map((columnDef) => {
            const column = table?.columns.find((entry) => entry.name === columnDef.column);
            const nullable = columnDef.column === "document_id"
                ? false
                : (column?.nullCount ? column.nullCount > 0 : true);
            const evidenceText = column
                ? `${columnDef.label} column (${column.sqlType}) on ${String(type.documentCount)} rows`
                : `${columnDef.label} on materialized document type table`;
            return columnProperty(type.tableName, columnDef, column, type.confidence, nullable, evidenceText);
        }),
    };
}
function buildTableEntity(entityId: string, name: string, description: string, tableName: string, columns: MaterializedColumn[], evidence: string, profile: ProfileReport): Entity {
    const table = profile.find((entry) => entry.table === tableName);
    return {
        id: entityId,
        name,
        description,
        sourceTable: tableName,
        status: "proposed",
        confidence: ONTOLOGY_HIGH_CONFIDENCE,
        provenance: { table: tableName, evidence },
        properties: columns.map((columnDef) => {
            const column = table?.columns.find((entry) => entry.name === columnDef.column);
            const evidenceText = column
                ? `${columnDef.label} column (${column.sqlType})`
                : `${columnDef.label} on ${tableName}`;
            return columnProperty(tableName, columnDef, column, ONTOLOGY_HIGH_CONFIDENCE, column?.nullCount ? column.nullCount > 0 : false, evidenceText);
        }),
    };
}
export function classifyMentionTables(profile: ProfileReport, vocabulary: DomainVocabulary): ColumnClassificationOutput {
    const tables = mentionEntitySpecs(profile, vocabulary)
        .filter((spec) => {
        const table = profile.find((entry) => entry.table === spec.table);
        return table !== undefined && table.rowCount > 0 && spec.columns.length > 0;
    })
        .map((spec) => ({
        table: spec.table,
        columns: spec.columns.map((column) => ({ ...column, confidence: spec.confidence })),
    }));
    return { tables };
}
export function buildMentionEntities(profile: ProfileReport, vocabulary: DomainVocabulary): Entity[] {
    return mentionEntitySpecs(profile, vocabulary)
        .map((spec) => buildMaterializedEntity(spec, profile))
        .filter((entity): entity is Entity => entity !== null);
}
interface RelationSpec {
    id: string;
    name: string;
    fromEntity: string;
    toEntity: string;
    column: string;
    cardinality: Relation["cardinality"];
    confidence: number;
    table: string;
    evidence: string;
}
function toRelation(spec: RelationSpec): Relation {
    return {
        id: spec.id,
        name: spec.name,
        fromEntity: spec.fromEntity,
        toEntity: spec.toEntity,
        fromColumn: spec.column,
        toColumn: spec.column,
        cardinality: spec.cardinality,
        status: "proposed",
        confidence: spec.confidence,
        provenance: { table: spec.table, column: spec.column, evidence: spec.evidence },
    };
}
export function buildMentionRelations(catalog: DocumentCatalog, entities: Entity[], vocabulary: DomainVocabulary): Relation[] {
    const entityId = entityIdFor(vocabulary);
    const entityName = entityNameFor(vocabulary).toLowerCase();
    const profileId = profileEntityIdFor(vocabulary);
    const has = (id: string): boolean => entities.some((entity) => entity.id === id);
    if (!has(entityId) || !has(DOCUMENT_MENTION_ENTITY_ID)) {
        return [];
    }
    const relations: Relation[] = catalog.documentTypes.flatMap((type) => {
        const typeId = documentTypeEntityId(type.id);
        const specs: RelationSpec[] = [
            {
                id: `${typeId}_has_mentions`,
                name: `${type.name} has document mentions`,
                fromEntity: typeId,
                toEntity: DOCUMENT_MENTION_ENTITY_ID,
                column: "document_id",
                cardinality: "one_to_many",
                confidence: type.confidence,
                table: type.tableName,
                evidence: `Each ${type.name.toLowerCase()} row links to extracted mentions via document_id`,
            },
        ];
        if (has(DOCUMENT_FACT_ENTITY_ID)) {
            specs.push({
                id: `${typeId}_has_facts`,
                name: `${type.name} has document facts`,
                fromEntity: typeId,
                toEntity: DOCUMENT_FACT_ENTITY_ID,
                column: "document_id",
                cardinality: "one_to_many",
                confidence: type.confidence,
                table: type.tableName,
                evidence: `Each ${type.name.toLowerCase()} row links to extracted quantities via document_id`,
            });
        }
        return specs.map(toRelation);
    });
    relations.push(toRelation({
        id: `mention_of_${entityId}`,
        name: `Document mention refers to ${entityName}`,
        fromEntity: entityId,
        toEntity: DOCUMENT_MENTION_ENTITY_ID,
        column: "entity_id",
        cardinality: "one_to_many",
        confidence: ONTOLOGY_ENTITY_CONFIDENCE,
        table: DOCUMENT_MENTIONS_TABLE,
        evidence: `Mentions link to deduplicated ${entityName} rows via entity_id`,
    }));
    if (has(DOCUMENT_FACT_ENTITY_ID)) {
        relations.push(toRelation({
            id: `${entityId}_has_facts`,
            name: `${entityNameFor(vocabulary)} has document facts`,
            fromEntity: entityId,
            toEntity: DOCUMENT_FACT_ENTITY_ID,
            column: "entity_id",
            cardinality: "one_to_many",
            confidence: ONTOLOGY_HIGH_CONFIDENCE,
            table: DOCUMENT_FACTS_TABLE,
            evidence: `Facts link to the ${entityName} named nearest in the document text`,
        }));
    }
    if (has(profileId)) {
        relations.push(toRelation({
            id: `${entityId}_has_profile`,
            name: `${entityNameFor(vocabulary)} has rollup profile`,
            fromEntity: entityId,
            toEntity: profileId,
            column: "entity_id",
            cardinality: "one_to_one",
            confidence: ONTOLOGY_PROFILE_CONFIDENCE,
            table: ENTITY_PROFILES_TABLE,
            evidence: `One precomputed rollup row per ${entityName}`,
        }), toRelation({
            id: `${profileId}_has_mentions`,
            name: `${entityNameFor(vocabulary)} profile has document mentions`,
            fromEntity: profileId,
            toEntity: DOCUMENT_MENTION_ENTITY_ID,
            column: "entity_id",
            cardinality: "one_to_many",
            confidence: ONTOLOGY_HIGH_CONFIDENCE,
            table: ENTITY_PROFILES_TABLE,
            evidence: "Profile rows expand to the underlying mentions via entity_id",
        }));
        if (has(DOCUMENT_FACT_ENTITY_ID)) {
            relations.push(toRelation({
                id: `${profileId}_has_facts`,
                name: `${entityNameFor(vocabulary)} profile has document facts`,
                fromEntity: profileId,
                toEntity: DOCUMENT_FACT_ENTITY_ID,
                column: "entity_id",
                cardinality: "one_to_many",
                confidence: ONTOLOGY_HIGH_CONFIDENCE,
                table: ENTITY_PROFILES_TABLE,
                evidence: "Profile totals expand to the individual facts via entity_id",
            }));
        }
    }
    return relations;
}
export function buildDocumentCorpusEntities(catalog: DocumentCatalog, profile: ProfileReport, vocabulary: DomainVocabulary = EMPTY_DOMAIN_VOCABULARY): Entity[] {
    const lineTable = profile.find((entry) => entry.table === DOCUMENT_LINES_TABLE);
    const chunkTable = profile.find((entry) => entry.table === DOCUMENT_CHUNKS_TABLE);
    return [
        ...catalog.documentTypes.map((type) => buildTypedEntity(type, profile, catalog)),
        buildTableEntity(DOCUMENT_TEXT_ENTITY_ID, "Document Text", "Line-level text content for all documents in the corpus", DOCUMENT_LINES_TABLE, DOCUMENT_LINES_COLUMNS, `Unified line table with ${String(lineTable?.rowCount ?? 0)} rows across the document corpus`, profile),
        buildTableEntity(DOCUMENT_CHUNK_ENTITY_ID, "Document Chunk", "Searchable text segments from documents, split for semantic retrieval", DOCUMENT_CHUNKS_TABLE, DOCUMENT_CHUNK_COLUMNS, `Chunk table with ${String(chunkTable?.rowCount ?? 0)} searchable segments across the document corpus`, profile),
        ...buildMentionEntities(profile, vocabulary),
    ];
}
export function buildDocumentCorpusRelations(catalog: DocumentCatalog, entities: Entity[], vocabulary: DomainVocabulary = EMPTY_DOMAIN_VOCABULARY): Relation[] {
    const documentText = entities.find((entity) => entity.id === DOCUMENT_TEXT_ENTITY_ID);
    const documentChunk = entities.find((entity) => entity.id === DOCUMENT_CHUNK_ENTITY_ID);
    if (!documentText || !documentChunk) {
        return [];
    }
    const typeRelations = catalog.documentTypes.flatMap((type) => {
        const typeId = documentTypeEntityId(type.id);
        return [
            toRelation({
                id: `${typeId}_has_text`,
                name: `${type.name} has document text`,
                fromEntity: typeId,
                toEntity: DOCUMENT_TEXT_ENTITY_ID,
                column: "document_id",
                cardinality: "one_to_many",
                confidence: type.confidence,
                table: type.tableName,
                evidence: `Each ${type.name.toLowerCase()} row links to line-level text rows via document_id`,
            }),
            toRelation({
                id: `${typeId}_has_chunks`,
                name: `${type.name} has document chunks`,
                fromEntity: typeId,
                toEntity: DOCUMENT_CHUNK_ENTITY_ID,
                column: "document_id",
                cardinality: "one_to_many",
                confidence: type.confidence,
                table: type.tableName,
                evidence: `Each ${type.name.toLowerCase()} row links to searchable text chunks via document_id`,
            }),
        ];
    });
    return [...typeRelations, ...buildMentionRelations(catalog, entities, vocabulary)];
}
const PIPELINE_TABLES: readonly string[] = [
    DOCUMENT_LINES_TABLE,
    DOCUMENT_CHUNKS_TABLE,
    DOCUMENT_ENTITIES_TABLE,
    DOCUMENT_MENTIONS_TABLE,
    DOCUMENT_FACTS_TABLE,
    ENTITY_PROFILES_TABLE,
];
export function isMaterializedDocumentTable(tableName: string, catalog: DocumentCatalog): boolean {
    return (PIPELINE_TABLES.includes(tableName) ||
        catalog.documentTypes.some((type) => type.tableName === tableName));
}
export function resolveDocumentTypeTableName(typeId: string): string {
    return documentTypeTableName(typeId);
}
