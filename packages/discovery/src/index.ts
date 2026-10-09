export { inspectProfileReport } from "./inspect/inspect-profile.js";
export { inferPropertyType } from "./inspect/sql-type.js";
export { discoverFromProfile } from "./propose/discover-from-profile.js";
export type { DiscoverFromProfileOptions } from "./propose/discover-from-profile.js";
export {
  discoverFromDatasetProvider,
  profileFromDatasetProvider,
} from "./propose/discover-from-provider.js";
export {
  warehouseTableFqn,
  warehouseTableShortName,
  warehouseTableIdsMatch,
} from "./profile/warehouse-table-id.js";
export {
  profileWarehouseTables,
  normalizeProfileTableShortNames,
  type ProfileWarehouseTablesOptions,
  type ProfileWarehouseTablesResult,
} from "./profile/profile-warehouse-tables.js";
export {
  discoverDocsFromProfile,
  filterProfileForDocsDiscovery,
  runDocsWarehouseDiscovery,
  type RunDocsWarehouseDiscoveryOptions,
  type DocsWarehouseDiscoveryResult,
} from "./propose/docs-warehouse-discovery.js";
export { enrichProposalFromDiscovery } from "./propose/enrich-proposal.js";
export type { EnrichProposalFromDiscoveryResult } from "./propose/enrich-proposal.js";
export {
  collectProfileSamples,
  foreignKeyTypesCompatible,
  inferForeignKeyCandidates,
  inferProfileForeignKeys,
  isPrimaryKeyCandidateColumn,
  sampledColumnValues,
  withInferredForeignKeys,
  type SampledTable,
} from "./profile/infer-foreign-keys.js";
export { inferCardinality } from "./propose/infer-cardinality.js";
export { buildReviewQuestions, proposalFromDiscovery } from "./propose/proposal-from-discovery.js";
export type { ProposalFromDiscoveryOptions } from "./propose/proposal-from-discovery.js";
