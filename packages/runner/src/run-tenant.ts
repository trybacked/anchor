import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import {
    applyReview,
    createRunId,
    DEFAULT_SOURCES_DIR,
    DEFAULT_WORKSPACE_CONFIG,
    writeWorkspaceConfig,
    readModelYaml,
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
import { createTenantWorkspace, type TenantWorkspace } from "./tenant-workspace.js";
import type { PipelineStats, RunAnchorPipelineResult } from "./types.js";

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

export async function runTenantPipeline(options: RunTenantPipelineOptions): Promise<RunTenantPipelineResult> {
    const progress = options.progress ?? noopProgressReporter();
    const workspace = await createTenantWorkspace(options.dataRoot, options.tenantId);
    const prepared = prepareFiles(options.files);
    const ledger = await openHashLedger(workspace.paths.ledgerPath);
    const { unknown } = partitionFilesByLedger(prepared, ledger);
    const allKnown = unknown.length === 0 && prepared.length > 0;
    const runId = options.runId ?? createRunId();
    let pipelineResult: RunAnchorPipelineResult | undefined;
    let stats: PipelineStats;
    try {
        if (allKnown && !options.forceFull && existsSync(workspace.paths.modelPath)) {
            progress.step("All submitted files already processed — skipping inference");
            const existingModel = readModelYaml(workspace.paths.persistDir);
            stats = SKIPPED_PIPELINE_STATS;
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
        await copySources(workspace.paths.sourcesDir, prepared);
        const config: WorkspaceConfig = WorkspaceConfigSchema.parse({
            ...DEFAULT_WORKSPACE_CONFIG,
            ...options.config,
        });
        writeWorkspaceConfig(workspace.paths.workDir, config);
        pipelineResult = await runAnchorPipeline({
            workspaceDir: workspace.paths.workDir,
            runId,
            sourcesDir: DEFAULT_SOURCES_DIR,
            config,
            ...(options.forceFull !== undefined ? { forceFull: options.forceFull } : {}),
            ...(options.skipEmbed !== undefined ? { skipEmbed: options.skipEmbed } : {}),
            ...(options.env !== undefined ? { env: options.env } : {}),
            progress,
        });
        const model = proposalToPersistedModel(pipelineResult.proposal, options.env);
        await persistModel(workspace, serializeModelYaml(model));
        await writeFile(
            workspace.paths.proposalPath,
            `${JSON.stringify(pipelineResult.proposal, null, JSON_PRETTY_INDENT)}\n`,
            "utf8",
        );
        for (const file of prepared) {
            await ledger.record(file.contentHash, pipelineResult.runId);
        }
        stats = {
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
        await collectGarbage(workspace.paths, runId);
        throw error;
    }
}
