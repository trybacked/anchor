#!/usr/bin/env node
/**
 * NL planner smoke test (real LLM via Vercel AI Gateway).
 *
 * Usage:
 *   pnpm build && pnpm smoke:semantic-nl
 *   pnpm smoke:semantic-nl -- --workspace /path/to/ontology/gerace
 *
 * Env: AI_GATEWAY_API_KEY, optional SEMANTIC_CHAT_MODEL / SEMANTIC_MODEL,
 *      BACKED_DATABRICKS_* (tenant), ANCHOR_WORKSPACE_ROOT or --workspace.
 */
import { readFileSync, existsSync } from "node:fs";
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
import { assertCase } from "./semantic-nl-assertions.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..");
const defaultWorkspace = join(repoRoot, "..", "ontology", "gerace");
const casesPath = join(scriptDir, "semantic-nl-smoke.cases.json");

function loadEnvFile(path) {
  if (!existsSync(path)) {
    return;
  }
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
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--workspace" && argv[index + 1] !== undefined) {
      workspace = argv[index + 1];
      index += 1;
    }
  }
  return resolve(workspace ?? defaultWorkspace);
}

async function main() {
  const workspaceRoot = parseArgs(process.argv.slice(2));
  loadEnvFile(join(repoRoot, ".env"));
  loadEnvFile(join(workspaceRoot, ".env"));
  const tenant = workspaceRoot.split("/").pop() ?? "gerace";
  loadEnvFile(join(process.env["HOME"] ?? "", ".config", "backed", `${tenant}.env`));

  const translate = createVercelAiTranslatorFromEnv(process.env);
  if (translate === undefined) {
    console.error("Missing AI_GATEWAY_API_KEY. Set it in anchor/.env or the environment.");
    process.exitCode = 1;
    return;
  }

  if (!hasDatabricksEnv(process.env)) {
    console.error("Missing BACKED_DATABRICKS_* env for warehouse execution.");
    process.exitCode = 1;
    return;
  }

  const ontology = loadPublishedOntology(workspaceRoot);
  if (ontology === null) {
    console.error(`No published ontology in ${workspaceRoot}`);
    process.exitCode = 1;
    return;
  }

  const model = readModelYaml(workspaceRoot);
  const client = createDatabricksSqlClient(databricksConfigFromEnv(process.env));
  const { runtime } = await buildQueryRuntimeFromEnv({
    ontology,
    model,
    executor: (sql, parameters) => client.execute(sql, parameters),
    env: process.env,
  });

  const engine = createSemanticChatEngine({ ontology, queryRuntime: runtime, translate });
  const suite = JSON.parse(readFileSync(casesPath, "utf8"));
  const modelId =
    process.env["SEMANTIC_CHAT_MODEL"] ?? process.env["SEMANTIC_MODEL"] ?? "openai/gpt-4o-mini";

  console.error(`Workspace: ${workspaceRoot}`);
  console.error(`Model: ${modelId}`);
  console.error(`Cases: ${String(suite.cases.length)}\n`);

  let passed = 0;
  let failed = 0;
  let advisory = 0;

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

    const failures = assertCase(testCase.expect ?? {}, answer, error);
    const ms = Date.now() - started;
    if (failures.length === 0) {
      passed += 1;
      const summary =
        answer !== undefined
          ? `route=${answer.route} ${answer.result.mode} ${answer.result.objectId} rows=${String(answer.result.rowCount)} attempts=${String(answer.attempts)}`
          : `failed as expected (${error?.name ?? "error"})`;
      console.log(`PASS  ${testCase.id}  ${ms}ms  ${summary}`);
    } else if (testCase.optional === true) {
      advisory += 1;
      console.log(`WARN  ${testCase.id}  ${ms}ms  (optional / LLM may hallucinate a valid plan)`);
      for (const message of failures) {
        console.log(`      - ${message}`);
      }
      if (answer !== undefined) {
        console.log(`      plan: ${JSON.stringify(answer.plan.objectQuery)}`);
      }
    } else {
      failed += 1;
      console.log(`FAIL  ${testCase.id}  ${ms}ms`);
      for (const message of failures) {
        console.log(`      - ${message}`);
      }
      if (answer !== undefined) {
        console.log(`      plan: ${JSON.stringify(answer.plan.objectQuery)}`);
      }
    }
  }

  console.error(
    `\n${String(passed)} passed, ${String(failed)} failed` +
      (advisory > 0 ? `, ${String(advisory)} advisory` : ""),
  );
  if (failed > 0) {
    process.exitCode = 1;
  }
}

await main();
