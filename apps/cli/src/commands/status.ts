import { readIngestManifest } from "@trybacked/ingest";
import { pipelineStatus } from "@trybacked/pipeline";
import { listPublicationVersions } from "@trybacked/registry";
import { parseHelpOnlyArgs } from "../args.js";
import { COMMANDS, formatCliCommand } from "../config.js";
import { findWorkspaceRoot } from "../env.js";
import type { CommandHandler } from "../types.js";
import { initUi } from "../ui/index.js";

export const statusCommand: CommandHandler = async (args) => {
  const ui = initUi();
  const parsed = parseHelpOnlyArgs(args);
  if (parsed.help) {
    ui.log(`Usage: ${formatCliCommand(COMMANDS.STATUS)}`);
    return;
  }
  const root = findWorkspaceRoot(process.cwd());
  const ingest = readIngestManifest(root);
  const checkpoint = pipelineStatus(root);
  const versions = listPublicationVersions(root);
  ui.heading("Workspace status");
  ui.log(`Ingest files: ${ingest !== null ? String(ingest.files.length) : "none"}`);
  ui.log(
    `Pipeline checkpoint: ${checkpoint !== null ? `${checkpoint.runId} (${checkpoint.completedStages.join(", ")})` : "none"}`,
  );
  ui.log(`Registry versions: ${String(versions.length)}`);
};
