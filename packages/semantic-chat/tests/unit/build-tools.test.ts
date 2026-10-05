import type { AnchorService } from "@trybacked/service";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildAgentTools, type AgentToolkit } from "../../src/agent/build-tools.js";
import { DEFAULT_AGENT_BUDGET, type AgentBudget } from "../../src/agent/types.js";
import { contractOntology, fakeService } from "./agent-fixtures.js";
type ToolExecutor = (
  input: unknown,
  options: {
    toolCallId: string;
    messages: never[];
  },
) => Promise<unknown>;
function toolkit(budget: Partial<AgentBudget> = {}): AgentToolkit {
  return buildAgentTools({
    ontology: contractOntology(),
    service: fakeService(),
    question: "How many contracts?",
    budget: { ...DEFAULT_AGENT_BUDGET, ...budget },
    recordStep: () => undefined,
    onTerminal: () => undefined,
  });
}
function queryInputSchema(tools: AgentToolkit): z.ZodTypeAny {
  const schema = tools.tools["query_objects"]?.inputSchema;
  if (!(schema instanceof z.ZodType)) {
    throw new Error("query_objects has no zod input schema");
  }
  return schema;
}
async function callQueryObjects(tools: AgentToolkit, callId: string): Promise<void> {
  const execute = tools.tools["query_objects"]?.execute as ToolExecutor | undefined;
  if (execute === undefined) {
    throw new Error("query_objects is not executable");
  }
  await execute({ objectId: "contract", mode: "count" }, { toolCallId: callId, messages: [] });
}
describe("agent query tool schema", () => {
  it("accepts the governed query features, so the compiler contract is not forked", () => {
    const schema = queryInputSchema(toolkit());
    expect(
      schema.safeParse({
        objectId: "contract",
        textSearch: { query: "acme", propertyIds: ["region"] },
        filters: [{ propertyId: "region", op: "starts_with", value: "Lomb" }],
      }).success,
    ).toBe(true);
  });
  it("rejects a filter op the compiler cannot run, instead of failing at query time", () => {
    const schema = queryInputSchema(toolkit());
    expect(
      schema.safeParse({
        objectId: "contract",
        filters: [{ propertyId: "region", op: "like", value: "Lomb" }],
      }).success,
    ).toBe(false);
  });
  it("caps rows at the run budget", () => {
    const schema = queryInputSchema(toolkit({ maxQueryRows: 20 }));
    expect(schema.safeParse({ objectId: "contract", limit: 20 }).success).toBe(true);
    expect(schema.safeParse({ objectId: "contract", limit: 21 }).success).toBe(false);
  });
});
describe("warehouse budget", () => {
  it("withdraws every warehouse tool once the budget is spent, leaving the rest callable", async () => {
    const tools = toolkit({ maxSqlCalls: 1 });
    expect(tools.availableToolNames()).toContain("query_objects");
    await callQueryObjects(tools, "call-1");
    const available = tools.availableToolNames();
    expect(available).not.toContain("query_objects");
    expect(available).not.toContain("get_property_values");
    expect(available).toContain("submit_answer");
    expect(available).toContain("search_schema");
  });
  it("reports the exhausted budget to the model instead of querying anyway", async () => {
    const tools = toolkit({ maxSqlCalls: 1 });
    await callQueryObjects(tools, "call-1");
    await expect(callQueryObjects(tools, "call-2")).rejects.toThrow(/budget of 1 calls exhausted/);
  });
  it("does not spend warehouse budget on failed query_objects calls", async () => {
    let attempts = 0;
    const service: AnchorService = {
      ...fakeService(),
      objectQuery: async (input) => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("warehouse unavailable");
        }
        return fakeService().objectQuery(input as never);
      },
    } as AnchorService;
    const tools = buildAgentTools({
      ontology: contractOntology(),
      service,
      question: "How many?",
      budget: { ...DEFAULT_AGENT_BUDGET, maxSqlCalls: 1 },
      recordStep: () => undefined,
      onTerminal: () => undefined,
    });
    const execute = tools.tools["query_objects"]?.execute as ToolExecutor | undefined;
    await expect(
      execute?.({ objectId: "contract", mode: "count" }, { toolCallId: "fail-1", messages: [] }),
    ).rejects.toThrow(/warehouse unavailable/);
    await callQueryObjects(tools, "ok-1");
  });
});
