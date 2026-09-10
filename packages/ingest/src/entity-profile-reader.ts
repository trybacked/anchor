import { DEFAULT_PROFILE_DOCUMENT_LIMIT, DEFAULT_PROFILE_FACT_LIMIT, DEFAULT_PROFILE_MATCH_LIMIT, DOCUMENT_FACTS_TABLE, DOCUMENT_MENTIONS_TABLE, ENTITY_MENTION_TYPE, ENTITY_PROFILES_TABLE, MAX_PROFILE_MATCH_LIMIT, MAX_PROFILE_ROW_LIMIT, } from "@backed/core";
import type { EntityProfileReader, EntityProfileRequest, EntityProfileResult, } from "@backed/core";
import { DOCUMENT_TYPE_TABLE_PREFIX } from "./document-type-tables.js";
import { readRowString } from "./duckdb-row.js";
import { quoteIdentifier, quoteString } from "./sql.js";
import type { SqlQuery } from "./types.js";
function clamp(value: number | undefined, fallback: number, max: number): number {
    if (value === undefined || !Number.isFinite(value)) {
        return fallback;
    }
    return Math.min(Math.max(1, Math.trunc(value)), max);
}
async function listDocumentTypeTables(query: SqlQuery): Promise<string[]> {
    const rows = await query(`SELECT table_name FROM information_schema.tables
     WHERE table_name LIKE ${quoteString(`${DOCUMENT_TYPE_TABLE_PREFIX}%`)}
     ORDER BY table_name`);
    return rows
        .map((row) => readRowString(row, "table_name"))
        .filter((name) => name.startsWith(DOCUMENT_TYPE_TABLE_PREFIX));
}
function buildDocumentUnion(tables: string[]): string | null {
    if (tables.length === 0) {
        return null;
    }
    return tables
        .map((table) => `SELECT document_id, ${quoteString(table)} AS document_table, subject, published_date, topics, summary
         FROM ${quoteIdentifier(table)}`)
        .join(" UNION ALL ");
}
async function findProfiles(query: SqlQuery, name: string, limit: number): Promise<Record<string, unknown>[]> {
    const pattern = quoteString(`%${name.trim().toLowerCase()}%`);
    return query(`SELECT * FROM ${quoteIdentifier(ENTITY_PROFILES_TABLE)}
     WHERE lower(name) LIKE ${pattern}
        OR lower(normalized_name) LIKE ${pattern}
        OR lower(entity_id) LIKE ${pattern}
     ORDER BY mention_count DESC, name ASC
     LIMIT ${String(limit)}`);
}
async function readFacts(query: SqlQuery, entityId: string, limit: number): Promise<Record<string, unknown>[]> {
    return query(`SELECT fact_type, amount, identifier_type, identifier_value, document_id, raw_text, page
     FROM ${quoteIdentifier(DOCUMENT_FACTS_TABLE)}
     WHERE entity_id = ${quoteString(entityId)}
     ORDER BY amount DESC NULLS LAST
     LIMIT ${String(limit)}`);
}
async function readAttributedIdentifiers(query: SqlQuery, entityId: string): Promise<Record<string, string[]>> {
    const mentions = quoteIdentifier(DOCUMENT_MENTIONS_TABLE);
    const entity = quoteString(entityId);
    const rows = await query(`SELECT DISTINCT mention_type, normalized_value AS value
     FROM ${mentions}
     WHERE entity_id = ${entity}
       AND mention_type <> ${quoteString(ENTITY_MENTION_TYPE)}
     ORDER BY mention_type, value`);
    const grouped: Record<string, string[]> = {};
    for (const row of rows) {
        const type = readRowString(row, "mention_type");
        const value = readRowString(row, "value");
        if (type.length === 0 || value.length === 0) {
            continue;
        }
        const values = grouped[type] ?? [];
        if (!values.includes(value)) {
            values.push(value);
        }
        grouped[type] = values;
    }
    return grouped;
}
async function readDocuments(query: SqlQuery, entityId: string, documentUnion: string | null, limit: number): Promise<Record<string, unknown>[]> {
    const mentions = quoteIdentifier(DOCUMENT_MENTIONS_TABLE);
    const entity = quoteString(entityId);
    if (documentUnion === null) {
        return query(`SELECT DISTINCT document_id, COUNT(*) OVER (PARTITION BY document_id) AS mention_count
       FROM ${mentions}
       WHERE entity_id = ${entity}
       LIMIT ${String(limit)}`);
    }
    return query(`WITH linked AS (
       SELECT document_id, COUNT(*) AS mention_count
       FROM ${mentions}
       WHERE entity_id = ${entity}
       GROUP BY document_id
     ),
     documents AS (${documentUnion})
     SELECT
       linked.document_id,
       documents.document_table,
       documents.subject,
       documents.published_date,
       documents.topics,
       documents.summary,
       linked.mention_count
     FROM linked
     LEFT JOIN documents ON documents.document_id = linked.document_id
     ORDER BY linked.mention_count DESC, linked.document_id ASC
     LIMIT ${String(limit)}`);
}
export function createEntityProfileReader(query: SqlQuery): EntityProfileReader {
    let documentUnion: string | null | undefined;
    return async (request: EntityProfileRequest): Promise<EntityProfileResult[]> => {
        if (documentUnion === undefined) {
            documentUnion = buildDocumentUnion(await listDocumentTypeTables(query));
        }
        const matchLimit = clamp(request.matchLimit, DEFAULT_PROFILE_MATCH_LIMIT, MAX_PROFILE_MATCH_LIMIT);
        const factLimit = clamp(request.factLimit, DEFAULT_PROFILE_FACT_LIMIT, MAX_PROFILE_ROW_LIMIT);
        const documentLimit = clamp(request.documentLimit, DEFAULT_PROFILE_DOCUMENT_LIMIT, MAX_PROFILE_ROW_LIMIT);
        const profiles = await findProfiles(query, request.name, matchLimit);
        return Promise.all(profiles.map(async (profile) => {
            const entityId = readRowString(profile, "entity_id");
            const [facts, documents, attributedIdentifiers] = await Promise.all([
                readFacts(query, entityId, factLimit),
                readDocuments(query, entityId, documentUnion ?? null, documentLimit),
                readAttributedIdentifiers(query, entityId),
            ]);
            return { profile, documents, facts, attributedIdentifiers };
        }));
    };
}
