import { discoverFromProfile } from "@backed/discovery";
import { openDataSession } from "@backed/ingest";
import { profileTables } from "@backed/profile";
import { listDuckDbTableNames } from "@backed/provider-duckdb";
import type { Dataset, IngestSession } from "@backed/ingest";
import {
  createRunId,
  readWorkspaceConfig,
  workspacePaths,
  writeRunArtifact,
} from "@trybacked/core";
import { existsSync } from "node:fs";
import path from "node:path";
import { MS_PER_SECOND } from "./config.js";
import { noopProgressReporter } from "./progress.js";
import type { PipelineProgressReporter } from "./progress.js";

export interface RunDiscoverSnapshotOptions {
  workspaceDir: string;
  runId?: string;
  progress?: PipelineProgressReporter;
}

export interface RunDiscoverSnapshotResult {
  runId: string;
  profilePath: string;
  discoveryPath: string;
  stats: { profileMs: number };
}

function buildIngestSession(
  query: IngestSession["query"],
  tableNames: string[],
  dataPath: string,
  close: () => void,
): IngestSession {
  const datasets: Dataset[] = tableNames.map((tableName) => ({
    tableName,
    sourceFile: dataPath,
    format: "csv",
  }));
  return { query, datasets, warnings: [], close };
}

export async function runDiscoverFromSnapshot(
  options: RunDiscoverSnapshotOptions,
): Promise<RunDiscoverSnapshotResult> {
  const progress = options.progress ?? noopProgressReporter();
  const root = path.resolve(options.workspaceDir);
  const paths = workspacePaths(root);
  readWorkspaceConfig(root);

  if (!existsSync(paths.dataPath)) {
    throw new Error(`No DuckDB snapshot at ${paths.dataPath}. Run ingest once or use "backed discover" with sources.`);
  }

  const runId = options.runId ?? createRunId();
  progress.heading?.("Discover run (snapshot)");
  progress.step(`${runId} · profiling ${paths.dataPath}`);

  const session = await openDataSession(paths.dataPath);
  try {
    const tableNames = await listDuckDbTableNames(session.query);
    if (tableNames.length === 0) {
      throw new Error("DuckDB snapshot contains no tables.");
    }
    const ingestSession = buildIngestSession(
      session.query,
      tableNames,
      paths.dataPath,
      () => session.close(),
    );
    const profileStarted = Date.now();
    const profile = await profileTables(ingestSession);
    const profileMs = Date.now() - profileStarted;
    const profilePath = writeRunArtifact(root, runId, "profile", profile);
    progress.success(`Profile → ${profilePath}`);

    const discovery = discoverFromProfile(profile, { ontologyId: path.basename(root) });
    const discoveryPath = writeRunArtifact(root, runId, "discovery", discovery);
    progress.success(`Discovery → ${discoveryPath}`);
    progress.detail(
      `${String(discovery.ontology.objects.length)} object(s), ${String(discovery.ontology.relationships.length)} relationship(s) (proposed)`,
    );

    return { runId, profilePath, discoveryPath, stats: { profileMs } };
  } finally {
    session.close();
  }
}

export function formatDiscoverSnapshotDuration(ms: number): string {
  return `${String(Math.round(ms / MS_PER_SECOND))}s`;
}
