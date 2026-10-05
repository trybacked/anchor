import {
  MAX_CHUNK_SEARCH_LIMIT,
  MAX_PROFILE_MATCH_LIMIT,
  MAX_TRAVERSE_ROW_LIMIT,
  type OntologyQueryRuntime,
} from "@trybacked/runtime";
import { maxRowLimitForProfile } from "@trybacked/service";
import { describe, expect, it } from "vitest";
import { MCP_SURFACE_TOOLS, TOOL_NAMES } from "../../src/constants.js";
import {
  MCP_TOOL_DEFINITIONS,
  QUERY_OBJECTS_TOOL_DEFINITION,
  WAREHOUSE_READER_TOOL_DEFINITIONS,
} from "../../src/tools.js";
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
function advertisedMax(schema: unknown): number | undefined {
  const node = schema as {
    unwrap?: () => unknown;
    maxValue?: number | null;
  };
  if (typeof node.unwrap === "function") {
    return advertisedMax(node.unwrap());
  }
  return typeof node.maxValue === "number" ? node.maxValue : undefined;
}
function toolField(toolName: string, field: string): unknown {
  const tool = [
    ...MCP_TOOL_DEFINITIONS,
    ...WAREHOUSE_READER_TOOL_DEFINITIONS,
    QUERY_OBJECTS_TOOL_DEFINITION,
  ].find((candidate) => candidate.name === toolName);
  if (tool === undefined) {
    throw new Error(`${toolName} is not registered`);
  }
  return (tool.inputSchema as Record<string, unknown>)[field];
}
describe("advertised tool bounds", () => {
  it.each([
    [TOOL_NAMES.searchDocuments, "limit", MAX_CHUNK_SEARCH_LIMIT],
    [TOOL_NAMES.getEntityProfile, "matchLimit", MAX_PROFILE_MATCH_LIMIT],
    [TOOL_NAMES.traverseGraph, "limit", MAX_TRAVERSE_ROW_LIMIT],
  ])("%s.%s advertises the enforced ceiling", (toolName, field, enforced) => {
    expect(advertisedMax(toolField(toolName, field))).toBe(enforced);
  });
  it("documents the query_objects row budget it actually applies", () => {
    expect(QUERY_OBJECTS_TOOL_DEFINITION.description).toContain(
      String(maxRowLimitForProfile("mcp")),
    );
  });
});
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
    expect(result).toMatchObject({
      error: { code: "not_found", message: expect.stringContaining("not found") },
    });
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
        mode: "rows",
        limit: 5,
      },
    ]);
    expect(result).toEqual({
      objectId: "customer",
      columns: ["id", "city"],
      rows: [{ id: 1, city: "Milano" }],
      rowCount: 1,
      mode: "rows",
      sql: "SELECT ...",
      provenance: [],
    });
  });
  it("returns a structured error when no runtime is configured", async () => {
    const result = await QUERY_OBJECTS_TOOL_DEFINITION.handler(
      { model: EMPTY_MODEL },
      { objectId: "customer" },
    );
    expect(result).toMatchObject({
      error: { code: "unavailable", message: expect.stringContaining("unavailable") },
    });
  });
  it("returns a structured error for invalid input", async () => {
    const queryRuntime: OntologyQueryRuntime = {
      queryObjects: () => Promise.reject(new Error("should not run")),
    };
    const result = await QUERY_OBJECTS_TOOL_DEFINITION.handler(
      { model: EMPTY_MODEL, queryRuntime },
      { objectId: "" },
    );
    expect(result).toMatchObject({
      error: { code: "bad_request", message: expect.stringContaining("Invalid query") },
    });
  });
});
