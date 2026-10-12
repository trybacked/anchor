/**
 * Live E2E: real AI Gateway calls. Requires anchor/.env with AI_GATEWAY_API_KEY.
 * CI skips when the key is absent from that file.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readDotEnvFile } from "../helpers/read-dotenv.js";
import { REPO_ROOT } from "../helpers/paths.js";
import { runCli } from "../helpers/run-cli.js";
import { createTempWorkspace, removeTempWorkspace } from "../helpers/temp-workspace.js";

const anchorDotEnv = readDotEnvFile(join(REPO_ROOT, ".env"));
const liveGatewayKey = (anchorDotEnv["AI_GATEWAY_API_KEY"] ?? "").trim();
const liveEnabled = liveGatewayKey.length > 0;

const CORPUS_TEXT = `Acme Corporation entered a master supply agreement with Supplier Beta on 2024-01-15.
The Organization Acme Corporation is the buyer. Supplier Beta shall deliver components monthly.
Contract value: EUR 250000. Legal entity Acme Corporation, VAT IT12345678901.`;

function seedDocumentWorkspace(root: string): void {
  const sources = join(root, "sources", "contracts");
  mkdirSync(sources, { recursive: true });
  writeFileSync(join(sources, "acme-supplier.txt"), CORPUS_TEXT, "utf8");
  writeFileSync(
    join(root, "competency-questions.yaml"),
    `questions:
  - id: q1
    text: Which organizations appear in the contracts?
  - id: q2
    text: What is the contract value for Acme Corporation?
`,
    "utf8",
  );
}

function liveEnv(root: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...anchorDotEnv,
    AI_GATEWAY_API_KEY: liveGatewayKey,
    BACKED_ENGINE: "files",
    BACKED_FILES_ROOT: join(root, "sources"),
    BACKED_DUCKDB_PATH: join(root, ".backed", "live-e2e.duckdb"),
  };
}

describe.skipIf(!liveEnabled)("anchor document pipeline LIVE e2e (real AI Gateway)", () => {
  let tempWorkspace: string | undefined;

  afterEach(async () => {
    await removeTempWorkspace(tempWorkspace);
    tempWorkspace = undefined;
  });

  it(
    "init → ingest → run uses LLMs4OL (not heuristic fallback)",
    async () => {
      tempWorkspace = await createTempWorkspace("backed-anchor-live-");
      seedDocumentWorkspace(tempWorkspace);
      const env = liveEnv(tempWorkspace);

      expect((await runCli(["anchor", "init", "-y"], tempWorkspace, env)).exitCode).toBe(0);

      const ingest = await runCli(["anchor", "ingest"], tempWorkspace, env, 120_000);
      expect(ingest.exitCode).toBe(0);

      const run = await runCli(["anchor", "run"], tempWorkspace, env, 600_000);
      if (run.exitCode !== 0) {
        throw new Error(
          `anchor run failed (exit ${String(run.exitCode)})\nstdout:\n${run.stdout}\nstderr:\n${run.stderr}`,
        );
      }

      const changeSet = JSON.parse(
        readFileSync(join(tempWorkspace, ".backed", "change-set.json"), "utf8"),
      ) as { changes: Array<{ rationale: string }> };
      expect(changeSet.changes.length).toBeGreaterThan(0);
      expect(
        changeSet.changes.every((change) => change.rationale.includes("LLMs4OL")),
      ).toBe(true);
      expect(
        changeSet.changes.some((change) =>
          change.rationale.toLowerCase().includes("deterministic"),
        ),
      ).toBe(false);

      expect(existsSync(join(tempWorkspace, ".backed", "llm-cache"))).toBe(true);

      const evalResult = await runCli(["anchor", "eval", "--json"], tempWorkspace, env, 60_000);
      expect(evalResult.exitCode).toBe(0);
    },
    720_000,
  );
});
