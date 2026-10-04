#!/usr/bin/env node

import { writeFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readModelYaml } from "../packages/core/dist/index.js";
import {
  createDatabricksSqlClient,
  databricksConfigFromEnv,
  hasDatabricksEnv,
} from "../packages/provider-databricks/dist/index.js";
import { loadPublishedOntology } from "../packages/registry/dist/index.js";
import { buildQueryRuntimeFromEnv } from "../packages/runtime/dist/index.js";
import {
  createSemanticAgentModelFromEnv,
  runSemanticAgent,
} from "../packages/semantic-chat/dist/index.js";
import { createAnchorService } from "../packages/service/dist/index.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..");
const defaultWorkspace = join(repoRoot, "..", "ontology", "gerace");

function loadEvalQuestions(tenant, limit) {
  const dir = join(repoRoot, "evals", tenant);
  if (!existsSync(dir)) {
    return [];
  }
  const questions = [];
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".jsonl"))) {
    for (const line of readFileSync(join(dir, file), "utf8").split("\n")) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      const row = JSON.parse(trimmed);
      if (typeof row.question === "string") {
        questions.push({
          id: row.id ?? `eval-${String(questions.length + 1)}`,
          category: "eval-dataset",
          question: row.question,
          expect: row.expect,
        });
      }
      if (questions.length >= limit) {
        return questions;
      }
    }
  }
  return questions;
}

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  try {
    process.loadEnvFile(path);
  } catch {
    const text = readFileSync(path, "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      process.env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
    }
  }
}

function buildQuestions(count, tenant) {
  const fromEvals = loadEvalQuestions(tenant, count);
  if (fromEvals.length > 0) {
    return fromEvals;
  }
  const questions = [];
  let index = 0;

  const push = (category, question) => {
    if (questions.length >= count) return;
    index += 1;
    questions.push({ id: `q${String(index).padStart(2, "0")}`, category, question });
  };

  push("count-month", "How many contracts are in the June 2025 ingest month?");
  push("rows-sample", "Show at most 5 contracts for the June 2025 ingest month.");

  for (let variant = 0; variant < 6; variant += 1) {
    push(
      "organization-count",
      `How many organizations (contracting authorities) are in the dataset${variant === 0 ? "" : ` — variant ${String(variant)}`}?`,
    );
  }

  for (const region of ["Sicilia", "Lombardia", "Lazio", "Campania"]) {
    push(
      "groupby-region",
      `For 2025-06, up to 10 rows: contracts by regional section (including ${region} if present).`,
    );
  }

  for (const limit of [3, 5, 5, 5]) {
    push(
      "join-select-name",
      `List ${String(limit)} contracts from 2025-06 with contracting authority name (organization join).`,
    );
  }

  push(
    "complex",
    "In June 2025, how many contracts with tender subject containing servizi and a populated regional section?",
  );
  push("complex", "How many contracts in May and June 2025 combined?");
  push("text-ish", "How many contracts in ingest 2025-06 with CIG starting with Z?");
  push("text-ish", "Organizations in Lombardia: how many are there?");

  return questions.slice(0, count);
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const rank = (p / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) return sorted[low] ?? 0;
  const weight = rank - low;
  return (sorted[low] ?? 0) * (1 - weight) + (sorted[high] ?? 0) * weight;
}

function parseArgs(argv) {
  let workspace = process.env["ANCHOR_WORKSPACE_ROOT"];
  let count = 50;
  let jsonOut;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--workspace" && argv[i + 1] !== undefined) {
      workspace = argv[i + 1];
      i += 1;
    } else if (argv[i] === "--count" && argv[i + 1] !== undefined) {
      count = Number(argv[i + 1]);
      i += 1;
    } else if (argv[i] === "--json" && argv[i + 1] !== undefined) {
      jsonOut = argv[i + 1];
      i += 1;
    }
  }
  return { workspace: resolve(workspace ?? defaultWorkspace), count, jsonOut };
}

async function main() {
  const { workspace, count, jsonOut } = parseArgs(process.argv.slice(2));
  loadEnvFile(join(repoRoot, ".env"));
  loadEnvFile(join(workspace, ".env"));
  const tenant = workspace.split("/").pop() ?? "gerace";
  loadEnvFile(join(process.env["HOME"] ?? "", ".config", "backed", `${tenant}.env`));

  const modelId =
    process.env["SEMANTIC_CHAT_MODEL"] ?? process.env["SEMANTIC_MODEL"] ?? "openai/gpt-4o-mini";
  const costPerMillionIn = Number(process.env["BENCHMARK_COST_USD_PER_1M_INPUT"] ?? "0");
  const costPerMillionOut = Number(process.env["BENCHMARK_COST_USD_PER_1M_OUTPUT"] ?? "0");

  let llmCalls = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  const agentModel = createSemanticAgentModelFromEnv(process.env);
  if (agentModel === undefined) {
    console.error("Missing AI_GATEWAY_API_KEY.");
    process.exitCode = 1;
    return;
  }

  if (!hasDatabricksEnv(process.env)) {
    console.error("Missing BACKED_DATABRICKS_* env.");
    process.exitCode = 1;
    return;
  }

  const ontology = loadPublishedOntology(workspace);
  if (ontology === null) {
    console.error(`No published ontology in ${workspace}`);
    process.exitCode = 1;
    return;
  }

  const model = readModelYaml(workspace);
  const client = createDatabricksSqlClient(databricksConfigFromEnv(process.env));
  const { runtime } = await buildQueryRuntimeFromEnv({
    ontology,
    model,
    executor: (sql, parameters) => client.execute(sql, parameters),
    env: process.env,
  });

  const service = createAnchorService({
    model,
    ontology,
    queryRuntime: runtime,
    executionProfile: "api",
  });

  const questions = buildQuestions(count, tenant);
  const results = [];
  const wallStart = Date.now();

  console.error(`Benchmark: ${String(questions.length)} questions · model ${modelId}`);
  console.error(`Workspace: ${workspace}\n`);

  for (const item of questions) {
    const started = Date.now();
    let status = "ok";
    let errorName;
    let errorMessage;
    let attempts;
    let mode;
    let objectId;
    let rowCount;
    try {
      const agent = await runSemanticAgent({
        ontology,
        service,
        question: item.question,
        modelId: agentModel.modelId,
        apiKey: agentModel.apiKey,
      });
      attempts = 1;
      const queryStep = agent.steps.find((step) => step.toolName === "query_objects");
      const queryResult =
        queryStep !== undefined ? agent.toolResults.get(queryStep.toolCallId) : undefined;
      if (typeof queryResult === "object" && queryResult !== null) {
        mode = String(queryResult.mode ?? queryStep?.input?.mode ?? "");
        objectId = String(queryResult.objectId ?? queryStep?.input?.objectId ?? "");
        rowCount = Number(queryResult.rowCount ?? 0);
      }
      inputTokens += agent.usage.inputTokens;
      outputTokens += agent.usage.outputTokens;
      llmCalls += 1;
    } catch (error) {
      status = "error";
      errorName = error instanceof Error ? error.name : "Error";
      errorMessage = error instanceof Error ? error.message : String(error);
    }
    const durationMs = Date.now() - started;
    results.push({
      ...item,
      status,
      durationMs,
      attempts,
      mode,
      objectId,
      rowCount,
      errorName,
      errorMessage,
    });
    const flag = status === "ok" ? "ok" : "ERR";
    console.log(
      `${flag}  ${item.id}  ${String(durationMs).padStart(5)}ms  ${item.category.padEnd(18)}  ${item.question.slice(0, 72)}${item.question.length > 72 ? "…" : ""}`,
    );
  }

  const wallMs = Date.now() - wallStart;
  const ok = results.filter((row) => row.status === "ok");
  const errors = results.filter((row) => row.status === "error");
  const durations = ok.map((row) => row.durationMs).sort((a, b) => a - b);
  const attemptsList = ok.map((row) => row.attempts ?? 1);
  const avgAttempts =
    attemptsList.length === 0
      ? 0
      : attemptsList.reduce((sum, value) => sum + value, 0) / attemptsList.length;

  const totalTokens = inputTokens + outputTokens;
  const estimatedCostUsd =
    (inputTokens / 1_000_000) * costPerMillionIn + (outputTokens / 1_000_000) * costPerMillionOut;

  const summary = {
    modelId,
    questionCount: questions.length,
    successCount: ok.length,
    errorCount: errors.length,
    wallClockMs: wallMs,
    latencyMs: {
      mean: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
      p50: percentile(durations, 50),
      p95: percentile(durations, 95),
      min: durations[0] ?? 0,
      max: durations[durations.length - 1] ?? 0,
    },
    llmCalls,
    tokens: { inputTokens, outputTokens, totalTokens },
    avgAttemptsOnSuccess: avgAttempts,
    estimatedCostUsd: estimatedCostUsd > 0 ? estimatedCostUsd : undefined,
    costNote:
      estimatedCostUsd > 0
        ? undefined
        : "Set BENCHMARK_COST_USD_PER_1M_INPUT/OUTPUT for USD estimate, or read usage in Vercel AI Gateway dashboard.",
  };

  console.error("\n--- Summary ---");
  console.error(`Success: ${String(ok.length)}/${String(questions.length)}`);
  console.error(
    `Latency (ok only): mean ${summary.latencyMs.mean.toFixed(0)}ms · p50 ${summary.latencyMs.p50.toFixed(0)}ms · p95 ${summary.latencyMs.p95.toFixed(0)}ms · max ${String(summary.latencyMs.max)}ms`,
  );
  console.error(`Wall clock: ${(wallMs / 1000).toFixed(1)}s (${(wallMs / 60000).toFixed(2)} min)`);
  console.error(
    `LLM completions: ${String(llmCalls)} · tokens in/out/total: ${String(inputTokens)}/${String(outputTokens)}/${String(totalTokens)}`,
  );
  console.error(`Avg repair attempts (ok): ${avgAttempts.toFixed(2)}`);
  if (summary.estimatedCostUsd !== undefined) {
    console.error(`Estimated LLM cost: $${summary.estimatedCostUsd.toFixed(4)}`);
  } else {
    console.error(summary.costNote);
  }

  if (errors.length > 0) {
    console.error("\nErrors:");
    for (const row of errors) {
      console.error(`  ${row.id}: ${row.errorName} — ${row.errorMessage}`);
    }
    process.exitCode = 1;
  }

  const payload = { summary, results };
  if (jsonOut !== undefined) {
    writeFileSync(jsonOut, `${JSON.stringify(payload, null, 2)}\n`);
    console.error(`\nWrote ${jsonOut}`);
  }
}

await main();
