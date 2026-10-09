import type { AnchorService } from "@trybacked/service";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { gradeEvidence, hasUsableEvidence } from "../../src/document-relevance.js";
import { orderForContext, tryDocumentSynthesisAnswer } from "../../src/document-synthesis.js";

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

function gradingModel(lines: string[]): MockLanguageModelV4 {
  return new MockLanguageModelV4({ doGenerate: async () => textResult(lines.join("\n")) });
}

describe("orderForContext", () => {
  it("places odd-ranked items at the top and even-ranked at the bottom", () => {
    expect(orderForContext([1, 2, 3, 4, 5])).toEqual([1, 3, 5, 2, 4]);
    expect(orderForContext(["a", "b"])).toEqual(["a", "b"]);
    expect(orderForContext<number>([])).toEqual([]);
  });

  it("keeps single items unchanged", () => {
    expect(orderForContext([7])).toEqual([7]);
  });
});

describe("gradeEvidence", () => {
  const items = ["alpha", "beta", "gamma"];

  it("drops excerpts graded 0 and ranks the rest by grade", async () => {
    const graded = await gradeEvidence(
      "domanda",
      items,
      (item) => item,
      () =>
        gradingModel([
          '{"id": "0", "grade": 2}',
          '{"id": "1", "grade": 0}',
          '{"id": "2", "grade": 1}',
        ]),
      "mock",
    );
    expect(graded.map((entry) => entry.item)).toEqual(["alpha", "gamma"]);
    expect(graded[0]?.grade).toBe(2);
    expect(hasUsableEvidence(graded)).toBe(true);
  });

  it("returns nothing usable when the grader discards everything", async () => {
    const graded = await gradeEvidence(
      "domanda",
      items,
      (item) => item,
      () =>
        gradingModel([
          '{"id": "0", "grade": 0}',
          '{"id": "1", "grade": 0}',
          '{"id": "2", "grade": 0}',
        ]),
      "mock",
    );
    expect(graded).toEqual([]);
    expect(hasUsableEvidence(graded)).toBe(false);
  });

  it("degrades to keep-all on an unparseable grading response", async () => {
    const graded = await gradeEvidence(
      "domanda",
      items,
      (item) => item,
      () => gradingModel(["risposta non json"]),
      "mock",
    );
    expect(graded.map((entry) => entry.item)).toEqual(items);
    expect(graded.every((entry) => entry.grade === 1)).toBe(true);
  });
});

const LONG_TEXT =
  "Il presente documento descrive l'oggetto dell'appalto con il proprio importo a base di gara. ".repeat(
    6,
  );

function chunkSearchService(rows: Record<string, unknown>[]): AnchorService {
  return {
    capabilities: () => ({ chunkSearch: true }),
    chunkSearch: async () => ({ rows, rowCount: rows.length }),
    entityProfile: async () => ({ profile: { matches: [], documents: [] } }),
  } as unknown as AnchorService;
}

function chunkRow(elementId: string, content: string): Record<string, unknown> {
  return {
    elementId,
    documentId: "d1",
    filename: "bando.pdf",
    folder: "gare",
    elementType: "text",
    page: 1,
    text: content,
  };
}

const RESOLVE_NEVER = () => {
  throw new Error("model must not be called");
};

describe("document synthesis with LLM reranking", () => {
  it("abstains when the grader discards every excerpt", async () => {
    const outcome = await tryDocumentSynthesisAnswer({
      service: chunkSearchService([chunkRow("e1", LONG_TEXT)]),
      question: "Pagamenti",
      documentTerms: [],
      locale: "it",
      ontologyVersion: 1,
      resolveModel: () => gradingModel(['{"id": "0", "grade": 0}']),
      modelId: "mock",
      abstainOnInsufficientEvidence: true,
      rerank: "llm",
    });
    expect(outcome.kind).toBe("abstained");
    if (outcome.kind !== "abstained") return;
    expect(outcome.response.outcome).toBe("abstained");
    expect(outcome.response.abstention?.reason).toBe("insufficient_evidence");
  });

  it("answers normally when the reranker is off", async () => {
    const outcome = await tryDocumentSynthesisAnswer({
      service: chunkSearchService([chunkRow("e1", LONG_TEXT)]),
      question: "Pagamenti",
      documentTerms: [],
      locale: "it",
      ontologyVersion: 1,
      resolveModel: () => gradingModel(["L'importo dell'appalto è definito nel documento [1]."]),
      modelId: "mock",
      rerank: "off",
    });
    expect(outcome.kind).toBe("answered");
    if (outcome.kind !== "answered") return;
    expect(outcome.response.answer).toContain("importo");
  });

  it("never calls the model for grading when the reranker is off", async () => {
    const outcome = await tryDocumentSynthesisAnswer({
      service: chunkSearchService([]),
      question: "Pagamenti",
      documentTerms: [],
      locale: "it",
      ontologyVersion: 1,
      resolveModel: RESOLVE_NEVER,
      modelId: "mock",
    });
    expect(outcome).toEqual({ kind: "skip", reason: "insufficient_evidence" });
  });
});
