import type { OntologyQueryRuntime } from "@backed/runtime";
import { describe, expect, it } from "vitest";
import { MCP_SURFACE_TOOLS, TOOL_NAMES } from "../../src/constants.js";
import { MCP_TOOL_DEFINITIONS, QUERY_OBJECTS_TOOL_DEFINITION } from "../../src/tools.js";

const EMPTY_MODEL = {
  metadata: {
    formatVersion: "1" as const,
    runId: "run-test",
    generatedAt: "2026-01-01T00:00:00.000Z",
  },
  entities: [],
  relations: [],
  rules: [],
};

describe("MCP tool registry", () => {
  it("registers exactly the five surface tools", () => {
    expect(MCP_TOOL_DEFINITIONS).toHaveLength(MCP_SURFACE_TOOLS.length);
    expect(MCP_TOOL_DEFINITIONS.map((tool) => tool.name)).toEqual([...MCP_SURFACE_TOOLS]);
  });

  it("uses stable tool name constants", () => {
    for (const name of MCP_SURFACE_TOOLS) {
      expect(Object.values(TOOL_NAMES)).toContain(name);
    }
  });

  it("requires string args for parameterized tools", () => {
    const getEntity = MCP_TOOL_DEFINITIONS.find((tool) => tool.name === TOOL_NAMES.getEntity);
    expect(getEntity).toBeDefined();
    const result = getEntity?.handler({ model: EMPTY_MODEL }, { id: 42 });
    expect(result).toEqual({ error: expect.stringContaining("not found") });
  });
});

describe("query_objects tool", () => {
  it("delegates to the query runtime and returns rows", async () => {
    const calls: unknown[] = [];
    const queryRuntime: OntologyQueryRuntime = {
      queryObjects: (query) => {
        calls.push(query);
        return Promise.resolve({
          objectId: query.objectId,
          columns: ["id", "city"],
          rows: [{ id: 1, city: "Milano" }],
          rowCount: 1,
          sql: "SELECT ...",
        });
      },
    };
    const result = await QUERY_OBJECTS_TOOL_DEFINITION.handler(
      { model: EMPTY_MODEL, queryRuntime },
      {
        objectId: "customer",
        filters: [{ propertyId: "city", op: "eq", value: "Milano" }],
        limit: 5,
      },
    );
    expect(calls).toEqual([
      {
        objectId: "customer",
        filters: [{ propertyId: "city", op: "eq", value: "Milano" }],
        limit: 5,
      },
    ]);
    expect(result).toEqual({
      objectId: "customer",
      columns: ["id", "city"],
      rows: [{ id: 1, city: "Milano" }],
      rowCount: 1,
    });
  });

  it("returns a structured error when no runtime is configured", async () => {
    const result = await QUERY_OBJECTS_TOOL_DEFINITION.handler(
      { model: EMPTY_MODEL },
      { objectId: "customer" },
    );
    expect(result).toEqual({ error: expect.stringContaining("unavailable") });
  });

  it("returns a structured error for invalid input", async () => {
    const queryRuntime: OntologyQueryRuntime = {
      queryObjects: () => Promise.reject(new Error("should not run")),
    };
    const result = await QUERY_OBJECTS_TOOL_DEFINITION.handler(
      { model: EMPTY_MODEL, queryRuntime },
      { objectId: "" },
    );
    expect(result).toEqual({ error: expect.stringContaining("Invalid query") });
  });
});
