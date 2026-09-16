import type { DocumentCatalog, DomainVocabulary, ProfileReport, Proposal, SemanticModel, WorkspaceConfig } from "@backed/core";
import type { BurstUsage, SemanticModels } from "@backed/semantic";
import type { PipelineProgressReporter } from "./progress.js";

export interface PersistedPipelineArtifacts {
    vocabulary?: DomainVocabulary;
    documentCatalog?: DocumentCatalog;
    profile?: ProfileReport;
}

export interface IncrementalPipelineContext {
    existingModel: SemanticModel;
    previousProfile: ProfileReport;
    unknownSourceFiles: string[];
}

export interface PipelineStageTimings {
    ingestMs: number;
    documentsMs: number;
    extractionMs: number;
    embedMs: number;
    profileMs: number;
    proposalMs: number;
}

export interface PipelineStats extends PipelineStageTimings {
    llmUsage: BurstUsage;
    skippedLlm: boolean;
}

export interface RunAnchorPipelineOptions {
    workspaceDir: string;
    runId?: string;
    sourcesDir?: string;
    config?: Partial<WorkspaceConfig>;
    forceFull?: boolean;
    skipEmbed?: boolean;
    models?: SemanticModels;
    env?: Record<string, string | undefined>;
    progress?: PipelineProgressReporter;
    persistedArtifacts?: PersistedPipelineArtifacts;
    incrementalContext?: IncrementalPipelineContext;
}

export interface RunAnchorPipelineResult {
    runId: string;
    proposalPath: string;
    profilePath: string;
    proposal: Proposal;
    stats: PipelineStats;
}

export class MissingSemanticModelsError extends Error {
    constructor(cause: unknown) {
        super(cause instanceof Error ? cause.message : String(cause));
        this.name = "MissingSemanticModelsError";
    }
}
