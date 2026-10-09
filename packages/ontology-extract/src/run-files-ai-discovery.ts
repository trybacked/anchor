import { DEFAULT_REVIEW_CONFIDENCE_THRESHOLD, type DatasetProvider } from "@trybacked/core";
import {
  discoverFromProfile,
  DOCS_WAREHOUSE_INFRA_INCLUDE,
  enrichProposalFromDiscovery,
  inferProfileForeignKeys,
  proposalFromDiscovery,
  profileFromDatasetProvider,
  type DiscoverFromProfileOptions,
  type ProposalFromDiscoveryOptions,
} from "@trybacked/discovery";
import type { DatasetSample } from "@trybacked/core";
import type { LanguageModel } from "ai";
import type { ProfileReport } from "@trybacked/core";
import { collectProfileDatasetSamples, type DocTableSample } from "./collect-samples.js";
import { extractOntologyWithLlm } from "./extract-with-llm.js";
import { mergeOntologyExtractIntoProposal } from "./merge-extract.js";
import type { DocsAiOntologyDiscoveryResult } from "./run-docs-ai-discovery.js";

export type RunFilesAiOntologyDiscoveryOptions = DiscoverFromProfileOptions &
  ProposalFromDiscoveryOptions & {
    localeHint?: string | undefined;
    model: LanguageModel;
    reviewConfidenceThreshold?: number;
    warehouseProfile?: ProfileReport | undefined;
    warehouseSamples?: readonly DocTableSample[] | undefined;
  };

function mergeProfileReports(
  primary: ProfileReport,
  supplemental: ProfileReport | undefined,
): ProfileReport {
  if (supplemental === undefined || supplemental.length === 0) {
    return primary;
  }
  const byTable = new Map<string, ProfileReport[number]>();
  for (const table of supplemental) {
    byTable.set(table.table, table);
  }
  for (const table of primary) {
    if (!byTable.has(table.table)) {
      byTable.set(table.table, table);
    }
  }
  return [...byTable.values()];
}

function samplesMapFromDocTableSamples(
  samples: readonly DocTableSample[],
): Map<string, DatasetSample> {
  const map = new Map<string, DatasetSample>();
  for (const sample of samples) {
    map.set(sample.table, {
      columns: [...sample.columns],
      rows: sample.rows.map((row) => [...row]),
    });
  }
  return map;
}

export async function runFilesAiOntologyDiscovery(
  provider: DatasetProvider,
  options: RunFilesAiOntologyDiscoveryOptions,
): Promise<
  DocsAiOntologyDiscoveryResult & {
    missingTables: string[];
    emptyTables: string[];
  }
> {
  const threshold = options.reviewConfidenceThreshold ?? DEFAULT_REVIEW_CONFIDENCE_THRESHOLD;
  const fileProfile = await profileFromDatasetProvider(provider);
  const warehouseMerged =
    options.warehouseProfile !== undefined && options.warehouseProfile.length > 0;
  let profile = mergeProfileReports(fileProfile, options.warehouseProfile);
  const emptyTables = profile.filter((table) => table.rowCount === 0).map((table) => table.table);
  if (warehouseMerged && options.warehouseSamples !== undefined && options.warehouseSamples.length > 0) {
    profile = inferProfileForeignKeys(
      profile,
      samplesMapFromDocTableSamples(options.warehouseSamples),
    );
  }
  const discovery = discoverFromProfile(profile, {
    ontologyId: options.ontologyId,
    ...(options.version !== undefined ? { version: options.version } : {}),
    ...(warehouseMerged ? { includeInfraTables: DOCS_WAREHOUSE_INFRA_INCLUDE } : {}),
  });
  const baselineProposal = proposalFromDiscovery(discovery, {
    runId: options.runId,
    ...(options.generatedAt !== undefined ? { generatedAt: options.generatedAt } : {}),
    reviewConfidenceThreshold: threshold,
  });
  const sampleTargets = profile
    .filter((table) => table.rowCount > 0)
    .map((table) => ({ table: table.table, datasetId: table.table }));
  const fileSamples = await collectProfileDatasetSamples(provider, sampleTargets);
  const samples = [...(options.warehouseSamples ?? []), ...fileSamples];
  const extracted = await extractOntologyWithLlm({
    model: options.model,
    profile,
    proposal: baselineProposal,
    samples,
    localeHint: options.localeHint,
  });
  const merged = mergeOntologyExtractIntoProposal(baselineProposal, extracted.output, {
    reviewConfidenceThreshold: threshold,
  });
  const enriched = enrichProposalFromDiscovery(merged, discovery);
  const usageCost = {
    inputTokens: extracted.usage.inputTokens,
    outputTokens: extracted.usage.outputTokens,
    costUsd: null as number | null,
  };
  return {
    profile,
    missingTables: [],
    emptyTables,
    discovery,
    proposal: {
      ...enriched.proposal,
      usage: usageCost,
    },
    aiUsage: extracted.usage,
    sampleTableCount: samples.length,
  };
}
