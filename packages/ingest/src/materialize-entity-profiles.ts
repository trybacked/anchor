import { DOCUMENT_ENTITIES_TABLE, DOCUMENT_FACTS_TABLE, DOCUMENT_MENTIONS_TABLE, ENTITY_MENTION_TYPE, ENTITY_PROFILES_TABLE, } from "@backed/core";
import type { FactType } from "@backed/core";
import { DOCUMENT_TYPE_TABLE_LIKE } from "./document-type-tables.js";
import { dropTableIfExists, quoteIdentifier, quoteString, sqlColumnSuffix, } from "./sql.js";
import type { Dataset, SqlQuery } from "./types.js";
export interface MaterializeEntityProfilesOptions {
    factTypes: Pick<FactType, "id" | "aggregation">[];
}
export interface MaterializeEntityProfilesResult {
    datasetsAdded: Dataset[];
    profileCount: number;
}
const SQL_AGGREGATIONS = {
    sum: "SUM",
    max: "MAX",
    min: "MIN",
    avg: "AVG",
} as const;
const AGGREGATION_PREFIXES = {
    sum: "total",
    max: "max",
    min: "min",
    avg: "avg",
} as const;
const TOPICS_COLUMN = "topics";
async function distinctValues(query: SqlQuery, table: string, column: string): Promise<string[]> {
    const rows = await query(`SELECT DISTINCT ${quoteIdentifier(column)} AS value FROM ${quoteIdentifier(table)}
     WHERE ${quoteIdentifier(column)} IS NOT NULL ORDER BY value`);
    return rows.map((row) => String(row["value"])).filter((value) => value.length > 0);
}
async function findTopicTables(query: SqlQuery): Promise<string[]> {
    const rows = await query(`SELECT table_name FROM information_schema.columns
     WHERE column_name = ${quoteString(TOPICS_COLUMN)} AND table_name LIKE ${quoteString(DOCUMENT_TYPE_TABLE_LIKE)}
     ORDER BY table_name`);
    return rows.map((row) => String(row["table_name"]));
}
function buildTopicSource(topicTables: string[]): string {
    if (topicTables.length === 0) {
        return "SELECT NULL AS document_id, NULL AS topics WHERE FALSE";
    }
    return topicTables
        .map((table) => `SELECT document_id, topics FROM ${quoteIdentifier(table)}`)
        .join(" UNION ALL ");
}
interface FactColumn {
    alias: string;
    expression: string;
}
function buildFactColumns(presentFactTypes: string[], factTypes: MaterializeEntityProfilesOptions["factTypes"]): FactColumn[] {
    const aggregationById = new Map(factTypes.map((factType) => [factType.id, factType.aggregation]));
    return presentFactTypes.map((factType) => {
        const aggregation = aggregationById.get(factType) ?? "sum";
        const alias = quoteIdentifier(`${AGGREGATION_PREFIXES[aggregation]}_${sqlColumnSuffix(factType)}`);
        return {
            alias,
            expression: `${SQL_AGGREGATIONS[aggregation]}(CASE WHEN fact_type = ${quoteString(factType)} THEN amount END) AS ${alias}`,
        };
    });
}
interface IdentifierRollupConfig {
    cteName: (suffix: string) => string;
    countColumn: (suffix: string) => string;
    listColumn: (suffix: string) => string;
    subquery: (mentions: string, identifierType: string) => string;
}
const DOCUMENT_IDENTIFIER_ROLLUP: IdentifierRollupConfig = {
    cteName: (suffix) => `${suffix}_rollup`,
    countColumn: (suffix) => quoteIdentifier(`${suffix}_count`),
    listColumn: (suffix) => quoteIdentifier(`${suffix}_list`),
    subquery: (mentions, identifierType) => `SELECT DISTINCT docs.entity_id, coded.normalized_value AS value
        FROM distinct_documents AS docs
        JOIN ${mentions} AS coded
          ON coded.document_id = docs.document_id
          AND coded.mention_type = ${quoteString(identifierType)}`,
};
const ATTRIBUTED_IDENTIFIER_ROLLUP: IdentifierRollupConfig = {
    cteName: (suffix) => `${suffix}_attributed`,
    countColumn: (suffix) => quoteIdentifier(`attributed_${suffix}_count`),
    listColumn: (suffix) => quoteIdentifier(`attributed_${suffix}_list`),
    subquery: (mentions, identifierType) => `SELECT DISTINCT entity_id, normalized_value AS value
        FROM ${mentions}
        WHERE entity_id IS NOT NULL
          AND mention_type = ${quoteString(identifierType)}`,
};
function buildIdentifierRollups(identifierTypes: string[], config: IdentifierRollupConfig): {
    ctes: string[];
    selects: string[];
    joins: string[];
} {
    const ctes: string[] = [];
    const selects: string[] = [];
    const joins: string[] = [];
    const mentions = quoteIdentifier(DOCUMENT_MENTIONS_TABLE);
    for (const identifierType of identifierTypes) {
        const suffix = sqlColumnSuffix(identifierType);
        const cte = config.cteName(suffix);
        const countColumn = config.countColumn(suffix);
        const listColumn = config.listColumn(suffix);
        ctes.push(`${cte} AS (
      SELECT
        entity_id,
        COUNT(*) AS ${countColumn},
        string_agg(value, ', ' ORDER BY value) AS ${listColumn}
      FROM (
        ${config.subquery(mentions, identifierType)}
      )
      GROUP BY entity_id
    )`);
        selects.push(`COALESCE(${cte}.${countColumn}, 0) AS ${countColumn}`, `${cte}.${listColumn}`);
        joins.push(`LEFT JOIN ${cte} ON ${cte}.entity_id = entity.entity_id`);
    }
    return { ctes, selects, joins };
}
function buildProfilesQuery(topicTables: string[], factColumns: FactColumn[], identifiers: ReturnType<typeof buildIdentifierRollups>, attributedIdentifiers: ReturnType<typeof buildIdentifierRollups>): string {
    const facts = quoteIdentifier(DOCUMENT_FACTS_TABLE);
    const mentions = quoteIdentifier(DOCUMENT_MENTIONS_TABLE);
    const entities = quoteIdentifier(DOCUMENT_ENTITIES_TABLE);
    const factAggregates = factColumns.map((column) => column.expression).join(", ");
    const factRollup = `fact_rollup AS (
      SELECT entity_id, COUNT(*) AS fact_count${factColumns.length > 0 ? `, ${factAggregates}` : ""}
      FROM ${facts}
      WHERE entity_id IS NOT NULL
      GROUP BY entity_id
    )`;
    const factSelects = factColumns.map((column) => `fact_rollup.${column.alias}`);
    const ctes = [
        `document_topics AS (${buildTopicSource(topicTables)})`,
        factRollup,
        `distinct_documents AS (
      SELECT DISTINCT entity_id, document_id
      FROM ${mentions}
      WHERE entity_id IS NOT NULL
    )`,
        `document_rollup AS (
      SELECT entity_id, string_agg(document_id, ', ' ORDER BY document_id) AS document_ids
      FROM distinct_documents
      GROUP BY entity_id
    )`,
        `related_rollup AS (
      SELECT
        related.entity_id,
        COUNT(*) AS related_count,
        string_agg(other.name, ', ' ORDER BY other.name) AS related_names
      FROM (
        SELECT DISTINCT source.entity_id, target.entity_id AS related_id
        FROM distinct_documents AS source
        JOIN distinct_documents AS target
          ON source.document_id = target.document_id
          AND source.entity_id <> target.entity_id
      ) AS related
      JOIN ${entities} AS other ON other.entity_id = related.related_id
      GROUP BY related.entity_id
    )`,
        `topic_rollup AS (
      SELECT entity_id, string_agg(topic, ', ' ORDER BY topic) AS topics
      FROM (
        SELECT DISTINCT docs.entity_id, trim(topic.value) AS topic
        FROM distinct_documents AS docs
        JOIN document_topics AS tagged ON tagged.document_id = docs.document_id
        CROSS JOIN UNNEST(string_split(tagged.topics, ',')) AS topic(value)
        WHERE tagged.topics IS NOT NULL AND trim(topic.value) <> ''
      )
      GROUP BY entity_id
    )`,
        ...identifiers.ctes,
        ...attributedIdentifiers.ctes,
    ];
    const selects = [
        "entity.entity_id",
        "entity.name",
        "entity.normalized_name",
        "entity.sector",
        "entity.role",
        "entity.summary",
        "entity.mention_count",
        "entity.document_count",
        "COALESCE(fact_rollup.fact_count, 0) AS fact_count",
        ...factSelects,
        ...identifiers.selects,
        ...attributedIdentifiers.selects,
        "document_rollup.document_ids",
        "COALESCE(related_rollup.related_count, 0) AS related_count",
        "related_rollup.related_names",
        "topic_rollup.topics",
    ];
    const joins = [
        `LEFT JOIN fact_rollup ON fact_rollup.entity_id = entity.entity_id`,
        `LEFT JOIN document_rollup ON document_rollup.entity_id = entity.entity_id`,
        `LEFT JOIN related_rollup ON related_rollup.entity_id = entity.entity_id`,
        `LEFT JOIN topic_rollup ON topic_rollup.entity_id = entity.entity_id`,
        ...identifiers.joins,
        ...attributedIdentifiers.joins,
    ];
    return `CREATE TABLE ${quoteIdentifier(ENTITY_PROFILES_TABLE)} AS
    WITH ${ctes.join(",\n    ")}
    SELECT ${selects.join(",\n      ")}
    FROM ${entities} AS entity
    ${joins.join("\n    ")}`;
}
export async function materializeEntityProfiles(query: SqlQuery, options: MaterializeEntityProfilesOptions): Promise<MaterializeEntityProfilesResult> {
    const presentFactTypes = await distinctValues(query, DOCUMENT_FACTS_TABLE, "fact_type");
    const identifierTypes = (await distinctValues(query, DOCUMENT_MENTIONS_TABLE, "mention_type")).filter((mentionType) => mentionType !== ENTITY_MENTION_TYPE);
    await dropTableIfExists(query, ENTITY_PROFILES_TABLE);
    await query(buildProfilesQuery(await findTopicTables(query), buildFactColumns(presentFactTypes, options.factTypes), buildIdentifierRollups(identifierTypes, DOCUMENT_IDENTIFIER_ROLLUP), buildIdentifierRollups(identifierTypes, ATTRIBUTED_IDENTIFIER_ROLLUP)));
    const countRows = await query(`SELECT COUNT(*) AS profile_count FROM ${quoteIdentifier(ENTITY_PROFILES_TABLE)}`);
    const profileCount = Number(countRows[0]?.["profile_count"] ?? 0);
    const datasetsAdded: Dataset[] = profileCount > 0
        ? [
            {
                tableName: ENTITY_PROFILES_TABLE,
                sourceFile: "entity-profiles:rollup",
                format: "json",
            },
        ]
        : [];
    return { datasetsAdded, profileCount };
}
