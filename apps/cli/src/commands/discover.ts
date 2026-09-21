import {
  formatDiscoverDatabricksDuration,
  formatDiscoverDuration,
  formatDiscoverSnapshotDuration,
  runDiscoverFromDatabricks,
  runDiscoverFromSnapshot,
  runDiscoverPipeline,
} from "@backed/runner";
import { existsSync } from "node:fs";
import path from "node:path";
import { commandErrorMessage, parseDiscoverArgs } from "../args.js";
import { findWorkspaceRoot } from "../env.js";
import { createCliPipelineProgress } from "../runner-progress.js";
import type { CommandHandler } from "../types.js";
import { initUi } from "../ui/index.js";

export const discoverCommand: CommandHandler = async (args) => {
  const ui = initUi();
  const root = findWorkspaceRoot(process.cwd());
  let parsed;
  try {
    parsed = parseDiscoverArgs(args);
  } catch (error) {
    ui.writeError(commandErrorMessage(error));
    process.exitCode = 1;
    return;
  }
  if (parsed.help) {
    ui.log("Usage: backed discover [sources-dir] [--snapshot | --databricks]");
    ui.log("  Default: ingest sources + profile + deterministic discovery (no LLM).");
    ui.log("  --snapshot   Profile existing .backed/data.duckdb without re-ingest.");
    ui.log("  --databricks Profile curated tables from Databricks SQL warehouse.");
    return;
  }
  const modeCount = Number(parsed.useSnapshot) + Number(parsed.useDatabricks);
  if (modeCount > 1) {
    ui.writeError("Choose only one of: sources-dir, --snapshot, --databricks.");
    process.exitCode = 1;
    return;
  }
  if (parsed.useSnapshot && parsed.sourcesDir !== undefined) {
    ui.writeError("Use either sources-dir or --snapshot, not both.");
    process.exitCode = 1;
    return;
  }
  if (parsed.useDatabricks && parsed.sourcesDir !== undefined) {
    ui.writeError("Use either sources-dir or --databricks, not both.");
    process.exitCode = 1;
    return;
  }
  if (parsed.sourcesDir !== undefined) {
    const absoluteSources = path.resolve(root, parsed.sourcesDir);
    if (!existsSync(absoluteSources)) {
      ui.writeError(`Sources folder not found: ${absoluteSources}`);
      process.exitCode = 1;
      return;
    }
  }
  try {
    const progress = createCliPipelineProgress(ui);
    if (parsed.useDatabricks) {
      const result = await runDiscoverFromDatabricks({
        workspaceDir: root,
        progress,
        env: process.env,
      });
      ui.blank();
      ui.writeSuccess(
        `Done in ${formatDiscoverDatabricksDuration(result.stats.profileMs)} · run ${result.runId}`,
      );
      return;
    }
    if (parsed.useSnapshot) {
      const result = await runDiscoverFromSnapshot({ workspaceDir: root, progress });
      ui.blank();
      ui.writeSuccess(
        `Done in ${formatDiscoverSnapshotDuration(result.stats.profileMs)} · run ${result.runId}`,
      );
      return;
    }
    const result = await runDiscoverPipeline({
      workspaceDir: root,
      ...(parsed.sourcesDir !== undefined ? { sourcesDir: parsed.sourcesDir } : {}),
      progress,
    });
    ui.blank();
    ui.writeSuccess(
      `Done in ${formatDiscoverDuration(result.stats.ingestMs + result.stats.profileMs)} · run ${result.runId}`,
    );
  } catch (error) {
    ui.writeError(commandErrorMessage(error));
    process.exitCode = 1;
  }
};
