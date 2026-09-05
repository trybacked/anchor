#!/usr/bin/env node
/**
 * E2E smoke: run backed model on fixtures/mixed/ in a temp workspace.
 * Requires AI_GATEWAY_API_KEY for full LLM path; exits non-zero on pipeline failure.
 */

import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const cliPath = join(repoRoot, "apps/cli/dist/cli.js");
const fixturesMixed = join(repoRoot, "fixtures/mixed");

const workspace = mkdtempSync(join(tmpdir(), "backed-mixed-e2e-"));

async function setupWorkspace() {
  cpSync(fixturesMixed, join(workspace, "sources"), { recursive: true });
  const { initWorkspace } = await import(
    pathToFileURL(join(repoRoot, "packages/core/dist/index.js")).href
  );
  initWorkspace(workspace, {
    sourcesDir: "./sources",
    documentTypeHints: [
      {
        match: "notice",
        documentType: "notice",
        documentTypeLabel: "Notice",
        confidence: 0.95,
      },
      {
        match: "determination",
        documentType: "determination",
        documentTypeLabel: "Determination",
        confidence: 0.95,
      },
    ],
  });
}

try {
  await setupWorkspace();

  const model = spawnSync(process.execPath, [cliPath, "model", "--no-embed"], {
    cwd: workspace,
    stdio: "inherit",
  });
  if (model.status !== 0) {
    process.exit(model.status ?? 1);
  }

  console.log(`Mixed folder E2E completed in ${workspace}`);
} finally {
  rmSync(workspace, { recursive: true, force: true });
}
