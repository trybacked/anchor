import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@trybacked/infrastructure", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@trybacked/infrastructure")>();
  const usage = { inputTokens: 0, outputTokens: 0, costUsd: null };
  const mockLlm = {
    modelId: "mock",
    async generateStructured<T>(request: { schemaName: string }): Promise<{
      value: T;
      modelId: string;
      usage: typeof usage;
      cacheHit: boolean;
    }> {
      if (request.schemaName === "ontology_terms") {
        return {
          value: {
            terms: [
              {
                id: "organization",
                name: "Organization",
                description: "Legal entity",
                evidenceUri: "contracts/acme-supplier.txt",
              },
              {
                id: "contract",
                name: "Contract",
                evidenceUri: "contracts/acme-supplier.txt",
              },
            ],
          } as T,
          modelId: "mock",
          usage,
          cacheHit: false,
        };
      }
      if (request.schemaName === "ontology_relations") {
        return {
          value: {
            relations: [
              {
                id: "contract_organization",
                name: "contract party",
                fromObjectTypeId: "contract",
                toObjectTypeId: "organization",
                cardinality: "many_to_one",
                evidenceUri: "contracts/acme-supplier.txt",
              },
            ],
          } as T,
          modelId: "mock",
          usage,
          cacheHit: false,
        };
      }
      if (request.schemaName.startsWith("extract_")) {
        return {
          value: {
            rows: [
              {
                values: { name: "Acme Corporation" },
                evidenceQuote: "Acme Corporation",
              },
            ],
          } as T,
          modelId: "mock",
          usage,
          cacheHit: false,
        };
      }
      throw new Error(`Unexpected mock schema: ${request.schemaName}`);
    },
    generateText: async () => ({ text: "", usage, cacheHit: false }),
  };
  return {
    ...actual,
    requireAiGatewayApiKey: () => "mock-gateway-key",
    createGatewayLanguageModel: () => mockLlm,
  };
});

import { runIngest } from "@trybacked/ingest";
import { runPipeline } from "@trybacked/pipeline";
import { runCli } from "../helpers/run-cli.js";
import { createTempWorkspace, removeTempWorkspace } from "../helpers/temp-workspace.js";

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
`,
    "utf8",
  );
}

describe("anchor document pipeline e2e (AI-only, mocked gateway)", () => {
  let tempWorkspace: string | undefined;

  afterEach(async () => {
    await removeTempWorkspace(tempWorkspace);
    tempWorkspace = undefined;
  });

  it("init + ingest via CLI, full AI pipeline in-process", async () => {
    tempWorkspace = await createTempWorkspace("backed-anchor-e2e-");
    seedDocumentWorkspace(tempWorkspace);
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      AI_GATEWAY_API_KEY: "mock-gateway-key",
      BACKED_ENGINE: "files",
      BACKED_FILES_ROOT: join(tempWorkspace, "sources"),
      BACKED_DUCKDB_PATH: join(tempWorkspace, ".backed", "e2e.duckdb"),
    };

    expect((await runCli(["anchor", "init", "-y"], tempWorkspace, env)).exitCode).toBe(0);

    await runIngest({
      workspaceRoot: tempWorkspace,
      filesRoot: env["BACKED_FILES_ROOT"]!,
      tenantId: "tenant",
      env,
    });

    const checkpoint = await runPipeline({
      workspaceRoot: tempWorkspace,
      filesRoot: env["BACKED_FILES_ROOT"]!,
      tenantId: "tenant",
      env,
    });
    expect(checkpoint.completedStages).toEqual(
      expect.arrayContaining(["ingest", "induce", "extract", "evaluate", "sync"]),
    );

    const changeSet = JSON.parse(
      readFileSync(join(tempWorkspace, ".backed", "change-set.json"), "utf8"),
    ) as { changes: Array<{ rationale: string }> };
    expect(changeSet.changes.some((change) => change.rationale.includes("LLMs4OL"))).toBe(true);
    expect(existsSync(join(tempWorkspace, "model.yaml"))).toBe(true);

    const evalResult = await runCli(["anchor", "eval", "--json"], tempWorkspace, env, 30_000);
    expect(evalResult.exitCode).toBe(0);
  });
});
