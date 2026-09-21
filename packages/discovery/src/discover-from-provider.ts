import type { DatasetProvider, DiscoveryReport, ProfileReport, TableProfile } from "@trybacked/core";
import { PIPELINE_INFRA_DATASET_TABLE_NAMES } from "@trybacked/core";
import { discoverFromProfile, type DiscoverFromProfileOptions } from "./discover-from-profile.js";

const INFRA_TABLES = new Set<string>(PIPELINE_INFRA_DATASET_TABLE_NAMES);

/** Builds a minimal profile from provider metadata (no FK overlap analysis). */
export async function profileFromDatasetProvider(provider: DatasetProvider): Promise<ProfileReport> {
  const datasets = await provider.listDatasets();
  const tables: TableProfile[] = [];

  for (const dataset of datasets) {
    if (INFRA_TABLES.has(dataset.id)) {
      continue;
    }
    const [schema, metadata, statistics] = await Promise.all([
      provider.getSchema(dataset),
      provider.getMetadata(dataset),
      provider.getStatistics(dataset),
    ]);
    const statsByName = new Map(statistics.columns.map((column) => [column.name, column]));
    const rowCount = metadata.rowCount ?? 0;
    tables.push({
      table: dataset.id,
      sourceFile: metadata.upstreamProvenance ?? dataset.id,
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

  return tables;
}

export async function discoverFromDatasetProvider(
  provider: DatasetProvider,
  options: DiscoverFromProfileOptions,
): Promise<DiscoveryReport> {
  const profile = await profileFromDatasetProvider(provider);
  return discoverFromProfile(profile, options);
}
