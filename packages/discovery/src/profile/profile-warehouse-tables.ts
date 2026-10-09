import type { DatasetProvider, ProfileReport, TableProfile } from "@trybacked/core";
import { collectProfileSamples, inferProfileForeignKeys } from "./infer-foreign-keys.js";
import { warehouseTableFqn, warehouseTableShortName } from "./warehouse-table-id.js";

export type ProfileWarehouseTablesOptions = {
  catalog: string;
  schema: string;

  tables: readonly string[];
};

export type ProfileWarehouseTablesResult = {
  profile: ProfileReport;

  missingTables: string[];

  emptyTables: string[];
};

function datasetId(options: ProfileWarehouseTablesOptions, shortName: string): string {
  return warehouseTableFqn(options.catalog, options.schema, shortName);
}

export async function profileWarehouseTables(
  provider: DatasetProvider,
  options: ProfileWarehouseTablesOptions,
): Promise<ProfileWarehouseTablesResult> {
  const profile: TableProfile[] = [];
  const missingTables: string[] = [];
  const emptyTables: string[] = [];
  const datasetIdByTable = new Map<string, string>();

  for (const shortName of options.tables) {
    const id = datasetId(options, shortName);
    let schema;
    let metadata;
    let statistics;
    try {
      [schema, metadata, statistics] = await Promise.all([
        provider.getSchema({ id }),
        provider.getMetadata({ id }),
        provider.getStatistics({ id }),
      ]);
    } catch {
      missingTables.push(shortName);
      continue;
    }
    const rowCount = metadata.rowCount ?? 0;
    if (rowCount === 0) {
      emptyTables.push(shortName);
    }
    datasetIdByTable.set(shortName, id);
    const statsByName = new Map(statistics.columns.map((column) => [column.name, column]));
    profile.push({
      table: shortName,
      sourceFile: id,
      rowCount,
      columns: schema.columns.map((column) => {
        const stats = statsByName.get(column.name);
        const distinctCount = stats?.distinctCount ?? 0;
        const nullCount = stats?.nullCount ?? 0;
        return {
          name: column.name,
          sqlType: column.type,
          nullCount,
          nullRatio: rowCount === 0 ? 0 : nullCount / rowCount,
          distinctCount,
          min: stats?.min ?? null,
          max: stats?.max ?? null,
          topValues: [],
          patterns: [],
          foreignKeyCandidates: [],
        };
      }),
    });
  }

  const samples = await collectProfileSamples(
    provider,
    profile
      .filter((table) => table.rowCount > 0)
      .map((table) => ({
        table: table.table,
        datasetId: datasetIdByTable.get(table.table) ?? table.sourceFile,
      })),
  );
  return {
    profile: samples.size > 0 ? inferProfileForeignKeys(profile, samples) : profile,
    missingTables,
    emptyTables,
  };
}

export function normalizeProfileTableShortNames(profile: ProfileReport): ProfileReport {
  return profile.map((table) => ({
    ...table,
    table: warehouseTableShortName(table.table),
    sourceFile: table.sourceFile.includes(".")
      ? table.sourceFile
      : warehouseTableShortName(table.sourceFile),
  }));
}
