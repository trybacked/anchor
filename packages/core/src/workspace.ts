import path from "node:path";
import { z } from "zod";
export const BACKED_DIR_NAME = ".backed";
export const CONFIG_FILE_NAME = "config.yaml";
export const RUNS_DIR_NAME = "runs";
export const MODEL_FILE_NAME = "model.yaml";
const RUN_ID_ISO_MILLIS_SUFFIX_PATTERN = /\.\d{3}Z$/;
const RUN_ID_RANDOM_SUFFIX_START = 2;
const RUN_ID_RANDOM_SUFFIX_END = 6;
const RUN_ID_RANDOM_SUFFIX_PAD_LENGTH = 4;
export const RUN_ARTIFACTS = {
  profile: "profile.json",
  discovery: "discovery.json",
  lifecycle: "lifecycle.json",
  audit: "audit.json",
  proposal: "proposal.json",
  review: "review.json",
  diff: "diff.json",
} as const;
/**
 *
 */
export type RunArtifactName = keyof typeof RUN_ARTIFACTS;
export const WorkspaceConfigSchema = z.object({
  /** Ontology identifier; defaults to the workspace folder name when omitted. */
  ontologyId: z.string().min(1).optional(),
});
/**
 *
 */
export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>;
export const DEFAULT_WORKSPACE_CONFIG: WorkspaceConfig = {};
/**
 *
 */
export interface WorkspacePaths {
  root: string;
  backedDir: string;
  configPath: string;
  runsDir: string;
  modelPath: string;
  runDir: (runId: string) => string;
  artifactPath: (runId: string, artifact: RunArtifactName) => string;
}
/** Resolves standard `.backed/` workspace paths for a project root. */
export function workspacePaths(root: string): WorkspacePaths {
  const backedDir = path.join(root, BACKED_DIR_NAME);
  const runsDir = path.join(backedDir, RUNS_DIR_NAME);
  return {
    root,
    backedDir,
    configPath: path.join(backedDir, CONFIG_FILE_NAME),
    runsDir,
    modelPath: path.join(root, MODEL_FILE_NAME),
    runDir: (runId) => path.join(runsDir, runId),
    artifactPath: (runId, artifact) => path.join(runsDir, runId, RUN_ARTIFACTS[artifact]),
  };
}
/** Creates a time-sortable run identifier with a random suffix. */
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
