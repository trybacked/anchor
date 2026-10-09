import { createRunId, readWorkspaceConfig, writeRunArtifact } from "@trybacked/core";
import { filesRootFromEnv } from "@trybacked/infrastructure";
import {
  createGatewayLanguageModel,
  createOntologyExtractModelFromEnv,
  foundryExtractToSeed,
  pdftotextAvailable,
  runFoundryExtractFromPdfRoot,
} from "@trybacked/ontology-extract";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse as parseYaml } from "yaml";
import { isHelpFlag } from "../config.js";
import { loadWorkspaceDotEnv } from "../env.js";
import type { CommandHandler } from "../types.js";
import { initUi } from "../ui/index.js";

function readSeedPathArg(args: string[], root: string): string {
  const seedArg = args.find((arg) => arg.startsWith("--seed-path="));
  if (seedArg !== undefined) {
    return seedArg.slice("--seed-path=".length).trim();
  }
  return join(root, "seed", "foundry-instances.json");
}

function loadCompetencyQuestions(root: string): string[] {
  const path = join(root, "competency-questions.yaml");
  if (!existsSync(path)) {
    return [];
  }
  const doc = parseYaml(readFileSync(path, "utf8")) as {
    questions?: Array<{ text?: string }>;
  };
  return (doc.questions ?? [])
    .map((entry) => entry.text?.trim())
    .filter((text): text is string => text !== undefined && text.length > 0);
}

export const ontologyExtractFoundryCommand: CommandHandler = async (args) => {
  loadWorkspaceDotEnv(process.cwd());
  const ui = initUi();
  if (args.some(isHelpFlag)) {
    ui.log(
      "Usage: backed ontology extract-foundry [--json] [--seed-path=seed/foundry-instances.json]",
    );
    ui.log(
      "  LLM instance extraction (organization, person, document, …) from PDFs under BACKED_FILES_ROOT.",
    );
    ui.log("  Requires pdftotext and AI_GATEWAY_API_KEY. Writes run artifacts + seed JSON.");
    return;
  }

  if (!pdftotextAvailable()) {
    ui.writeError("pdftotext not found (install poppler: brew install poppler).");
    process.exitCode = 1;
    return;
  }

  const modelConfig = createOntologyExtractModelFromEnv(process.env);
  if (modelConfig === undefined) {
    ui.writeError("Set AI_GATEWAY_API_KEY (and optional SEMANTIC_MODEL) in .env.");
    process.exitCode = 1;
    return;
  }

  const root = loadWorkspaceDotEnv(process.cwd());
  const filesRoot = filesRootFromEnv(process.env, root);
  if (!existsSync(filesRoot)) {
    ui.writeError(`File root does not exist: ${filesRoot}`);
    process.exitCode = 1;
    return;
  }

  let ontologyId = "default";
  try {
    ontologyId = readWorkspaceConfig(root).ontologyId ?? ontologyId;
  } catch {
    /* optional config */
  }

  const runId = createRunId();
  const json = args.includes("--json");
  ui.heading("Foundry extract");
  ui.step(`${runId} · PDF excerpts from ${filesRoot}`);

  const model = createGatewayLanguageModel(modelConfig.apiKey, modelConfig.modelId);
  const competencyQuestions = loadCompetencyQuestions(root);
  const result = await runFoundryExtractFromPdfRoot({
    root: filesRoot,
    model,
    localeHint: "it",
    competencyQuestions,
  });

  const extractPath = writeRunArtifact(root, runId, "foundryExtract", result.output);
  const seed = foundryExtractToSeed(result.output, { ontologyId });
  const seedPath = readSeedPathArg(args, root);
  mkdirSync(dirname(seedPath), { recursive: true });
  writeFileSync(seedPath, `${JSON.stringify(seed, null, 2)}\n`, "utf8");

  if (json) {
    ui.log(
      JSON.stringify(
        {
          runId,
          usage: result.usage,
          documentCount: result.documents.length,
          instanceCount: result.output.instances.length,
          seedPath,
          extractPath,
          seed,
        },
        null,
        2,
      ),
    );
    return;
  }

  ui.writeSuccess(`Extract → ${ui.path(extractPath)}`);
  ui.writeSuccess(`Seed → ${ui.path(seedPath)}`);
  ui.detail(
    `${String(result.documents.length)} PDF(s) · ${String(result.output.instances.length)} instance(s) · ${String(result.usage.totalTokens)} tokens`,
  );
  if (competencyQuestions.length > 0) {
    ui.detail(`${String(competencyQuestions.length)} competency question(s) passed to the model`);
  }
  ui.step('Review seed, run "backed ontology materialize-foundry", then "backed anchor sync".');
};
