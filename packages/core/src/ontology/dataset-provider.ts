/**
 * Provider-agnostic dataset access contract.
 * Anchor core depends on this interface only — not on DuckDB, warehouses, or ingest.
 */

export type DatasetIdentifier = {
  /** Stable id within the provider (table name, dataset FQN, etc.). */
  id: string;
  /** Optional human label. */
  name?: string;
};

export type Dataset = DatasetIdentifier & {
  description?: string;
};

export type DatasetColumn = {
  name: string;
  /** Provider-native or normalized logical type name. */
  type: string;
  nullable: boolean;
  primaryKeyCandidate?: boolean;
  foreignKeyCandidate?: boolean;
};

export type DatasetSchema = {
  columns: DatasetColumn[];
  primaryKey?: string[];
};

export type DatasetMetadata = {
  rowCount?: number;
  upstreamProvenance?: string;
  tags?: Record<string, string>;
};

export type DatasetColumnStatistics = {
  name: string;
  nullCount?: number;
  distinctCount?: number;
  min?: string;
  max?: string;
};

export type DatasetStatistics = {
  columns: DatasetColumnStatistics[];
};

export type SampleOptions = {
  limit?: number;
  columns?: string[];
};

export type DatasetSample = {
  columns: string[];
  rows: unknown[][];
};

/** Adapter implemented by DuckDB, Postgres, Databricks, etc. */
export interface DatasetProvider {
  listDatasets(): Promise<Dataset[]>;
  getSchema(dataset: DatasetIdentifier): Promise<DatasetSchema>;
  getMetadata(dataset: DatasetIdentifier): Promise<DatasetMetadata>;
  getStatistics(dataset: DatasetIdentifier): Promise<DatasetStatistics>;
  sample?(dataset: DatasetIdentifier, options?: SampleOptions): Promise<DatasetSample>;
}
