import { existsSync } from "node:fs";
import path from "node:path";
import {
    createRunId,
    listRunIds,
    patchWorkspaceConfig,
    readWorkspaceConfig,
    workspacePaths,
    writeRunArtifact,
} from "@backed/core";
import type { DocumentCatalog, DomainVocabulary, Proposal } from "@backed/core";
import { ingestFolder } from "@backed/ingest";
import { profileTables } from "@backed/profile";
import {
    compressProfile,
    EMPTY_BURST_USAGE,
    mergeIncrementalProposal,
    proposeModel,
    splitTablesByKind,
} from "@backed/semantic";
import type { BurstUsage } from "@backed/semantic";
import { MS_PER_SECOND, PROPOSAL_ONTOLOGY_PREFIX } from "./config.js";
import { runDocumentStage } from "./pipeline/document-stage.js";
import { resolveIncrementalScope } from "./pipeline/incremental.js";
import { prepareLlmCache, resolveModels, resolveSourcesDir } from "./pipeline/setup.js";
import { resolveCatalogForInference } from "./tenant-persist-cache.js";
import { noopProgressReporter } from "./progress.js";
import type { PipelineStageTimings, RunAnchorPipelineOptions, RunAnchorPipelineResult } from "./types.js";

export async function runAnchorPipeline(options: RunAnchorPipelineOptions): Promise<RunAnchorPipelineResult> {
    const progress = options.progress ?? noopProgressReporter();
    const root = path.resolve(options.workspaceDir);
    const forceFull = options.forceFull ?? false;
    const skipEmbed = options.skipEmbed ?? false;
    if (options.config !== undefined) {
        patchWorkspaceConfig(root, options.config);
    }
    const sourcesDir = resolveSourcesDir(root, options.sourcesDir);
    const absoluteSources = path.resolve(root, sourcesDir);
    if (!existsSync(absoluteSources)) {
        throw new Error(`Sources folder not found: ${absoluteSources}`);
    }
    const runId = options.runId ?? createRunId();
    const previousRunIds = listRunIds(root);
    const previousRunId = previousRunIds.at(-1);
    progress.heading?.("Model run");
    progress.step(`${runId} · reading ${sourcesDir}`);
    const paths = workspacePaths(root);
    const workspaceConfig = readWorkspaceConfig(root);
    const timings: PipelineStageTimings = {
        ingestMs: 0,
        documentsMs: 0,
        extractionMs: 0,
        embedMs: 0,
        profileMs: 0,
        proposalMs: 0,
    };
    const ingestStarted = Date.now();
    const session = await ingestFolder(absoluteSources, { databasePath: paths.dataPath });
    timings.ingestMs = Date.now() - ingestStarted;
    try {
        if (session.datasets.length === 0) {
            throw new Error(`No readable tables found in "${sourcesDir}".`);
        }
        progress.step(`Tables: ${session.datasets.map((dataset) => dataset.tableName).join(", ")}`);
        const models = resolveModels(options);
        const llmCache = await prepareLlmCache(root, forceFull);
        const profileStarted = Date.now();
        let profile = await profileTables(session);
        timings.profileMs += Date.now() - profileStarted;
        const { lineDocuments } = splitTablesByKind(compressProfile(profile));
        const hasLineDocuments = lineDocuments.length > 0;
        let documentCatalog: DocumentCatalog | undefined;
        let vocabulary: DomainVocabulary | undefined;
        let extractionUsage: BurstUsage | undefined;
        if (hasLineDocuments && workspaceConfig.documentTypeHints.length === 0) {
            progress.warn("No documentTypeHints configured — every document may require LLM classification.");
        }
        if (hasLineDocuments) {
            const documentsStarted = Date.now();
            const documentStage = await runDocumentStage(
                session,
                models,
                runId,
                root,
                lineDocuments,
                workspaceConfig,
                skipEmbed,
                previousRunId,
                forceFull,
                llmCache,
                progress,
                options.persistedArtifacts?.vocabulary,
                options.persistedArtifacts?.documentCatalog,
                options.incrementalContext?.unknownSourceFiles,
            );
            timings.documentsMs = Date.now() - documentsStarted;
            timings.extractionMs = documentStage.extractionMs;
            timings.embedMs = documentStage.embedMs;
            documentCatalog = documentStage.documentCatalog;
            vocabulary = documentStage.vocabulary;
            extractionUsage = documentStage.extractionUsage;
            const reprofileStarted = Date.now();
            profile = await profileTables(session);
            timings.profileMs += Date.now() - reprofileStarted;
        }
        const profilePath = writeRunArtifact(root, runId, "profile", profile);
        progress.success(`Profile → ${profilePath}`);
        const catalogForInference = resolveCatalogForInference(
            documentCatalog,
            options.persistedArtifacts?.documentCatalog,
        );
        const incrementalScope = options.incrementalContext !== undefined
            ? resolveIncrementalScope(
                root,
                profile,
                previousRunId,
                forceFull,
                options.incrementalContext.previousProfile,
                options.incrementalContext.existingModel,
                options.incrementalContext.unknownSourceFiles,
                catalogForInference,
            )
            : resolveIncrementalScope(
                root,
                profile,
                previousRunId,
                forceFull,
                options.persistedArtifacts?.profile,
                undefined,
                undefined,
                catalogForInference,
            );
        const proposalStarted = Date.now();
        const freshProposal = await proposeModel({
            profile: incrementalScope.profileForInference,
            runId,
            models,
            llmCache,
            ...(catalogForInference !== undefined ? { documentCatalog: catalogForInference } : {}),
            ...(vocabulary !== undefined ? { vocabulary } : {}),
            ...(extractionUsage !== undefined ? { extractionUsage } : {}),
            onProgress: (message) => {
                if (message.startsWith(PROPOSAL_ONTOLOGY_PREFIX)) {
                    progress.indeterminate?.(message);
                    return;
                }
                progress.detail(message);
            },
            onBatchProgress: ({ completed, total }) => {
                progress.track?.("Column classification (LLM)", completed, total);
            },
        });
        timings.proposalMs = Date.now() - proposalStarted;
        const proposal: Proposal = incrementalScope.incrementalTables !== null && incrementalScope.existingModel !== null
            ? mergeIncrementalProposal(freshProposal, incrementalScope.existingModel, incrementalScope.incrementalTables, profile)
            : freshProposal;
        const proposalPath = writeRunArtifact(root, runId, "proposal", proposal);
        progress.success(`Proposal → ${proposalPath}`);
        const llmUsage = proposal.usage ?? EMPTY_BURST_USAGE;
        return {
            runId,
            proposalPath,
            profilePath,
            proposal,
            stats: {
                ...timings,
                llmUsage,
                skippedLlm: false,
            },
        };
    }
    finally {
        session.close();
    }
}

export function formatPipelineDuration(ms: number): string {
    return `${String(Math.round(ms / MS_PER_SECOND))}s`;
}
