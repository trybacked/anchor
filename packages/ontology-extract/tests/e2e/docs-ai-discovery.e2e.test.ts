import { createRunId } from "@trybacked/core";
import {
  createDatabricksProviderFromEnv,
  hasDatabricksEnv,
} from "@trybacked/adapter-databricks";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, type TestContext } from "vitest";
import { runDocsWarehouseDiscovery } from "@trybacked/discovery";
import {
  createGatewayLanguageModel,
  createOntologyExtractModelFromEnv,
  runDocsAiOntologyDiscovery,
} from "../../src/index.js";

const e2eDir = dirname(fileURLToPath(import.meta.url));
const anchorRoot = resolve(e2eDir, "../../../..");
const repoRoot = resolve(anchorRoot, "..");

function loadDotEnv(path: string): void {
  if (existsSync(path)) {
    process.loadEnvFile(path);
  }
}

loadDotEnv(join(anchorRoot, ".env"));
loadDotEnv(join(repoRoot, "ontology", "gerace", ".env"));

const modelConfig = createOntologyExtractModelFromEnv(process.env);
const e2eEnabled =
  process.env["ONTOLOGY_EXTRACT_E2E"] === "1" &&
  hasDatabricksEnv(process.env) &&
  modelConfig !== undefined;

describe.skipIf(!e2eEnabled)("docs AI ontology discovery (e2e)", () => {
  it(
    "profiles docs tables, calls LLM, returns a valid enriched proposal",
    async (context: TestContext) => {
      const catalog =
        process.env["ONTOLOGY_EXTRACT_E2E_CATALOG"]?.trim() ??
        process.env["BACKED_DATABRICKS_CATALOG"]?.trim() ??
        "backed_gerace";
      const tenantId = process.env["ONTOLOGY_EXTRACT_E2E_TENANT"]?.trim() ?? "gerace";
      const { provider } = createDatabricksProviderFromEnv(process.env);
      const tables = ["documents", "document_elements", "document_entities"] as const;
      const preflight = await runDocsWarehouseDiscovery(provider, {
        ontologyId: tenantId,
        catalog,
        runId: "preflight",
        tables: [...tables],
      });
      const hasRows = preflight.profile.some((table) => table.rowCount > 0);
      if (!hasRows) {
        context.skip(
          `${catalog}.docs.* has schema but zero rows — upload PDFs and run docs_refresh, then re-run ONTOLOGY_EXTRACT_E2E=1`,
        );
      }

      const model = createGatewayLanguageModel(modelConfig!.apiKey, modelConfig!.modelId);
      const runId = createRunId();

      const result = await runDocsAiOntologyDiscovery(provider, {
        ontologyId: tenantId,
        catalog,
        runId,
        model,
        localeHint: "it",
        tables: [...tables],
      });

      expect(result.profile.length).toBeGreaterThan(0);
      expect(result.proposal.runId).toBe(runId);
      expect(result.proposal.entities.length).toBeGreaterThan(0);
      expect(result.aiUsage.totalTokens).toBeGreaterThan(0);
      expect(result.sampleTableCount).toBeGreaterThan(0);

      const llmTouched = result.proposal.entities.some((entity) =>
        entity.provenance.evidence.includes("llm_file_extraction"),
      );
      expect(llmTouched).toBe(true);

      const renamed = result.proposal.entities.some(
        (entity) => entity.name !== entity.id && entity.name.length > 0,
      );
      expect(renamed).toBe(true);
    },
    120_000,
  );
});
