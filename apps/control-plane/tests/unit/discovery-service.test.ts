import type { DatasetProvider, DatasetSchema, DatasetStatistics } from "@trybacked/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  proposeDocsAiWarehouseDiscovery,
  proposeDocsWarehouseDiscovery,
} from "../../src/authoring/discovery-service.js";

const { runDocsAiOntologyDiscovery, createOntologyExtractModelFromEnv } = vi.hoisted(() => ({
  runDocsAiOntologyDiscovery: vi.fn(),
  createOntologyExtractModelFromEnv: vi.fn(),
}));

vi.mock("@trybacked/ontology-extract", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@trybacked/ontology-extract")>();
  return {
    ...actual,
    runDocsAiOntologyDiscovery,
    createOntologyExtractModelFromEnv,
    createGatewayLanguageModel: vi.fn(),
  };
});

function mockProvider(
  tables: Record<string, { rowCount: number; columns: string[] }>,
): DatasetProvider {
  return {
    listDatasets: async () => [],
    getSchema: async (dataset) => {
      const table = dataset.id.split(".").pop() ?? dataset.id;
      const entry = tables[table];
      if (entry === undefined) {
        throw new Error(`Table not found: ${table}`);
      }
      const columns = entry.columns;
      return {
        columns: columns.map((name) => ({ name, type: "STRING", nullable: true })),
      } satisfies DatasetSchema;
    },
    getMetadata: async (dataset) => {
      const table = dataset.id.split(".").pop() ?? dataset.id;
      const entry = tables[table];
      if (entry === undefined) {
        throw new Error(`Table not found: ${table}`);
      }
      return { rowCount: entry.rowCount };
    },
    getStatistics: async (dataset) => {
      const table = dataset.id.split(".").pop() ?? dataset.id;
      const entry = tables[table];
      if (entry === undefined) {
        throw new Error(`Table not found: ${table}`);
      }
      return {
        columns: entry.columns.map((name) => ({
          name,
          nullCount: 0,
          distinctCount: entry?.rowCount ?? 0,
        })),
      } satisfies DatasetStatistics;
    },
  };
}

describe("proposeDocsWarehouseDiscovery", () => {
  it("returns docs_schema_empty when no tables resolve", async () => {
    const outcome = await proposeDocsWarehouseDiscovery(mockProvider({}), {
      tenantId: "gerace",
      catalog: "backed_gerace",
      runId: "run-1",
      tables: ["documents"],
    });
    expect(outcome).toMatchObject({ code: "docs_schema_empty" });
  });

  it("returns proposal when documents table has rows", async () => {
    const outcome = await proposeDocsWarehouseDiscovery(
      mockProvider({
        documents: { rowCount: 3, columns: ["document_id", "filename"] },
      }),
      {
        tenantId: "gerace",
        catalog: "backed_gerace",
        runId: "run-2",
        tables: ["documents"],
      },
    );
    expect(outcome).toMatchObject({
      profileTableCount: 1,
      proposal: { entities: [{ id: "documents" }] },
    });
  });
});

describe("proposeDocsAiWarehouseDiscovery", () => {
  beforeEach(() => {
    runDocsAiOntologyDiscovery.mockReset();
    createOntologyExtractModelFromEnv.mockReset();
  });

  it("returns ai_not_configured without gateway key", async () => {
    createOntologyExtractModelFromEnv.mockReturnValue(undefined);
    const outcome = await proposeDocsAiWarehouseDiscovery(
      mockProvider({
        documents: { rowCount: 1, columns: ["document_id"] },
      }),
      {},
      {
        tenantId: "gerace",
        catalog: "backed_gerace",
        runId: "run-ai-1",
        tables: ["documents"],
      },
    );
    expect(outcome).toEqual({ code: "ai_not_configured" });
    expect(runDocsAiOntologyDiscovery).not.toHaveBeenCalled();
  });

  it("returns enriched proposal when AI pipeline succeeds", async () => {
    createOntologyExtractModelFromEnv.mockReturnValue({
      apiKey: "test-key",
      modelId: "mock/model",
    });
    runDocsAiOntologyDiscovery.mockResolvedValue({
      profile: [{ table: "documents", sourceFile: "f", rowCount: 2, columns: [] }],
      missingTables: [],
      emptyTables: [],
      discovery: { ontology: { objects: [], relationships: [] } },
      proposal: {
        runId: "run-ai-2",
        generatedAt: "2025-06-01T00:00:00.000Z",
        entities: [{ id: "documents", name: "Documento" }],
        relations: [],
        rules: [],
        doubts: [],
        questions: [],
        usage: { inputTokens: 100, outputTokens: 50, costUsd: null },
      },
      aiUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      sampleTableCount: 1,
    });
    const outcome = await proposeDocsAiWarehouseDiscovery(
      mockProvider({
        documents: { rowCount: 2, columns: ["document_id", "filename"] },
      }),
      { AI_GATEWAY_API_KEY: "test-key" },
      {
        tenantId: "gerace",
        catalog: "backed_gerace",
        runId: "run-ai-2",
        tables: ["documents"],
        locale: "it",
      },
    );
    expect(outcome).toMatchObject({
      profileTableCount: 1,
      sampleTableCount: 1,
      aiUsage: { totalTokens: 150 },
      proposal: { entities: [{ name: "Documento" }] },
    });
    expect(runDocsAiOntologyDiscovery).toHaveBeenCalledOnce();
  });
});
