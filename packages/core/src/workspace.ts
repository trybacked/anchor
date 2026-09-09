import path from "node:path";
import { z } from "zod";
import { DocumentTypeHintConfigSchema } from "./document-type-hints.js";
import { DomainVocabularySchema } from "./domain.js";
export const DEFAULT_SOURCES_DIR = "./sources";
export const BACKED_DIR_NAME = ".backed";
export const CONFIG_FILE_NAME = "config.yaml";
export const RUNS_DIR_NAME = "runs";
export const MODEL_FILE_NAME = "model.yaml";
export const DATA_FILE_NAME = "data.duckdb";
const RUN_ID_ISO_MILLIS_SUFFIX_PATTERN = /\.\d{3}Z$/;
const RUN_ID_RANDOM_SUFFIX_START = 2;
const RUN_ID_RANDOM_SUFFIX_END = 6;
const RUN_ID_RANDOM_SUFFIX_PAD_LENGTH = 4;
export const RUN_ARTIFACTS = {
    profile: "profile.json",
    documents: "documents.json",
    vocabulary: "vocabulary.json",
    proposal: "proposal.json",
    review: "review.json",
    diff: "diff.json",
} as const;
export type RunArtifactName = keyof typeof RUN_ARTIFACTS;
export const WorkspaceConfigSchema = z.object({
    sourcesDir: z.string().min(1),
    documentTypeHints: z.array(DocumentTypeHintConfigSchema).default([]),
    domain: DomainVocabularySchema.partial().optional(),
});
export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>;
export interface WorkspacePaths {
    root: string;
    backedDir: string;
    configPath: string;
    runsDir: string;
    llmCacheDir: string;
    modelPath: string;
    dataPath: string;
    runDir: (runId: string) => string;
    artifactPath: (runId: string, artifact: RunArtifactName) => string;
}
export function workspacePaths(root: string): WorkspacePaths {
    const backedDir = path.join(root, BACKED_DIR_NAME);
    const runsDir = path.join(backedDir, RUNS_DIR_NAME);
    return {
        root,
        backedDir,
        configPath: path.join(backedDir, CONFIG_FILE_NAME),
        runsDir,
        llmCacheDir: path.join(backedDir, "cache", "llm"),
        modelPath: path.join(root, MODEL_FILE_NAME),
        dataPath: path.join(backedDir, DATA_FILE_NAME),
        runDir: (runId) => path.join(runsDir, runId),
        artifactPath: (runId, artifact) => path.join(runsDir, runId, RUN_ARTIFACTS[artifact]),
    };
}
export function createRunId(now: Date = new Date()): string {
    const timestamp = now
        .toISOString()
        .replaceAll(/[-:]/g, "")
        .replace(RUN_ID_ISO_MILLIS_SUFFIX_PATTERN, "");
    const suffix = Math.random()
        .toString(16)
        .slice(RUN_ID_RANDOM_SUFFIX_START, RUN_ID_RANDOM_SUFFIX_END)
        .padEnd(RUN_ID_RANDOM_SUFFIX_PAD_LENGTH, "0");
    return `${timestamp}-${suffix}`;
}
