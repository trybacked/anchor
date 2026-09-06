import { existsSync } from "node:fs";
import path from "node:path";

import {
  ProfileReportSchema,
  createRunId,
  listRunIds,
  patchWorkspaceConfig,
  readModelYaml,
  readRunArtifact,
  readWorkspaceConfig,
  workspacePaths,
  writeRunArtifact,
} from "@backed/core";
import type {
  DocumentCatalog,
  DocumentTypeHintConfig,
  ProfileReport,
  Proposal,
  SemanticModel,
} from "@backed/core";
import {
  affectedTablesFromProfileDiff,
  filterProfileToTables,
} from "@backed/diff";
import type { IngestSession } from "@backed/ingest";
import {
  chunkDocumentLines,
  fetchChunkTextsForEmbedding,
  fetchDocumentHeaderSamples,
  ingestFolder,
  materializeDocumentTables,
  storeChunkEmbeddings,
} from "@backed/ingest";
import { profileTables } from "@backed/profile";
import {
  MissingApiKeyError,
  compressProfile,
  embedTexts,
  extractDocumentCatalog,
  mergeIncrementalProposal,
  proposeModel,
  resolveSemanticModels,
  splitTablesByKind,
} from "@backed/semantic";
import type { BurstUsage, SemanticModels } from "@backed/semantic";

import { findWorkspaceRoot } from "../env.js";
import { createAiProgressReporter, getUi, initUi } from "../ui/index.js";
import type { CommandHandler } from "../types.js";

interface DocumentStageResult {
  documentCatalog: DocumentCatalog;
  extractionUsage: BurstUsage;
  extractionMs: number;
  embedMs: number;
}

interface IncrementalScope {
  profileForInference: ProfileReport;
  incrementalTables: Set<string> | null;
  existingModel: SemanticModel | null;
}

interface StageTimings {
  ingestMs: number;
  documentsMs: number;
  extractionMs: number;
  embedMs: number;
  profileMs: number;
  proposalMs: number;
}

function resolveSourcesDir(root: string, positional: string | undefined): string {
  if (positional) {
    patchWorkspaceConfig(root, { sourcesDir: positional });
    return positional;
  }
  return readWorkspaceConfig(root).sourcesDir;
}

function formatDurationMs(ms: number): string {
  return `${String(Math.round(ms / 1000))}s`;
}

function printStageTimings(timings: StageTimings, skippedEmbed: boolean): void {
  const ui = getUi();
  const parts: string[] = [
    `${ui.label("Ingest")} ${formatDurationMs(timings.ingestMs)}`,
    skippedEmbed
      ? `${ui.label("Documents")} ${formatDurationMs(timings.documentsMs)} ${ui.dim(`(extraction ${formatDurationMs(timings.extractionMs)}, embed skipped)`)}`
      : `${ui.label("Documents")} ${formatDurationMs(timings.documentsMs)} ${ui.dim(`(extraction ${formatDurationMs(timings.extractionMs)}, embed ${formatDurationMs(timings.embedMs)})`)}`,
    `${ui.label("Profile")} ${formatDurationMs(timings.profileMs)}`,
    `${ui.label("Proposal")} ${formatDurationMs(timings.proposalMs)}`,
  ];
  ui.blank();
  ui.log(parts.join(` ${ui.dim("·")} `));
}

function printProposalSummary(proposal: Proposal): void {
  const ui = getUi();
  ui.blank();
  ui.writeSuccess(
    `${String(proposal.entities.length)} entities, ${String(proposal.relations.length)} relations`,
  );
  if (proposal.doubts.length > 0) {
    ui.log(`  ${ui.label("Doubts")}  ${String(proposal.doubts.length)} open`);
  }
  if (proposal.usage) {
    const cost = proposal.usage.costUsd !== null ? ` ${ui.dim(`(~$${proposal.usage.costUsd.toFixed(4)})`)}` : "";
    ui.log(
      `  ${ui.label("LLM")}     ${String(proposal.usage.inputTokens)} in / ${String(proposal.usage.outputTokens)} out${cost}`,
    );
  }
  ui.step(
    `${String(proposal.questions.length)} review question(s) — run ${ui.command("backed review")}`,
  );
}

async function runDocumentStage(
  session: IngestSession,
  models: SemanticModels,
  runId: string,
  root: string,
  lineDocuments: ReturnType<typeof splitTablesByKind>["lineDocuments"],
  documentTypeHints: DocumentTypeHintConfig[],
  skipEmbed: boolean,
): Promise<DocumentStageResult> {
  const ui = getUi();
  ui.step(
    `Documents (${String(lineDocuments.length)} file(s)) — classifying and indexing…`,
  );

  const extractionStarted = Date.now();
  const headerSamples = await fetchDocumentHeaderSamples(
    session.query,
    lineDocuments.map((table) => ({
      sourceTable: table.table,
      pageCount: table.rowCount,
    })),
  );

  const aiProgress = createAiProgressReporter((message) => {
    ui.detail(message);
  });

  const extracted = await extractDocumentCatalog({
    runId,
    models,
    samples: headerSamples,
    documentTypeHints,
    onProgress: (message) => {
      aiProgress.detail(message);
    },
    onLlmProgress: ({ completed, total }) => {
      aiProgress.track("Classifying documents (LLM)", completed, total);
    },
  });
  aiProgress.end();
  const extractionMs = Date.now() - extractionStarted;

  const sourceFileByTable = new Map(
    session.datasets.map((dataset) => [dataset.tableName, dataset.sourceFile]),
  );
  const materialized = await materializeDocumentTables(
    session.query,
    extracted.catalog,
    sourceFileByTable,
  );
  const documentCatalog = materialized.catalog;

  session.datasets = session.datasets.filter(
    (dataset) => !materialized.datasetsRemoved.includes(dataset.tableName),
  );
  session.datasets.push(...materialized.datasetsAdded);

  const documentsPath = writeRunArtifact(root, runId, "documents", documentCatalog);
  ui.writeSuccess(`Document types → ${ui.path(documentsPath)}`);
  ui.log(`  ${ui.label("Types")}  ${documentCatalog.documentTypes.map((type) => type.name).join(", ")}`);

  const chunked = await chunkDocumentLines(session.query);
  session.datasets = session.datasets.filter(
    (dataset) => dataset.tableName !== chunked.dataset.tableName,
  );
  session.datasets.push(chunked.dataset);
  if (chunked.embeddingsRestored > 0) {
    ui.log(
      `  ${ui.label("Index")}  ${String(chunked.chunkCount)} segments (${String(chunked.embeddingsRestored)} embeddings preserved)`,
    );
  } else {
    ui.log(`  ${ui.label("Index")}  ${String(chunked.chunkCount)} text segments`);
  }

  let embedMs = 0;
  if (!skipEmbed) {
    const chunkTexts = await fetchChunkTextsForEmbedding(session.query);
    if (chunkTexts.length > 0) {
      const embedStarted = Date.now();
      const embedProgress = createAiProgressReporter((message) => {
        ui.detail(message);
      });
      const embedded = await embedTexts(
        models.embedding,
        chunkTexts.map((row) => row.text),
        undefined,
        ({ completed, total }) => {
          embedProgress.track("Embedding document chunks", completed, total);
        },
      );
      embedProgress.end();
      await storeChunkEmbeddings(
        session.query,
        chunkTexts.map((row, index) => ({
          document_id: row.document_id,
          chunk_index: row.chunk_index,
          embedding: embedded.embeddings[index] ?? [],
        })),
      );
      embedMs = Date.now() - embedStarted;
      ui.writeSuccess(`Semantic search ready (${String(chunkTexts.length)} vectors)`);
    } else if (chunked.embeddingsRestored > 0) {
      ui.writeSuccess(`Semantic search ready (${String(chunked.embeddingsRestored)} vectors preserved)`);
    }
  } else {
    ui.writeWarn("Embeddings skipped (--no-embed, keyword search only)");
  }

  return {
    documentCatalog,
    extractionUsage: extracted.usage,
    extractionMs,
    embedMs,
  };
}

function resolveIncrementalScope(
  root: string,
  profile: ProfileReport,
  previousRunId: string | undefined,
  forceFull: boolean,
  hasDocuments: boolean,
): IncrementalScope {
  if (forceFull || hasDocuments || previousRunId === undefined) {
    return {
      profileForInference: profile,
      incrementalTables: null,
      existingModel: null,
    };
  }

  try {
    const existingModel = readModelYaml(root);
    const previousProfile = readRunArtifact(
      root,
      previousRunId,
      "profile",
      ProfileReportSchema,
    );
    const incrementalTables = affectedTablesFromProfileDiff(previousProfile, profile);
    if (incrementalTables.size === 0) {
      return {
        profileForInference: profile,
        incrementalTables: null,
        existingModel: null,
      };
    }
    return {
      profileForInference: filterProfileToTables(profile, incrementalTables),
      incrementalTables,
      existingModel,
    };
  } catch {
    return {
      profileForInference: profile,
      incrementalTables: null,
      existingModel: null,
    };
  }
}

function logInferenceScope(
  incrementalScope: IncrementalScope,
  hasDocumentCatalog: boolean,
): void {
  const ui = getUi();
  const { incrementalTables, existingModel } = incrementalScope;

  if (incrementalTables !== null && existingModel !== null) {
    ui.step(
      `Incremental inference on ${String(incrementalTables.size)} changed table(s): ${[...incrementalTables].join(", ")}`,
    );
    ui.detail(
      `Carrying forward ${String(existingModel.entities.filter((entity) => entity.status !== "proposed").length)} reviewed element(s) from model.yaml`,
    );
    return;
  }

  if (hasDocumentCatalog) {
    ui.step("Building semantic model from documents…");
    return;
  }

  ui.step("Building semantic model…");
}

export const modelCommand: CommandHandler = async (args) => {
  const ui = initUi();
  const root = findWorkspaceRoot(process.cwd());
  const forceFull = args.includes("--full");
  const skipEmbed = args.includes("--no-embed");
  const positional = args.find((arg) => !arg.startsWith("--"));

  const sourcesDir = resolveSourcesDir(root, positional);
  const absoluteSources = path.resolve(root, sourcesDir);
  if (!existsSync(absoluteSources)) {
    ui.writeError(`Sources folder not found: ${absoluteSources}`);
    process.exitCode = 1;
    return;
  }

  const runId = createRunId();
  const previousRunIds = listRunIds(root);
  const previousRunId = previousRunIds.at(-1);

  ui.heading("Model run");
  ui.step(`${ui.accent(runId)} · reading ${ui.path(sourcesDir)}`);

  const paths = workspacePaths(root);
  const workspaceConfig = readWorkspaceConfig(root);
  const timings: StageTimings = {
    ingestMs: 0,
    documentsMs: 0,
    extractionMs: 0,
    embedMs: 0,
    profileMs: 0,
    proposalMs: 0,
  };

  const ingestStarted = Date.now();
  const session = await ingestFolder(absoluteSources, { databasePath: paths.dataPath });
  timings.ingestMs = Date.now() - ingestStarted;

  try {
    if (session.datasets.length === 0) {
      ui.writeError(`No readable tables found in "${sourcesDir}".`);
      process.exitCode = 1;
      return;
    }

    ui.log(`  ${ui.label("Tables")}  ${session.datasets.map((dataset) => dataset.tableName).join(", ")}`);
    ui.writeSuccess(`Data snapshot → ${ui.path(paths.dataPath)}`);
    for (const warning of session.warnings) {
      ui.writeWarn(`[${warning.file}] ${warning.message}`);
    }

    let models;
    try {
      models = resolveSemanticModels();
    } catch (error) {
      if (error instanceof MissingApiKeyError) {
        ui.writeError(error.message);
        process.exitCode = 1;
        return;
      }
      throw error;
    }

    const profileStarted = Date.now();
    let profile = await profileTables(session);
    timings.profileMs += Date.now() - profileStarted;

    const { lineDocuments } = splitTablesByKind(compressProfile(profile));
    const hasLineDocuments = lineDocuments.length > 0;

    let documentCatalog: DocumentCatalog | undefined;
    let extractionUsage: BurstUsage | undefined;

    if (hasLineDocuments && workspaceConfig.documentTypeHints.length === 0) {
      ui.writeWarn(
        'No documentTypeHints in config — all documents use LLM classification. Run "backed init" or edit .backed/config.yaml.',
      );
    }

    if (hasLineDocuments) {
      const documentsStarted = Date.now();
      const documentStage = await runDocumentStage(
        session,
        models,
        runId,
        root,
        lineDocuments,
        workspaceConfig.documentTypeHints,
        skipEmbed,
      );
      timings.documentsMs = Date.now() - documentsStarted;
      timings.extractionMs = documentStage.extractionMs;
      timings.embedMs = documentStage.embedMs;
      documentCatalog = documentStage.documentCatalog;
      extractionUsage = documentStage.extractionUsage;

      const reprofileStarted = Date.now();
      profile = await profileTables(session);
      timings.profileMs += Date.now() - reprofileStarted;
    }
    const profilePath = writeRunArtifact(root, runId, "profile", profile);
    ui.writeSuccess(`Profile → ${ui.path(profilePath)}`);

    const incrementalScope = resolveIncrementalScope(
      root,
      profile,
      previousRunId,
      forceFull,
      hasLineDocuments,
    );
    logInferenceScope(incrementalScope, documentCatalog !== undefined);

    const proposalStarted = Date.now();
    const proposalProgress = createAiProgressReporter((message) => {
      ui.detail(message);
    });
    const freshProposal = await proposeModel({
      profile: incrementalScope.profileForInference,
      runId,
      models,
      ...(documentCatalog !== undefined ? { documentCatalog } : {}),
      ...(extractionUsage !== undefined ? { extractionUsage } : {}),
      onProgress: (message) => {
        if (message.startsWith("Building ontology")) {
          proposalProgress.indeterminate(message);
          return;
        }
        proposalProgress.detail(message);
      },
      onBatchProgress: ({ completed, total }) => {
        proposalProgress.track("Column classification (LLM)", completed, total);
      },
    });
    proposalProgress.end();
    timings.proposalMs = Date.now() - proposalStarted;

    const proposal: Proposal =
      incrementalScope.incrementalTables !== null && incrementalScope.existingModel !== null
        ? mergeIncrementalProposal(
            freshProposal,
            incrementalScope.existingModel,
            incrementalScope.incrementalTables,
            profile,
          )
        : freshProposal;

    const proposalPath = writeRunArtifact(root, runId, "proposal", proposal);
    ui.writeSuccess(`Proposal → ${ui.path(proposalPath)}`);
    printProposalSummary(proposal);
    printStageTimings(timings, skipEmbed);
  } finally {
    session.close();
  }
};
