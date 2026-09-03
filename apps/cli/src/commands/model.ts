import { existsSync } from "node:fs";
import path from "node:path";

import { createRunId, initWorkspace, readWorkspaceConfig, writeRunArtifact } from "@backed/core";
import type { Proposal } from "@backed/core";
import { ingestFolder } from "@backed/ingest";
import { profileTables } from "@backed/profile";
import { MissingApiKeyError, proposeModel, resolveSemanticModels } from "@backed/semantic";

import type { CommandHandler } from "../types.js";

const NO_LLM_FLAG = "--no-llm";

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
    `Proposta di modello: ${String(proposal.entities.length)} entità, ${String(proposal.relations.length)} relazioni, ${String(proposal.rules.length)} regole.`,
  );
  if (proposal.doubts.length > 0) {
    console.log(`Dubbi dichiarati dal modello: ${String(proposal.doubts.length)}`);
  }
  if (proposal.usage) {
    const cost = proposal.usage.costUsd !== null ? ` (~$${proposal.usage.costUsd.toFixed(4)})` : "";
    console.log(
      `Token: ${String(proposal.usage.inputTokens)} in / ${String(proposal.usage.outputTokens)} out${cost}`,
    );
  }
  console.log(
    `Domande di review selezionate: ${String(proposal.questions.length)}. Prossimo passo: "backed review".`,
  );
}

export const modelCommand: CommandHandler = async (args) => {
  const root = process.cwd();
  const noLlm = args.includes(NO_LLM_FLAG);
  const positional = args.find((arg) => !arg.startsWith("--"));

  const sourcesDir = resolveSourcesDir(root, positional);
  const absoluteSources = path.resolve(root, sourcesDir);
  if (!existsSync(absoluteSources)) {
    console.error(`Cartella sorgenti non trovata: ${absoluteSources}`);
    process.exitCode = 1;
    return;
  }

  const runId = createRunId();
  console.log(`Run ${runId} — profilo delle sorgenti in "${sourcesDir}"...`);

  const session = await ingestFolder(absoluteSources);
  try {
    if (session.datasets.length === 0) {
      console.error(`Nessuna tabella leggibile trovata in "${sourcesDir}".`);
      process.exitCode = 1;
      return;
    }

    console.log(
      `Tabelle trovate: ${session.datasets.map((dataset) => dataset.tableName).join(", ")}`,
    );
    for (const warning of session.warnings) {
      console.log(`  Avviso [${warning.file}]: ${warning.message}`);
    }

    const profile = await profileTables(session);
    const profilePath = writeRunArtifact(root, runId, "profile", profile);
    console.log(`Profilo salvato: ${profilePath}`);

    if (noLlm) {
      console.log("Modalità --no-llm: mi fermo al profilo, nessuna chiamata AI.");
      return;
    }

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

    console.log("Inferenza semantica in corso (burst agentici)...");
    const proposal = await proposeModel({ profile, runId, models });
    const proposalPath = writeRunArtifact(root, runId, "proposal", proposal);
    console.log(`Proposta salvata: ${proposalPath}`);
    printProposalSummary(proposal);
  } finally {
    session.close();
  }
};
