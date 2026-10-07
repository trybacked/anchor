import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { runSemanticAgent } from "../../src/agent/run-agent.js";
import { DEFAULT_AGENT_BUDGET } from "../../src/agent/types.js";
import { CONTRACTS_DATASET, contractOntology, fakeService } from "./agent-fixtures.js";
type GenerateResult = Awaited<ReturnType<MockLanguageModelV4["doGenerate"]>>;
type CallOptions = MockLanguageModelV4["doGenerateCalls"][number];
type ScriptedCall = {
  toolName: string;
  input: Record<string, unknown>;
};
function toolCallResult(call: ScriptedCall, index: number): GenerateResult {
  return {
    content: [
      {
        type: "tool-call",
        toolCallId: `call-${String(index)}`,
        toolName: call.toolName,
        input: JSON.stringify(call.input),
      },
    ],
    finishReason: { unified: "tool-calls", raw: undefined },
    usage: {
      inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 5, text: 5, reasoning: undefined },
    },
    warnings: [],
  };
}
function scriptedModel(script: ScriptedCall[]) {
  let index = 0;
  return new MockLanguageModelV4({
    doGenerate: async () => {
      const call = script[Math.min(index, script.length - 1)]!;
      const result = toolCallResult(call, index);
      index += 1;
      return result;
    },
  });
}
const QUERY = {
  objectId: "contract",
  mode: "count",
  filters: [{ propertyId: "load_month", op: "eq", value: "2025-06" }],
};
function answerCiting(toolCallId: string) {
  return {
    answer: "There are 42 contracts.",
    claims: [{ text: "42 contracts", toolCallId }],
    assumptions: ["Used load_month as the period."],
  };
}
function run(script: ScriptedCall[], question = "How many contracts in June 2025?", maxSteps = 6) {
  const model = scriptedModel(script);
  const result = runSemanticAgent({
    ontology: contractOntology(),
    service: fakeService(),
    question,
    apiKey: "unused",
    modelId: "mock",
    budget: { ...DEFAULT_AGENT_BUDGET, maxSteps, maxSqlCalls: 3 },
    semanticCatalogs: [],
    resolveModel: () => model,
  });
  return { model, result };
}
function toolNames(call: CallOptions | undefined): string[] {
  return (call?.tools ?? []).map((tool) => tool.name);
}
describe("runSemanticAgent", () => {
  it("returns a grounded answer and stops at submit_answer", async () => {
    const { model, result } = run([
      { toolName: "query_objects", input: QUERY },
      { toolName: "submit_answer", input: answerCiting("call-0") },
    ]);
    const agent = await result;
    expect(agent.answer).toBe("There are 42 contracts.");
    expect(agent.clarification).toBeUndefined();
    expect(agent.steps.map((step) => [step.toolName, step.status])).toEqual([
      ["query_objects", "ok"],
      ["submit_answer", "ok"],
    ]);
    expect(model.doGenerateCalls).toHaveLength(2);
    expect(model.doGenerateCalls[0]?.toolChoice).toEqual({ type: "required" });
  });
  it("rejects a clarification the ontology can settle and keeps going", async () => {
    const { result } = run([
      {
        toolName: "ask_clarification",
        input: {
          question: "Which date?",
          options: ["load month", "publication date"],
          ambiguity: { objectId: "contract", propertyIds: ["load_month", "published_on"] },
        },
      },
      { toolName: "query_objects", input: QUERY },
      { toolName: "submit_answer", input: answerCiting("call-1") },
    ]);
    const agent = await result;
    expect(agent.clarification).toBeUndefined();
    expect(agent.steps[0]).toMatchObject({ toolName: "ask_clarification", status: "error" });
    expect(agent.steps[0]?.error).toContain("default time dimension");
  });
  it("ends on an accepted clarification without calling the model again", async () => {
    const { model, result } = run([
      {
        toolName: "ask_clarification",
        input: { question: "Which Gerace?", options: ["Comune", "Diocesi"] },
      },
      { toolName: "submit_answer", input: answerCiting("call-0") },
    ]);
    const agent = await result;
    expect(agent.clarification).toEqual({
      question: "Which Gerace?",
      options: ["Comune", "Diocesi"],
    });
    expect(model.doGenerateCalls).toHaveLength(1);
  });
  it("forces submit_answer on the final step", async () => {
    const { model, result } = run(
      [
        { toolName: "query_objects", input: { ...QUERY, mode: "rows", limit: 1 } },
        { toolName: "submit_answer", input: { answer: "No data found.", claims: [] } },
      ],
      "How many contracts?",
      2,
    );
    const agent = await result;
    expect(agent.answer).toBe("No data found.");
    expect(toolNames(model.doGenerateCalls.at(-1))).toEqual(["submit_answer"]);
    expect(toolNames(model.doGenerateCalls[0])).toContain("query_objects");
  });
  it("records failing tools as error steps", async () => {
    const { result } = run([
      { toolName: "query_objects", input: { objectId: "ghost", mode: "count" } },
      { toolName: "submit_answer", input: { answer: "Unknown object.", claims: [] } },
    ]);
    const agent = await result;
    expect(agent.steps[0]).toMatchObject({ toolName: "query_objects", status: "error" });
  });
  it("puts catalog semantics into the system prompt", async () => {
    const ontology = contractOntology();
    ontology.objects[0] = { ...ontology.objects[0]!, semantics: undefined };
    const model = scriptedModel([
      { toolName: "submit_answer", input: { answer: "ok", claims: [] } },
    ]);
    await runSemanticAgent({
      ontology,
      service: fakeService(),
      question: "How many contracts?",
      apiKey: "unused",
      modelId: "mock",
      semanticCatalogs: [
        {
          id: "c",
          datasets: {
            [CONTRACTS_DATASET]: { entity: { defaultTimeDimension: "load_month" }, properties: {} },
          },
          glossary: [],
          examples: [],
        },
      ],
      resolveModel: () => model,
    });
    const system = model.doGenerateCalls[0]?.prompt.find((message) => message.role === "system");
    expect(system?.content).toContain("Default time dimension: load_month");
  });
});
