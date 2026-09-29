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

function filterValueMatches(actual, expected) {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      return false;
    }
    const actualSet = new Set(actual.map((entry) => String(entry)));
    return expected.every((entry) => actualSet.has(String(entry)));
  }
  return String(actual) === String(expected);
}

function filterMatches(actualFilters, expected) {
  return actualFilters.some(
    (filter) =>
      filter.propertyId === expected.propertyId &&
      filter.op === expected.op &&
      filterValueMatches(filter.value, expected.value) &&
      (expected.objectId === undefined || filter.objectId === expected.objectId),
  );
}

function monthFilterMatches(actualFilters, months) {
  const monthSet = new Set(months.map(String));
  return actualFilters.some((filter) => {
    if (filter.propertyId !== "source_year_month") {
      return false;
    }
    if (filter.op === "eq" && monthSet.has(String(filter.value))) {
      return true;
    }
    if (filter.op === "in" && Array.isArray(filter.value)) {
      return filter.value.some((entry) => monthSet.has(String(entry)));
    }
    return false;
  });
}

function joinMatches(actualJoins, expectedJoins) {
  if (expectedJoins === undefined || expectedJoins.length === 0) {
    return true;
  }
  const ids = new Set((actualJoins ?? []).map((join) => join.relationshipId));
  return expectedJoins.every((join) => ids.has(join.relationshipId));
}

function parseCount(rows) {
  const raw = rows[0]?.["count"];
  if (typeof raw === "number") return raw;
  if (typeof raw === "bigint") return Number(raw);
  if (typeof raw === "string") return Number(raw);
  return NaN;
}

function assertCase(expectation, answer, error) {
  const failures = [];

  if (expectation.shouldFail === true) {
    if (error === undefined) {
      failures.push("expected planner/validation failure but ask succeeded");
      return failures;
    }
    if (expectation.failType !== undefined && error.name !== expectation.failType) {
      failures.push(`expected ${expectation.failType}, got ${error.name}: ${error.message}`);
    }
    return failures;
  }

  if (error !== undefined) {
    failures.push(`${error.name}: ${error.message}`);
    return failures;
  }

  if (answer === undefined) {
    failures.push("missing answer");
    return failures;
  }

  if (expectation.route !== undefined && answer.route !== expectation.route) {
    failures.push(`route ${String(answer.route)} !== ${expectation.route}`);
  }
  if (expectation.templateId !== undefined && answer.templateId !== expectation.templateId) {
    failures.push(`templateId ${String(answer.templateId)} !== ${expectation.templateId}`);
  }

  const query = answer.plan.objectQuery;
  if (expectation.objectId !== undefined && query.objectId !== expectation.objectId) {
    failures.push(`objectId ${query.objectId} !== ${expectation.objectId}`);
  }
  if (expectation.mode !== undefined && answer.result.mode !== expectation.mode) {
    failures.push(`mode ${answer.result.mode} !== ${expectation.mode}`);
  }
  if (expectation.maxAttempts !== undefined && answer.attempts > expectation.maxAttempts) {
    failures.push(`attempts ${String(answer.attempts)} > ${String(expectation.maxAttempts)}`);
  }
  if (expectation.filtersInclude !== undefined) {
    for (const filter of expectation.filtersInclude) {
      if (!filterMatches(query.filters ?? [], filter)) {
        failures.push(`missing filter ${JSON.stringify(filter)}`);
      }
    }
  }
  if (expectation.filtersIncludeMonths !== undefined) {
    if (!monthFilterMatches(query.filters ?? [], expectation.filtersIncludeMonths)) {
      failures.push(`missing month filter for ${JSON.stringify(expectation.filtersIncludeMonths)}`);
    }
  }
  if (expectation.groupByIncludes !== undefined) {
    const groupBy = query.groupBy ?? [];
    for (const propertyId of expectation.groupByIncludes) {
      if (!groupBy.includes(propertyId)) {
        failures.push(`groupBy missing ${propertyId} (got ${JSON.stringify(groupBy)})`);
      }
    }
  }
  if (expectation.aggregationsMin !== undefined) {
    const count = query.aggregations?.length ?? 0;
    if (count < expectation.aggregationsMin) {
      failures.push(`aggregations ${String(count)} < min ${String(expectation.aggregationsMin)}`);
    }
  }
  if (expectation.selectIncludesAny !== undefined) {
    const select = query.select ?? [];
    const hit = expectation.selectIncludesAny.some((needle) =>
      select.some((column) => column.includes(needle)),
    );
    if (!hit) {
      failures.push(`select ${JSON.stringify(select)} missing one of ${JSON.stringify(expectation.selectIncludesAny)}`);
    }
  }
  if (expectation.sqlIncludes !== undefined) {
    const sql = answer.result.sql.toUpperCase();
    for (const fragment of expectation.sqlIncludes) {
      if (!sql.includes(fragment.toUpperCase())) {
        failures.push(`sql missing ${fragment}`);
      }
    }
  }
  if (expectation.minResultRows !== undefined && answer.result.rowCount < expectation.minResultRows) {
    failures.push(
      `result rows ${String(answer.result.rowCount)} < min ${String(expectation.minResultRows)}`,
    );
  }
  if (!joinMatches(query.joins, expectation.joinsInclude)) {
    failures.push(`joins ${JSON.stringify(query.joins)} missing ${JSON.stringify(expectation.joinsInclude)}`);
  }
  if (expectation.maxRowCount !== undefined && answer.result.rowCount > expectation.maxRowCount) {
    failures.push(`rowCount ${String(answer.result.rowCount)} > ${String(expectation.maxRowCount)}`);
  }
  if (expectation.minProvenanceRows !== undefined && answer.provenance.length < expectation.minProvenanceRows) {
    failures.push(`provenance rows ${String(answer.provenance.length)} < ${String(expectation.minProvenanceRows)}`);
  }
  if (expectation.countEquals !== undefined) {
    const count = parseCount(answer.result.rows);
    if (count !== expectation.countEquals) {
      failures.push(`count ${String(count)} !== ${String(expectation.countEquals)}`);
    }
  }
  if (expectation.countMin !== undefined) {
    const count = parseCount(answer.result.rows);
    if (!Number.isFinite(count) || count < expectation.countMin) {
      failures.push(`count ${String(count)} < min ${String(expectation.countMin)}`);
    }
  }
  if (answer.result.sql.length === 0) {
    failures.push("empty compiled sql");
  }

  return failures;
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
          ? `${answer.result.mode} ${answer.result.objectId} rows=${String(answer.result.rowCount)} attempts=${String(answer.attempts)}`
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
