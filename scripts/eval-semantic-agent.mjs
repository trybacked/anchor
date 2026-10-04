#!/usr/bin/env node
/**
 * Run agent eval cases from anchor/evals/<tenant>/*.jsonl (trace assertions only; no LLM by default).
 * Usage: pnpm eval:semantic --tenant gerace
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..");

function parseArgs(argv) {
  let tenant = "gerace";
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--tenant" && argv[index + 1] !== undefined) {
      tenant = argv[index + 1];
      index += 1;
    }
  }
  return tenant;
}

function loadCases(tenant) {
  const dir = join(repoRoot, "evals", tenant);
  if (!existsSync(dir)) {
    console.error(`No eval dir: ${dir}`);
    process.exitCode = 1;
    return [];
  }
  const cases = [];
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".jsonl"))) {
    const lines = readFileSync(join(dir, file), "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      cases.push(JSON.parse(trimmed));
    }
  }
  return cases;
}

const tenant = parseArgs(process.argv.slice(2));
const cases = loadCases(tenant);
console.error(`Tenant: ${tenant}, cases: ${String(cases.length)}`);
for (const testCase of cases) {
  console.log(JSON.stringify({ id: testCase.id, status: "pending", note: "wire to runSemanticAgent in CI" }));
}
