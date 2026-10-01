#!/usr/bin/env node
/**
 * Live LLM baseline: NL → routed plan correctness on semantic-nl-smoke.cases.json.
 *
 *   pnpm build && pnpm smoke:semantic-nl-baseline
 *   pnpm smoke:semantic-nl-baseline -- --json /tmp/nl-baseline.json --min-plan-rate 0.9
 *
 * Exit 1 when required-case plan pass rate is below --min-plan-rate (default 0.9).
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
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
  createSemanticChatEngine,
  SemanticChatTranslationError,
  SemanticPlanValidationError,
} from "../packages/semantic-chat/dist/index.js";
import { createVercelAiTranslatorFromEnv } from "../packages/semantic-chat/dist/adapters/vercel-ai.js";
import { assertCase, assertPlanShape } from "./semantic-nl-assertions.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..");
const defaultWorkspace = join(repoRoot, "..", "ontology", "gerace");
const casesPath = join(scriptDir, "semantic-nl-smoke.cases.json");

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

function parseArgs(argv) {
  let workspace = process.env["ANCHOR_WORKSPACE_ROOT"];
  let jsonOut;
  let minPlanRate = 0.9;
  let minE2eRate = 0.9;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--workspace" && argv[i + 1] !== undefined) {
      workspace = argv[i + 1];
      i += 1;
    } else if (arg === "--json" && argv[i + 1] !== undefined) {
      jsonOut = argv[i + 1];
      i += 1;
    } else if (arg === "--min-plan-rate" && argv[i + 1] !== undefined) {
      minPlanRate = Number(argv[i + 1]);
      i += 1;
    } else if (arg === "--min-e2e-rate" && argv[i + 1] !== undefined) {
      minE2eRate = Number(argv[i + 1]);
      i += 1;
    }
  }
  return {
    workspace: resolve(workspace ?? defaultWorkspace),
    jsonOut,
    minPlanRate,
    minE2eRate,
  };
}

function rate(pass, total) {
  return total === 0 ? 0 : pass / total;
}

async function main() {
  const { workspace, jsonOut, minPlanRate, minE2eRate } = parseArgs(process.argv.slice(2));
  loadEnvFile(join(repoRoot, ".env"));
  loadEnvFile(join(workspace, ".env"));
  const tenant = workspace.split("/").pop() ?? "gerace";
  loadEnvFile(join(process.env["HOME"] ?? "", ".config", "backed", `${tenant}.env`));

  const translate = createVercelAiTranslatorFromEnv(process.env);
  if (translate === undefined) {
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

  let llmCalls = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  const { createVercelAiTranslator } =
    await import("../packages/semantic-chat/dist/adapters/vercel-ai.js");
  const modelId =
    process.env["SEMANTIC_CHAT_MODEL"] ?? process.env["SEMANTIC_MODEL"] ?? "openai/gpt-4o-mini";
  const apiKey = process.env["AI_GATEWAY_API_KEY"]?.trim();
  const translator = createVercelAiTranslator({
    modelId,
    apiKey,
    usageSink: (usage) => {
      llmCalls += 1;
      inputTokens += usage.inputTokens;
      outputTokens += usage.outputTokens;
    },
  });

  const engine = createSemanticChatEngine({
    ontology,
    queryRuntime: runtime,
    translate: translator,
  });
  const suite = JSON.parse(readFileSync(casesPath, "utf8"));
  const wallStart = Date.now();

  console.error(`Baseline · workspace ${workspace}`);
  console.error(
    `Model: ${modelId} · target plan ≥${(minPlanRate * 100).toFixed(0)}% required cases\n`,
  );

  const caseResults = [];
  let requiredTotal = 0;
  let requiredPlanPass = 0;
  let requiredE2ePass = 0;
  let optionalTotal = 0;
  let optionalPlanPass = 0;

  for (const testCase of suite.cases) {
    const started = Date.now();
    let answer;
    let error;
    try {
      answer = await engine.ask(testCase.question);
    } catch (caught) {
      if (
        caught instanceof SemanticPlanValidationError ||
        caught instanceof SemanticChatTranslationError
      ) {
        error = caught;
      } else {
        error = caught instanceof Error ? caught : new Error(String(caught));
      }
    }

    const expect = testCase.expect ?? {};
    const planFailures = assertPlanShape(expect, answer, error);
    const e2eFailures = assertCase(expect, answer, error);
    const durationMs = Date.now() - started;
    const optional = testCase.optional === true;

    const row = {
      id: testCase.id,
      optional,
      durationMs,
      route: answer?.route,
      templateId: answer?.templateId,
      attempts: answer?.attempts,
      planOk: planFailures.length === 0,
      e2eOk: e2eFailures.length === 0,
      planFailures,
      e2eFailures,
    };
    caseResults.push(row);

    if (optional) {
      optionalTotal += 1;
      if (row.planOk) optionalPlanPass += 1;
      console.log(
        `${row.planOk ? "plan✓" : "plan✗"}  ${testCase.id}  ${String(durationMs).padStart(5)}ms  (optional) route=${String(row.route ?? "-")}`,
      );
    } else {
      requiredTotal += 1;
      if (row.planOk) requiredPlanPass += 1;
      if (row.e2eOk) requiredE2ePass += 1;
      const flag = row.planOk && row.e2eOk ? "PASS" : row.planOk ? "PLAN" : "FAIL";
      console.log(
        `${flag.padEnd(4)}  ${testCase.id}  ${String(durationMs).padStart(5)}ms  route=${String(row.route ?? "-")} attempts=${String(row.attempts ?? "-")}`,
      );
      if (!row.planOk) {
        for (const message of planFailures) {
          console.log(`      plan: ${message}`);
        }
      }
      if (row.planOk && !row.e2eOk) {
        for (const message of e2eFailures) {
          console.log(`      e2e: ${message}`);
        }
      }
    }
  }

  const wallMs = Date.now() - wallStart;
  const planRate = rate(requiredPlanPass, requiredTotal);
  const e2eRate = rate(requiredE2ePass, requiredTotal);

  const summary = {
    recordedAt: new Date().toISOString(),
    modelId,
    workspace,
    tenant,
    thresholds: { minPlanRate, minE2eRate },
    required: {
      total: requiredTotal,
      planPass: requiredPlanPass,
      e2ePass: requiredE2ePass,
      planPassRate: planRate,
      e2ePassRate: e2eRate,
    },
    optional: {
      total: optionalTotal,
      planPass: optionalPlanPass,
      planPassRate: rate(optionalPlanPass, optionalTotal),
    },
    llm: {
      calls: llmCalls,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
    },
    wallClockMs: wallMs,
    cases: caseResults,
  };

  console.error("\n--- Baseline summary ---");
  console.error(
    `Required plan: ${String(requiredPlanPass)}/${String(requiredTotal)} (${(planRate * 100).toFixed(1)}%) · target ≥${(minPlanRate * 100).toFixed(0)}%`,
  );
  console.error(
    `Required E2E:  ${String(requiredE2ePass)}/${String(requiredTotal)} (${(e2eRate * 100).toFixed(1)}%) · target ≥${(minE2eRate * 100).toFixed(0)}%`,
  );
  console.error(
    `LLM calls: ${String(llmCalls)} · tokens ${String(inputTokens)}/${String(outputTokens)} · wall ${(wallMs / 1000).toFixed(1)}s`,
  );

  if (jsonOut !== undefined) {
    writeFileSync(jsonOut, `${JSON.stringify(summary, null, 2)}\n`);
    console.error(`Wrote ${jsonOut}`);
  }

  if (planRate < minPlanRate || e2eRate < minE2eRate) {
    console.error("\nBaseline gate FAILED (plan or E2E below threshold).");
    process.exitCode = 1;
  } else {
    console.error("\nBaseline gate PASSED.");
  }
}

await main();
