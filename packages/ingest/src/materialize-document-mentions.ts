import { DOCUMENT_ENTITIES_TABLE, DOCUMENT_LINES_TABLE, DOCUMENT_MENTIONS_TABLE, } from "@backed/core";
import { readRowNumber, readRowString } from "./duckdb-row.js";
import { dropTableIfExists, quoteIdentifier, quoteString, sqlNullableNumber, sqlNullableString, } from "./sql.js";
import type { Dataset, SqlQuery } from "./types.js";
export interface MaterializedMentionInput {
    mentionId: string;
    documentId: string;
    entityId: string | null;
    mentionType: string;
    text: string;
    normalizedValue: string;
    page: number;
    line: number;
    confidence: number;
    context: string;
}
export interface MaterializedEntityInput {
    entityId: string;
    name: string;
    normalizedName: string;
    mentionCount: number;
    documentCount: number;
    sector?: string | null;
    role?: string | null;
    summary?: string | null;
    enrichmentConfidence?: number | null;
}
export interface MaterializeDocumentMentionsInput {
    mentions: MaterializedMentionInput[];
    entities: MaterializedEntityInput[];
}
export interface MaterializeDocumentMentionsResult {
    datasetsAdded: Dataset[];
    mentionCount: number;
    entityCount: number;
}
async function createEntitiesTable(query: SqlQuery, entities: MaterializedEntityInput[]): Promise<void> {
    await dropTableIfExists(query, DOCUMENT_ENTITIES_TABLE);
    await query(`CREATE TABLE ${quoteIdentifier(DOCUMENT_ENTITIES_TABLE)} (
      entity_id VARCHAR NOT NULL,
      name VARCHAR NOT NULL,
      normalized_name VARCHAR NOT NULL,
      mention_count INTEGER NOT NULL,
      document_count INTEGER NOT NULL,
      sector VARCHAR,
      role VARCHAR,
      summary VARCHAR,
      enrichment_confidence DOUBLE
    )`);
    for (const entity of entities) {
        await query(`INSERT INTO ${quoteIdentifier(DOCUMENT_ENTITIES_TABLE)} (
        entity_id, name, normalized_name, mention_count, document_count,
        sector, role, summary, enrichment_confidence
      ) VALUES (
        ${quoteString(entity.entityId)},
        ${quoteString(entity.name)},
        ${quoteString(entity.normalizedName)},
        ${String(entity.mentionCount)},
        ${String(entity.documentCount)},
        ${sqlNullableString(entity.sector ?? null)},
        ${sqlNullableString(entity.role ?? null)},
        ${sqlNullableString(entity.summary ?? null)},
        ${sqlNullableNumber(entity.enrichmentConfidence ?? null)}
      )`);
    }
}
async function createDocumentMentionsTable(query: SqlQuery, mentions: MaterializedMentionInput[]): Promise<void> {
    await dropTableIfExists(query, DOCUMENT_MENTIONS_TABLE);
    await query(`CREATE TABLE ${quoteIdentifier(DOCUMENT_MENTIONS_TABLE)} (
      mention_id VARCHAR NOT NULL,
      document_id VARCHAR NOT NULL,
      entity_id VARCHAR,
      mention_type VARCHAR NOT NULL,
      text VARCHAR NOT NULL,
      normalized_value VARCHAR NOT NULL,
      page INTEGER NOT NULL,
      line INTEGER NOT NULL,
      confidence DOUBLE NOT NULL,
      context VARCHAR NOT NULL
    )`);
    for (const mention of mentions) {
        await query(`INSERT INTO ${quoteIdentifier(DOCUMENT_MENTIONS_TABLE)} (
        mention_id, document_id, entity_id, mention_type, text, normalized_value, page, line, confidence, context
      ) VALUES (
        ${quoteString(mention.mentionId)},
        ${quoteString(mention.documentId)},
        ${sqlNullableString(mention.entityId)},
        ${quoteString(mention.mentionType)},
        ${quoteString(mention.text)},
        ${quoteString(mention.normalizedValue)},
        ${String(mention.page)},
        ${String(mention.line)},
        ${String(mention.confidence)},
        ${quoteString(mention.context)}
      )`);
    }
}
export async function fetchAllDocumentLines(query: SqlQuery): Promise<Array<{
    document_id: string;
    page: number;
    line: number;
    text: string;
}>> {
    const rows = await query(`SELECT document_id, page, line, text FROM ${quoteIdentifier(DOCUMENT_LINES_TABLE)} ORDER BY document_id, page, line`);
    return rows.map((row) => ({
        document_id: readRowString(row, "document_id"),
        page: readRowNumber(row, "page"),
        line: readRowNumber(row, "line"),
        text: readRowString(row, "text"),
    }));
}
export async function materializeDocumentMentions(query: SqlQuery, input: MaterializeDocumentMentionsInput): Promise<MaterializeDocumentMentionsResult> {
    await createEntitiesTable(query, input.entities);
    await createDocumentMentionsTable(query, input.mentions);
    const datasetsAdded: Dataset[] = [];
    if (input.entities.length > 0) {
        datasetsAdded.push({
            tableName: DOCUMENT_ENTITIES_TABLE,
            sourceFile: "document-mentions:entities",
            format: "json",
        });
    }
    if (input.mentions.length > 0) {
        datasetsAdded.push({
            tableName: DOCUMENT_MENTIONS_TABLE,
            sourceFile: "document-mentions:mentions",
            format: "json",
        });
    }
    return {
        datasetsAdded,
        mentionCount: input.mentions.length,
        entityCount: input.entities.length,
    };
}
