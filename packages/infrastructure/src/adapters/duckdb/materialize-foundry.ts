import { duckDbExec } from "./executor.js";

export type FoundryTableRows = Record<string, Record<string, unknown>[]>;

const TABLE_DDL: Record<string, string> = {
  documents: `(document_id VARCHAR PRIMARY KEY, source_file VARCHAR, title VARCHAR)`,
  organization_profiles: `(normalized_name VARCHAR PRIMARY KEY, name VARCHAR, entity_type VARCHAR, mention_count BIGINT, first_seen_document_id VARCHAR, last_seen_document_id VARCHAR)`,
  person_profiles: `(normalized_name VARCHAR PRIMARY KEY, name VARCHAR, entity_type VARCHAR, mention_count BIGINT, first_seen_document_id VARCHAR, last_seen_document_id VARCHAR)`,
  legal_instrument_profiles: `(normalized_name VARCHAR PRIMARY KEY, name VARCHAR, entity_type VARCHAR, mention_count BIGINT, first_seen_document_id VARCHAR, last_seen_document_id VARCHAR)`,
  topic_profiles: `(normalized_name VARCHAR PRIMARY KEY, name VARCHAR, entity_type VARCHAR, mention_count BIGINT, first_seen_document_id VARCHAR, last_seen_document_id VARCHAR)`,
  military_asset_profiles: `(normalized_name VARCHAR PRIMARY KEY, name VARCHAR, entity_type VARCHAR, mention_count BIGINT, first_seen_document_id VARCHAR, last_seen_document_id VARCHAR)`,
  document_organization_mentions: `(mention_id VARCHAR PRIMARY KEY, document_id VARCHAR, organization_normalized_name VARCHAR)`,
  document_person_mentions: `(mention_id VARCHAR PRIMARY KEY, document_id VARCHAR, person_normalized_name VARCHAR)`,
  document_topic_mentions: `(mention_id VARCHAR PRIMARY KEY, document_id VARCHAR, topic_normalized_name VARCHAR)`,
  document_legal_instrument_mentions: `(mention_id VARCHAR PRIMARY KEY, document_id VARCHAR, legal_instrument_normalized_name VARCHAR)`,
  person_organization_affiliations: `(affiliation_id VARCHAR PRIMARY KEY, person_normalized_name VARCHAR, organization_normalized_name VARCHAR, co_document_count BIGINT)`,
};

function quoteIdent(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function qualifiedTable(catalog: string, schema: string, table: string): string {
  return `${quoteIdent(catalog)}.${quoteIdent(schema)}.${quoteIdent(table)}`;
}

function insertStatement(
  qualified: string,
  columns: string[],
  rows: Record<string, unknown>[],
): string {
  if (rows.length === 0) {
    return "";
  }
  const values = rows
    .map((row) => {
      const cells = columns.map((column) => {
        const value = row[column];
        if (value === null || value === undefined) {
          return "NULL";
        }
        if (typeof value === "number" || typeof value === "boolean") {
          return String(value);
        }
        if (typeof value === "string") {
          return `'${value.replaceAll("'", "''")}'`;
        }
        return "NULL";
      });
      return `(${cells.join(", ")})`;
    })
    .join(",\n");
  return `INSERT INTO ${qualified} (${columns.map((c) => `"${c}"`).join(", ")}) VALUES\n${values};`;
}

export async function materializeFoundryRowsToDuckDb(options: {
  dbPath: string;
  catalog: string;
  schema?: string;
  rows: FoundryTableRows;
}): Promise<{ tables: string[]; rowCounts: Record<string, number> }> {
  const schema = options.schema ?? "docs";
  const statements: string[] = [`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(schema)};`];

  for (const table of Object.keys(TABLE_DDL)) {
    const qualified = qualifiedTable(options.catalog, schema, table);
    const ddl = TABLE_DDL[table];
    if (ddl === undefined) {
      continue;
    }
    statements.push(`CREATE OR REPLACE TABLE ${qualified} ${ddl};`);
    const tableRows = options.rows[table] ?? [];
    const firstRow = tableRows[0];
    if (firstRow !== undefined) {
      const columns = Object.keys(firstRow);
      const insert = insertStatement(qualified, columns, tableRows);
      if (insert.length > 0) {
        statements.push(insert);
      }
    }
  }

  for (const statement of statements) {
    if (statement.trim().length === 0) {
      continue;
    }
    await duckDbExec(options.dbPath, statement);
  }

  const rowCounts: Record<string, number> = {};
  for (const table of Object.keys(TABLE_DDL)) {
    rowCounts[table] = options.rows[table]?.length ?? 0;
  }
  return { tables: Object.keys(TABLE_DDL), rowCounts };
}
