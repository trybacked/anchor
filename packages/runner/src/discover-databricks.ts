import { discoverFromDatasetProvider, profileFromDatasetProvider } from "@backed/discovery";
import { createDatabricksProviderFromEnv } from "@backed/provider-databricks";
import { createRunId, writeRunArtifact } from "@trybacked/core";
import path from "node:path";
import { MS_PER_SECOND } from "./config.js";
import { noopProgressReporter } from "./progress.js";
import type { PipelineProgressReporter } from "./progress.js";

export interface RunDiscoverDatabricksOptions {
  workspaceDir: string;
  runId?: string;
  progress?: PipelineProgressReporter;
  env?: Record<string, string | undefined>;
}

export interface RunDiscoverDatabricksResult {
  runId: string;
  profilePath: string;
  discoveryPath: string;
  stats: { profileMs: number };
}

export async function runDiscoverFromDatabricks(
  options: RunDiscoverDatabricksOptions,
): Promise<RunDiscoverDatabricksResult> {
  const progress = options.progress ?? noopProgressReporter();
  const root = path.resolve(options.workspaceDir);
  const runId = options.runId ?? createRunId();
  progress.heading?.("Discover run (Databricks)");
  progress.step(`${runId} · listing tables from Databricks SQL warehouse`);

  const { provider } = createDatabricksProviderFromEnv(options.env ?? process.env);
  const profileStarted = Date.now();
  const profile = await profileFromDatasetProvider(provider);
  const profileMs = Date.now() - profileStarted;
  if (profile.length === 0) {
    throw new Error("No datasets returned from Databricks. Check catalog/schema env vars.");
  }

  const profilePath = writeRunArtifact(root, runId, "profile", profile);
  progress.success(`Profile → ${profilePath}`);

  const discovery = await discoverFromDatasetProvider(provider, { ontologyId: path.basename(root) });
  const discoveryPath = writeRunArtifact(root, runId, "discovery", discovery);
  progress.success(`Discovery → ${discoveryPath}`);
  progress.detail(
    `${String(discovery.ontology.objects.length)} object(s), ${String(discovery.ontology.relationships.length)} relationship(s) (proposed)`,
  );

  return { runId, profilePath, discoveryPath, stats: { profileMs } };
}

export function formatDiscoverDatabricksDuration(ms: number): string {
  return `${String(Math.round(ms / MS_PER_SECOND))}s`;
}
