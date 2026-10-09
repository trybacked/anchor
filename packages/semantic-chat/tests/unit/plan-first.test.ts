import type { AnchorService } from "@trybacked/service";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { attachSemanticAsk } from "../../src/create-semantic-ask.js";
import { runPlanFirst } from "../../src/plan-first/run-plan-first.js";
import { contractOntology, fakeService } from "./agent-fixtures.js";

type GenerateResult = Awaited<ReturnType<MockLanguageModelV4["doGenerate"]>>;

function textResult(text: string): GenerateResult {
  return {
    content: [{ type: "text", text }],
    finishReason: { unified: "stop", raw: undefined },
    usage: {
      inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 5, text: 5, reasoning: undefined },
    },
    warnings: [],
  };
}

function toolCallResult(toolName: string, input: Record<string, unknown>): GenerateResult {
  return {
    content: [{ type: "tool-call", toolCallId: "call-0", toolName, input: JSON.stringify(input) }],
    finishReason: { unified: "tool-calls", raw: undefined },
    usage: {
      inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 5, text: 5, reasoning: undefined },
    },
    warnings: [],
  };
}

function plannerModel(output: Record<string, unknown>): MockLanguageModelV4 {
  return new MockLanguageModelV4({ doGenerate: async () => textResult(JSON.stringify(output)) });
}

const COUNT_PLAN = {
  locale: "it",
  query: {
    objectId: "contract",
    mode: "count",
    filters: [{ propertyId: "load_month", op: "eq", value: "2025-06" }],
  },
  unanswerable: null,
  assumptions: ["Periodo: mese di caricamento giugno 2025."],
};

describe("runPlanFirst", () => {
  it("answers with one structured call, one query and a deterministic text", async () => {
    const outcome = await runPlanFirst({
      ontology: contractOntology(),
      service: fakeService(),
      question: "Quanti contratti a giugno 2025?",
      model: plannerModel(COUNT_PLAN),
      semanticCatalogs: [],
    });
    expect(outcome.kind).toBe("answered");
    if (outcome.kind !== "answered") return;
    expect(outcome.result.answer).toContain("**42** Contract");
    expect(outcome.result.claims).toEqual([{ text: "42", toolCallId: "plan-query" }]);
    expect(outcome.result.assumptions).toEqual(COUNT_PLAN.assumptions);
    expect(outcome.result.steps.map((step) => step.toolName)).toEqual(["query_objects"]);
  });

  it("renders in the interface language even when the planner guessed another", async () => {
    const outcome = await runPlanFirst({
      ontology: contractOntology(),
      service: fakeService(),
      question: "ai in calabria",
      model: plannerModel({ ...COUNT_PLAN, locale: "en" }),
      locale: "it",
      semanticCatalogs: [],
    });
    expect(outcome.kind).toBe("answered");
    if (outcome.kind === "answered") expect(outcome.result.answer).toContain("Criteri:");
  });

  it("falls back when the planner declines", async () => {
    const outcome = await runPlanFirst({
      ontology: contractOntology(),
      service: fakeService(),
      question: "cv luca tropea",
      model: plannerModel({
        locale: "it",
        query: null,
        unanswerable: "Fuori dominio.",
        assumptions: [],
      }),
      semanticCatalogs: [],
    });
    expect(outcome).toMatchObject({ kind: "fallback", reason: "Fuori dominio." });
  });

  it("falls back when the plan references unknown properties", async () => {
    const outcome = await runPlanFirst({
      ontology: contractOntology(),
      service: fakeService(),
      question: "Quanti?",
      model: plannerModel({
        ...COUNT_PLAN,
        query: {
          objectId: "contract",
          mode: "count",
          filters: [{ propertyId: "ghost", op: "eq", value: 1 }],
        },
      }),
      semanticCatalogs: [],
    });
    expect(outcome.kind).toBe("fallback");
    if (outcome.kind === "fallback") expect(outcome.reason).toContain("ghost");
  });

  it("falls back when filters are placed under an unknown key instead of dropping them", async () => {
    const outcome = await runPlanFirst({
      ontology: contractOntology(),
      service: fakeService(),
      question: "Quanti in Calabria?",
      model: plannerModel({
        ...COUNT_PLAN,
        query: {
          objectId: "contract",
          mode: "count",
          where: [{ propertyId: "region", op: "eq", value: "Calabria" }],
        },
      }),
      semanticCatalogs: [],
    });
    expect(outcome.kind).toBe("fallback");
  });

  it("falls back on malformed planner output instead of throwing", async () => {
    const outcome = await runPlanFirst({
      ontology: contractOntology(),
      service: fakeService(),
      question: "Quanti?",
      model: new MockLanguageModelV4({ doGenerate: async () => textResult("not json") }),
      semanticCatalogs: [],
    });
    expect(outcome.kind).toBe("fallback");
  });

  it("repairs a rejected plan once and reports the real attempt count", async () => {
    let calls = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        calls += 1;
        const plan =
          calls === 1
            ? {
                ...COUNT_PLAN,
                query: {
                  objectId: "contract",
                  mode: "count",
                  filters: [{ propertyId: "importo", op: "eq", value: 1 }],
                },
              }
            : COUNT_PLAN;
        return textResult(JSON.stringify(plan));
      },
    });
    const outcome = await runPlanFirst({
      ontology: contractOntology(),
      service: fakeService(),
      question: "Quanti contratti a giugno 2025?",
      model,
      semanticCatalogs: [],
    });
    expect(calls).toBe(2);
    expect(outcome.kind).toBe("answered");
    if (outcome.kind === "answered") {
      expect(outcome.result.attempts).toBe(2);
      expect(outcome.result.steps.map((step) => step.toolName)).toEqual(["query_objects"]);
    }
  });

  it("exhausts the repair budget and falls back to the agent", async () => {
    let calls = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        calls += 1;
        return textResult(
          JSON.stringify({
            ...COUNT_PLAN,
            query: {
              objectId: "contract",
              mode: "count",
              filters: [{ propertyId: "importo", op: "eq", value: 1 }],
            },
          }),
        );
      },
    });
    const outcome = await runPlanFirst({
      ontology: contractOntology(),
      service: fakeService(),
      question: "Quanti contratti a giugno 2025?",
      model,
      semanticCatalogs: [],
    });
    expect(calls).toBe(2);
    expect(outcome.kind).toBe("fallback");
    if (outcome.kind === "fallback") expect(outcome.reason).toContain("importo");
  });

  it("repairs a bad_request from the service using its structured issues", async () => {
    let calls = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        calls += 1;
        return textResult(JSON.stringify(COUNT_PLAN));
      },
    });
    const failingService = {
      ...fakeService(),
      objectQuery: async () =>
        calls === 1
          ? {
              error: {
                code: "bad_request",
                message: "Unknown dataset mapping for contract.",
                issues: [
                  {
                    code: "missing_dataset_mapping",
                    message: "No dataset mapping for object contract.",
                    path: "objectId",
                  },
                ],
              },
            }
          : fakeService().objectQuery({
              objectId: "contract",
              mode: "count",
            }),
    } as unknown as AnchorService;
    const outcome = await runPlanFirst({
      ontology: contractOntology(),
      service: failingService,
      question: "Quanti contratti a giugno 2025?",
      model,
      semanticCatalogs: [],
    });
    expect(calls).toBe(2);
    expect(outcome.kind).toBe("answered");
    if (outcome.kind === "answered") expect(outcome.result.attempts).toBe(2);
  });
});

describe("attachSemanticAsk strategy", () => {
  const env = { AI_GATEWAY_API_KEY: "k", SEMANTIC_CHAT_MODEL: "mock" };

  it("uses plan-first and reports route single", async () => {
    const service = attachSemanticAsk(fakeService(), {
      ontology: contractOntology(),
      env,
      resolveModel: () => plannerModel(COUNT_PLAN),
    });
    const response = await service.semanticAsk!({ question: "Quanti contratti a giugno 2025?" });
    expect(response.route).toBe("single");
    expect(response.answer).toContain("**42** Contract");
  });

  it("falls through to the agent when the plan is rejected", async () => {
    let calls = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        calls += 1;
        return calls === 1
          ? textResult(
              JSON.stringify({ locale: "en", query: null, unanswerable: "no", assumptions: [] }),
            )
          : toolCallResult("submit_answer", { answer: "Agent answer.", claims: [] });
      },
    });
    const service = attachSemanticAsk(fakeService(), {
      ontology: contractOntology(),
      env,
      resolveModel: () => model,
    });
    const response = await service.semanticAsk!({ question: "Anything?" });
    expect(response.route).toBe("agent");
    expect(response.answer).toBe("Agent answer.");
  });

  it("honours SEMANTIC_ASK_STRATEGY=agent", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () =>
        toolCallResult("submit_answer", { answer: "Agent only.", claims: [] }),
    });
    const service: AnchorService = attachSemanticAsk(fakeService(), {
      ontology: contractOntology(),
      env: { ...env, SEMANTIC_ASK_STRATEGY: "agent" },
      resolveModel: () => model,
    });
    const response = await service.semanticAsk!({ question: "Anything?" });
    expect(response.route).toBe("agent");
  });

  it("reports an agent decline_answer as an abstained outcome", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () =>
        toolCallResult("decline_answer", {
          reason: "out_of_scope",
          explanation: "La domanda è fuori dal perimetro di questo tenant.",
          followUps: ["Chiedimi quanti contratti sono caricati."],
        }),
    });
    const service: AnchorService = attachSemanticAsk(fakeService(), {
      ontology: contractOntology(),
      env: { ...env, SEMANTIC_ASK_STRATEGY: "agent" },
      resolveModel: () => model,
    });
    const response = await service.semanticAsk!({ question: "Che tempo fa a Roma?" });
    expect(response.route).toBe("agent");
    expect(response.outcome).toBe("abstained");
    expect(response.abstention).toEqual({
      reason: "out_of_scope",
      explanation: "La domanda è fuori dal perimetro di questo tenant.",
    });
    expect(response.clarification).toBeUndefined();
    expect(response.followUps).toEqual(["Chiedimi quanti contratti sono caricati."]);
  });
});
