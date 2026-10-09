import { describe, expect, it } from "vitest";
import type { AnchorService } from "@trybacked/service";
import { tryDocumentSynthesisAnswer } from "../../src/document-synthesis.js";

function emptyChunkSearchService(): AnchorService {
  return {
    capabilities: () => ({ chunkSearch: true }),
    chunkSearch: async () => ({ rows: [], rowCount: 0 }),
    entityProfile: async () => ({
      profile: { matches: [], documents: [] },
    }),
  } as unknown as AnchorService;
}

const RESOLVE_MODEL = () => {
  throw new Error("model must not be called when evidence is insufficient");
};

describe("document synthesis abstention", () => {
  it("turns insufficient evidence into an abstained response when opted in", async () => {
    const outcome = await tryDocumentSynthesisAnswer({
      service: emptyChunkSearchService(),
      question: "Riassumi il curriculum di Luca Tropea",
      documentTerms: [],
      locale: "it",
      ontologyVersion: 1,
      resolveModel: RESOLVE_MODEL,
      modelId: "mock",
      abstainOnInsufficientEvidence: true,
    });
    expect(outcome.kind).toBe("abstained");
    if (outcome.kind !== "abstained") return;
    expect(outcome.response.outcome).toBe("abstained");
    expect(outcome.response.abstention?.reason).toBe("insufficient_evidence");
    expect(outcome.response.route).toBe("document-synthesis");
    expect(outcome.response.agentSteps?.[0]?.toolName).toBe("search_documents");
  });

  it("keeps the routing skip when the flag is off", async () => {
    const outcome = await tryDocumentSynthesisAnswer({
      service: emptyChunkSearchService(),
      question: "Riassumi il curriculum di Luca Tropea",
      documentTerms: [],
      locale: "it",
      ontologyVersion: 1,
      resolveModel: RESOLVE_MODEL,
      modelId: "mock",
    });
    expect(outcome).toEqual({ kind: "skip", reason: "insufficient_evidence" });
  });
});
