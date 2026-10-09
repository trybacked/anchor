import { DEFAULT_REVIEW_CONFIDENCE_THRESHOLD, type DatasetProvider } from "@trybacked/core";
import {
  discoverFromProfile,
  enrichProposalFromDiscovery,
  proposalFromDiscovery,
  profileFromDatasetProvider,
  type DiscoverFromProfileOptions,
  type ProposalFromDiscoveryOptions,
} from "@trybacked/discovery";
import type { LanguageModel } from "ai";
import { collectProfileDatasetSamples } from "./collect-samples.js";
import { extractOntologyWithLlm } from "./extract-with-llm.js";
import { mergeOntologyExtractIntoProposal } from "./merge-extract.js";
import type { DocsAiOntologyDiscoveryResult } from "./run-docs-ai-discovery.js";

export type RunFilesAiOntologyDiscoveryOptions = DiscoverFromProfileOptions &
  ProposalFromDiscoveryOptions & {
    localeHint?: string | undefined;
    model: LanguageModel;
    reviewConfidenceThreshold?: number;
  };

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
  const profile = await profileFromDatasetProvider(provider);
  const emptyTables = profile.filter((table) => table.rowCount === 0).map((table) => table.table);
  const discovery = discoverFromProfile(profile, {
    ontologyId: options.ontologyId,
    ...(options.version !== undefined ? { version: options.version } : {}),
  });
  const baselineProposal = proposalFromDiscovery(discovery, {
    runId: options.runId,
    ...(options.generatedAt !== undefined ? { generatedAt: options.generatedAt } : {}),
    reviewConfidenceThreshold: threshold,
  });
  const sampleTargets = profile
    .filter((table) => table.rowCount > 0)
    .map((table) => ({ table: table.table, datasetId: table.table }));
  const samples = await collectProfileDatasetSamples(provider, sampleTargets);
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
