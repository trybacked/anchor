import { existsSync } from "node:fs";
import path from "node:path";

import {
  ProfileReportSchema,
  createRunId,
  initWorkspace,
  listRunIds,
  readModelYaml,
  readRunArtifact,
  readWorkspaceConfig,
  workspacePaths,
  writeRunArtifact,
} from "@backed/core";
import type { DocumentCatalog, Proposal } from "@backed/core";
import {
  affectedTablesFromProfileDiff,
  filterProfileToTables,
} from "@backed/diff";
import {
  fetchDocumentHeaderSamples,
  ingestFolder,
  materializeDocumentTables,
} from "@backed/ingest";
import { profileTables } from "@backed/profile";
import {
  MissingApiKeyError,
  compressProfile,
  extractDocumentCatalog,
  isDocumentCorpus,
  mergeIncrementalProposal,
  proposeModel,
  resolveSemanticModels,
  splitTablesByKind,
} from "@backed/semantic";
import type { BurstUsage } from "@backed/semantic";

import { findWorkspaceRoot } from "../env.js";
import type { CommandHandler } from "../types.js";

function resolveSourcesDir(root: string, positional: string | undefined): string {
  if (positional) {
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
  const root = findWorkspaceRoot(process.cwd());
  const forceFull = args.includes("--full");
  const positional = args.find((arg) => !arg.startsWith("--"));

  const sourcesDir = resolveSourcesDir(root, positional);
  const absoluteSources = path.resolve(root, sourcesDir);
  if (!existsSync(absoluteSources)) {
    console.error(`Sources folder not found: ${absoluteSources}`);
    process.exitCode = 1;
    return;
  }

  const runId = createRunId();
  const previousRunIds = listRunIds(root);
  const previousRunId = previousRunIds.at(-1);

  console.log(`Run ${runId} — profiling sources in "${sourcesDir}"...`);

  const paths = workspacePaths(root);
  const session = await ingestFolder(absoluteSources, { databasePath: paths.dataPath });
  try {
    if (session.datasets.length === 0) {
      console.error(`No readable tables found in "${sourcesDir}".`);
      process.exitCode = 1;
      return;
    }

    console.log(
      `Tables found: ${session.datasets.map((dataset) => dataset.tableName).join(", ")}`,
    );
    console.log(`Data snapshot saved: ${paths.dataPath}`);
    for (const warning of session.warnings) {
      console.log(`  Warning [${warning.file}]: ${warning.message}`);
    }

    let profile = await profileTables(session);
    const compressedTables = compressProfile(profile);
    const { lineDocuments } = splitTablesByKind(compressedTables);
    const documentCorpus = isDocumentCorpus(lineDocuments.length, compressedTables.length);

    let documentCatalog: DocumentCatalog | undefined;
    let extractionUsage: BurstUsage | undefined;

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

    if (documentCorpus) {
      console.log(
        `Document corpus detected (${String(lineDocuments.length)} line-document tables) — running extraction and materialization...`,
      );

      const headerSamples = await fetchDocumentHeaderSamples(
        session.query,
        lineDocuments.map((table) => ({
          sourceTable: table.table,
          pageCount: table.rowCount,
        })),
      );

      const extracted = await extractDocumentCatalog({
        runId,
        models,
        samples: headerSamples,
        onProgress: (message) => {
          console.log(`  ${message}`);
        },
      });
      extractionUsage = extracted.usage;

      const sourceFileByTable = new Map(
        session.datasets.map((dataset) => [dataset.tableName, dataset.sourceFile]),
      );
      const materialized = await materializeDocumentTables(
        session.query,
        extracted.catalog,
        sourceFileByTable,
      );
      documentCatalog = materialized.catalog;

      session.datasets = session.datasets.filter(
        (dataset) => !materialized.datasetsRemoved.includes(dataset.tableName),
      );
      session.datasets.push(...materialized.datasetsAdded);

      const documentsPath = writeRunArtifact(root, runId, "documents", documentCatalog);
      console.log(`Document catalog saved: ${documentsPath}`);
      console.log(
        `Materialized tables: ${documentCatalog.documentTypes.map((type) => type.tableName).join(", ")}, document_lines`,
      );

      profile = await profileTables(session);
    }

    const profilePath = writeRunArtifact(root, runId, "profile", profile);
    console.log(`Profile saved: ${profilePath}`);

    let incrementalTables: Set<string> | null = null;
    let existingModel = null;

    if (!forceFull && !documentCorpus && previousRunId !== undefined) {
      try {
        existingModel = readModelYaml(root);
        const previousProfile = readRunArtifact(
          root,
          previousRunId,
          "profile",
          ProfileReportSchema,
        );
        incrementalTables = affectedTablesFromProfileDiff(previousProfile, profile);
        if (incrementalTables.size === 0) {
          incrementalTables = null;
        }
      } catch {
        incrementalTables = null;
        existingModel = null;
      }
    }

    const profileForInference =
      incrementalTables !== null
        ? filterProfileToTables(profile, incrementalTables)
        : profile;

    if (incrementalTables !== null && existingModel !== null) {
      console.log(
        `Incremental inference on ${String(incrementalTables.size)} changed table(s): ${[...incrementalTables].join(", ")}`,
      );
      console.log(
        `Carrying forward ${String(existingModel.entities.filter((entity) => entity.status !== "proposed").length)} reviewed element(s) from model.yaml.`,
      );
    } else if (documentCatalog !== undefined) {
      console.log("Running semantic inference on materialized document ontology...");
    } else {
      console.log("Running semantic inference (line-document tables skip LLM; see progress below)...");
    }

    const freshProposal = await proposeModel({
      profile: profileForInference,
      runId,
      models,
      ...(documentCatalog !== undefined ? { documentCatalog } : {}),
      ...(extractionUsage !== undefined ? { extractionUsage } : {}),
      onProgress: (message) => {
        console.log(`  ${message}`);
      },
    });
    const proposal: Proposal =
      incrementalTables !== null && existingModel !== null
        ? mergeIncrementalProposal(freshProposal, existingModel, incrementalTables, profile)
        : freshProposal;

    const proposalPath = writeRunArtifact(root, runId, "proposal", proposal);
    console.log(`Proposal saved: ${proposalPath}`);
    printProposalSummary(proposal);
  } finally {
    session.close();
  }
};
