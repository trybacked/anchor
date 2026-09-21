import {
  appendAuditEvents,
  buildRollbackAuditEvent,
  listPublicationVersions,
  readPublicationRecord,
  rollbackPublication,
} from "@trybacked/core";
import { findWorkspaceRoot } from "../env.js";
import { defaultReviewer } from "../reviewer.js";
import type { CommandHandler } from "../types.js";
import { initUi } from "../ui/index.js";

function parseVersionArg(args: string[]): number | undefined {
  const positional = args.find((arg) => !arg.startsWith("-"));
  if (positional === undefined) {
    return undefined;
  }
  const version = Number(positional);
  if (!Number.isInteger(version) || version <= 0) {
    throw new Error(`Invalid publication version: ${positional}`);
  }
  return version;
}

export const rollbackCommand: CommandHandler = (args) => {
  const ui = initUi();
  const root = findWorkspaceRoot(process.cwd());
  const versions = listPublicationVersions(root);
  if (versions.length === 0) {
    ui.writeError('No published ontology versions. Run "backed publish" first.');
    process.exitCode = 1;
    return;
  }

  let targetVersion: number;
  try {
    const requested = parseVersionArg(args);
    if (requested !== undefined) {
      targetVersion = requested;
    } else {
      const current = readPublicationRecord(root)?.version;
      const sorted = versions.map((entry) => entry.version).sort((a, b) => b - a);
      const fallback = sorted.find((version) => version !== current) ?? sorted[0];
      if (fallback === undefined) {
        throw new Error("No previous publication version to roll back to.");
      }
      targetVersion = fallback;
    }
  } catch (error) {
    ui.writeError(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  try {
    const before = readPublicationRecord(root);
    const record = rollbackPublication(root, targetVersion);
    const actorId = defaultReviewer();
    appendAuditEvents(root, [
      buildRollbackAuditEvent({
        runId: record.runId,
        recordedAt: new Date().toISOString(),
        fromVersion: before?.version ?? targetVersion,
        toVersion: record.version,
        ...(actorId !== undefined ? { actor: { id: actorId } } : {}),
      }),
    ]);
    ui.heading("Rollback publication");
    ui.writeSuccess(`Active publication is now v${String(record.version)}`);
  } catch (error) {
    ui.writeError(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
};
