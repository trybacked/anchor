import { createRunId } from "@trybacked/core";
import { createDatasetProviderFromEnv } from "@trybacked/infrastructure";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, type TestContext } from "vitest";
import { profileFromDatasetProvider } from "@trybacked/discovery";
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
const filesRoot = process.env["BACKED_FILES_ROOT"]?.trim();
const e2eEnabled =
  process.env["ONTOLOGY_EXTRACT_E2E"] === "1" &&
  filesRoot !== undefined &&
  filesRoot.length > 0 &&
  modelConfig !== undefined;

describe.skipIf(!e2eEnabled)("docs AI ontology discovery (e2e)", () => {
  it("profiles file collections, calls LLM, returns a valid enriched proposal", async (context: TestContext) => {
    const tenantId = process.env["ONTOLOGY_EXTRACT_E2E_TENANT"]?.trim() ?? "gerace";
    const catalog =
      process.env["ONTOLOGY_EXTRACT_E2E_CATALOG"]?.trim() ??
      process.env["BACKED_CATALOG"]?.trim() ??
      `backed_${tenantId}`;
    const provider = createDatasetProviderFromEnv(process.env, { tenantId });
    const profile = await profileFromDatasetProvider(provider);
    const hasRows = profile.some((table) => table.rowCount > 0);
    if (!hasRows) {
      context.skip(
        `No documents under ${filesRoot}/${tenantId} — add files, then re-run ONTOLOGY_EXTRACT_E2E=1`,
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
  }, 120_000);
});
