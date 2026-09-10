import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import {
    applyReview,
    createRunId,
    DEFAULT_SOURCES_DIR,
    DEFAULT_WORKSPACE_CONFIG,
    DocumentCatalogSchema,
    DomainVocabularySchema,
    writeWorkspaceConfig,
    parseModelYaml,
    ProfileReportSchema,
    readRunArtifact,
    serializeModelYaml,
    WorkspaceConfigSchema,
} from "@backed/core";
import type { Proposal, SemanticModel, WorkspaceConfig } from "@backed/core";
import { resolveReviewConfidenceThreshold } from "@backed/semantic";
import { JSON_PRETTY_INDENT, SKIPPED_PIPELINE_STATS } from "./config.js";
import { collectGarbage, type DeletionLogEntry } from "./gc.js";
import { hashContent } from "./file-hash.js";
import { openHashLedger, partitionFilesByLedger } from "./hash-ledger.js";
import { noopProgressReporter, type PipelineProgressReporter } from "./progress.js";
import { runAnchorPipeline } from "./run.js";
import {
    loadTenantPersistedArtifacts,
    persistTenantDocumentCatalog,
    persistTenantProfile,
    persistTenantVocabulary,
} from "./tenant-persist-cache.js";
import { TenantPipelineError } from "./tenant-pipeline-error.js";
import { createTenantWorkspace, type TenantWorkspace } from "./tenant-workspace.js";
import type { PipelineStats, RunAnchorPipelineResult } from "./types.js";

export { TenantPipelineError } from "./tenant-pipeline-error.js";

export interface TenantInputFile {
    fileName: string;
    content: Buffer;
}

export interface PreparedTenantFile extends TenantInputFile {
    contentHash: string;
}

export interface RunTenantPipelineOptions {
    dataRoot: string;
    tenantId: string;
    runId?: string;
    files: TenantInputFile[];
    config?: Partial<WorkspaceConfig>;
    forceFull?: boolean;
    skipEmbed?: boolean;
    env?: Record<string, string | undefined>;
    progress?: PipelineProgressReporter;
}

export interface RunTenantPipelineResult {
    runId: string;
    tenantId: string;
    skipped: boolean;
    modelPath: string;
    stats: PipelineStats;
    pipeline?: RunAnchorPipelineResult;
    deletionEntry: DeletionLogEntry;
}

function sanitizeFileName(fileName: string): string {
    const base = path.basename(fileName);
    if (base.length === 0 || base === "." || base === "..") {
        throw new Error(`Invalid upload file name: ${fileName}`);
    }
    return base;
}

function prepareFiles(files: TenantInputFile[]): PreparedTenantFile[] {
    return files.map((file) => ({
        fileName: sanitizeFileName(file.fileName),
        content: file.content,
        contentHash: hashContent(file.content),
    }));
}

async function copySources(sourcesDir: string, files: PreparedTenantFile[]): Promise<void> {
    await mkdir(sourcesDir, { recursive: true });
    for (const file of files) {
        await writeFile(path.join(sourcesDir, file.fileName), file.content);
    }
}

function proposalToPersistedModel(proposal: Proposal, env?: Record<string, string | undefined>): SemanticModel {
    const { model } = applyReview(proposal, {
        runId: proposal.runId,
        answeredAt: new Date().toISOString(),
        answers: [],
    }, new Date(), {
        reviewConfidenceThreshold: resolveReviewConfidenceThreshold(env ?? process.env),
    });
    return model;
}

async function persistModel(workspace: TenantWorkspace, modelYaml: string): Promise<string> {
    await mkdir(workspace.paths.persistDir, { recursive: true });
    await writeFile(workspace.paths.modelPath, modelYaml, "utf8");
    return workspace.paths.modelPath;
}

async function readPersistedModel(modelPath: string): Promise<SemanticModel> {
    return parseModelYaml(await readFile(modelPath, "utf8"));
}

async function persistPipelineArtifacts(
    workspace: TenantWorkspace,
    pipelineResult: RunAnchorPipelineResult,
): Promise<void> {
    await mkdir(workspace.paths.persistDir, { recursive: true });
    try {
        const vocabulary = readRunArtifact(
            workspace.paths.workDir,
            pipelineResult.runId,
            "vocabulary",
            DomainVocabularySchema,
        );
        await persistTenantVocabulary(workspace.paths.persistDir, vocabulary);
    }
    catch {
        // no document stage in this run
    }
    try {
        const documentCatalog = readRunArtifact(
            workspace.paths.workDir,
            pipelineResult.runId,
            "documents",
            DocumentCatalogSchema,
        );
        await persistTenantDocumentCatalog(workspace.paths.persistDir, documentCatalog);
    }
    catch {
        // no document stage in this run
    }
    try {
        const profile = existsSync(pipelineResult.profilePath)
            ? ProfileReportSchema.parse(JSON.parse(await readFile(pipelineResult.profilePath, "utf8")) as unknown)
            : readRunArtifact(workspace.paths.workDir, pipelineResult.runId, "profile", ProfileReportSchema);
        await persistTenantProfile(workspace.paths.persistDir, profile);
    }
    catch {
        // profile unavailable
    }
}

export async function runTenantPipeline(options: RunTenantPipelineOptions): Promise<RunTenantPipelineResult> {
    const progress = options.progress ?? noopProgressReporter();
    const workspace = await createTenantWorkspace(options.dataRoot, options.tenantId);
    const prepared = prepareFiles(options.files);
    if (prepared.length === 0) {
        throw new Error("At least one file is required");
    }
    const ledger = await openHashLedger(workspace.paths.ledgerPath);
    const { known, unknown } = partitionFilesByLedger(prepared, ledger);
    const runId = options.runId ?? createRunId();
    const hasExistingModel = existsSync(workspace.paths.modelPath);
    const allKnown = unknown.length === 0 && !options.forceFull;
    const filesToProcess = options.forceFull ? prepared : unknown;
    try {
        if (allKnown && hasExistingModel) {
            progress.step("All submitted files already processed — skipping inference");
            const existingModel = await readPersistedModel(workspace.paths.modelPath);
            const stats = SKIPPED_PIPELINE_STATS;
            await copySources(workspace.paths.sourcesDir, prepared);
            await persistModel(workspace, serializeModelYaml(existingModel));
            const gc = await collectGarbage(workspace.paths, runId);
            return {
                runId,
                tenantId: workspace.tenantId,
                skipped: true,
                modelPath: workspace.paths.modelPath,
                stats,
                deletionEntry: gc.entry,
            };
        }
        if (filesToProcess.length === 0) {
            throw new Error("No new files to process");
        }
        await copySources(workspace.paths.sourcesDir, filesToProcess);
        const config: WorkspaceConfig = WorkspaceConfigSchema.parse({
            ...DEFAULT_WORKSPACE_CONFIG,
            ...options.config,
        });
        writeWorkspaceConfig(workspace.paths.workDir, config);
        const persistedArtifacts = options.forceFull
            ? undefined
            : await loadTenantPersistedArtifacts(workspace.paths.persistDir);
        const existingModel = hasExistingModel && !options.forceFull
            ? await readPersistedModel(workspace.paths.modelPath)
            : undefined;
        const pipelineResult = await runAnchorPipeline({
            workspaceDir: workspace.paths.workDir,
            runId,
            sourcesDir: DEFAULT_SOURCES_DIR,
            config,
            ...(options.forceFull !== undefined ? { forceFull: options.forceFull } : {}),
            ...(options.skipEmbed !== undefined ? { skipEmbed: options.skipEmbed } : {}),
            ...(options.env !== undefined ? { env: options.env } : {}),
            ...(persistedArtifacts !== undefined ? { persistedArtifacts } : {}),
            ...(existingModel !== undefined && persistedArtifacts?.profile !== undefined
                ? {
                    incrementalContext: {
                        existingModel,
                        previousProfile: persistedArtifacts.profile,
                        unknownSourceFiles: filesToProcess.map((file) => file.fileName),
                    },
                }
                : {}),
            progress,
        });
        await persistPipelineArtifacts(workspace, pipelineResult);
        const proposal = pipelineResult.proposal;
        const model = proposalToPersistedModel(proposal, options.env);
        await persistModel(workspace, serializeModelYaml(model));
        await writeFile(
            workspace.paths.proposalPath,
            `${JSON.stringify(proposal, null, JSON_PRETTY_INDENT)}\n`,
            "utf8",
        );
        for (const file of filesToProcess) {
            await ledger.record(file.contentHash, runId);
        }
        const stats: PipelineStats = {
            ...pipelineResult.stats,
            skippedLlm: false,
        };
        const gc = await collectGarbage(workspace.paths, runId);
        return {
            runId,
            tenantId: workspace.tenantId,
            skipped: false,
            modelPath: workspace.paths.modelPath,
            stats,
            pipeline: pipelineResult,
            deletionEntry: gc.entry,
        };
    }
    catch (error) {
        const gc = await collectGarbage(workspace.paths, runId);
        if (error instanceof TenantPipelineError) {
            throw error;
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new TenantPipelineError(message, gc.entry, {
            ...(error instanceof Error ? { cause: error } : {}),
        });
    }
}
