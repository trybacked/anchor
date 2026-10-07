import { DEFAULT_REVIEW_CONFIDENCE_THRESHOLD, type DatasetProvider } from "@trybacked/core";
import {
  enrichProposalFromDiscovery,
  runDocsWarehouseDiscovery,
  type DocsWarehouseDiscoveryResult,
  type RunDocsWarehouseDiscoveryOptions,
} from "@trybacked/discovery";
import type { LanguageModel } from "ai";
import { collectDocsTableSamples } from "./collect-samples.js";
import { extractOntologyWithLlm } from "./extract-with-llm.js";
import { mergeOntologyExtractIntoProposal } from "./merge-extract.js";

export type RunDocsAiOntologyDiscoveryOptions = RunDocsWarehouseDiscoveryOptions & {
  catalog: string;
  schema?: string;
  localeHint?: string | undefined;
  model: LanguageModel;
  reviewConfidenceThreshold?: number;
};

export type DocsAiOntologyDiscoveryResult = DocsWarehouseDiscoveryResult & {
  proposal: DocsWarehouseDiscoveryResult["proposal"];
  aiUsage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  sampleTableCount: number;
};

export async function runDocsAiOntologyDiscovery(
  provider: DatasetProvider,
  options: RunDocsAiOntologyDiscoveryOptions,
): Promise<DocsAiOntologyDiscoveryResult> {
  const schema = options.schema ?? "docs";
  const threshold = options.reviewConfidenceThreshold ?? DEFAULT_REVIEW_CONFIDENCE_THRESHOLD;
  const baseline = await runDocsWarehouseDiscovery(provider, options);
  const profiledTables = baseline.profile
    .filter((table) => table.rowCount > 0)
    .map((table) => table.table);
  const samples = await collectDocsTableSamples(provider, {
    catalog: options.catalog,
    schema,
    tables: profiledTables,
  });
  const extracted = await extractOntologyWithLlm({
    model: options.model,
    profile: baseline.profile,
    proposal: baseline.proposal,
    samples,
    localeHint: options.localeHint,
  });
  const merged = mergeOntologyExtractIntoProposal(baseline.proposal, extracted.output, {
    reviewConfidenceThreshold: threshold,
  });
  const enriched = enrichProposalFromDiscovery(merged, baseline.discovery);
  const usageCost = {
    inputTokens: extracted.usage.inputTokens,
    outputTokens: extracted.usage.outputTokens,
    costUsd: null as number | null,
  };
  return {
    ...baseline,
    proposal: {
      ...enriched.proposal,
      usage: usageCost,
    },
    aiUsage: extracted.usage,
    sampleTableCount: samples.length,
  };
}
