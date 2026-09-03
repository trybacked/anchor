import { existsSync } from "node:fs";
import path from "node:path";

import { createRunId, initWorkspace, readWorkspaceConfig, writeRunArtifact } from "@backed/core";
import type { Proposal } from "@backed/core";
import { ingestFolder } from "@backed/ingest";
import { profileTables } from "@backed/profile";
import { MissingApiKeyError, proposeModel, resolveSemanticModels } from "@backed/semantic";

import type { CommandHandler } from "../types.js";

function resolveSourcesDir(root: string, positional: string | undefined): string {
  if (positional) {
    // A folder passed explicitly also (re)initializes the workspace config.
    initWorkspace(root, { sourcesDir: positional });
    return positional;
  }
  return readWorkspaceConfig(root).sourcesDir;
}

function printProposalSummary(proposal: Proposal): void {
  console.log(
    `Model proposal: ${String(proposal.entities.length)} entities, ${String(proposal.relations.length)} relations, ${String(proposal.rules.length)} rules.`,
  );
  if (proposal.doubts.length > 0) {
    console.log(`Doubts declared by the model: ${String(proposal.doubts.length)}`);
  }
  if (proposal.usage) {
    const cost = proposal.usage.costUsd !== null ? ` (~$${proposal.usage.costUsd.toFixed(4)})` : "";
    console.log(
      `Tokens: ${String(proposal.usage.inputTokens)} in / ${String(proposal.usage.outputTokens)} out${cost}`,
    );
  }
  console.log(
    `Review questions selected: ${String(proposal.questions.length)}. Next step: "backed review".`,
  );
}

export const modelCommand: CommandHandler = async (args) => {
  const root = process.cwd();
  const positional = args.find((arg) => !arg.startsWith("--"));

  const sourcesDir = resolveSourcesDir(root, positional);
  const absoluteSources = path.resolve(root, sourcesDir);
  if (!existsSync(absoluteSources)) {
    console.error(`Sources folder not found: ${absoluteSources}`);
    process.exitCode = 1;
    return;
  }

  const runId = createRunId();
  console.log(`Run ${runId} — profiling sources in "${sourcesDir}"...`);

  const session = await ingestFolder(absoluteSources);
  try {
    if (session.datasets.length === 0) {
      console.error(`No readable tables found in "${sourcesDir}".`);
      process.exitCode = 1;
      return;
    }

    console.log(
      `Tables found: ${session.datasets.map((dataset) => dataset.tableName).join(", ")}`,
    );
    for (const warning of session.warnings) {
      console.log(`  Warning [${warning.file}]: ${warning.message}`);
    }

    const profile = await profileTables(session);
    const profilePath = writeRunArtifact(root, runId, "profile", profile);
    console.log(`Profile saved: ${profilePath}`);

    let models;
    try {
      models = resolveSemanticModels();
    } catch (error) {
      if (error instanceof MissingApiKeyError) {
        console.error(error.message);
        process.exitCode = 1;
        return;
      }
      throw error;
    }

    console.log("Running semantic inference (agentic bursts)...");
    const proposal = await proposeModel({ profile, runId, models });
    const proposalPath = writeRunArtifact(root, runId, "proposal", proposal);
    console.log(`Proposal saved: ${proposalPath}`);
    printProposalSummary(proposal);
  } finally {
    session.close();
  }
};
