import type { Ontology, SemanticModel } from "@trybacked/core";
import { createOntologyQueryRuntime } from "@trybacked/runtime";
import { describe, expect, it, vi } from "vitest";
import { createAnchorService } from "../../src/index.js";

const emptyModel = (runId: string): SemanticModel => ({
  metadata: {
    formatVersion: "1",
    runId,
    generatedAt: "2026-01-01T00:00:00.000Z",
  },
  entities: [],
  relations: [],
  rules: [],
});

const procurementOntology: Ontology = {
  metadata: { formatVersion: "1", id: "demo", version: 1 },
  objects: [
    {
      id: "contract",
      name: "Contract",
      sourceDatasetId: "demo.procurement.contracts",
      properties: [
        { id: "cig", name: "CIG", type: "string", role: "primary_key" },
        { id: "project_id", name: "Project id", type: "string", role: "attribute" },
      ],
    },
    {
      id: "project",
      name: "Project",
      sourceDatasetId: "backed.docs.projects",
      properties: [
        { id: "project_id", name: "Project id", type: "string", role: "primary_key" },
        { id: "name", name: "Name", type: "string", role: "attribute" },
      ],
    },
  ],
  relationships: [
    {
      id: "project_has_contracts",
      name: "Project has contracts",
      fromObjectId: "project",
      toObjectId: "contract",
      fromPropertyId: "project_id",
      toPropertyId: "project_id",
      cardinality: "one_to_many",
    },
  ],
  logic: [],
  actions: [],
};

describe("createAnchorService objectQuery", () => {
  it("runs join queries through the injected runtime", async () => {
    const executor = vi.fn(() => Promise.resolve([{ cig: "X1" }]));
    const queryRuntime = createOntologyQueryRuntime({
      ontology: procurementOntology,
      executor,
    });
    const service = createAnchorService({
      model: emptyModel("service-object-query"),
      ontology: procurementOntology,
      queryRuntime,
      executionProfile: "mcp",
    });
    const result = await service.objectQuery({
      objectId: "contract",
      joins: [{ relationshipId: "project_has_contracts" }],
      filters: [{ objectId: "project", propertyId: "name", op: "eq", value: "Beta" }],
      limit: 10,
    });
    expect(executor).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      objectId: "contract",
      rowCount: 1,
      rows: [{ cig: "X1" }],
    });
  });

  it("maps execution budget violations to bad_request", async () => {
    const queryRuntime = createOntologyQueryRuntime({
      ontology: procurementOntology,
      executor: () => Promise.resolve([]),
    });
    const service = createAnchorService({
      model: emptyModel("service-budget"),
      ontology: procurementOntology,
      queryRuntime,
      executionProfile: "semantic_chat",
    });
    const result = await service.objectQuery({
      objectId: "contract",
      filters: [],
      limit: 500,
    });
    expect(result).toMatchObject({
      error: {
        code: "bad_request",
        message: expect.stringContaining("Row limit"),
        issues: [
          {
            code: "query_budget_exceeded",
            path: "query",
          },
        ],
      },
    });
  });

  it("propagates compiler query issues with suggestions", async () => {
    const queryRuntime = createOntologyQueryRuntime({
      ontology: procurementOntology,
      executor: () => Promise.resolve([]),
    });
    const service = createAnchorService({
      model: emptyModel("service-issues"),
      ontology: procurementOntology,
      queryRuntime,
      executionProfile: "mcp",
    });
    const result = await service.objectQuery({
      objectId: "contract",
      filters: [{ propertyId: "cigg", op: "eq", value: "X1" }],
    });
    expect(result).toMatchObject({
      error: {
        code: "bad_request",
        issues: [
          {
            code: "unknown_property",
            path: "propertyId",
            invalidValue: "cigg",
            suggestions: ["cig"],
          },
        ],
      },
    });
  });

  it("converts Zod shape errors into query issues", async () => {
    const queryRuntime = createOntologyQueryRuntime({
      ontology: procurementOntology,
      executor: () => Promise.resolve([]),
    });
    const service = createAnchorService({
      model: emptyModel("service-shape"),
      ontology: procurementOntology,
      queryRuntime,
      executionProfile: "mcp",
    });
    const result = await service.objectQuery({
      objectId: "contract",
      filters: "not-an-array",
    });
    expect(result).toMatchObject({
      error: {
        code: "bad_request",
        issues: [{ code: "invalid_query", path: "filters" }],
      },
    });
  });
});
