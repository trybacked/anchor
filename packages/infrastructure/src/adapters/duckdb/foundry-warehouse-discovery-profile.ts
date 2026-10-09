import type { ProfileReport, TableProfile } from "@trybacked/core";
import { existsSync } from "node:fs";
import { createCatalogWarehouseSqlExecutor, resolveTenantWarehouseDuckDbPath } from "./catalog-warehouse.js";
import { applyFoundryForeignKeyHints } from "./foundry-profile-foreign-keys.js";
import { FOUNDRY_WAREHOUSE_TABLE_DDL } from "./materialize-foundry.js";

const DOCS_SCHEMA = "docs";
const SAMPLE_LIMIT = 12;

const DISCOVERY_TABLES = [...Object.keys(FOUNDRY_WAREHOUSE_TABLE_DDL), "document_entities"];

function quoteIdent(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function qualifiedTable(catalog: string, table: string): string {
  return `${quoteIdent(catalog)}.${quoteIdent(DOCS_SCHEMA)}.${quoteIdent(table)}`;
}

function sqlTypeFromValue(value: unknown): string {
  if (typeof value === "number") {
    return Number.isInteger(value) ? "BIGINT" : "DOUBLE";
  }
  if (typeof value === "boolean") {
    return "BOOLEAN";
  }
  return "VARCHAR";
}

function buildTableProfile(
  table: string,
  catalog: string,
  rows: Record<string, unknown>[],
): TableProfile | null {
  if (rows.length === 0) {
    return null;
  }
  const columnNames = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const rowCount = rows.length;
  return {
    table,
    sourceFile: `${catalog}.${DOCS_SCHEMA}.${table}`,
    rowCount,
    columns: columnNames.map((name) => {
      const values = rows.map((row) => row[name]);
      const nullCount = values.filter((value) => value === null || value === undefined).length;
      const distinct = new Set(
        values.filter((value) => value !== null && value !== undefined).map(String),
      );
      const sample = values.find((value) => value !== null && value !== undefined);
      return {
        name,
        sqlType: sqlTypeFromValue(sample),
        nullCount,
        nullRatio: rowCount === 0 ? 0 : nullCount / rowCount,
        distinctCount: distinct.size,
        min: null,
        max: null,
        topValues: [],
        patterns: [],
        foreignKeyCandidates: [],
      };
    }),
  };
}

export type FoundryWarehouseDiscoverySamples = {
  table: string;
  columns: string[];
  rows: string[][];
};

export type FoundryWarehouseDiscoveryProfile = {
  profile: ProfileReport;
  samples: FoundryWarehouseDiscoverySamples[];
};

export async function loadFoundryWarehouseDiscoveryProfile(options: {
  env: NodeJS.ProcessEnv;
  catalog: string;
}): Promise<FoundryWarehouseDiscoveryProfile | undefined> {
  const tenantDbPath = resolveTenantWarehouseDuckDbPath(options.env, options.catalog);
  if (!existsSync(tenantDbPath)) {
    return undefined;
  }
  const executor = createCatalogWarehouseSqlExecutor({
    env: options.env,
    catalog: options.catalog,
  });
  const profile: ProfileReport = [];
  const samples: FoundryWarehouseDiscoverySamples[] = [];

  for (const table of DISCOVERY_TABLES) {
    const qualified = qualifiedTable(options.catalog, table);
    let countRows: Record<string, unknown>[];
    try {
      countRows = await executor(`SELECT COUNT(*) AS row_count FROM ${qualified}`, []);
    } catch {
      continue;
    }
    const rowCountRaw = countRows[0]?.row_count;
    const rowCount =
      typeof rowCountRaw === "number"
        ? rowCountRaw
        : typeof rowCountRaw === "bigint"
          ? Number(rowCountRaw)
          : Number(rowCountRaw ?? 0);
    if (!Number.isFinite(rowCount) || rowCount <= 0) {
      continue;
    }
    let sampleRows: Record<string, unknown>[];
    try {
      sampleRows = await executor(`SELECT * FROM ${qualified} LIMIT ${String(SAMPLE_LIMIT)}`, []);
    } catch {
      continue;
    }
    const tableProfile = buildTableProfile(table, options.catalog, sampleRows);
    if (tableProfile === null) {
      continue;
    }
    profile.push({ ...tableProfile, rowCount });
    const columns = tableProfile.columns.map((column) => column.name);
    samples.push({
      table,
      columns,
      rows: sampleRows.map((row) =>
        columns.map((column) => {
          const value = row[column];
          if (value === null || value === undefined) {
            return "";
          }
          return String(value);
        }),
      ),
    });
  }

  if (profile.length === 0) {
    return undefined;
  }
  const profileWithKeys = applyFoundryForeignKeyHints(profile);
  return { profile: profileWithKeys, samples };
}
