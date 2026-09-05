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
  const parts: string[] = [
    `Ingest ${formatDurationMs(timings.ingestMs)}`,
    skippedEmbed
      ? `Documents ${formatDurationMs(timings.documentsMs)} (extraction ${formatDurationMs(timings.extractionMs)}, embed skipped)`
      : `Documents ${formatDurationMs(timings.documentsMs)} (extraction ${formatDurationMs(timings.extractionMs)}, embed ${formatDurationMs(timings.embedMs)})`,
    `Profile ${formatDurationMs(timings.profileMs)}`,
    `Proposal ${formatDurationMs(timings.proposalMs)}`,
  ];
  console.log(parts.join(" · "));
}

function printProposalSummary(proposal: Proposal): void {
  console.log(
    `Done: ${String(proposal.entities.length)} entities, ${String(proposal.relations.length)} relations.`,
  );
  if (proposal.doubts.length > 0) {
    console.log(`Open doubts: ${String(proposal.doubts.length)}`);
  }
  if (proposal.usage) {
    const cost = proposal.usage.costUsd !== null ? ` (~$${proposal.usage.costUsd.toFixed(4)})` : "";
    console.log(
      `LLM usage: ${String(proposal.usage.inputTokens)} in / ${String(proposal.usage.outputTokens)} out${cost}`,
    );
  }
  console.log(
    `Review: ${String(proposal.questions.length)} question(s). Run "backed review" to confirm.`,
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
  console.log(
    `Documents detected (${String(lineDocuments.length)} file(s)) — classifying and indexing...`,
  );

  const extractionStarted = Date.now();
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
    documentTypeHints,
    onProgress: (message) => {
      console.log(`  ${message}`);
    },
  });
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
  console.log(`Document types saved: ${documentsPath}`);
  console.log(`Indexed: ${documentCatalog.documentTypes.map((type) => type.name).join(", ")}`);

  const chunked = await chunkDocumentLines(session.query);
  session.datasets = session.datasets.filter(
    (dataset) => dataset.tableName !== chunked.dataset.tableName,
  );
  session.datasets.push(chunked.dataset);
  if (chunked.embeddingsRestored > 0) {
    console.log(`Search index: ${String(chunked.chunkCount)} text segments (${String(chunked.embeddingsRestored)} embeddings preserved)`);
  } else {
    console.log(`Search index: ${String(chunked.chunkCount)} text segments`);
  }

  let embedMs = 0;
  if (!skipEmbed) {
    const chunkTexts = await fetchChunkTextsForEmbedding(session.query);
    if (chunkTexts.length > 0) {
      const embedStarted = Date.now();
      const embedded = await embedTexts(
        models.embedding,
        chunkTexts.map((row) => row.text),
        (message) => {
          console.log(`  ${message}`);
        },
      );
      await storeChunkEmbeddings(
        session.query,
        chunkTexts.map((row, index) => ({
          document_id: row.document_id,
          chunk_index: row.chunk_index,
          embedding: embedded.embeddings[index] ?? [],
        })),
      );
      embedMs = Date.now() - embedStarted;
      console.log(`Semantic search ready (${String(chunkTexts.length)} vectors indexed)`);
    } else if (chunked.embeddingsRestored > 0) {
      console.log(`Semantic search ready (${String(chunked.embeddingsRestored)} vectors preserved)`);
    }
  } else {
    console.log("Semantic search: embeddings skipped (--no-embed, keyword mode only)");
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
  const { incrementalTables, existingModel } = incrementalScope;

  if (incrementalTables !== null && existingModel !== null) {
    console.log(
      `Incremental inference on ${String(incrementalTables.size)} changed table(s): ${[...incrementalTables].join(", ")}`,
    );
    console.log(
      `Carrying forward ${String(existingModel.entities.filter((entity) => entity.status !== "proposed").length)} reviewed element(s) from model.yaml.`,
    );
    return;
  }

  if (hasDocumentCatalog) {
    console.log("Building semantic model from documents...");
    return;
  }

  console.log("Building semantic model...");
}

export const modelCommand: CommandHandler = async (args) => {
  const root = findWorkspaceRoot(process.cwd());
  const forceFull = args.includes("--full");
  const skipEmbed = args.includes("--no-embed");
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

  console.log(`Run ${runId} — reading sources in "${sourcesDir}"...`);

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

    const profileStarted = Date.now();
    let profile = await profileTables(session);
    timings.profileMs += Date.now() - profileStarted;

    const { lineDocuments } = splitTablesByKind(compressProfile(profile));
    const hasLineDocuments = lineDocuments.length > 0;

    let documentCatalog: DocumentCatalog | undefined;
    let extractionUsage: BurstUsage | undefined;

    if (hasLineDocuments && workspaceConfig.documentTypeHints.length === 0) {
      console.log(
        "  No documentTypeHints in config — all documents will use LLM classification. Run \"backed init\" or edit .backed/config.yaml.",
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
    console.log(`Profile saved: ${profilePath}`);

    const incrementalScope = resolveIncrementalScope(
      root,
      profile,
      previousRunId,
      forceFull,
      hasLineDocuments,
    );
    logInferenceScope(incrementalScope, documentCatalog !== undefined);

    const proposalStarted = Date.now();
    const freshProposal = await proposeModel({
      profile: incrementalScope.profileForInference,
      runId,
      models,
      ...(documentCatalog !== undefined ? { documentCatalog } : {}),
      ...(extractionUsage !== undefined ? { extractionUsage } : {}),
      onProgress: (message) => {
        console.log(`  ${message}`);
      },
    });
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
    console.log(`Proposal saved: ${proposalPath}`);
    printProposalSummary(proposal);
    printStageTimings(timings, skipEmbed);
  } finally {
    session.close();
  }
};
