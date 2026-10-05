#!/usr/bin/env node
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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
  SemanticAgentError,
} from "../packages/semantic-chat/dist/index.js";
import { createAnchorService } from "../packages/service/dist/index.js";
import {
  AGENT_OUTCOMES,
  agentOutcome,
  assertAgentCase,
  lastSuccessfulQuery,
  toolErrorCount,
} from "./semantic-agent-eval-shape.mjs";
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..");
const defaultWorkspace = join(repoRoot, "..", "ontology", "gerace");
const smokeCasesPath = join(scriptDir, "semantic-nl-smoke.cases.json");
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
  let mdOut;
  let jsonOut;
  let includeOptional = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--workspace" && argv[i + 1] !== undefined) {
      workspace = argv[i + 1];
      i += 1;
    } else if (argv[i] === "--md" && argv[i + 1] !== undefined) {
      mdOut = argv[i + 1];
      i += 1;
    } else if (argv[i] === "--json" && argv[i + 1] !== undefined) {
      jsonOut = argv[i + 1];
      i += 1;
    } else if (argv[i] === "--include-optional") {
      includeOptional = true;
    }
  }
  const resolved = resolve(workspace ?? defaultWorkspace);
  const tenant = resolved.split("/").pop() ?? "gerace";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const reportsDir = join(repoRoot, "reports");
  return {
    workspace: resolved,
    tenant,
    mdOut: resolve(mdOut ?? join(reportsDir, `semantic-ask-${tenant}-${stamp}.md`)),
    jsonOut: resolve(jsonOut ?? join(reportsDir, `semantic-ask-${tenant}-${stamp}.json`)),
    includeOptional,
  };
}
function loadJsonlCases(tenant) {
  const dir = join(repoRoot, "evals", tenant);
  if (!existsSync(dir)) return [];
  const cases = [];
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".jsonl"))) {
    for (const line of readFileSync(join(dir, file), "utf8").split("\n")) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      const row = JSON.parse(trimmed);
      cases.push({
        id: row.id ?? `jsonl-${String(cases.length + 1)}`,
        category: row.category ?? file.replace(/\.jsonl$/, ""),
        question: row.question,
        expect: row.expect,
        optional: row.optional === true,
        source: `evals/${tenant}/${file}`,
      });
    }
  }
  return cases;
}
function loadSmokeCases(includeOptional) {
  if (!existsSync(smokeCasesPath)) return [];
  const suite = JSON.parse(readFileSync(smokeCasesPath, "utf8"));
  return suite.cases
    .filter((row) => includeOptional || row.optional !== true)
    .filter((row) => row.expect?.route !== "template")
    .map((row) => ({
      id: row.id,
      category: "smoke",
      question: row.question,
      expect: row.expect,
      optional: row.optional === true,
      source: "scripts/semantic-nl-smoke.cases.json",
    }));
}
function mergeCases(lists) {
  const byId = new Map();
  for (const list of lists) {
    for (const item of list) {
      if (!byId.has(item.id)) {
        byId.set(item.id, item);
      }
    }
  }
  return [...byId.values()];
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
function fmtMs(ms) {
  return `${ms.toFixed(0)} ms`;
}
function fmtUsd(n) {
  return n === undefined ? "—" : `$${n.toFixed(4)}`;
}
function escapeMdCell(text) {
  return String(text ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ");
}
function truncate(text, max) {
  const s = String(text ?? "");
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}
function tryGitSha() {
  for (const cwd of [join(repoRoot, ".."), repoRoot]) {
    try {
      return execSync("git rev-parse --short HEAD", { cwd, encoding: "utf8" }).trim();
    } catch {
      void 0;
    }
  }
  return undefined;
}
function buildMarkdown(payload) {
  const { meta, summary, byCategory, results } = payload;
  const lines = [];
  lines.push("# Semantic AI Ask — benchmark report");
  lines.push("");
  lines.push(`| Field | Value |`);
  lines.push(`| --- | --- |`);
  lines.push(`| Generated (UTC) | ${meta.generatedAt} |`);
  lines.push(`| Tenant / workspace | \`${meta.tenant}\` · \`${meta.workspace}\` |`);
  lines.push(`| Ontology version | ${meta.ontologyVersion ?? "—"} |`);
  lines.push(
    `| Model | \`${meta.modelId}\`${meta.fallbackModelId ? ` (fallback: \`${meta.fallbackModelId}\`)` : ""} |`,
  );
  lines.push(`| Git commit | ${meta.gitSha ?? "—"} |`);
  lines.push(`| Case sources | ${meta.sources.join(", ")} |`);
  lines.push("");
  lines.push("## Executive summary");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("| --- | --- |");
  lines.push(`| Questions | ${summary.questionCount} |`);
  lines.push(
    `| Agent OK (no throw) | ${summary.agentOkCount} (${summary.agentOkRate.toFixed(1)}%) |`,
  );
  lines.push(
    `| Assertions passed | ${summary.assertPassCount} (${summary.assertPassRate.toFixed(1)}%) |`,
  );
  lines.push(`| Clarifications | ${summary.clarificationCount} |`);
  lines.push(`| Wall clock | ${(summary.wallClockMs / 1000).toFixed(1)} s |`);
  lines.push(`| Throughput | ${summary.questionsPerMinute.toFixed(2)} q/min |`);
  lines.push(`| LLM completions | ${summary.llmCalls} |`);
  lines.push(
    `| Tokens in / out / total | ${summary.tokens.inputTokens} / ${summary.tokens.outputTokens} / ${summary.tokens.totalTokens} |`,
  );
  lines.push(`| Est. LLM cost (USD) | ${fmtUsd(summary.estimatedCostUsd)} |`);
  lines.push(`| Cost note | ${summary.costNote ?? "—"} |`);
  lines.push("");
  lines.push("## Outcomes");
  lines.push("");
  lines.push("| Outcome | Count | Share |");
  lines.push("| --- | ---: | ---: |");
  for (const [outcome, count] of Object.entries(summary.outcomes)) {
    const share = summary.questionCount > 0 ? (count / summary.questionCount) * 100 : 0;
    lines.push(`| \`${outcome}\` | ${count} | ${share.toFixed(1)}% |`);
  }
  lines.push(`| Tool errors (recovered or not) | ${summary.toolErrorCount} | — |`);
  lines.push("");
  lines.push("## Latency (successful agent runs)");
  lines.push("");
  lines.push("| Stat | ms |");
  lines.push("| --- | ---: |");
  lines.push(`| Mean | ${summary.latencyMs.mean.toFixed(0)} |`);
  lines.push(`| p50 | ${summary.latencyMs.p50.toFixed(0)} |`);
  lines.push(`| p90 | ${summary.latencyMs.p90.toFixed(0)} |`);
  lines.push(`| p95 | ${summary.latencyMs.p95.toFixed(0)} |`);
  lines.push(`| p99 | ${summary.latencyMs.p99.toFixed(0)} |`);
  lines.push(`| Min | ${summary.latencyMs.min.toFixed(0)} |`);
  lines.push(`| Max | ${summary.latencyMs.max.toFixed(0)} |`);
  lines.push(`| Agent usage latency (sum) | ${summary.agentUsageLatencyMs.sum.toFixed(0)} |`);
  lines.push(`| Agent usage latency (mean) | ${summary.agentUsageLatencyMs.mean.toFixed(0)} |`);
  lines.push("");
  lines.push("## Tool & warehouse activity");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("| --- | --- |");
  lines.push(`| Total tool steps | ${summary.toolSteps.total} |`);
  lines.push(`| \`query_objects\` calls | ${summary.toolSteps.queryObjects} |`);
  lines.push(`| Other tools | ${summary.toolSteps.other} |`);
  lines.push(`| Mean steps per question | ${summary.toolSteps.meanPerQuestion.toFixed(2)} |`);
  lines.push(`| Mean SQL rowCount (last query) | ${summary.rowCount.mean.toFixed(1)} |`);
  lines.push("");
  if (byCategory.length > 0) {
    lines.push("## By category");
    lines.push("");
    lines.push("| Category | n | OK | Assert pass | Mean ms | p95 ms | Tokens | Est. USD |");
    lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
    for (const row of byCategory) {
      lines.push(
        `| ${escapeMdCell(row.category)} | ${row.n} | ${row.agentOk} | ${row.assertPass} | ${row.meanMs.toFixed(0)} | ${row.p95Ms.toFixed(0)} | ${row.tokens} | ${row.costUsd !== undefined ? row.costUsd.toFixed(4) : "—"} |`,
      );
    }
    lines.push("");
  }
  const errorBuckets = new Map();
  for (const row of results) {
    if (row.errorMessage) {
      const key = `${row.errorName ?? "Error"}: ${row.errorMessage}`;
      errorBuckets.set(key, (errorBuckets.get(key) ?? 0) + 1);
    }
  }
  if (errorBuckets.size > 0) {
    lines.push("## Error taxonomy");
    lines.push("");
    lines.push("| Count | Error |");
    lines.push("| ---: | --- |");
    for (const [message, count] of [...errorBuckets.entries()].sort((a, b) => b[1] - a[1])) {
      lines.push(`| ${count} | ${escapeMdCell(message)} |`);
    }
    lines.push("");
  }
  lines.push("## Per-question results");
  lines.push("");
  lines.push(
    "| ID | Cat. | Outcome | Assert | ms | Steps | Tool err | Q.obj | Mode | Rows | Tok in/out | USD | Error (short) | Answer (preview) |",
  );
  lines.push(
    "| --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | ---: | --- | ---: | --- | --- |",
  );
  for (const row of results) {
    lines.push(
      `| ${escapeMdCell(row.id)} | ${escapeMdCell(row.category)} | ${row.outcome} | ${row.assertStatus} | ${row.durationMs} | ${row.stepCount} | ${row.toolErrorCount} | ${escapeMdCell(row.objectId ?? "—")} | ${escapeMdCell(row.mode ?? "—")} | ${row.rowCount ?? "—"} | ${row.inputTokens}/${row.outputTokens} | ${row.costUsd !== undefined ? row.costUsd.toFixed(4) : "—"} | ${escapeMdCell(truncate(row.errorMessage ?? "—", 48))} | ${escapeMdCell(truncate(row.answerPreview, 72))} |`,
    );
  }
  lines.push("");
  const failures = results.filter(
    (row) => row.agentStatus === "error" || row.assertStatus === "fail",
  );
  if (failures.length > 0) {
    lines.push("## Failures & assertion detail");
    lines.push("");
    for (const row of failures) {
      lines.push(`### ${row.id}`);
      lines.push("");
      lines.push(`- **Question:** ${row.question}`);
      lines.push(`- **Source:** ${row.source}`);
      lines.push(`- **Outcome:** \`${row.outcome}\``);
      if (row.toolTrace.length > 0) {
        lines.push(
          `- **Tool trace:** ${row.toolTrace.map((entry) => escapeMdCell(truncate(entry, 160))).join(" → ")}`,
        );
      }
      if (row.errorName) {
        lines.push(`- **Error:** \`${row.errorName}\` — ${row.errorMessage}`);
      }
      if (row.assertFailures?.length) {
        lines.push("- **Assertions:**");
        for (const msg of row.assertFailures) {
          lines.push(`  - ${msg}`);
        }
      }
      if (row.runId) {
        lines.push(`- **runId:** \`${row.runId}\``);
      }
      lines.push("");
    }
  }
  lines.push("## Question catalog");
  lines.push("");
  for (const row of results) {
    lines.push(`1. **${row.id}** (${row.category}): ${row.question}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}
async function main() {
  const { workspace, tenant, mdOut, jsonOut, includeOptional } = parseArgs(process.argv.slice(2));
  loadEnvFile(join(repoRoot, ".env"));
  loadEnvFile(join(workspace, ".env"));
  loadEnvFile(join(process.env["HOME"] ?? "", ".config", "backed", `${tenant}.env`));
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
  const cases = mergeCases([loadSmokeCases(includeOptional), loadJsonlCases(tenant)]);
  if (cases.length === 0) {
    console.error("No benchmark cases loaded.");
    process.exitCode = 1;
    return;
  }
  const costPerMillionIn = Number(process.env["BENCHMARK_COST_USD_PER_1M_INPUT"] ?? "0.15");
  const costPerMillionOut = Number(process.env["BENCHMARK_COST_USD_PER_1M_OUTPUT"] ?? "0.60");
  const wallStart = Date.now();
  const results = [];
  let llmCalls = 0;
  let inputTokensTotal = 0;
  let outputTokensTotal = 0;
  console.error(`Report benchmark · ${String(cases.length)} cases · ${agentModel.modelId}`);
  console.error(`Workspace: ${workspace}\n`);
  for (const testCase of cases) {
    const started = Date.now();
    let agent;
    let error;
    try {
      agent = await runSemanticAgent({
        ontology,
        service,
        question: testCase.question,
        modelId: agentModel.modelId,
        apiKey: agentModel.apiKey,
        ...(agentModel.fallbackModelId !== undefined
          ? { fallbackModelId: agentModel.fallbackModelId }
          : {}),
      });
      llmCalls += 1;
      inputTokensTotal += agent.usage.inputTokens;
      outputTokensTotal += agent.usage.outputTokens;
    } catch (caught) {
      error =
        caught instanceof SemanticAgentError || caught instanceof Error
          ? caught
          : new Error(String(caught));
    }
    const assertFailures = assertAgentCase(testCase.expect, agent, error, testCase.question);
    const durationMs = Date.now() - started;
    const inputTokens = agent?.usage.inputTokens ?? 0;
    const outputTokens = agent?.usage.outputTokens ?? 0;
    const costUsd =
      (inputTokens / 1000000) * costPerMillionIn + (outputTokens / 1000000) * costPerMillionOut;
    const query = lastSuccessfulQuery(agent);
    const row = {
      id: testCase.id,
      category: testCase.category,
      source: testCase.source,
      question: testCase.question,
      optional: testCase.optional === true,
      agentStatus: error === undefined ? "ok" : "error",
      outcome: agentOutcome(agent, error),
      assertStatus:
        assertFailures.length === 0
          ? testCase.expect !== undefined
            ? "pass"
            : "n/a"
          : testCase.optional
            ? "warn"
            : "fail",
      durationMs,
      stepCount: agent?.steps.length ?? 0,
      toolErrorCount: toolErrorCount(agent),
      objectId: query?.result.objectId ?? query?.input.objectId,
      mode: query?.result.mode ?? query?.input.mode,
      rowCount: query !== undefined ? Number(query.result.rowCount) : undefined,
      inputTokens,
      outputTokens,
      costUsd: agent !== undefined ? costUsd : undefined,
      clarification: agent?.clarification !== undefined,
      answerPreview: agent?.answer ?? "",
      runId: agent?.runId,
      errorName: error?.name,
      errorMessage: error?.message,
      assertFailures,
      toolNames: agent?.steps.map((step) => step.toolName) ?? [],
      toolTrace:
        agent?.steps.map((step) =>
          step.status === "error" ? `${step.toolName} ✗ (${step.error ?? "error"})` : step.toolName,
        ) ?? [],
      agentUsageLatencyMs: agent?.usage.latencyMs,
    };
    results.push(row);
    const flag =
      row.agentStatus === "error"
        ? "ERR"
        : row.assertStatus === "fail"
          ? "ASN"
          : row.assertStatus === "warn"
            ? "WRN"
            : "OK ";
    console.log(
      `${flag}  ${row.id.padEnd(28)}  ${String(row.durationMs).padStart(6)}ms  steps=${String(row.stepCount)}  tok=${String(inputTokens)}/${String(outputTokens)}`,
    );
  }
  const wallClockMs = Date.now() - wallStart;
  const agentOk = results.filter((row) => row.agentStatus === "ok");
  const assertPass = results.filter(
    (row) => row.assertStatus === "pass" || row.assertStatus === "n/a",
  );
  const durations = agentOk.map((row) => row.durationMs).sort((a, b) => a - b);
  const usageLatencies = agentOk
    .map((row) => row.agentUsageLatencyMs ?? 0)
    .filter((value) => value > 0);
  const toolStepsTotal = agentOk.reduce((sum, row) => sum + row.stepCount, 0);
  const queryObjectCalls = agentOk.reduce(
    (sum, row) => sum + row.toolNames.filter((name) => name === "query_objects").length,
    0,
  );
  const rowCounts = agentOk
    .map((row) => row.rowCount)
    .filter((value) => typeof value === "number" && Number.isFinite(value));
  const summary = {
    questionCount: results.length,
    agentOkCount: agentOk.length,
    agentOkRate: (agentOk.length / results.length) * 100,
    assertPassCount: assertPass.length,
    assertPassRate: (assertPass.length / results.length) * 100,
    clarificationCount: results.filter((row) => row.clarification).length,
    outcomes: Object.fromEntries(
      AGENT_OUTCOMES.map((outcome) => [
        outcome,
        results.filter((row) => row.outcome === outcome).length,
      ]),
    ),
    toolErrorCount: results.reduce((sum, row) => sum + row.toolErrorCount, 0),
    wallClockMs,
    questionsPerMinute: wallClockMs > 0 ? (results.length / wallClockMs) * 60000 : 0,
    llmCalls,
    tokens: {
      inputTokens: inputTokensTotal,
      outputTokens: outputTokensTotal,
      totalTokens: inputTokensTotal + outputTokensTotal,
    },
    estimatedCostUsd:
      (inputTokensTotal / 1000000) * costPerMillionIn +
      (outputTokensTotal / 1000000) * costPerMillionOut,
    costNote:
      "USD estimate from BENCHMARK_COST_USD_PER_1M_INPUT/OUTPUT (defaults: gpt-4o-mini list-ish). Verify on Vercel AI Gateway.",
    latencyMs: {
      mean: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
      p50: percentile(durations, 50),
      p90: percentile(durations, 90),
      p95: percentile(durations, 95),
      p99: percentile(durations, 99),
      min: durations[0] ?? 0,
      max: durations[durations.length - 1] ?? 0,
    },
    agentUsageLatencyMs: {
      sum: usageLatencies.reduce((a, b) => a + b, 0),
      mean: usageLatencies.length
        ? usageLatencies.reduce((a, b) => a + b, 0) / usageLatencies.length
        : 0,
    },
    toolSteps: {
      total: toolStepsTotal,
      queryObjects: queryObjectCalls,
      other: toolStepsTotal - queryObjectCalls,
      meanPerQuestion: agentOk.length ? toolStepsTotal / agentOk.length : 0,
    },
    rowCount: {
      mean: rowCounts.length ? rowCounts.reduce((a, b) => a + b, 0) / rowCounts.length : 0,
    },
  };
  const categoryMap = new Map();
  for (const row of results) {
    const bucket = categoryMap.get(row.category) ?? {
      category: row.category,
      n: 0,
      agentOk: 0,
      assertPass: 0,
      durations: [],
      tokens: 0,
      costUsd: 0,
    };
    bucket.n += 1;
    if (row.agentStatus === "ok") bucket.agentOk += 1;
    if (row.assertStatus === "pass" || row.assertStatus === "n/a") bucket.assertPass += 1;
    if (row.agentStatus === "ok") bucket.durations.push(row.durationMs);
    bucket.tokens += row.inputTokens + row.outputTokens;
    bucket.costUsd += row.costUsd ?? 0;
    categoryMap.set(row.category, bucket);
  }
  const byCategory = [...categoryMap.values()].map((bucket) => {
    const sorted = bucket.durations.sort((a, b) => a - b);
    return {
      category: bucket.category,
      n: bucket.n,
      agentOk: bucket.agentOk,
      assertPass: bucket.assertPass,
      meanMs: sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0,
      p95Ms: percentile(sorted, 95),
      tokens: bucket.tokens,
      costUsd: bucket.costUsd,
    };
  });
  const meta = {
    generatedAt: new Date().toISOString(),
    tenant,
    workspace,
    ontologyVersion: ontology.metadata.version,
    modelId: agentModel.modelId,
    fallbackModelId: agentModel.fallbackModelId,
    gitSha: tryGitSha(),
    sources: [...new Set(cases.map((row) => row.source))],
    costPerMillionIn,
    costPerMillionOut,
  };
  const payload = { meta, summary, byCategory, results };
  mkdirSync(dirname(mdOut), { recursive: true });
  mkdirSync(dirname(jsonOut), { recursive: true });
  writeFileSync(jsonOut, `${JSON.stringify(payload, null, 2)}\n`);
  writeFileSync(mdOut, buildMarkdown(payload));
  console.error("\n--- Summary ---");
  console.error(
    `Agent OK: ${summary.agentOkCount}/${summary.questionCount} · Assert pass: ${summary.assertPassCount}/${summary.questionCount}`,
  );
  console.error(
    `Latency mean/p95: ${fmtMs(summary.latencyMs.mean)} / ${fmtMs(summary.latencyMs.p95)} · wall ${(wallClockMs / 1000).toFixed(1)}s`,
  );
  console.error(
    `Tokens ${summary.tokens.inputTokens}/${summary.tokens.outputTokens} · est. ${fmtUsd(summary.estimatedCostUsd)}`,
  );
  console.error(`\nWrote ${mdOut}`);
  console.error(`Wrote ${jsonOut}`);
  const hardFails = results.filter(
    (row) => row.agentStatus === "error" || (row.assertStatus === "fail" && !row.optional),
  );
  if (hardFails.length > 0) {
    process.exitCode = 1;
  }
}
await main();
