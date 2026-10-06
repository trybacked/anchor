import {
  DOCS_ONTOLOGY_DISCOVERY_TABLE_NAMES,
  type DiscoveryReport,
  type ProfileReport,
  type Proposal,
} from "@trybacked/core";
import type { DatasetProvider } from "@trybacked/core";
import {
  normalizeProfileTableShortNames,
  profileWarehouseTables,
  type ProfileWarehouseTablesResult,
} from "../profile/profile-warehouse-tables.js";
import { warehouseTableShortName } from "../profile/warehouse-table-id.js";
import { discoverFromProfile, type DiscoverFromProfileOptions } from "./discover-from-profile.js";
import {
  proposalFromDiscovery,
  type ProposalFromDiscoveryOptions,
} from "./proposal-from-discovery.js";

const DOCS_INFRA_INCLUDE = new Set<string>(["document_entities", "entity_profiles"]);

export type RunDocsWarehouseDiscoveryOptions = DiscoverFromProfileOptions &
  ProposalFromDiscoveryOptions & {
    catalog: string;
    schema?: string;
    tables?: readonly string[];
  };

export type DocsWarehouseDiscoveryResult = ProfileWarehouseTablesResult & {
  discovery: DiscoveryReport;
  proposal: Proposal;
};

export async function runDocsWarehouseDiscovery(
  provider: DatasetProvider,
  options: RunDocsWarehouseDiscoveryOptions,
): Promise<DocsWarehouseDiscoveryResult> {
  const schema = options.schema ?? "docs";
  const tables = options.tables ?? DOCS_ONTOLOGY_DISCOVERY_TABLE_NAMES;
  const profiled = await profileWarehouseTables(provider, {
    catalog: options.catalog,
    schema,
    tables,
  });
  const profile = normalizeProfileTableShortNames(profiled.profile);
  const discovery = discoverFromProfile(profile, {
    ontologyId: options.ontologyId,
    ...(options.version !== undefined ? { version: options.version } : {}),
    includeInfraTables: DOCS_INFRA_INCLUDE,
  });
  const proposal = proposalFromDiscovery(discovery, {
    runId: options.runId,
    ...(options.generatedAt !== undefined ? { generatedAt: options.generatedAt } : {}),
    ...(options.reviewConfidenceThreshold !== undefined
      ? { reviewConfidenceThreshold: options.reviewConfidenceThreshold }
      : {}),
  });
  return {
    ...profiled,
    discovery,
    proposal,
  };
}

export function filterProfileForDocsDiscovery(
  profile: ProfileReport,
  tables: readonly string[] = DOCS_ONTOLOGY_DISCOVERY_TABLE_NAMES,
): { profile: ProfileReport; missingTables: string[] } {
  const wanted = new Set(tables.map((name) => warehouseTableShortName(name)));
  const present = new Set(profile.map((table) => warehouseTableShortName(table.table)));
  const missingTables = [...wanted].filter((name) => !present.has(name));
  return {
    profile: profile.filter((table) => wanted.has(warehouseTableShortName(table.table))),
    missingTables,
  };
}

/** @deprecated Prefer {@link runDocsWarehouseDiscovery}. */
export function discoverDocsFromProfile(
  profile: ProfileReport,
  options: RunDocsWarehouseDiscoveryOptions,
): Omit<DocsWarehouseDiscoveryResult, "emptyTables"> & { missingTables: string[] } {
  const tables = options.tables ?? DOCS_ONTOLOGY_DISCOVERY_TABLE_NAMES;
  const filtered = filterProfileForDocsDiscovery(normalizeProfileTableShortNames(profile), tables);
  const discovery = discoverFromProfile(filtered.profile, {
    ontologyId: options.ontologyId,
    ...(options.version !== undefined ? { version: options.version } : {}),
    includeInfraTables: DOCS_INFRA_INCLUDE,
  });
  const proposal = proposalFromDiscovery(discovery, {
    runId: options.runId,
    ...(options.generatedAt !== undefined ? { generatedAt: options.generatedAt } : {}),
    ...(options.reviewConfidenceThreshold !== undefined
      ? { reviewConfidenceThreshold: options.reviewConfidenceThreshold }
      : {}),
  });
  return {
    profile: filtered.profile,
    missingTables: filtered.missingTables,
    discovery,
    proposal,
  };
}
