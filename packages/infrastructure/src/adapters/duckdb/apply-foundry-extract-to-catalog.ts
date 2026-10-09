import { createCatalogWarehouseSqlExecutor, execCatalogWarehouseSql } from "./catalog-warehouse.js";
import type { FoundryTableRows } from "./materialize-foundry.js";
import { FOUNDRY_WAREHOUSE_TABLE_DDL } from "./materialize-foundry.js";

const DOCS_SCHEMA = "docs";
const SKIP_TABLES = new Set(["documents"]);

function quoteIdent(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function qualifiedTable(catalog: string, table: string): string {
  return `${quoteIdent(catalog)}.${quoteIdent(DOCS_SCHEMA)}.${quoteIdent(table)}`;
}

function escapeLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function insertSql(
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
          return escapeLiteral(value);
        }
        return "NULL";
      });
      return `(${cells.join(", ")})`;
    })
    .join(",\n");
  return `INSERT INTO ${qualified} (${columns.map((c) => quoteIdent(c)).join(", ")}) VALUES\n${values};`;
}

export async function applyFoundryExtractToCatalogWarehouse(options: {
  env: NodeJS.ProcessEnv;
  catalog: string;
  rows: FoundryTableRows;
  pageCountByDocumentId: Record<string, number>;
}): Promise<{ entityRows: number }> {
  const { env, catalog } = options;
  await execCatalogWarehouseSql(
    env,
    catalog,
    `CREATE SCHEMA IF NOT EXISTS ${quoteIdent(catalog)}.${quoteIdent(DOCS_SCHEMA)};`,
  );

  for (const [table, ddl] of Object.entries(FOUNDRY_WAREHOUSE_TABLE_DDL)) {
    if (SKIP_TABLES.has(table)) {
      continue;
    }
    const qualified = qualifiedTable(catalog, table);
    await execCatalogWarehouseSql(env, catalog, `CREATE TABLE IF NOT EXISTS ${qualified} ${ddl};`);
  }

  for (const table of Object.keys(FOUNDRY_WAREHOUSE_TABLE_DDL)) {
    if (SKIP_TABLES.has(table)) {
      continue;
    }
    await execCatalogWarehouseSql(env, catalog, `DELETE FROM ${qualifiedTable(catalog, table)};`);
  }

  for (const table of Object.keys(FOUNDRY_WAREHOUSE_TABLE_DDL)) {
    if (SKIP_TABLES.has(table)) {
      continue;
    }
    const tableRows = options.rows[table] ?? [];
    const firstRow = tableRows[0];
    if (firstRow === undefined) {
      continue;
    }
    const columns = Object.keys(firstRow);
    const insert = insertSql(qualifiedTable(catalog, table), columns, tableRows);
    if (insert.length > 0) {
      await execCatalogWarehouseSql(env, catalog, insert);
    }
  }

  for (const [documentId, pageCount] of Object.entries(options.pageCountByDocumentId)) {
    if (pageCount <= 0) {
      continue;
    }
    await execCatalogWarehouseSql(
      env,
      catalog,
      `UPDATE ${qualifiedTable(catalog, "documents")} SET ${quoteIdent("page_count")} = ${String(pageCount)} WHERE ${quoteIdent("document_id")} = ${escapeLiteral(documentId)};`,
    );
  }

  const entities = qualifiedTable(catalog, "document_entities");
  await execCatalogWarehouseSql(env, catalog, `DELETE FROM ${entities};`);

  const mentionTables = [
    "document_organization_mentions",
    "document_person_mentions",
    "document_topic_mentions",
    "document_legal_instrument_mentions",
  ] as const;
  const entityDocumentIds: string[] = [];
  for (const table of mentionTables) {
    for (const row of options.rows[table] ?? []) {
      const documentId = row.document_id;
      if (typeof documentId === "string" && documentId.length > 0) {
        entityDocumentIds.push(documentId);
      }
    }
  }
  if (entityDocumentIds.length > 0) {
    const values = entityDocumentIds.map((id) => `(${escapeLiteral(id)})`).join(",\n");
    await execCatalogWarehouseSql(
      env,
      catalog,
      `INSERT INTO ${entities} (${quoteIdent("document_id")}) VALUES\n${values};`,
    );
  }

  const countRows = await createCatalogWarehouseSqlExecutor({ env, catalog })(
    `SELECT COUNT(*) AS c FROM ${entities}`,
    [],
  );
  const countRaw = countRows[0]?.["c"];
  const entityRows =
    typeof countRaw === "number"
      ? countRaw
      : typeof countRaw === "bigint"
        ? Number(countRaw)
        : Number(countRaw ?? 0);

  return { entityRows: Number.isFinite(entityRows) ? entityRows : 0 };
}
