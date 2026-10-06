import {
  DEFAULT_REVIEW_CONFIDENCE_THRESHOLD,
  type AuthoringCommand,
  type DiscoveryReport,
  type Proposal,
  type Review,
  applyReview,
} from "@trybacked/core";
import { runDocsWarehouseDiscovery } from "@trybacked/discovery";
import {
  createGatewayLanguageModel,
  createOntologyExtractModelFromEnv,
  runDocsAiOntologyDiscovery,
} from "@trybacked/ontology-extract";
import type { DatasetProvider } from "@trybacked/core";
import {
  applyCommands,
  chunkAuthoringCommands,
  commandsFromReviewedDiscovery,
  validateDiscoveryReview,
} from "@trybacked/ontology-authoring";
import type { SemanticModel } from "@trybacked/core";

export type DocsDiscoveryPreflightError =
  | { code: "docs_schema_empty"; message: string; missingTables: string[]; emptyTables: string[] }
  | { code: "docs_tables_empty"; message: string; missingTables: string[]; emptyTables: string[] };

export type DocsDiscoveryPreflightOk = {
  profileTableCount: number;
  missingTables: string[];
  emptyTables: string[];
  discovery: DiscoveryReport;
  proposal: Proposal;
};

export type DocsAiDiscoveryPreflightOk = DocsDiscoveryPreflightOk & {
  aiUsage: { inputTokens: number; outputTokens: number; totalTokens: number };
  sampleTableCount: number;
};

export async function proposeDocsAiWarehouseDiscovery(
  provider: DatasetProvider,
  env: NodeJS.ProcessEnv,
  input: {
    tenantId: string;
    catalog: string;
    runId: string;
    reviewConfidenceThreshold?: number;
    tables?: readonly string[];
    requireNonEmptyTables?: boolean;
    locale?: string | undefined;
  },
): Promise<DocsAiDiscoveryPreflightOk | DocsDiscoveryPreflightError | { code: "ai_not_configured" }> {
  const modelConfig = createOntologyExtractModelFromEnv(env);
  if (modelConfig === undefined) {
    return { code: "ai_not_configured" };
  }
  const model = createGatewayLanguageModel(modelConfig.apiKey, modelConfig.modelId);
  const aiResult = await runDocsAiOntologyDiscovery(provider, {
    ontologyId: input.tenantId,
    catalog: input.catalog,
    runId: input.runId,
    model,
    ...(input.reviewConfidenceThreshold !== undefined
      ? { reviewConfidenceThreshold: input.reviewConfidenceThreshold }
      : {}),
    ...(input.tables !== undefined ? { tables: input.tables } : {}),
    ...(input.locale !== undefined ? { localeHint: input.locale } : {}),
  });
  if (aiResult.profile.length === 0) {
    return {
      code: "docs_schema_empty",
      message:
        "No curated docs tables found in the warehouse. Upload PDFs and run docs_refresh first.",
      missingTables: aiResult.missingTables,
      emptyTables: aiResult.emptyTables,
    };
  }
  const profiledNonEmpty = aiResult.profile.filter((table) => table.rowCount > 0);
  if (input.requireNonEmptyTables !== false && profiledNonEmpty.length === 0) {
    return {
      code: "docs_tables_empty",
      message:
        "Docs tables exist but contain no rows yet. Upload files and run docs_refresh before proposing entities.",
      missingTables: aiResult.missingTables,
      emptyTables: aiResult.emptyTables,
    };
  }
  return {
    profileTableCount: aiResult.profile.length,
    missingTables: aiResult.missingTables,
    emptyTables: aiResult.emptyTables,
    discovery: aiResult.discovery,
    proposal: aiResult.proposal,
    aiUsage: aiResult.aiUsage,
    sampleTableCount: aiResult.sampleTableCount,
  };
}

export async function proposeDocsWarehouseDiscovery(
  provider: DatasetProvider,
  input: {
    tenantId: string;
    catalog: string;
    runId: string;
    reviewConfidenceThreshold?: number;
    tables?: readonly string[];
    requireNonEmptyTables?: boolean;
  },
): Promise<DocsDiscoveryPreflightOk | DocsDiscoveryPreflightError> {
  const result = await runDocsWarehouseDiscovery(provider, {
    ontologyId: input.tenantId,
    catalog: input.catalog,
    runId: input.runId,
    reviewConfidenceThreshold:
      input.reviewConfidenceThreshold ?? DEFAULT_REVIEW_CONFIDENCE_THRESHOLD,
    ...(input.tables !== undefined ? { tables: input.tables } : {}),
  });

  if (result.profile.length === 0) {
    return {
      code: "docs_schema_empty",
      message:
        "No curated docs tables found in the warehouse. Upload PDFs and run docs_refresh first.",
      missingTables: result.missingTables,
      emptyTables: result.emptyTables,
    };
  }

  const profiledNonEmpty = result.profile.filter((table) => table.rowCount > 0);
  if (input.requireNonEmptyTables !== false && profiledNonEmpty.length === 0) {
    return {
      code: "docs_tables_empty",
      message:
        "Docs tables exist but contain no rows yet. Upload files and run docs_refresh before proposing entities.",
      missingTables: result.missingTables,
      emptyTables: result.emptyTables,
    };
  }

  return {
    profileTableCount: result.profile.length,
    missingTables: result.missingTables,
    emptyTables: result.emptyTables,
    discovery: result.discovery,
    proposal: result.proposal,
  };
}

export type BuildDiscoveryReviewResult = {
  staleAnswerCount: number;
  unansweredQuestionIds: string[];
  commands: AuthoringCommand[];
  reviewedModel: SemanticModel;
};

export function buildDiscoveryReviewCommands(
  draft: SemanticModel,
  proposal: Proposal,
  review: Review,
  options: {
    reviewConfidenceThreshold?: number;
    includeRelations?: boolean;
    requireCompleteReview?: boolean;
  } = {},
): BuildDiscoveryReviewResult | { code: "review_incomplete"; unansweredQuestionIds: string[] } {
  const validation = validateDiscoveryReview(proposal, review);
  if (
    options.requireCompleteReview === true &&
    validation.unansweredQuestionIds.length > 0
  ) {
    return {
      code: "review_incomplete",
      unansweredQuestionIds: validation.unansweredQuestionIds,
    };
  }
  const { model: reviewedModel, staleAnswerCount } = applyReview(proposal, review, new Date(), {
    reviewConfidenceThreshold:
      options.reviewConfidenceThreshold ?? DEFAULT_REVIEW_CONFIDENCE_THRESHOLD,
  });
  const commands = commandsFromReviewedDiscovery(draft, reviewedModel, {
    includeRelations: options.includeRelations ?? true,
  });
  return {
    staleAnswerCount,
    unansweredQuestionIds: validation.unansweredQuestionIds,
    commands,
    reviewedModel,
  };
}

export function applyAuthoringCommandBatches(
  draft: SemanticModel,
  commands: AuthoringCommand[],
): SemanticModel {
  let model = draft;
  for (const batch of chunkAuthoringCommands(commands)) {
    model = applyCommands(model, batch);
  }
  return model;
}
