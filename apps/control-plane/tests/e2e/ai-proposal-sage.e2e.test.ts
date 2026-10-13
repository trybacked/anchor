import { createSageDecisionModel } from "@trybacked/infrastructure";
import { DEFAULT_DECISION_POLICY } from "@trybacked/ontology-ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startMockSageServer } from "../../../../packages/ontology-ai/tests/e2e/mock-sage-server.js";
import { createControlPlaneApp } from "../../src/app.js";
import type { ControlPlaneConfig } from "../../src/config.js";

vi.mock("../../src/db/repositories.js", () => ({
  getOrganizationByTenantId: vi.fn(async () => ({
    id: "org-1",
    tenant_id: "tenant-e2e",
    catalog: "backed_tenant_e2e",
  })),
}));

vi.mock("../../src/db/ontology-repositories.js", () => ({
  resolveTenantRole: vi.fn(async () => "editor" as const),
}));

vi.mock("../../src/db/ai-proposal-repositories.js", () => ({
  ensureAiProposalsTable: vi.fn(async () => undefined),
  insertAiProposal: vi.fn(async (input: { id: string; tenantId: string; runId: string }) => ({
    id: input.id,
    tenantId: input.tenantId,
    runId: input.runId,
    scopeKind: "tenant",
    scopeRef: undefined,
    status: "proposed",
    payload: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  })),
  setAiProposalStatus: vi.fn(async () => undefined),
}));

vi.mock("@trybacked/infrastructure", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@trybacked/infrastructure")>();
  return {
    ...actual,
    createDatasetProviderFromEnv: vi.fn(() => ({
      listDatasets: async () => [{ id: "db.main.contracts", name: "contracts" }],
      getSchema: async () => ({
        columns: [{ name: "contract_id", type: "string", nullable: false }],
      }),
      getMetadata: async () => ({ rowCount: 1 }),
      getStatistics: async () => ({ columns: [] }),
      sample: async () => ({
        columns: ["contract_id"],
        rows: [["C-0"]],
      }),
    })),
  };
});

vi.mock("@trybacked/ontology-extract", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@trybacked/ontology-extract")>();
  return {
    ...actual,
    createOntologyExtractModelFromEnv: vi.fn(() => ({
      apiKey: "mock-gateway",
      modelId: "mock-model",
    })),
    createGatewayLanguageModel: vi.fn(() => ({
      modelId: "mock-model",
    })),
  };
});

vi.mock("@trybacked/ontology-ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@trybacked/ontology-ai")>();
  return {
    ...actual,
    createAiSdkLlm: vi.fn(() => ({
      generateObject: async ({ schema }: { schema: { parse: (v: unknown) => unknown } }) =>
        schema.parse({
          changes: [
            {
              id: "change-1",
              command: {
                type: "addObjectType",
                objectType: {
                  id: "contract",
                  name: "Contract",
                  backing: [
                    {
                      sourceId: "contracts",
                      datasetId: "db.main.contracts",
                      columnMappings: { contract_id: "contract_id" },
                    },
                  ],
                  properties: [
                    {
                      kind: "physical",
                      id: "contract_id",
                      name: "Contract ID",
                      type: "string",
                      bindingSourceId: "contracts",
                      column: "contract_id",
                      role: "primary_key",
                    },
                  ],
                },
              },
              confidence: 0.93,
              rationale: "Stable identifier column.",
              evidence: [
                {
                  datasetId: "db.main.contracts",
                  columnName: "contract_id",
                  sampleValues: ["C-0"],
                },
              ],
            },
          ],
        }),
    })),
  };
});

const config: ControlPlaneConfig = {
  host: "127.0.0.1",
  port: 8791,
  databaseUrl: "postgresql://unused",
  adminToken: "admin-token-test",
  internalToken: "internal-token-test",
  filesRoot: "./sources",
  filesRegistryRoot: "./.backed/remote-registry",
  sharedSpacesJson: "{}",
  defaultSharedSpaces: [],
  decisionPolicy: DEFAULT_DECISION_POLICY,
  serverAutoApproveThresholdMin: 0.85,
};

describe("POST /authoring/ai/proposals with Sage (e2e)", () => {
  let sageBaseUrl: string;
  let closeSage: () => Promise<void>;

  beforeEach(async () => {
    const server = await startMockSageServer();
    sageBaseUrl = server.baseUrl;
    closeSage = server.close;
  });

  afterEach(async () => {
    await closeSage();
  });

  it("returns decisionSummary and Sage advisor fields", async () => {
    const decisionModel = createSageDecisionModel({
      apiKey: "lv_test_e2e",
      baseUrl: sageBaseUrl,
      timeoutMs: 10_000,
      reasoning: "off",
    });
    const pool = { query: vi.fn(async () => ({ rows: [] })) };
    const app = createControlPlaneApp(config, pool as never, { decisionModel });

    const response = await app.request(
      "http://localhost/v1/tenants/tenant-e2e/authoring/ai/proposals",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer internal-token-test",
          "X-Backed-User": "e2e-user",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ scope: { kind: "tenant" } }),
      },
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      decisionSummary: { autoApproved: number; needsReview: number };
      proposal: { decisions: Array<{ advisor?: { modelId: string } }> };
    };
    expect(body.decisionSummary.autoApproved).toBe(1);
    expect(body.proposal.decisions[0]?.advisor?.modelId).toBe("mock-sage-e2e");
  });
});
