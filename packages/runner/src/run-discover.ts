import { discoverFromProfile } from "@backed/discovery";
import { ingestFolder } from "@backed/ingest";
import { profileTables } from "@backed/profile";
import {
  createRunId,
  patchWorkspaceConfig,
  readWorkspaceConfig,
  workspacePaths,
  writeRunArtifact,
} from "@trybacked/core";
import { existsSync } from "node:fs";
import path from "node:path";
import { MS_PER_SECOND } from "./config.js";
import { resolveSourcesDir } from "./pipeline/setup.js";
import { noopProgressReporter } from "./progress.js";
import type { RunAnchorPipelineOptions } from "./types.js";

export interface RunDiscoverPipelineResult {
  runId: string;
  profilePath: string;
  discoveryPath: string;
  stats: {
    ingestMs: number;
    profileMs: number;
  };
}

export async function runDiscoverPipeline(
  options: Pick<
    RunAnchorPipelineOptions,
    "workspaceDir" | "sourcesDir" | "config" | "runId" | "progress"
  >,
): Promise<RunDiscoverPipelineResult> {
  const progress = options.progress ?? noopProgressReporter();
  const root = path.resolve(options.workspaceDir);
  if (options.config !== undefined) {
    patchWorkspaceConfig(root, options.config);
  }
  const sourcesDir = resolveSourcesDir(root, options.sourcesDir);
  const absoluteSources = path.resolve(root, sourcesDir);
  if (!existsSync(absoluteSources)) {
    throw new Error(`Sources folder not found: ${absoluteSources}`);
  }
  const runId = options.runId ?? createRunId();
  progress.heading?.("Discover run");
  progress.step(`${runId} · reading ${sourcesDir}`);
  const paths = workspacePaths(root);
  readWorkspaceConfig(root);

  const ingestStarted = Date.now();
  const session = await ingestFolder(absoluteSources, { databasePath: paths.dataPath });
  const ingestMs = Date.now() - ingestStarted;
  try {
    if (session.datasets.length === 0) {
      throw new Error(`No readable tables found in "${sourcesDir}".`);
    }
    progress.step(`Tables: ${session.datasets.map((dataset) => dataset.tableName).join(", ")}`);
    const profileStarted = Date.now();
    const profile = await profileTables(session);
    const profileMs = Date.now() - profileStarted;
    const profilePath = writeRunArtifact(root, runId, "profile", profile);
    progress.success(`Profile → ${profilePath}`);

    const discovery = discoverFromProfile(profile, { ontologyId: path.basename(root) });
    const discoveryPath = writeRunArtifact(root, runId, "discovery", discovery);
    progress.success(`Discovery → ${discoveryPath}`);
    progress.detail(
      `${String(discovery.ontology.objects.length)} object(s), ${String(discovery.ontology.relationships.length)} relationship(s) (proposed)`,
    );

    return {
      runId,
      profilePath,
      discoveryPath,
      stats: { ingestMs, profileMs },
    };
  } finally {
    session.close();
  }
}

export function formatDiscoverDuration(ms: number): string {
  return `${String(Math.round(ms / MS_PER_SECOND))}s`;
}
