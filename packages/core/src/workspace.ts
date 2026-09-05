/** Layout of the local workspace: .backed/, runs, artifact names, run ids. */

import path from "node:path";

import { z } from "zod";

import { DocumentTypeHintConfigSchema } from "./document-type-hints.js";

export const BACKED_DIR_NAME = ".backed";
export const CONFIG_FILE_NAME = "config.yaml";
export const RUNS_DIR_NAME = "runs";
export const MODEL_FILE_NAME = "model.yaml";
export const DATA_FILE_NAME = "data.duckdb";

export const RUN_ARTIFACTS = {
  profile: "profile.json",
  documents: "documents.json",
  proposal: "proposal.json",
  review: "review.json",
  diff: "diff.json",
} as const;

export type RunArtifactName = keyof typeof RUN_ARTIFACTS;

export const WorkspaceConfigSchema = z.object({
  sourcesDir: z.string().min(1),
  /** Filename slug rules for document classification. Set by `backed init`; edit before model runs. */
  documentTypeHints: z.array(DocumentTypeHintConfigSchema).default([]),
});

export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>;

export interface WorkspacePaths {
  root: string;
  backedDir: string;
  configPath: string;
  runsDir: string;
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
    modelPath: path.join(root, MODEL_FILE_NAME),
    dataPath: path.join(backedDir, DATA_FILE_NAME),
    runDir: (runId) => path.join(runsDir, runId),
    artifactPath: (runId, artifact) => path.join(runsDir, runId, RUN_ARTIFACTS[artifact]),
  };
}

/** Sortable run id: UTC timestamp + random suffix, e.g. 20260903T191233-4f2a. */
export function createRunId(now: Date = new Date()): string {
  const timestamp = now
    .toISOString()
    .replaceAll(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "");
  const suffix = Math.random().toString(16).slice(2, 6).padEnd(4, "0");
  return `${timestamp}-${suffix}`;
}
