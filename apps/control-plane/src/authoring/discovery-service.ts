import {
  DEFAULT_REVIEW_CONFIDENCE_THRESHOLD,
  type AuthoringCommand,
  type DiscoveryReport,
  type Proposal,
  type Review,
  applyReview,
} from "@trybacked/core";
import type { DatasetProvider } from "@trybacked/core";
import type { SemanticModel } from "@trybacked/core";
import {
  discoverFromDatasetProvider,
  proposalFromDiscovery,
  profileFromDatasetProvider,
  runDocsWarehouseDiscovery,
} from "@trybacked/discovery";
import {
  applyCommands,
  chunkAuthoringCommands,
  commandsFromReviewedDiscovery,
  validateDiscoveryReview,
} from "@trybacked/ontology-authoring";
import {
  resolveFoundryWarehouseDiscoveryProfile,
  type FoundryWarehouseDiscoveryProfile,
} from "@trybacked/infrastructure";
import { fetchWarehouseDiscoveryProfileFromPlatform } from "./warehouse-discovery-profile-fetch.js";
import {
  createGatewayLanguageModel,
  createOntologyExtractModelFromEnv,
  runDocsAiOntologyDiscovery,
  runFilesAiOntologyDiscovery,
} from "@trybacked/ontology-extract";

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
): Promise<
  DocsAiDiscoveryPreflightOk | DocsDiscoveryPreflightError | { code: "ai_not_configured" }
> {
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
        "No document archive tables found in the warehouse. Provision curated document datasets via your data platform first.",
      missingTables: aiResult.missingTables,
      emptyTables: aiResult.emptyTables,
    };
  }
  const profiledNonEmpty = aiResult.profile.filter((table) => table.rowCount > 0);
  if (input.requireNonEmptyTables !== false && profiledNonEmpty.length === 0) {
    return {
      code: "docs_tables_empty",
      message:
        "Document archive tables exist but contain no rows yet. Load data via your data platform before proposing entities.",
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
        "No document archive tables found in the warehouse. Provision curated document datasets via your data platform first.",
      missingTables: result.missingTables,
      emptyTables: result.emptyTables,
    };
  }

  const profiledNonEmpty = result.profile.filter((table) => table.rowCount > 0);
  if (input.requireNonEmptyTables !== false && profiledNonEmpty.length === 0) {
    return {
      code: "docs_tables_empty",
      message:
        "Document archive tables exist but contain no rows yet. Load data via your data platform before proposing entities.",
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

export type FilesDiscoveryPreflightError = {
  code: "files_empty";
  message: string;
};

export type FilesDiscoveryPreflightOk = {
  profileTableCount: number;
  missingTables: string[];
  emptyTables: string[];
  discovery: DiscoveryReport;
  proposal: Proposal;
};

export async function proposeDocsAiFilesSourceDiscovery(
  provider: DatasetProvider,
  env: NodeJS.ProcessEnv,
  input: {
    tenantId: string;
    catalog: string;
    runId: string;
    reviewConfidenceThreshold?: number;
    locale?: string | undefined;
    filesRegistryRoot?: string | undefined;
  },
): Promise<
  DocsAiDiscoveryPreflightOk | FilesDiscoveryPreflightError | { code: "ai_not_configured" }
> {
  const modelConfig = createOntologyExtractModelFromEnv(env);
  if (modelConfig === undefined) {
    return { code: "ai_not_configured" };
  }
  const warehouseEnv =
    input.filesRegistryRoot !== undefined && input.filesRegistryRoot.length > 0
      ? { ...env, BACKED_FILES_REGISTRY_ROOT: input.filesRegistryRoot }
      : env;
  let warehouse: FoundryWarehouseDiscoveryProfile | undefined =
    await resolveFoundryWarehouseDiscoveryProfile({
      env: warehouseEnv,
      tenantId: input.tenantId,
      catalog: input.catalog,
    });
  if (warehouse === undefined) {
    const platformBase = env["PLATFORM_API_INTERNAL_URL"]?.trim();
    const platformToken = env["ANCHOR_API_TOKEN"]?.trim();
    if (
      platformBase !== undefined &&
      platformBase.length > 0 &&
      platformToken !== undefined &&
      platformToken.length > 0
    ) {
      try {
        warehouse = await fetchWarehouseDiscoveryProfileFromPlatform({
          baseUrl: platformBase,
          tenantId: input.tenantId,
          bearerToken: platformToken,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(
          `[discovery] warehouse profile fetch skipped (unexpected): tenant=${input.tenantId} reason=${reason}`,
        );
        warehouse = undefined;
      }
    }
  }
  const model = createGatewayLanguageModel(modelConfig.apiKey, modelConfig.modelId);
  const aiResult = await runFilesAiOntologyDiscovery(provider, {
    ontologyId: input.tenantId,
    runId: input.runId,
    model,
    ...(warehouse !== undefined
      ? {
          warehouseProfile: warehouse.profile,
          warehouseSamples: warehouse.samples,
          catalog: input.catalog,
        }
      : {}),
    ...(input.reviewConfidenceThreshold !== undefined
      ? { reviewConfidenceThreshold: input.reviewConfidenceThreshold }
      : {}),
    ...(input.locale !== undefined ? { localeHint: input.locale } : {}),
  });
  if (aiResult.profile.length === 0) {
    return {
      code: "files_empty",
      message:
        "No file collections found. Add subfolders with documents under the tenant file source root.",
    };
  }
  const profiledNonEmpty = aiResult.profile.filter((table) => table.rowCount > 0);
  if (profiledNonEmpty.length === 0) {
    return {
      code: "files_empty",
      message:
        "No file collections found. Add subfolders with documents under the tenant file source root.",
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

export async function proposeFilesSourceDiscovery(
  provider: DatasetProvider,
  input: {
    tenantId: string;
    runId: string;
    reviewConfidenceThreshold?: number;
  },
): Promise<FilesDiscoveryPreflightOk | FilesDiscoveryPreflightError> {
  const profile = await profileFromDatasetProvider(provider);
  if (profile.length === 0) {
    return {
      code: "files_empty",
      message:
        "No file collections found. Add subfolders with documents under the tenant file source root.",
    };
  }
  const resolvedDiscovery = await discoverFromDatasetProvider(provider, {
    ontologyId: input.tenantId,
  });
  const proposal = proposalFromDiscovery(resolvedDiscovery, {
    runId: input.runId,
    reviewConfidenceThreshold:
      input.reviewConfidenceThreshold ?? DEFAULT_REVIEW_CONFIDENCE_THRESHOLD,
  });
  return {
    profileTableCount: profile.length,
    missingTables: [],
    emptyTables: profile.filter((table) => table.rowCount === 0).map((table) => table.table),
    discovery: resolvedDiscovery,
    proposal,
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
  if (options.requireCompleteReview === true && validation.unansweredQuestionIds.length > 0) {
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
